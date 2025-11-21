import azure.functions as func
import json
import logging
import os
import uuid
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta

# Initialize clients
cosmos_client = CosmosClient(os.environ['COSMOS_DB_ENDPOINT'], os.environ['COSMOS_DB_KEY'])
database = cosmos_client.get_database_client('underwriting')
jobs_container = database.get_container_client('jobs')

blob_service_client = BlobServiceClient.from_connection_string(os.environ['STORAGE_CONNECTION_STRING'])

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('API Handler function processed a request.')
    
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    
    # Handle OPTIONS preflight
    if req.method == 'OPTIONS':
        return func.HttpResponse(status_code=200, headers=headers)
    
    route = req.route_params.get('route', '')
    method = req.method
    
    try:
        if route in ['upload', 'documents/upload'] and method == 'POST':
            return handle_upload(req, headers)
        elif route == 'documents/batch-upload' and method == 'POST':
            return handle_batch_upload(req, headers)
        elif route == 'jobs' and method == 'GET':
            return handle_get_jobs(req, headers)
        elif route.startswith('jobs/') and '/document-url' in route and method == 'GET':
            job_id = route.split('/')[1]
            return handle_get_document_url(job_id, headers)
        elif route.startswith('jobs/') and method == 'GET':
            job_id = route.split('/')[1]
            return handle_get_job(job_id, headers)
        else:
            return func.HttpResponse(
                json.dumps({'error': f'Route not found: {route}'}),
                status_code=404,
                mimetype='application/json',
                headers=headers
            )
    except Exception as e:
        logging.error(f'Error: {str(e)}')
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json',
            headers=headers
        )

def handle_upload(req: func.HttpRequest, headers: dict) -> func.HttpResponse:
    """Generate presigned URL for document upload"""
    try:
        req_body = req.get_json()
        filename = req_body.get('filename')
        
        if not filename:
            return func.HttpResponse(
                json.dumps({'error': 'filename is required'}),
                status_code=400,
                mimetype='application/json',
                headers=headers
            )
        
        # Get storage connection string from env
        storage_conn_str = os.environ.get('STORAGE_CONNECTION_STRING')
        if not storage_conn_str:
            storage_conn_str = os.environ.get('AzureWebJobsStorage')
        
        blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
        blob_client = blob_service.get_blob_client('documents', filename)
        
        # Get account key from connection string
        import re
        account_key_match = re.search(r'AccountKey=([^;]+)', storage_conn_str)
        account_name_match = re.search(r'AccountName=([^;]+)', storage_conn_str)
        
        if account_key_match and account_name_match:
            account_key = account_key_match.group(1)
            account_name = account_name_match.group(1)
            
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name='documents',
                blob_name=filename,
                account_key=account_key,
                permission=BlobSasPermissions(write=True, create=True),
                expiry=datetime.utcnow() + timedelta(hours=1)
            )
            
            upload_url = f"{blob_client.url}?{sas_token}"
        else:
            upload_url = blob_client.url
        
        # Create job entry
        job_id = f"job-{str(uuid.uuid4())}"
        job_data = {
            'id': job_id,
            'jobId': job_id,
            'filename': filename,
            'status': 'pending',
            'createdAt': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        }
        jobs_container.create_item(job_data)
        
        return func.HttpResponse(
            json.dumps({
                'uploadUrl': upload_url,
                'jobId': job_id
            }),
            mimetype='application/json',
            headers=headers
        )
    except Exception as e:
        logging.error(f'Upload error: {str(e)}')
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json',
            headers=headers
        )

def handle_get_jobs(req: func.HttpRequest, headers: dict) -> func.HttpResponse:
    """Get all jobs"""
    try:
        items = list(jobs_container.read_all_items())
        # Add frontend-compatible fields
        for item in items:
            if 'createdAt' in item:
                item['uploadTimestamp'] = item['createdAt']
                item['timestamp'] = item['createdAt']
            if 'filename' in item:
                item['originalFilename'] = item['filename']
            # Add batchId - use batchJobId if exists, otherwise use jobId as single-item batch
            if 'batchJobId' in item:
                item['batchId'] = item['batchJobId']
            else:
                item['batchId'] = item.get('jobId', item.get('id', 'unknown'))
            # Map status to frontend format
            if item.get('status') == 'extracted':
                item['status'] = 'Complete'
            elif item.get('status') == 'pending':
                item['status'] = 'In Progress'
            elif item.get('status') == 'failed':
                item['status'] = 'Failed'
        return func.HttpResponse(
            json.dumps({'jobs': items}),
            mimetype='application/json',
            headers=headers
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json',
            headers=headers
        )

