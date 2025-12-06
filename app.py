from flask import Flask, request, jsonify
import json
import os
import uuid
import time
from datetime import datetime, timedelta
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from azure.identity import DefaultAzureCredential

app = Flask(__name__)

def get_clients():
    storage_account_name = os.environ.get('STORAGE_ACCOUNT_NAME', 'uwworkbenchprodsa')
    cosmos_endpoint = os.environ.get('COSMOS_DB_ENDPOINT', 'https://uw-workbench-prod-cosmos.documents.azure.com:443/')
    
    cred = DefaultAzureCredential()
    blob_service = BlobServiceClient(account_url=f"https://{storage_account_name}.blob.core.windows.net", credential=cred)
    cosmos_client = CosmosClient(cosmos_endpoint, credential=cred)
    database = cosmos_client.get_database_client('underwriting')
    jobs_container = database.get_container_client('jobs')
    return blob_service, jobs_container

@app.route('/api/documents/upload', methods=['POST'])
def upload_document():
    try:
        blob_service, jobs_container = get_clients()
        
        data = request.get_json()
        filename = data.get('filename')
        insurance_type = data.get('insuranceType')
        
        if not filename:
            return jsonify({'error': 'filename is required'}), 400
            
        job_id = f"job-{uuid.uuid4().hex}"
        
        job_item = {
            'id': job_id,
            'jobId': job_id,
            'filename': filename,
            'insuranceType': insurance_type,
            'status': 'pending',
            'createdAt': datetime.utcnow().isoformat()
        }
        jobs_container.create_item(job_item)
        
        # For now, return a simple response
        return jsonify({'uploadUrl': f'https://example.com/upload/{job_id}', 'jobId': job_id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job(job_id):
    try:
        blob_service, jobs_container = get_clients()
        job = jobs_container.read_item(job_id, partition_key=job_id)
        return jsonify(job)
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)