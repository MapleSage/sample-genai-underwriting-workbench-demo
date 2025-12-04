import azure.functions as func
import json
import logging
import os
import uuid
import time
from datetime import datetime, timedelta

from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from azure.identity import DefaultAzureCredential


def get_clients():
    """Lazily initialize Azure clients using environment variables."""
    # Prefer Managed Identity if available
    storage_conn = os.environ.get('STORAGE_CONNECTION_STRING')
    cosmos_endpoint = os.environ.get('COSMOS_DB_ENDPOINT')
    cosmos_key = os.environ.get('COSMOS_DB_KEY')
    storage_account_name = os.environ.get('STORAGE_ACCOUNT_NAME')

    try:
        if storage_account_name and cosmos_endpoint:
            # Use DefaultAzureCredential if the function app has a managed identity
            cred = DefaultAzureCredential()
            blob_service = BlobServiceClient(account_url=f"https://{storage_account_name}.blob.core.windows.net", credential=cred)
            cosmos_client = CosmosClient(cosmos_endpoint, credential=cred)
            database = cosmos_client.get_database_client('underwriting')
            jobs_container = database.get_container_client('jobs')
            return blob_service, jobs_container
    except Exception:
        logging.exception('Managed Identity auth failed, falling back to connection-string auth')

    # Fallback to connection string / key-based auth
    if not storage_conn or not cosmos_endpoint or not cosmos_key:
        raise Exception('Missing required environment variables for storage or Cosmos DB')

    blob_service = BlobServiceClient.from_connection_string(storage_conn)
    cosmos_client = CosmosClient(cosmos_endpoint, cosmos_key)
    database = cosmos_client.get_database_client('underwriting')
    jobs_container = database.get_container_client('jobs')

    return blob_service, jobs_container


def parse_connection_string(conn_str: str):
    """Extract account name and key from a storage connection string."""
    parts = dict(p.split('=', 1) for p in conn_str.split(';') if '=' in p)
    return parts.get('AccountName'), parts.get('AccountKey')


def create_upload_sas_url(blob_service: BlobServiceClient, container: str, blob_name: str, expiry_minutes: int = 60):
    # SAS generation requires account key; prefer connection string for SAS generation
    conn_str = os.environ.get('STORAGE_CONNECTION_STRING')
    if not conn_str:
        # If no connection string available, we cannot generate a service SAS here.
        # In that case, the app should use Azure AD based uploads (not implemented in this helper).
        raise Exception('STORAGE_CONNECTION_STRING required to generate SAS upload URL')

    account_name, account_key = parse_connection_string(conn_str)
    if not account_name or not account_key:
        raise Exception('Could not parse storage account name/key from connection string')

    sas_token = generate_blob_sas(
        account_name=account_name,
        account_key=account_key,
        container_name=container,
        blob_name=blob_name,
        permission=BlobSasPermissions(write=True, create=True),
        expiry=datetime.utcnow() + timedelta(minutes=expiry_minutes)
    )

    blob_client = blob_service.get_blob_client(container, blob_name)
    return f"{blob_client.url}?{sas_token}"


def _with_retries(fn, retries=4, base_delay=0.5, factor=2.0):
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            sleep_for = base_delay * (factor ** (attempt - 1))
            logging.warning('Attempt %s failed, retrying in %.2fs: %s', attempt, sleep_for, str(e))
            time.sleep(sleep_for)
    raise last_exc


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('API Handler received request: %s %s', req.method, req.url)

    try:
        blob_service, jobs_container = get_clients()
    except Exception as e:
        logging.exception('Client initialization failed')
        return func.HttpResponse(json.dumps({'error': str(e)}), status_code=500, mimetype='application/json')

    # Get wildcard route value (function.json uses "{*route}")
    route_val = req.route_params.get('route') or ''

    # Route: POST /documents/upload
    if req.method == 'POST' and (route_val == 'documents/upload' or req.url.endswith('/documents/upload')):
        try:
            body = req.get_json()
            filename = body.get('filename')
            insurance_type = body.get('insuranceType')

            if not filename:
                return func.HttpResponse(json.dumps({'error': 'filename is required'}), status_code=400, mimetype='application/json')

            job_id = f"job-{uuid.uuid4().hex}"

            # Create job item in Cosmos DB
            job_item = {
                'id': job_id,
                'jobId': job_id,
                'filename': filename,
                'insuranceType': insurance_type,
                'status': 'pending',
                'createdAt': datetime.utcnow().isoformat()
            }
            jobs_container.create_item(job_item)

            # Create upload URL pointing to documents/{jobId}/{filename}
            blob_name = f"{job_id}/{filename}"
            upload_url = create_upload_sas_url(blob_service, 'documents', blob_name)

            resp = {'uploadUrl': upload_url, 'jobId': job_id}
            return func.HttpResponse(json.dumps(resp), status_code=200, mimetype='application/json')
        except Exception as e:
            logging.exception('Error handling upload request')
            return func.HttpResponse(json.dumps({'error': str(e)}), status_code=500, mimetype='application/json')

    # Route: GET /jobs/{jobId}
    if req.method == 'GET' and route_val.startswith('jobs/'):
        job_id = route_val.split('/', 1)[1] if '/' in route_val else None
        try:
            job = jobs_container.read_item(job_id, partition_key=job_id)
            return func.HttpResponse(json.dumps(job), status_code=200, mimetype='application/json')
        except Exception as e:
            logging.exception('Error fetching job')
            return func.HttpResponse(json.dumps({'error': str(e)}), status_code=404, mimetype='application/json')

    # Default response
    return func.HttpResponse(json.dumps({'message': 'OK'}), status_code=200, mimetype='application/json')
