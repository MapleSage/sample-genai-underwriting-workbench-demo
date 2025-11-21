#!/usr/bin/env python3
import os
import sys
from azure.cosmos import CosmosClient

# Get credentials from environment or Azure CLI
endpoint = os.environ.get('COSMOS_DB_ENDPOINT')
key = os.environ.get('COSMOS_DB_KEY')

if not endpoint or not key:
    print("Error: COSMOS_DB_ENDPOINT and COSMOS_DB_KEY must be set")
    sys.exit(1)

# Initialize client
client = CosmosClient(endpoint, key)
database = client.get_database_client('underwriting')
container = database.get_container_client('jobs')

# Get all pending jobs
query = "SELECT * FROM c WHERE c.status = 'In Progress' OR c.status = 'pending'"
pending_jobs = list(container.query_items(query, enable_cross_partition_query=True))

print(f"Found {len(pending_jobs)} pending jobs to delete")

# Delete each job
for job in pending_jobs:
    try:
        container.delete_item(job['id'], partition_key=job['id'])
        print(f"Deleted job: {job['id']} ({job.get('filename', 'unknown')})")
    except Exception as e:
        print(f"Error deleting job {job['id']}: {e}")

print(f"\nDeleted {len(pending_jobs)} pending jobs")
