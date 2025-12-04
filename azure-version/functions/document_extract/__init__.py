import azure.functions as func
import logging
import os
import json
import time
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from azure.identity import DefaultAzureCredential
from openai import AzureOpenAI
try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader
from PIL import Image
import io
import base64

# Lazy client initialization (avoid import-time failures)
cosmos_client = None
jobs_container = None
blob_service_client = None


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


def init_clients():
    global cosmos_client, jobs_container, blob_service_client
    if jobs_container and blob_service_client:
        return

    cosmos_endpoint = os.environ.get('COSMOS_DB_ENDPOINT')
    cosmos_key = os.environ.get('COSMOS_DB_KEY')
    storage_conn = os.environ.get('STORAGE_CONNECTION_STRING')
    storage_account_name = os.environ.get('STORAGE_ACCOUNT_NAME')

    # Try Managed Identity first
    try:
        if storage_account_name and cosmos_endpoint:
            cred = DefaultAzureCredential()
            blob_service_client = BlobServiceClient(account_url=f"https://{storage_account_name}.blob.core.windows.net", credential=cred)
            cosmos_client = CosmosClient(cosmos_endpoint, credential=cred)
            database = cosmos_client.get_database_client('underwriting')
            jobs_container = database.get_container_client('jobs')
            return
    except Exception:
        logging.exception('Managed Identity unavailable, falling back to key/connection string')

    # Fallback
    if not storage_conn or not cosmos_endpoint or not cosmos_key:
        raise Exception('Missing storage or cosmos credentials')

    blob_service_client = BlobServiceClient.from_connection_string(storage_conn)
    cosmos_client = CosmosClient(cosmos_endpoint, cosmos_key)
    database = cosmos_client.get_database_client('underwriting')
    jobs_container = database.get_container_client('jobs')

# Azure OpenAI client
openai_client = AzureOpenAI(
    api_key=os.environ.get('AZURE_OPENAI_KEY'),
    api_version='2024-02-01',
    azure_endpoint=os.environ.get('AZURE_OPENAI_ENDPOINT')
)

def main(event: func.EventGridEvent):
    logging.info(f"Processing Event Grid event: {event.get_json()}")
    
    # Get blob info from event
    event_data = event.get_json()
    blob_url = event_data['url']
    
    # Parse path to get Job ID and filename
    # URL format: https://<account>.blob.core.windows.net/documents/<job-id>/<filename>
    path_parts = blob_url.split('/')
    filename = path_parts[-1]
    
    # Try to extract Job ID (parent folder)
    # If path is documents/<filename>, parent is 'documents' (legacy)
    # If path is documents/<job-id>/<filename>, parent is <job-id>
    possible_job_id = path_parts[-2]
    
    logging.info(f"Processing blob: {filename}, Possible Job ID: {possible_job_id}")
    
    try:
        init_clients()
        # Download blob
        # If using job-id folder, we need to provide the full blob name
        if possible_job_id.startswith('job-'):
            blob_name = f"{possible_job_id}/{filename}"
            job_id = possible_job_id
        else:
            blob_name = filename
            job_id = None
            
        blob_client = blob_service_client.get_blob_client('documents', blob_name)
        pdf_content = _with_retries(lambda: blob_client.download_blob().readall())
        pdf_reader = PdfReader(io.BytesIO(pdf_content))
        
        extracted_data = []
        
        # Process each page
        for page_num, page in enumerate(pdf_reader.pages):
            logging.info(f"Processing page {page_num + 1}")
            
            # Extract text
            text = page.extract_text()
            
            # Use GPT-4 Vision for analysis (simplified)
            page_analysis = analyze_page_with_gpt4(text, page_num + 1)
            
            extracted_data.append({
                'page': page_num + 1,
                'text': text,
                'analysis': page_analysis
            })
        
        # Store results in Cosmos DB
            if job_id:
            # New path: Update specific job by ID
            try:
                    job = _with_retries(lambda: jobs_container.read_item(job_id, partition_key=job_id))
                    job['extractedData'] = extracted_data
                    job['status'] = 'extracted'
                    _with_retries(lambda: jobs_container.upsert_item(job))
                    logging.info(f"Updated job {job['id']} with extracted data")
            except Exception as e:
                logging.error(f"Failed to update job {job_id}: {str(e)}")
                raise
        else:
            # Legacy path: Find job by filename (prone to race conditions)
            logging.warning(f"Using legacy filename lookup for {filename}")
            query = f"SELECT * FROM c WHERE c.filename = '{filename}' AND c.status = 'pending'"
            jobs = list(jobs_container.query_items(query, enable_cross_partition_query=True))
            
            if jobs:
                job = jobs[0]
                job['extractedData'] = extracted_data
                job['status'] = 'extracted'
                _with_retries(lambda: jobs_container.upsert_item(job))
                logging.info(f"Updated job {job['id']} with extracted data")
            else:
                logging.warning(f"No pending job found for filename: {filename}")
        
    except Exception as e:
        logging.error(f"Error processing document: {str(e)}")
        raise

def analyze_page_with_gpt4(text: str, page_num: int) -> dict:
    """Analyze page content using GPT-4"""
    try:
        prompt = f"""Analyze this insurance document page and extract key information:

Page {page_num} Content:
{text[:4000]}  # Limit text length

Extract:
1. Document type (application, medical report, etc.)
2. Key data points (names, dates, amounts, medical conditions)
3. Risk factors
4. Any discrepancies or concerns

Return as JSON."""

        response = openai_client.chat.completions.create(
            model=os.environ.get('AZURE_OPENAI_DEPLOYMENT', 'gpt-4'),
            messages=[
                {"role": "system", "content": "You are an insurance underwriting assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        result = response.choices[0].message.content
        
        # Try to parse as JSON
        try:
            return json.loads(result)
        except:
            return {"raw_analysis": result}
            
    except Exception as e:
        logging.error(f"GPT-4 analysis error: {str(e)}")
        return {"error": str(e)}
