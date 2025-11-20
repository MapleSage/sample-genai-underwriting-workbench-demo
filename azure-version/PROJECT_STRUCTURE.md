# Azure Version - Project Structure

## 📁 Directory Layout

```
azure-version/
├── README.md                      # Main overview
├── QUICK_START.md                 # 5-minute deployment guide
├── DEPLOYMENT_GUIDE.md            # Detailed deployment instructions
├── AWS_TO_AZURE_MAPPING.md        # Service comparison guide
├── PROJECT_STRUCTURE.md           # This file
├── .env.example                   # Environment variables template
├── deploy.sh                      # Automated deployment script
│
├── infrastructure/                # Azure Bicep templates
│   ├── main.bicep                # Main infrastructure template
│   └── README.md                 # Infrastructure documentation
│
└── functions/                     # Azure Functions
    ├── host.json                 # Functions host configuration
    ├── requirements.txt          # Python dependencies
    │
    ├── api_handler/              # REST API endpoints
    │   ├── __init__.py          # API handler logic
    │   └── function.json        # Function binding config
    │
    └── document_extract/         # Document processing
        ├── __init__.py          # Extraction logic with GPT-4
        └── function.json        # Blob trigger config
```

## 🔧 Component Details

### Infrastructure (`infrastructure/`)

**main.bicep** - Deploys:

- Storage Account with blob containers
- Cosmos DB with jobs container
- Function App (consumption plan)
- Static Web App for frontend
- All IAM roles and permissions

### Functions (`functions/`)

**api_handler** - HTTP-triggered function:

- `POST /upload` - Generate SAS token for document upload
- `GET /jobs` - List all processing jobs
- `GET /jobs/{id}` - Get specific job details

**document_extract** - Blob-triggered function:

- Triggered when PDF uploaded to `documents` container
- Extracts text from PDF pages
- Analyzes content using Azure OpenAI GPT-4
- Stores results in Cosmos DB

### Configuration Files

**.env.example** - Required environment variables:

```bash
AZURE_SUBSCRIPTION_ID          # Your Azure subscription
AZURE_RESOURCE_GROUP           # Resource group name
AZURE_LOCATION                 # Azure region (e.g., eastus)
AZURE_OPENAI_ENDPOINT          # OpenAI service endpoint
AZURE_OPENAI_KEY               # OpenAI API key
AZURE_OPENAI_DEPLOYMENT        # Model deployment name
```

**deploy.sh** - Automated deployment:

1. Validates prerequisites
2. Creates resource group
3. Deploys Bicep template
4. Configures function app settings
5. Deploys functions
6. Outputs URLs and endpoints

## 🚀 Deployment Flow

```
1. User runs: ./deploy.sh
   ↓
2. Script validates: Azure CLI, Functions Core Tools
   ↓
3. Creates resource group
   ↓
4. Deploys infrastructure (Bicep)
   ↓
5. Configures app settings
   ↓
6. Deploys functions
   ↓
7. Outputs URLs
```

## 📊 Data Flow

```
User uploads PDF
   ↓
Frontend → API Handler (POST /upload)
   ↓
API Handler generates SAS token
   ↓
Frontend uploads to Blob Storage
   ↓
Blob trigger → Document Extract function
   ↓
Extract function:
  - Reads PDF
  - Calls GPT-4 for analysis
  - Stores in Cosmos DB
   ↓
Frontend polls API Handler (GET /jobs/{id})
   ↓
User views results
```

## 🔐 Security

- **Storage**: Private containers with SAS tokens
- **Cosmos DB**: Connection string in app settings
- **Functions**: Function-level authentication
- **OpenAI**: API key in app settings
- **HTTPS**: Enforced on all endpoints

## 📈 Scalability

- **Functions**: Auto-scale based on load
- **Storage**: Unlimited capacity
- **Cosmos DB**: Auto-scale RU/s
- **Static Web App**: Global CDN

## 🧪 Testing

After deployment:

```bash
# Get function URL
FUNCTION_URL=$(az functionapp show \
  --name <function-app-name> \
  --resource-group underwriting-workbench-rg \
  --query defaultHostName -o tsv)

# Test API
curl https://$FUNCTION_URL/api/jobs

# Upload test document via frontend
# Use ../sample_documents/life_submission.pdf
```

## 🔄 Updates

To update after changes:

```bash
# Update infrastructure
cd infrastructure
az deployment group create \
  --resource-group underwriting-workbench-rg \
  --template-file main.bicep

# Update functions
cd ../functions
func azure functionapp publish <function-app-name>
```

## 📝 Adding New Functions

1. Create new directory in `functions/`
2. Add `__init__.py` with function logic
3. Add `function.json` with bindings
4. Update `requirements.txt` if needed
5. Redeploy: `func azure functionapp publish <name>`

## 🐛 Debugging

View logs:

```bash
# Stream function logs
func azure functionapp logstream <function-app-name>

# Or in Azure Portal:
# Function App → Monitor → Log Stream
```

## 💡 Tips

1. **Development**: Test functions locally with `func start`
2. **Costs**: Monitor in Azure Cost Management
3. **Performance**: Check Application Insights
4. **Errors**: Review function logs in Portal
5. **Updates**: Use deployment slots for zero-downtime

## 🆘 Troubleshooting

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for common issues and solutions.
