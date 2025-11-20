import azure.functions as func
import logging
import os
import json
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from openai import AzureOpenAI
try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader
from PIL import Image
import io
import base64

# Initialize clients
cosmos_client = CosmosClient(os.environ['COSMOS_DB_ENDPOINT'], os.environ['COSMOS_DB_KEY'])
database = cosmos_client.get_database_client('underwriting')
jobs_container = database.get_container_client('jobs')

blob_service_client = BlobServiceClient.from_connection_string(os.environ['STORAGE_CONNECTION_STRING'])

# Azure OpenAI client
openai_client = AzureOpenAI(
    api_key=os.environ.get('AZURE_OPENAI_KEY'),
    api_version='2024-02-01',
    azure_endpoint=os.environ.get('AZURE_OPENAI_ENDPOINT')
)

def main(myblob: func.InputStream):
    logging.info(f"Processing blob: {myblob.name}")
    
    try:
        # Extract job ID from blob name
        filename = myblob.name.split('/')[-1]
        
        # Read PDF
        pdf_content = myblob.read()
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
        # Find job by filename
        query = f"SELECT * FROM c WHERE c.filename = '{filename}'"
        jobs = list(jobs_container.query_items(query, enable_cross_partition_query=True))
        
        if jobs:
            job = jobs[0]
            job['extractedData'] = extracted_data
            job['status'] = 'extracted'
            jobs_container.upsert_item(job)
            logging.info(f"Updated job {job['id']} with extracted data")
        
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
