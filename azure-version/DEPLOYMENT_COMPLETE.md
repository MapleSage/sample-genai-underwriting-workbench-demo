# 🎉 Azure Deployment Complete!

## Deployed Resources

### Frontend

- **URL**: https://victorious-mushroom-0a855a80f.3.azurestaticapps.net
- **Custom Domain**: https://uw.sagesure.io
- **Status**: ✅ Deployed and running

### Backend API

- **Function App**: https://uw-functions-11e9fd0d.azurewebsites.net
- **API Endpoint**: https://uw-functions-11e9fd0d.azurewebsites.net/api/
- **Status**: ✅ Running with 2 functions deployed

### Functions

1. **api_handler** (HTTP Trigger)
   - Endpoint: `/api/{*route}`
   - Handles: Upload, job status, job retrieval
2. **document_extract** (Blob Trigger)
   - Triggered by: Document uploads to `documents` container
   - Processes: PDFs with GPT-4o analysis

### Storage

- **Account**: uwstorage11e9fd0d
- **Containers**:
  - `documents` - PDF uploads
  - `extraction-chunks` - Processed data

### Database

- **Cosmos DB**: uw-cosmos-11e9fd0d
- **Location**: West US 2
- **Database**: underwriting
- **Container**: jobs (partition key: /jobId)

### AI Service

- **Azure OpenAI**: sageinsure-openai
- **Model**: gpt-4o
- **Status**: ✅ Configured and ready

## 🧪 Test the Deployment

### 1. Access the Frontend

Open in your browser:

```
https://victorious-mushroom-0a855a80f.3.azurestaticapps.net
```

or

```
https://uw.sagesure.io
```

### 2. Test the API

```bash
# Get all jobs
curl https://uw-functions-11e9fd0d.azurewebsites.net/api/jobs

# Request upload URL
curl -X POST https://uw-functions-11e9fd0d.azurewebsites.net/api/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.pdf"}'
```

### 3. Upload a Test Document

Use the sample documents in `../sample_documents/`:

- `life_submission.pdf`
- `p&c_submission.pdf`

## 📊 Monitor Your Deployment

### Azure Portal Links

- **Resource Group**: [underwriting-workbench-rg](https://portal.azure.com/#@maplesage.com/resource/subscriptions/2bfa9715-785b-445f-8102-6a423a7495ef/resourceGroups/underwriting-workbench-rg)
- **Function App**: [uw-functions-11e9fd0d](https://portal.azure.com/#@maplesage.com/resource/subscriptions/2bfa9715-785b-445f-8102-6a423a7495ef/resourceGroups/underwriting-workbench-rg/providers/Microsoft.Web/sites/uw-functions-11e9fd0d)
- **Static Web App**: [uw-frontend-11e9fd0d](https://portal.azure.com/#@maplesage.com/resource/subscriptions/2bfa9715-785b-445f-8102-6a423a7495ef/resourceGroups/underwriting-workbench-rg/providers/Microsoft.Web/staticSites/uw-frontend-11e9fd0d)

### View Logs

```bash
# Stream function logs
func azure functionapp logstream uw-functions-11e9fd0d

# Or in Azure Portal:
# Function App → Monitor → Log Stream
```

### Check Cosmos DB

```bash
# List all jobs
az cosmosdb sql container query \
  --account-name uw-cosmos-11e9fd0d \
  --resource-group underwriting-workbench-rg \
  --database-name underwriting \
  --name jobs \
  --query-text "SELECT * FROM c"
```

## 💰 Cost Estimate

Based on current configuration:

| Service               | Tier         | Est. Monthly Cost |
| --------------------- | ------------ | ----------------- |
| Function App          | Consumption  | $5-20             |
| Static Web App        | Free         | $0                |
| Blob Storage          | Standard LRS | $1-5              |
| Cosmos DB             | Serverless   | $10-50            |
| Azure OpenAI (GPT-4o) | Pay-per-use  | $30-500           |
| **Total**             |              | **$46-575**       |

_Costs vary based on usage. OpenAI is the primary variable cost._

## 🔧 Configuration

All configuration is stored in Azure Function App Settings:

- `COSMOS_DB_ENDPOINT`
- `COSMOS_DB_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_DEPLOYMENT`

## 🚀 Next Steps

1. **Test Document Upload**: Upload a PDF from the frontend
2. **Monitor Processing**: Watch the function logs as it processes
3. **Review Results**: Check Cosmos DB for extracted data
4. **Customize Prompts**: Edit function code to adjust GPT-4o prompts
5. **Add Authentication**: Implement Azure AD B2C for security
6. **Set Up CI/CD**: Configure GitHub Actions for automated deployments

## 🆘 Troubleshooting

### Frontend not loading?

- Check Static Web App deployment status in Azure Portal
- Verify API URL in frontend environment variables

### API returning errors?

- Check Function App logs
- Verify Cosmos DB and OpenAI credentials
- Ensure storage containers exist

### Document processing not working?

- Check blob trigger is enabled
- Verify OpenAI deployment name matches
- Review function logs for errors

## 📚 Documentation

- [Azure Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/)
- [Azure Static Web Apps](https://docs.microsoft.com/en-us/azure/static-web-apps/)
- [Azure OpenAI Service](https://docs.microsoft.com/en-us/azure/cognitive-services/openai/)
- [Cosmos DB](https://docs.microsoft.com/en-us/azure/cosmos-db/)

## 🎯 Comparison with AWS

Both versions are now deployed:

- **AWS**: https://do8j2ue0e3niw.cloudfront.net (Claude 3.7 Sonnet)
- **Azure**: https://uw.sagesure.io (GPT-4o)

You can test both and compare the AI model performance!
