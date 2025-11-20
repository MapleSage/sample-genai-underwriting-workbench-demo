# Azure Deployment Guide

## Quick Start

### 1. Prerequisites Setup

Install required tools:

```bash
# Azure CLI
brew install azure-cli  # macOS
# or visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Login to Azure
az login
```

### 2. Azure OpenAI Setup

You need an Azure OpenAI resource with GPT-4 deployed:

```bash
# Create Azure OpenAI resource (if not exists)
az cognitiveservices account create \
  --name your-openai-resource \
  --resource-group your-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus

# Deploy GPT-4 model
az cognitiveservices account deployment create \
  --name your-openai-resource \
  --resource-group your-rg \
  --deployment-name gpt-4 \
  --model-name gpt-4 \
  --model-version "0613" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
nano .env
```

Required values:

- `AZURE_SUBSCRIPTION_ID`: Your Azure subscription ID
- `AZURE_OPENAI_ENDPOINT`: Your OpenAI endpoint URL
- `AZURE_OPENAI_KEY`: Your OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT`: Your GPT-4 deployment name

### 4. Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Source environment variables
source .env

# Run deployment
./deploy.sh
```

The script will:

1. Create resource group
2. Deploy infrastructure (Bicep)
3. Deploy Azure Functions
4. Configure app settings
5. Output URLs and endpoints

### 5. Test the Deployment

```bash
# Get function app URL
FUNCTION_URL=$(az functionapp show \
  --name <function-app-name> \
  --resource-group underwriting-workbench-rg \
  --query defaultHostName -o tsv)

# Test API endpoint
curl https://$FUNCTION_URL/api/jobs
```

## Architecture Components

### Azure Services Used

1. **Azure Functions** (Serverless compute)
   - `api_handler`: REST API endpoints
   - `document_extract`: PDF processing with GPT-4
   - `document_analyze`: Underwriting analysis

2. **Azure Blob Storage** (Document storage)
   - `documents`: Uploaded PDFs
   - `extraction-chunks`: Processed data

3. **Azure Cosmos DB** (NoSQL database)
   - `jobs` container: Job metadata and results

4. **Azure OpenAI Service** (AI/ML)
   - GPT-4 for document analysis
   - GPT-4 Vision for image processing

5. **Azure Static Web Apps** (Frontend hosting)
   - React application
   - CDN distribution

## Cost Estimation

Approximate monthly costs (USD):

- Azure Functions (Consumption): $0-20
- Cosmos DB (Serverless): $1-50
- Blob Storage: $1-10
- Azure OpenAI (GPT-4): $30-500 (usage-based)
- Static Web Apps (Free tier): $0

**Total: ~$32-580/month** (depending on usage)

## Troubleshooting

### Function deployment fails

```bash
# Check function app logs
az functionapp log tail \
  --name <function-app-name> \
  --resource-group underwriting-workbench-rg
```

### OpenAI connection issues

```bash
# Verify OpenAI settings
az functionapp config appsettings list \
  --name <function-app-name> \
  --resource-group underwriting-workbench-rg \
  | grep OPENAI
```

### Storage access issues

```bash
# Check storage connection
az storage account show-connection-string \
  --name <storage-account-name> \
  --resource-group underwriting-workbench-rg
```

## Cleanup

To remove all resources:

```bash
az group delete --name underwriting-workbench-rg --yes --no-wait
```

## Next Steps

1. Upload sample documents from `../sample_documents/`
2. Monitor function execution in Azure Portal
3. Review extracted data in Cosmos DB
4. Customize prompts for your use case
5. Add authentication (Azure AD B2C)
6. Set up CI/CD pipeline
