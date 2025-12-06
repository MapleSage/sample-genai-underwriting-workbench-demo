#!/usr/bin/env python3
"""
FastAPI-based API handler for GenAI Underwriting Workbench (Azure version)
Handles document uploads, job status queries, and provides CORS support for frontend.
"""

import os
import uuid
import logging
import time
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from azure.cosmos import CosmosClient, exceptions as cosmos_exceptions
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from azure.servicebus import ServiceBusClient, ServiceBusMessage
from azure.identity import DefaultAzureCredential

# Configure logging
logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="GenAI Underwriting Workbench API",
    description="API for document processing and underwriting analysis",
    version="1.0.0"
)

# CORS Configuration - Allow frontend at https://uw.sagesure.io
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://uw.sagesure.io",
        "http://localhost:5173",  # Local development
        "http://localhost:3000",  # Alternative local port
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Pydantic models for request/response
class DocumentUploadRequest(BaseModel):
    filename: str
    insuranceType: Optional[str] = "life"

class DocumentUploadResponse(BaseModel):
    uploadUrl: str
    jobId: str

class JobResponse(BaseModel):
    id: str
    jobId: str
    filename: str
    insuranceType: Optional[str] = None
    status: str
    createdAt: str
    updatedAt: Optional[str] = None
    progress: Optional[Dict[str, Any]] = None
    extractedData: Optional[List[Dict[str, Any]]] = None
    analysis: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, str]] = None

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    context: Optional[List[str]]

# Global clients (initialized lazily)
_cosmos_client = None
_blob_service_client = None
_servicebus_client = None
_jobs_container = None


def get_cosmos_client():
    """Get or create Cosmos DB client"""
    global _cosmos_client, _jobs_container
    
    if _jobs_container is not None:
        return _jobs_container
    
    cosmos_endpoint = os.environ.get('COSMOS_DB_ENDPOINT')
    cosmos_key = os.environ.get('COSMOS_DB_KEY')
    
    if not cosmos_endpoint:
        raise ValueError("COSMOS_DB_ENDPOINT environment variable is required")
    
    try:
        # Try managed identity first
        if not cosmos_key:
            logger.info("Using managed identity for Cosmos DB")
            credential = DefaultAzureCredential()
            _cosmos_client = CosmosClient(cosmos_endpoint, credential=credential)
        else:
            logger.info("Using key-based auth for Cosmos DB")
            _cosmos_client = CosmosClient(cosmos_endpoint, credential=cosmos_key)
        
        database_name = os.environ.get('COSMOS_DB_NAME', 'underwriting')
        container_name = os.environ.get('COSMOS_JOBS_CONTAINER', 'jobs')
        
        database = _cosmos_client.get_database_client(database_name)
        _jobs_container = database.get_container_client(container_name)
        
        logger.info(f"Connected to Cosmos DB: {database_name}/{container_name}")
        return _jobs_container
    
    except Exception as e:
        logger.error(f"Failed to initialize Cosmos DB client: {e}")
        raise


def get_blob_service_client():
    """Get or create Blob Storage client"""
    global _blob_service_client
    
    if _blob_service_client is not None:
        return _blob_service_client
    
    storage_account_name = os.environ.get('STORAGE_ACCOUNT_NAME')
    storage_conn_string = os.environ.get('STORAGE_CONNECTION_STRING')
    
    if not storage_account_name and not storage_conn_string:
        raise ValueError("STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING is required")
    
    try:
        if storage_conn_string:
            logger.info("Using connection string for Blob Storage")
            _blob_service_client = BlobServiceClient.from_connection_string(storage_conn_string)
        else:
            logger.info("Using managed identity for Blob Storage")
            account_url = f"https://{storage_account_name}.blob.core.windows.net"
            credential = DefaultAzureCredential()
            _blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
        
        logger.info("Connected to Blob Storage")
        return _blob_service_client
    
    except Exception as e:
        logger.error(f"Failed to initialize Blob Storage client: {e}")
        raise


def get_servicebus_client():
    """Get or create Service Bus client"""
    global _servicebus_client
    
    if _servicebus_client is not None:
        return _servicebus_client
    
    servicebus_namespace = os.environ.get('SERVICE_BUS_NAMESPACE')
    servicebus_conn_string = os.environ.get('SERVICE_BUS_CONNECTION_STRING')
    
    if not servicebus_namespace and not servicebus_conn_string:
        raise ValueError("SERVICE_BUS_NAMESPACE or SERVICE_BUS_CONNECTION_STRING is required")
    
    try:
        if servicebus_conn_string:
            logger.info("Using connection string for Service Bus")
            _servicebus_client = ServiceBusClient.from_connection_string(servicebus_conn_string)
        else:
            logger.info("Using managed identity for Service Bus")
            fully_qualified_namespace = f"{servicebus_namespace}.servicebus.windows.net"
            credential = DefaultAzureCredential()
            _servicebus_client = ServiceBusClient(
                fully_qualified_namespace=fully_qualified_namespace,
                credential=credential
            )
        
        logger.info("Connected to Service Bus")
        return _servicebus_client
    
    except Exception as e:
        logger.error(f"Failed to initialize Service Bus client: {e}")
        raise


def parse_connection_string(conn_str: str) -> tuple:
    """Extract account name and key from storage connection string"""
    parts = dict(p.split('=', 1) for p in conn_str.split(';') if '=' in p)
    return parts.get('AccountName'), parts.get('AccountKey')


