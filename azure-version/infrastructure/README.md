# Azure Infrastructure

This directory contains the Azure Bicep templates for deploying the underwriting workbench infrastructure.

## Files

- `main.bicep`: Main infrastructure template

## Resources Created

1. **Storage Account** (`uwstorage*`)
   - Blob containers: `documents`, `extraction-chunks`
   - Used for PDF storage and processed data

2. **Cosmos DB** (`uw-cosmos-*`)
   - Database: `underwriting`
   - Container: `jobs` (partition key: `/jobId`)
   - Stores job metadata and results

3. **Function App** (`uw-functions-*`)
   - Consumption plan (serverless)
   - Python 3.9 runtime
   - Includes all necessary app settings

4. **Static Web App** (`uw-frontend-*`)
   - Free tier
   - Hosts React frontend
   - Automatic HTTPS

## Deployment

### Using Azure CLI

```bash
az deployment group create \
  --resource-group underwriting-workbench-rg \
  --template-file main.bicep \
  --parameters location=eastus
```

### Using the Deploy Script

```bash
cd ..
./deploy.sh
```

## Outputs

The deployment provides these outputs:

- `storageAccountName`: Name of the storage account
- `cosmosDbEndpoint`: Cosmos DB endpoint URL
- `functionAppName`: Name of the function app
- `functionAppUrl`: Function app URL
- `staticWebAppUrl`: Frontend URL
- `storageConnectionString`: Storage connection string

## Customization

You can customize the deployment by modifying parameters in `main.bicep`:

```bicep
param location string = 'eastus'  // Change region
param environmentName string = 'prod'  // Change environment
param openAIDeploymentName string = 'gpt-4'  // Change model
```

## Cost Optimization

To reduce costs:

1. Use Cosmos DB serverless mode (default)
2. Use consumption plan for Functions (default)
3. Use Standard_LRS for storage (default)
4. Use Free tier for Static Web Apps (default)

## Monitoring

After deployment, monitor resources in Azure Portal:

- Function App → Monitor → Logs
- Cosmos DB → Metrics
- Storage Account → Monitoring

## Cleanup

To delete all resources:

```bash
az group delete --name underwriting-workbench-rg --yes
```