def handle_get_job(job_id: str, headers: dict) -> func.HttpResponse:
    """Get specific job"""
    try:
        item = jobs_container.read_item(job_id, partition_key=job_id)
        # Add frontend-compatible fields
        if 'createdAt' in item:
            item['uploadTimestamp'] = item['createdAt']
            item['timestamp'] = item['createdAt']
        if 'filename' in item:
            item['originalFilename'] = item['filename']
        # Add batchId - use batchJobId if exists, otherwise use jobId as single-item batch
        if 'batchJobId' in item:
            item['batchId'] = item['batchJobId']
        else:
            item['batchId'] = item.get('jobId', item.get('id', 'unknown'))
        # Map status to frontend format
        if item.get('status') == 'extracted':
            item['status'] = 'Complete'
        elif item.get('status') == 'pending':
            item['status'] = 'In Progress'
        elif item.get('status') == 'failed':
            item['status'] = 'Failed'
        return func.HttpResponse(
            json.dumps(item),
            mimetype='application/json',
            headers=headers
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=404,
            mimetype='application/json',
            headers=headers
        )

def handle_batch_upload(req: func.HttpRequest, headers: dict) -> func.HttpResponse:
    """Generate presigned URLs for multiple document uploads"""
    try:
        req_body = req.get_json()
        files = req_body.get('files', [])
        insurance_type = req_body.get('insuranceType', 'life')
        
        if not files:
            return func.HttpResponse(
                json.dumps({'error': 'files array is required'}),
                status_code=400,
                mimetype='application/json',
                headers=headers
            )
        
        # Get storage connection string
        storage_conn_str = os.environ.get('STORAGE_CONNECTION_STRING') or os.environ.get('AzureWebJobsStorage')
        blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
        
        # Extract account info
        import re
        account_key_match = re.search(r'AccountKey=([^;]+)', storage_conn_str)
        account_name_match = re.search(r'AccountName=([^;]+)', storage_conn_str)
        
        if not (account_key_match and account_name_match):
            return func.HttpResponse(
                json.dumps({'error': 'Storage account configuration error'}),
                status_code=500,
                mimetype='application/json',
                headers=headers
            )
        
        account_key = account_key_match.group(1)
        account_name = account_name_match.group(1)
        
        # Create batch job
        batch_job_id = f"batch-{str(uuid.uuid4())}"
        
        upload_urls = []
        job_ids = []
        
        for file_info in files:
            filename = file_info.get('filename')
            if not filename:
                continue
                
            blob_client = blob_service.get_blob_client('documents', filename)
            
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name='documents',
                blob_name=filename,
                account_key=account_key,
                permission=BlobSasPermissions(write=True, create=True),
                expiry=datetime.utcnow() + timedelta(hours=1)
            )
            
            upload_url = f"{blob_client.url}?{sas_token}"
            
            # Create individual job entry
            job_id = f"job-{str(uuid.uuid4())}"
            job_data = {
                'id': job_id,
                'jobId': job_id,
                'filename': filename,
                'status': 'pending',
                'insuranceType': insurance_type,
                'batchJobId': batch_job_id,
                'createdAt': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            }
            jobs_container.create_item(job_data)
            
            upload_urls.append(upload_url)
            job_ids.append(job_id)
        
        return func.HttpResponse(
            json.dumps({
                'uploadUrls': upload_urls,
                'jobIds': job_ids,
                'batchJobId': batch_job_id
            }),
            mimetype='application/json',
            headers=headers
        )
    except Exception as e:
        logging.error(f'Batch upload error: {str(e)}')
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json',
            headers=headers
        )

def handle_get_document_url(job_id: str, headers: dict) -> func.HttpResponse:
    """Get presigned URL for viewing document"""
    try:
        # Get job to find filename
        item = jobs_container.read_item(job_id, partition_key=job_id)
        filename = item.get('filename')
        
        if not filename:
            return func.HttpResponse(
                json.dumps({'error': 'Filename not found in job'}),
                status_code=404,
                mimetype='application/json',
                headers=headers
            )
        
        # Get storage connection string
        storage_conn_str = os.environ.get('STORAGE_CONNECTION_STRING') or os.environ.get('AzureWebJobsStorage')
        blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
        blob_client = blob_service.get_blob_client('documents', filename)
        
        # Extract account info
        import re
        account_key_match = re.search(r'AccountKey=([^;]+)', storage_conn_str)
        account_name_match = re.search(r'AccountName=([^;]+)', storage_conn_str)
        
        if account_key_match and account_name_match:
            account_key = account_key_match.group(1)
            account_name = account_name_match.group(1)
            
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name='documents',
                blob_name=filename,
                account_key=account_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.utcnow() + timedelta(hours=1)
            )
            
            document_url = f"{blob_client.url}?{sas_token}"
        else:
            document_url = blob_client.url
        
        return func.HttpResponse(
            json.dumps({'url': document_url}),
            mimetype='application/json',
            headers=headers
        )
    except Exception as e:
        logging.error(f'Get document URL error: {str(e)}')
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=404,
            mimetype='application/json',
            headers=headers
        )
