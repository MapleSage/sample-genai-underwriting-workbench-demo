#!/bin/bash

# Test the Azure underwriting app upload flow

API_URL="https://uw-functions-11e9fd0d.azurewebsites.net/api"
SAMPLE_FILE="../sample_documents/life_submission.pdf"

echo "=== Testing Azure Underwriting App ==="
echo ""

# Step 1: Request upload URL
echo "1. Requesting upload URL..."
UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Content-Type: application/json" \
  -d '{"filename": "life_submission.pdf", "insuranceType": "life"}')

echo "Response: $UPLOAD_RESPONSE"
echo ""

UPLOAD_URL=$(echo $UPLOAD_RESPONSE | jq -r '.uploadUrl')
JOB_ID=$(echo $UPLOAD_RESPONSE | jq -r '.jobId')

echo "Job ID: $JOB_ID"
echo ""

# Step 2: Upload the file
echo "2. Uploading file to Azure Blob Storage..."
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  -H "x-ms-blob-type: BlockBlob" \
  --data-binary "@$SAMPLE_FILE" \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

# Step 3: Check job status
echo "3. Checking job status..."
sleep 2
JOB_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID")
echo "Job Status: $JOB_STATUS" | jq '.'
echo ""

echo "=== Test Complete ==="
echo "Job ID: $JOB_ID"
echo "Check status at: $API_URL/jobs/$JOB_ID"
echo "Frontend URL: https://victorious-mushroom-0a855a80f.3.azurestaticapps.net/jobs/$JOB_ID"
