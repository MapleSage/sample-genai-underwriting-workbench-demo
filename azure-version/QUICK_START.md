# Quick Start - Azure Deployment

## 🚀 Deploy in 5 Minutes

### Step 1: Set up Azure OpenAI

```bash
# Login to Azure
az login

# Create resource group
az group create --name openai-rg --location eastus

# Create Azure OpenAI resource
az cognitiveservices account create \
  --name my-openai-resource \
  --resource-group openai-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus

# Get endpoint and key
az cognitiveservices account show \
  --name my-openai-resource \
  --resource-group openai-rg \
  --query properties.endpoint -o tsv

az cognitiveservices account keys list \
  --name my-openai-resource \
  --resource-group openai-rg \
  --query key1 -o tsv
```

### Step 2: Configure Environment

```bash
# Copy and edit environment file
cp .env.example .env

# Edit with your values
export AZURE_SUBSCRIPTION_ID="your-sub-id"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_KEY="your-key"
export AZURE_OPENAI_DEPLOYMENT="gpt-4"
```

### Step 3: Deploy

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### Step 4: Test

The deployment will output your frontend URL. Open it in a browser and upload a document from `../sample_documents/`.

## What Gets Deployed

- ✅ Azure Functions (3 functions)
- ✅ Azure Blob Storage (2 containers)
- ✅ Azure Cosmos DB (1 database, 1 container)
- ✅ Azure Static Web App (frontend)
- ✅ All necessary IAM roles and permissions

## Estimated Cost

- **Development/Testing**: ~$10-30/month
- **Production (low volume)**: ~$50-100/month
- **Production (high volume)**: $200-500/month

Most cost comes from Azure OpenAI usage.

## Cleanup

```bash
az group delete --name underwriting-workbench-rg --yes
```

## Need Help?

- See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions
- See [AWS_TO_AZURE_MAPPING.md](./AWS_TO_AZURE_MAPPING.md) for service comparisons
- Check Azure Portal for logs and monitoring
