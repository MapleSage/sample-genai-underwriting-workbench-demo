# Fixes Applied - November 29, 2024

## Current Architecture

**Multi-Cloud Hybrid Setup**:
- Frontend: Vercel (Vite/React)
- Auth: AWS Cognito
- Backend: Azure Functions + Cosmos DB + Blob Storage
- Event Processing: Event Grid (now added)

## Issues Fixed

### 1. OAuth Double Callback Error ✅
**Problem**: OAuth callback triggered twice, causing "Invalid OAuth callback - missing or mismatched parameters" error in console.

**Solution**: Added `useRef` flag in `OAuthCallback.tsx` to prevent double execution.

**Files Changed**:
- `frontend/src/pages/OAuthCallback.tsx`

### 2. Unknown Status "In Progress" Warning ✅
**Problem**: Console warnings showing "Unknown status received: In Progress".

**Solution**: Added "In Progress" status to `STATUS_MAPPING` in `JobPage.tsx`.

**Files Changed**:
- `frontend/src/components/JobPage.tsx`

### 3. Jobs Stuck in "Pending" Status ✅
**Problem**: Jobs created but never processed - stuck as "pending" forever.

**Root Cause**: Event Grid subscription was missing from infrastructure. The `document_extract` Azure Function was never being triggered when PDFs were uploaded to blob storage.

**Solution**: Added Event Grid System Topic and Subscription to Bicep template to automatically trigger document extraction when PDFs are uploaded.

**Files Changed**:
- `azure-version/infrastructure/main.bicep`

**What was added**:
- Event Grid System Topic for Storage Account events
- Event Grid Subscription that triggers `document_extract` function on blob creation
- Filter for `.pdf` files in `documents` container only
- Retry policy with 30 attempts over 24 hours

## Deployment

### 1. Deploy Infrastructure Changes

```bash
cd azure-version

# Deploy the updated Bicep template
az deployment group create \
  --resource-group <your-resource-group> \
  --template-file infrastructure/main.bicep
```

### 2. Deploy Frontend to Vercel

The frontend changes are already built. Vercel will auto-deploy on git push, or manually:

```bash
cd frontend
npm install
npm run build

# Deploy to Vercel
vercel --prod
```

### 3. Clean Up Stuck Jobs

Run the cleanup script to remove existing stuck jobs:

```bash
cd azure-version

# Set environment variables
export COSMOS_DB_ENDPOINT="<your-cosmos-endpoint>"
export COSMOS_DB_KEY="<your-cosmos-key>"

# Run cleanup
python3 delete_pending_jobs.py
```

## Verification

### Test Event Grid Trigger

1. Upload a PDF to the `documents` container:
   ```bash
   az storage blob upload \
     --account-name <storage-account> \
     --container-name documents \
     --name test.pdf \
     --file sample_documents/test.pdf
   ```

2. Check Function App logs:
   ```bash
   az monitor activity-log list \
     --resource-group <your-resource-group> \
     --max-events 10
   ```

3. Verify job status changes from "pending" to "extracted" in Cosmos DB

### Test Frontend

1. Clear browser cache
2. Sign in (should not see OAuth errors)
3. Upload a document
4. Monitor status (should not see "Unknown status" warnings)
5. Job should progress from "In Progress" to "Complete"

## How It Works Now

```
User uploads PDF
    ↓
Blob Storage (documents container)
    ↓
Event Grid detects BlobCreated event
    ↓
Triggers document_extract Function
    ↓
Function processes PDF with GPT-4
    ↓
Updates Cosmos DB: status = "extracted"
    ↓
Frontend polls and shows "Complete"
```

## Troubleshooting

### Jobs still stuck?

Check Event Grid subscription status:
```bash
az eventgrid system-topic event-subscription show \
  --name document-upload-subscription \
  --system-topic-name uw-storage-events-<suffix> \
  --resource-group <your-resource-group>
```

### Function not triggering?

Check Function App logs:
```bash
az webapp log tail \
  --name <function-app-name> \
  --resource-group <your-resource-group>
```

### Event Grid issues?

View Event Grid metrics:
```bash
az monitor metrics list \
  --resource <system-topic-resource-id> \
  --metric "PublishSuccessCount,PublishFailCount"
```
