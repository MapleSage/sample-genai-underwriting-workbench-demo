# AWS vs Azure Implementation Comparison

This repository contains two implementations of the GenAI Underwriting Workbench:

## 📁 Directory Structure

```
.
├── cdk/                    # AWS implementation (original)
├── frontend/               # Shared frontend (works with both)
├── azure-version/          # Azure implementation (new)
└── sample_documents/       # Test documents (shared)
```

## 🔄 Quick Comparison

| Aspect              | AWS Version                 | Azure Version           |
| ------------------- | --------------------------- | ----------------------- |
| **AI Model**        | Claude 3.7 Sonnet (Bedrock) | GPT-4 (Azure OpenAI)    |
| **Compute**         | AWS Lambda                  | Azure Functions         |
| **Storage**         | Amazon S3                   | Azure Blob Storage      |
| **Database**        | DynamoDB                    | Cosmos DB               |
| **Orchestration**   | Step Functions              | Logic Apps (simplified) |
| **IaC**             | AWS CDK (TypeScript)        | Azure Bicep             |
| **Deployment Time** | ~10 min                     | ~8 min                  |
| **Monthly Cost**    | $30-300                     | $50-500                 |

## 🚀 Deployment Commands

### AWS Version (Current Directory)

```bash
cd cdk
npm install
cdk bootstrap
cdk deploy
```

**Output**: CloudFront URL for frontend

### Azure Version

```bash
cd azure-version
cp .env.example .env
# Edit .env with your Azure credentials
./deploy.sh
```

**Output**: Static Web App URL for frontend

## 💰 Cost Breakdown

### AWS (Monthly, Moderate Usage)

- Lambda: $5-20
- S3: $1-5
- DynamoDB: $5-25
- Bedrock (Claude): $20-200
- CloudFront: $1-10
- **Total: ~$32-260**

### Azure (Monthly, Moderate Usage)

- Functions: $5-20
- Blob Storage: $1-5
- Cosmos DB: $10-50
- Azure OpenAI (GPT-4): $30-400
- Static Web Apps: $0-10
- **Total: ~$46-485**

**Note**: Azure OpenAI is more expensive but offers different capabilities.

## 🎯 Which Should You Choose?

### Choose AWS if:

- ✅ You prefer Claude models (better for long documents)
- ✅ You want lower AI costs
- ✅ You're already on AWS
- ✅ You need Step Functions orchestration
- ✅ You prefer TypeScript for IaC (CDK)

### Choose Azure if:

- ✅ You prefer GPT-4 models
- ✅ You need Microsoft 365 integration
- ✅ You're already on Azure
- ✅ You want Azure AI Foundry features
- ✅ You prefer Bicep for IaC

## 🔧 Technical Differences

### AI Model Behavior

**Claude 3.7 Sonnet (AWS)**:

- Better at following complex instructions
- Excellent with long documents (200K tokens)
- More consistent structured output
- Lower cost per token

**GPT-4 (Azure)**:

- Strong general reasoning
- Better at creative tasks
- Wider knowledge base
- Higher cost per token

### Architecture Patterns

**AWS**: Event-driven with Step Functions orchestrating Lambda functions

**Azure**: Event-driven with Functions, simplified orchestration

Both use similar patterns:

1. Upload document → Storage
2. Trigger extraction → AI processing
3. Store results → Database
4. API serves results → Frontend

## 📊 Performance

Both implementations offer similar performance:

- **Document Upload**: < 1 second
- **PDF Processing**: 2-5 seconds per page
- **AI Analysis**: 5-15 seconds per page
- **Total (10-page doc)**: 1-3 minutes

## 🔐 Security

Both implementations include:

- ✅ Encrypted storage at rest
- ✅ HTTPS/TLS in transit
- ✅ IAM/RBAC for access control
- ✅ API authentication
- ✅ Private network options available

## 🧪 Testing

Use the same sample documents for both:

```bash
# Test documents work with both implementations
sample_documents/
├── life_submission.pdf
└── p&c_submission.pdf
```

## 📚 Documentation

- **AWS Version**: See main [README.md](./README.md)
- **Azure Version**: See [azure-version/README.md](./azure-version/README.md)
- **Detailed Azure Guide**: See [azure-version/DEPLOYMENT_GUIDE.md](./azure-version/DEPLOYMENT_GUIDE.md)
- **Service Mapping**: See [azure-version/AWS_TO_AZURE_MAPPING.md](./azure-version/AWS_TO_AZURE_MAPPING.md)

## 🤝 Contributing

Both implementations welcome contributions. The frontend is shared, so improvements benefit both versions.

## 📝 License

Same license applies to both implementations (see LICENSE file).
