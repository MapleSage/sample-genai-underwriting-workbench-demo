#!/usr/bin/env python3
"""
Document processing worker for GenAI Underwriting Workbench (Azure version)
Listens to Service Bus queue, downloads PDFs, extracts text with Azure OpenAI, and updates job status.
"""

import os
import sys
import json
import logging
import time
import signal
import io
from datetime import datetime
from typing import Dict, List, Any, Optional

from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from azure.servicebus import ServiceBusClient, ServiceBusReceiveMode
from azure.identity import DefaultAzureCredential
from openai import AzureOpenAI

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader

from PIL import Image

# Configure logging
logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global flag for graceful shutdown
shutdown_flag = False


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    global shutdown_flag
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_flag = True


# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


class AzureClients:
    """Manages Azure service clients with lazy initialization"""
    
    def __init__(self):
        self._cosmos_client = None
        self._blob_service_client = None
        self._servicebus_client = None
        self._openai_client = None
        self._jobs_container = None
    
    def get_cosmos_container(self):
        """Get Cosmos DB jobs container"""
        if self._jobs_container is not None:
            return self._jobs_container
        
        cosmos_endpoint = os.environ.get('COSMOS_DB_ENDPOINT')
        cosmos_key = os.environ.get('COSMOS_DB_KEY')
        
        if not cosmos_endpoint:
            raise ValueError("COSMOS_DB_ENDPOINT is required")
        
        try:
            if cosmos_key:
                logger.info("Using key-based auth for Cosmos DB")
                self._cosmos_client = CosmosClient(cosmos_endpoint, credential=cosmos_key)
            else:
                logger.info("Using managed identity for Cosmos DB")
                credential = DefaultAzureCredential()
                self._cosmos_client = CosmosClient(cosmos_endpoint, credential=credential)
            
            database_name = os.environ.get('COSMOS_DB_NAME', 'underwriting')
            container_name = os.environ.get('COSMOS_JOBS_CONTAINER', 'jobs')
            
            database = self._cosmos_client.get_database_client(database_name)
            self._jobs_container = database.get_container_client(container_name)
            
            logger.info(f"Connected to Cosmos DB: {database_name}/{container_name}")
            return self._jobs_container
        
        except Exception as e:
            logger.error(f"Failed to initialize Cosmos DB: {e}")
            raise
    
    def get_blob_service_client(self):
        """Get Blob Storage client"""
        if self._blob_service_client is not None:
            return self._blob_service_client
        
        storage_account_name = os.environ.get('STORAGE_ACCOUNT_NAME')
        storage_conn_string = os.environ.get('STORAGE_CONNECTION_STRING')
        
        if not storage_account_name and not storage_conn_string:
            raise ValueError("STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING is required")
        
        try:
            if storage_conn_string:
                logger.info("Using connection string for Blob Storage")
                self._blob_service_client = BlobServiceClient.from_connection_string(storage_conn_string)
            else:
                logger.info("Using managed identity for Blob Storage")
                account_url = f"https://{storage_account_name}.blob.core.windows.net"
                credential = DefaultAzureCredential()
                self._blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
            
            logger.info("Connected to Blob Storage")
            return self._blob_service_client
        
        except Exception as e:
            logger.error(f"Failed to initialize Blob Storage: {e}")
            raise
    
    def get_servicebus_client(self):
        """Get Service Bus client"""
        if self._servicebus_client is not None:
            return self._servicebus_client
        
        servicebus_namespace = os.environ.get('SERVICE_BUS_NAMESPACE')
        servicebus_conn_string = os.environ.get('SERVICE_BUS_CONNECTION_STRING')
        
        if not servicebus_namespace and not servicebus_conn_string:
            raise ValueError("SERVICE_BUS_NAMESPACE or SERVICE_BUS_CONNECTION_STRING is required")
        
        try:
            if servicebus_conn_string:
                logger.info("Using connection string for Service Bus")
                self._servicebus_client = ServiceBusClient.from_connection_string(servicebus_conn_string)
            else:
                logger.info("Using managed identity for Service Bus")
                fully_qualified_namespace = f"{servicebus_namespace}.servicebus.windows.net"
                credential = DefaultAzureCredential()
                self._servicebus_client = ServiceBusClient(
                    fully_qualified_namespace=fully_qualified_namespace,
                    credential=credential
                )
            
            logger.info("Connected to Service Bus")
            return self._servicebus_client
        
        except Exception as e:
            logger.error(f"Failed to initialize Service Bus: {e}")
            raise
    
    def get_openai_client(self):
        """Get Azure OpenAI client"""
        if self._openai_client is not None:
            return self._openai_client
        
        openai_endpoint = os.environ.get('AZURE_OPENAI_ENDPOINT')
        openai_key = os.environ.get('AZURE_OPENAI_KEY') or os.environ.get('OPENAI_API_KEY')
        api_version = os.environ.get('OPENAI_API_VERSION', '2024-02-15-preview')
        
        if not openai_endpoint or not openai_key:
            raise ValueError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY are required")
        
        try:
            self._openai_client = AzureOpenAI(
                api_key=openai_key,
                api_version=api_version,
                azure_endpoint=openai_endpoint,
                timeout=60.0,
                max_retries=3
            )
            logger.info("Connected to Azure OpenAI")
            return self._openai_client
        
        except Exception as e:
            logger.error(f"Failed to initialize Azure OpenAI: {e}")
            raise


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