def generate_sas_upload_url(blob_name: str, container: str = 'documents', expiry_minutes: int = 60) -> str:
    """Generate SAS URL for blob upload"""
    storage_conn_string = os.environ.get('STORAGE_CONNECTION_STRING')
    
    if not storage_conn_string:
        raise ValueError("STORAGE_CONNECTION_STRING required for SAS token generation")
    
    account_name, account_key = parse_connection_string(storage_conn_string)
    
    if not account_name or not account_key:
        raise ValueError("Could not parse storage account credentials")
    
    sas_token = generate_blob_sas(
        account_name=account_name,
        account_key=account_key,
        container_name=container,
        blob_name=blob_name,
        permission=BlobSasPermissions(write=True, create=True),
        expiry=datetime.utcnow() + timedelta(minutes=expiry_minutes)
    )
    
    blob_service = get_blob_service_client()
    blob_client = blob_service.get_blob_client(container, blob_name)
    
    return f"{blob_client.url}?{sas_token}"


def with_retries(func, max_retries: int = 3, base_delay: float = 0.5, factor: float = 2.0):
    """Execute function with exponential backoff retries"""
    last_exception = None
    
    for attempt in range(1, max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            if attempt == max_retries:
                break
            
            delay = base_delay * (factor ** (attempt - 1))
            logger.warning(f"Attempt {attempt} failed, retrying in {delay}s: {e}")
            time.sleep(delay)
    
    raise last_exception


# Health check endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness probe"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint for Kubernetes readiness probe"""
    try:
        # Check if we can connect to Cosmos DB
        container = get_cosmos_client()
        # Simple query to verify connection
        list(container.query_items(
            query="SELECT TOP 1 c.id FROM c",
            enable_cross_partition_query=True
        ))
        return {"status": "ready", "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Service not ready")


# API endpoints
@app.post("/api/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(request: DocumentUploadRequest):
    """
    Create a new job and generate SAS URL for document upload
    """
    logger.info(f"Upload request received: {request.filename}")
    
    if not request.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    
    try:
        # Generate job ID
        job_id = f"job-{uuid.uuid4().hex}"
        
        # Create job in Cosmos DB
        jobs_container = get_cosmos_client()
        
        job_item = {
            'id': job_id,
            'jobId': job_id,
            'filename': request.filename,
            'insuranceType': request.insuranceType,
            'status': 'pending',
            'createdAt': datetime.utcnow().isoformat(),
            'updatedAt': datetime.utcnow().isoformat()
        }
        
        def create_job():
            return jobs_container.create_item(job_item)
        
        with_retries(create_job)
        logger.info(f"Created job {job_id} in Cosmos DB")
        
        # Generate SAS URL for upload
        blob_name = f"{job_id}/{request.filename}"
        container_name = os.environ.get('STORAGE_CONTAINER_NAME', 'documents')
        upload_url = generate_sas_upload_url(blob_name, container_name)
        
        # Enqueue message to Service Bus for processing
        servicebus_client = get_servicebus_client()
        queue_name = os.environ.get('SERVICE_BUS_QUEUE_NAME', 'document-extraction')
        
        message_body = {
            'jobId': job_id,
            'filename': request.filename,
            'blobPath': f"{container_name}/{blob_name}",
            'insuranceType': request.insuranceType,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        def send_message():
            with servicebus_client.get_queue_sender(queue_name) as sender:
                import json
                message = ServiceBusMessage(
                    body=json.dumps(message_body),
                    content_type="application/json"
                )
                sender.send_messages(message)
        
        with_retries(send_message)
        logger.info(f"Enqueued message for job {job_id}")
        
        return DocumentUploadResponse(
            uploadUrl=upload_url,
            jobId=job_id
        )
    
    except Exception as e:
        logger.error(f"Error creating upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs", response_model=List[JobResponse])
async def list_jobs():
    """
    List all jobs
    """
    try:
        jobs_container = get_cosmos_client()
        
        query = "SELECT * FROM c ORDER BY c.createdAt DESC"
        jobs = list(jobs_container.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        
        return jobs
    
    except Exception as e:
        logger.error(f"Error listing jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    """
    Get job details by ID
    """
    try:
        jobs_container = get_cosmos_client()
        
        def read_job():
            return jobs_container.read_item(item=job_id, partition_key=job_id)
        
        job = with_retries(read_job)
        return job
    
    except cosmos_exceptions.CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    except Exception as e:
        logger.error(f"Error fetching job {job_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs/{job_id}/analysis")
async def get_job_analysis(job_id: str):
    """
    Get analysis results for a job
    """
    try:
        jobs_container = get_cosmos_client()
        
        def read_job():
            return jobs_container.read_item(item=job_id, partition_key=job_id)
        
        job = with_retries(read_job)
        
        if 'analysis' not in job or not job['analysis']:
            raise HTTPException(status_code=404, detail="Analysis not available yet")
        
        return job['analysis']
    
    except cosmos_exceptions.CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis for job {job_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/jobs/{job_id}/chat", response_model=ChatResponse)
async def chat_with_job(job_id: str, request: ChatRequest):
    """
    Chat with job documents (placeholder - to be implemented)
    """
    try:
        jobs_container = get_cosmos_client()
        
        def read_job():
            return jobs_container.read_item(item=job_id, partition_key=job_id)
        
        job = with_retries(read_job)
        
        if job['status'] != 'completed':
            raise HTTPException(
                status_code=400,
                detail="Job must be completed before chatting"
            )
        
        # TODO: Implement actual chat functionality with Azure OpenAI
        return ChatResponse(
            response="Chat functionality coming soon!",
            context=[]
        )
    
    except cosmos_exceptions.CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat for job {job_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get('PORT', 8080))
    uvicorn.run(
        "api-server:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )
