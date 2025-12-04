import json
import boto3
import os
import urllib.parse
from datetime import datetime

stepfunctions = boto3.client('stepfunctions')
STATE_MACHINE_ARN = os.environ['STATE_MACHINE_ARN']

def lambda_handler(event, context):
    """
    Triggered by S3 event notifications when files are uploaded.
    Starts the Step Functions workflow for document processing.
    """
    print(f"Received event: {json.dumps(event)}")
    
    executions_started = 0
    errors = []
    
    for record in event.get('Records', []):
        try:
            # Extract S3 bucket and key from the event
            bucket = record['s3']['bucket']['name']
            encoded_key = record['s3']['object']['key']
            
            # Decode the key (S3 events URL-encode the key)
            key = urllib.parse.unquote_plus(encoded_key)
            
            print(f"Processing upload: s3://{bucket}/{key}")
            
            # Only process files in the uploads/ prefix
            if not key.startswith('uploads/'):
                print(f"Skipping file {key} - not in uploads/ prefix")
                continue
            
            # Only process PDF files
            if not key.lower().endswith('.pdf'):
                print(f"Skipping file {key} - not a PDF")
                continue
            
            # Create a unique execution name from the S3 key
            # Replace invalid characters for Step Functions execution names
            timestamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
            execution_name = f"upload-{timestamp}-{key.replace('/', '-').replace('.', '-')}"[:80]
            
            # Start Step Functions execution
            response = stepfunctions.start_execution(
                stateMachineArn=STATE_MACHINE_ARN,
                name=execution_name,
                input=json.dumps({
                    'detail': {
                        'bucket': {'name': bucket},
                        'object': {'key': key}
                    },
                    'classification': 'OTHER'
                })
            )
            
            print(f"✅ Started execution: {response['executionArn']}")
            executions_started += 1
            
        except Exception as e:
            error_msg = f"Error processing record: {str(e)}"
            print(f"❌ {error_msg}")
            errors.append(error_msg)
            # Don't raise - continue processing other files
    
    result = {
        'statusCode': 200 if not errors else 207,  # 207 = Multi-Status
        'body': json.dumps({
            'message': f'Started {executions_started} workflow execution(s)',
            'executionsStarted': executions_started,
            'errors': errors if errors else None
        })
    }
    
    print(f"Result: {json.dumps(result)}")
    return result
