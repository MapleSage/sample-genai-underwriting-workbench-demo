# AWS to Azure Service Mapping

## Core Services

| AWS Service             | Azure Service                         | Purpose                |
| ----------------------- | ------------------------------------- | ---------------------- |
| Amazon Bedrock (Claude) | Azure OpenAI Service (GPT-4)          | AI/ML inference        |
| AWS Lambda              | Azure Functions                       | Serverless compute     |
| AWS Step Functions      | Azure Logic Apps / Durable Functions  | Workflow orchestration |
| Amazon S3               | Azure Blob Storage                    | Object storage         |
| Amazon DynamoDB         | Azure Cosmos DB                       | NoSQL database         |
| API Gateway             | Azure API Management / Functions HTTP | API management         |
| CloudFront              | Azure CDN / Front Door                | Content delivery       |
| AWS CDK                 | Azure Bicep / Terraform               | Infrastructure as Code |
| CloudWatch              | Azure Monitor / App Insights          | Monitoring & logging   |

## Key Implementation Differences

### 1. AI/ML Services

**AWS (Bedrock):**

```python
import boto3
bedrock = boto3.client('bedrock-runtime')
response = bedrock.invoke_model(
    modelId='anthropic.claude-3-sonnet',
    body=json.dumps({"prompt": prompt})
)
```

**Azure (OpenAI):**

```python
from openai import AzureOpenAI
client = AzureOpenAI(api_key=key, azure_endpoint=endpoint)
response = client.chat.completions.create(
    model='gpt-4',
    messages=[{"role": "user", "content": prompt}]
)
```

### 2. Serverless Functions

**AWS Lambda:**

- Event-driven with various triggers
- Packaged as ZIP or container
- Deployed via CDK/SAM/CloudFormation

**Azure Functions:**

- Similar event-driven model
- Python/Node.js/C# support
- Deployed via Azure CLI/VS Code

### 3. Storage

**AWS S3:**

```python
s3 = boto3.client('s3')
s3.put_object(Bucket='bucket', Key='key', Body=data)
```

**Azure Blob:**

```python
from azure.storage.blob import BlobServiceClient
blob_client = BlobServiceClient.from_connection_string(conn_str)
blob_client.upload_blob(name='blob', data=data)
```

### 4. Database

**AWS DynamoDB:**

- Key-value and document database
- Partition key + sort key
- Eventually consistent by default

**Azure Cosmos DB:**

- Multi-model database (SQL API recommended)
- Partition key required
- Session consistency by default
- More expensive but globally distributed

### 5. Infrastructure as Code

**AWS CDK (TypeScript):**

```typescript
const bucket = new s3.Bucket(this, "Bucket", {
  versioned: true,
});
```

**Azure Bicep:**

```bicep
resource bucket 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'storageaccount'
  location: location
  sku: { name: 'Standard_LRS' }
}
```

## Cost Comparison

### Compute (per 1M requests)

- **AWS Lambda**: ~$0.20 (128MB, 100ms avg)
- **Azure Functions**: ~$0.20 (similar specs)

### Storage (per GB/month)

- **AWS S3**: $0.023 (Standard)
- **Azure Blob**: $0.018 (Hot tier)

### Database (per GB/month)

- **DynamoDB**: $0.25 (on-demand)
- **Cosmos DB**: $0.25 (serverless)

### AI/ML (per 1K tokens)

- **Bedrock Claude 3 Sonnet**: $0.003 input / $0.015 output
- **Azure OpenAI GPT-4**: $0.03 input / $0.06 output

**Note**: Azure OpenAI is significantly more expensive but offers different capabilities.

## Migration Considerations

### Advantages of Azure Version

1. **Enterprise Integration**: Better integration with Microsoft 365, Active Directory
2. **Hybrid Cloud**: Strong hybrid cloud support with Azure Arc
3. **AI Foundry**: Unified AI development platform
4. **Regional Availability**: May have better presence in certain regions

### Challenges

1. **Cost**: Azure OpenAI is more expensive than Bedrock
2. **Model Differences**: GPT-4 vs Claude - different strengths
3. **Learning Curve**: Different APIs and patterns
4. **Tooling**: Different deployment and monitoring tools

## Feature Parity

| Feature                | AWS Version          | Azure Version              | Status      |
| ---------------------- | -------------------- | -------------------------- | ----------- |
| Document Upload        | ✅ S3 presigned URLs | ✅ Blob SAS tokens         | ✅ Complete |
| PDF Processing         | ✅ Lambda + Bedrock  | ✅ Functions + OpenAI      | ✅ Complete |
| Document Analysis      | ✅ Claude 3.7 Sonnet | ✅ GPT-4                   | ✅ Complete |
| Chat Interface         | ✅ API Gateway       | ✅ Functions HTTP          | ✅ Complete |
| Workflow Orchestration | ✅ Step Functions    | ⚠️ Logic Apps (simplified) | ⚠️ Partial  |
| Frontend Hosting       | ✅ CloudFront + S3   | ✅ Static Web Apps         | ✅ Complete |

## Deployment Time

- **AWS (CDK)**: ~8-10 minutes
- **Azure (Bicep)**: ~6-8 minutes

Both are comparable in deployment speed.
