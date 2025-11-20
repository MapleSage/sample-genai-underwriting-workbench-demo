# 🤖 genai-underwriting-workbench-azure

An Azure AI Foundry implementation of the GenAI Underwriting Workbench, showcasing Azure OpenAI and Azure AI services for transforming life insurance underwriting workflows.

## Architecture Overview

This solution leverages Azure AI Foundry and Azure services to streamline the underwriting process:

- **Azure AI Foundry**: GPT-4 and GPT-4 Vision for document analysis
- **Azure Functions**: Serverless compute for document processing
- **Azure Blob Storage**: Document storage
- **Azure Cosmos DB**: NoSQL database for job metadata and results
- **Azure Logic Apps**: Workflow orchestration
- **Azure Static Web Apps**: Frontend hosting
- **Azure API Management**: API gateway (optional)

## Prerequisites

- **Azure CLI**: Install and authenticate

  ```bash
  az login
  az account set --subscription <subscription-id>
  ```

- **Azure Functions Core Tools**:

  ```bash
  npm install -g azure-functions-core-tools@4
  ```

- **Node.js**: Version 18 or later
- **Python**: Version 3.9+ (for Azure Functions)
- **Azure AI Foundry Access**: Ensure you have access to Azure OpenAI Service

## Deployment

### 1. Set Environment Variables

```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_RESOURCE_GROUP="underwriting-workbench-rg"
export AZURE_LOCATION="eastus"
export AZURE_OPENAI_ENDPOINT="your-openai-endpoint"
export AZURE_OPENAI_KEY="your-openai-key"
```

### 2. Deploy Infrastructure

```bash
cd infrastructure
az deployment group create \
  --resource-group $AZURE_RESOURCE_GROUP \
  --template-file main.bicep \
  --parameters location=$AZURE_LOCATION
```

### 3. Deploy Functions

```bash
cd functions
func azure functionapp publish <function-app-name>
```

### 4. Deploy Frontend

```bash
cd frontend
npm install
npm run build
az staticwebapp deploy
```

## Key Differences from AWS Version

- Uses Azure OpenAI Service (GPT-4) instead of Amazon Bedrock
- Azure Functions replace AWS Lambda
- Azure Logic Apps for orchestration instead of Step Functions
- Cosmos DB instead of DynamoDB
- Blob Storage instead of S3

## Development

See individual component READMEs:

- [Infrastructure](./infrastructure/README.md)
- [Functions](./functions/README.md)
- [Frontend](./frontend/README.md)