def update_job_status(
    jobs_container,
    job_id: str,
    status: str,
    progress: Optional[Dict[str, Any]] = None,
    extracted_data: Optional[List[Dict[str, Any]]] = None,
    analysis: Optional[Dict[str, Any]] = None,
    error: Optional[Dict[str, str]] = None
):
    """Update job status in Cosmos DB"""
    try:
        def read_and_update():
            job = jobs_container.read_item(item=job_id, partition_key=job_id)
            job['status'] = status
            job['updatedAt'] = datetime.utcnow().isoformat()
            
            if progress is not None:
                job['progress'] = progress
            if extracted_data is not None:
                job['extractedData'] = extracted_data
            if analysis is not None:
                job['analysis'] = analysis
            if error is not None:
                job['error'] = error
            
            return jobs_container.upsert_item(job)
        
        with_retries(read_and_update)
        logger.info(f"Updated job {job_id} status to {status}")
    
    except Exception as e:
        logger.error(f"Failed to update job {job_id} status: {e}")
        raise


def download_pdf(blob_service_client, blob_path: str) -> bytes:
    """Download PDF from Blob Storage"""
    try:
        # Parse blob path: container/job-id/filename
        parts = blob_path.split('/', 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid blob path format: {blob_path}")
        
        container_name, blob_name = parts
        
        logger.info(f"Downloading blob: {container_name}/{blob_name}")
        
        def download():
            blob_client = blob_service_client.get_blob_client(container_name, blob_name)
            return blob_client.download_blob().readall()
        
        pdf_content = with_retries(download)
        logger.info(f"Downloaded {len(pdf_content)} bytes")
        return pdf_content
    
    except Exception as e:
        logger.error(f"Failed to download PDF from {blob_path}: {e}")
        raise


def extract_text_from_pdf(pdf_content: bytes) -> List[Dict[str, Any]]:
    """Extract text from PDF pages"""
    try:
        pdf_reader = PdfReader(io.BytesIO(pdf_content))
        num_pages = len(pdf_reader.pages)
        
        logger.info(f"Processing PDF with {num_pages} pages")
        
        pages_data = []
        for page_num, page in enumerate(pdf_reader.pages, start=1):
            text = page.extract_text()
            
            pages_data.append({
                'page': page_num,
                'text': text,
                'pageType': 'unknown'  # Will be classified by AI
            })
            
            logger.info(f"Extracted text from page {page_num}/{num_pages}")
        
        return pages_data
    
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        raise


def analyze_page_with_openai(openai_client, text: str, page_num: int) -> Dict[str, Any]:
    """Analyze page content using Azure OpenAI"""
    try:
        deployment_name = os.environ.get('AZURE_OPENAI_DEPLOYMENT', 'gpt-4')
        
        prompt = f"""Analyze this insurance document page and extract key information:

Page {page_num} Content:
{text[:4000]}

Extract and return as JSON:
1. documentType: (application, medical_report, financial_statement, etc.)
2. keyValues: {{key: value}} pairs of important data
3. riskFactors: list of identified risk factors
4. concerns: list of any discrepancies or concerns

Return only valid JSON."""

        response = openai_client.chat.completions.create(
            model=deployment_name,
            messages=[
                {"role": "system", "content": "You are an insurance underwriting assistant. Extract structured data from documents."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        result = response.choices[0].message.content
        
        # Try to parse as JSON
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            logger.warning(f"Could not parse OpenAI response as JSON for page {page_num}")
            return {"raw_analysis": result}
    
    except Exception as e:
        logger.error(f"OpenAI analysis error for page {page_num}: {e}")
        return {"error": str(e)}


def perform_comprehensive_analysis(openai_client, extracted_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Perform comprehensive underwriting analysis"""
    try:
        deployment_name = os.environ.get('AZURE_OPENAI_DEPLOYMENT', 'gpt-4')
        
        # Combine all extracted text
        full_text = "\n\n".join([
            f"Page {page['page']}:\n{page.get('text', '')[:2000]}"
            for page in extracted_data
        ])
        
        prompt = f"""Perform comprehensive underwriting analysis on this insurance application:

{full_text[:8000]}

Provide analysis as JSON with:
1. summary: Brief overview of the application
2. risks: Array of {{category, severity, description, page}} for identified risks
3. recommendations: Array of recommended actions
4. completedAt: Current timestamp

Focus on medical history, financial status, lifestyle factors, and any discrepancies."""

        response = openai_client.chat.completions.create(
            model=deployment_name,
            messages=[
                {"role": "system", "content": "You are an expert insurance underwriter. Analyze applications for risks and provide recommendations."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        result = response.choices[0].message.content
        
        try:
            analysis = json.loads(result)
            analysis['completedAt'] = datetime.utcnow().isoformat()
            return analysis
        except json.JSONDecodeError:
            logger.warning("Could not parse analysis as JSON")
            return {
                "summary": result,
                "risks": [],
                "recommendations": [],
                "completedAt": datetime.utcnow().isoformat()
            }
    
    except Exception as e:
        logger.error(f"Comprehensive analysis error: {e}")
        raise


def process_job(clients: AzureClients, message_body: Dict[str, Any]):
    """Process a single job"""
    job_id = message_body.get('jobId')
    blob_path = message_body.get('blobPath')
    filename = message_body.get('filename')
    
    logger.info(f"Processing job {job_id}: {filename}")
    
    jobs_container = clients.get_cosmos_container()
    blob_service = clients.get_blob_service_client()
    openai_client = clients.get_openai_client()
    
    try:
        # Update status to processing
        update_job_status(jobs_container, job_id, 'processing', progress={
            'message': 'Starting document processing',
            'currentPage': 0,
            'totalPages': 0
        })
        
        # Download PDF
        pdf_content = download_pdf(blob_service, blob_path)
        
        # Extract text from pages
        pages_data = extract_text_from_pdf(pdf_content)
        total_pages = len(pages_data)
        
        # Analyze each page with OpenAI
        for i, page_data in enumerate(pages_data, start=1):
            update_job_status(jobs_container, job_id, 'processing', progress={
                'message': f'Analyzing page {i} of {total_pages}',
                'currentPage': i,
                'totalPages': total_pages
            })
            
            analysis = analyze_page_with_openai(openai_client, page_data['text'], page_data['page'])
            page_data['analysis'] = analysis
            page_data['pageType'] = analysis.get('documentType', 'unknown')
            page_data['keyValues'] = analysis.get('keyValues', {})
        
        # Store extracted data
        update_job_status(jobs_container, job_id, 'processing', 
                         extracted_data=pages_data,
                         progress={
                             'message': 'Performing comprehensive analysis',
                             'currentPage': total_pages,
                             'totalPages': total_pages
                         })
        
        # Perform comprehensive analysis
        comprehensive_analysis = perform_comprehensive_analysis(openai_client, pages_data)
        
        # Update job to completed
        update_job_status(
            jobs_container,
            job_id,
            'completed',
            extracted_data=pages_data,
            analysis=comprehensive_analysis
        )
        
        logger.info(f"Successfully completed job {job_id}")
    
    except Exception as e:
        logger.error(f"Error processing job {job_id}: {e}", exc_info=True)
        
        # Update job to failed
        update_job_status(
            jobs_container,
            job_id,
            'failed',
            error={
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }
        )
        raise


def update_liveness_probe():
    """Update liveness probe file for Kubernetes"""
    try:
        with open('/tmp/worker_alive', 'w') as f:
            f.write(datetime.utcnow().isoformat())
    except Exception as e:
        logger.warning(f"Failed to update liveness probe: {e}")


def main():
    """Main worker loop"""
    logger.info("Starting document processing worker...")
    
    # Initialize clients
    clients = AzureClients()
    
    # Get Service Bus receiver
    servicebus_client = clients.get_servicebus_client()
    queue_name = os.environ.get('SERVICE_BUS_QUEUE_NAME', 'document-extraction')
    
    logger.info(f"Listening to queue: {queue_name}")
    
    with servicebus_client.get_queue_receiver(
        queue_name=queue_name,
        receive_mode=ServiceBusReceiveMode.PEEK_LOCK,
        max_wait_time=30
    ) as receiver:
        
        while not shutdown_flag:
            try:
                # Update liveness probe
                update_liveness_probe()
                
                # Receive messages
                messages = receiver.receive_messages(max_message_count=1, max_wait_time=30)
                
                for message in messages:
                    try:
                        # Parse message body
                        message_body = json.loads(str(message))
                        logger.info(f"Received message: {message_body}")
                        
                        # Process job
                        process_job(clients, message_body)
                        
                        # Complete message
                        receiver.complete_message(message)
                        logger.info("Message completed successfully")
                    
                    except Exception as e:
                        logger.error(f"Error processing message: {e}", exc_info=True)
                        
                        # Abandon message (will be retried)
                        receiver.abandon_message(message)
                        logger.info("Message abandoned for retry")
            
            except KeyboardInterrupt:
                logger.info("Received keyboard interrupt")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)
                time.sleep(5)  # Wait before retrying
    
    logger.info("Worker shutting down gracefully")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
