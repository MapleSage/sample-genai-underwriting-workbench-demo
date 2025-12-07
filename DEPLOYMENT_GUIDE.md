# 🚀 Deployment Guide

This guide covers the complete deployment process for the GenAI Underwriting Workbench with Azure backend and Vercel frontend.

## 📋 Current Setup

- **Frontend**: Deployed on Vercel at `https://uw.sagesure.io`
- **Backend API**: Deployed on AKS at `http://4.154.255.64`
- **Project**: `azure-underwriting` on Vercel

## 🔧 GitHub Actions Setup

### Required Secrets

Add these secrets to your GitHub repository:

```bash
# Azure Credentials
AZURE_CREDENTIALS='{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret", 
  "subscriptionId": "your-subscription-id",
  "tenantId": "your-tenant-id"
}'

# Azure Container Registry
ACR_NAME=your-acr-name

# AKS Cluster
AKS_RESOURCE_GROUP=your-resource-group
AKS_CLUSTER_NAME=your-cluster-name

# Vercel (for frontend updates)
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=team_niy924DHEP28gtVrVZOSmiiy
VERCEL_PROJECT_ID=prj_sEfTAMP0iGaJhWllne5SzyqRFi9x
```

### Workflows

1. **`aks-deploy.yml`**: Builds and deploys backend to AKS
2. **`update-frontend.yml`**: Updates frontend API URL and redeploys

## 🚀 Deployment Process

### Automatic Deployment

1. Push changes to `main` branch
2. GitHub Actions will:
   - Build and push Docker images to ACR
   - Deploy to AKS cluster
   - Update Kubernetes manifests
   - Trigger frontend update (if configured)

### Manual Frontend Update

Run the update script:

```bash
./update-frontend-api.sh [API_URL]
```

Or use the default API URL:

```bash
./update-frontend-api.sh
```

### Manual Vercel Deployment

```bash
cd frontend
vercel --prod
```

## 🔍 Verification

### Check Backend Status

```bash
# Check if API is responding
curl http://4.154.255.64/api/health

# Check Kubernetes deployments
kubectl get deployments -n underwriting
kubectl get pods -n underwriting
kubectl get svc -n underwriting
```

### Check Frontend

1. Visit `https://uw.sagesure.io`
2. Check browser console for API connection errors
3. Try uploading a document to test full workflow

## 🛠️ Troubleshooting

### Backend Issues

```bash
# Check pod logs
kubectl logs -n underwriting -l app=api-handler --tail=50
kubectl logs -n underwriting -l app=document-extract --tail=50

# Check service status
kubectl get svc -n underwriting
kubectl describe ingress -n underwriting
```

### Frontend Issues

```bash
# Check Vercel deployment logs
vercel logs --follow

# Check environment variables
vercel env ls
```

### Common Issues

1. **CORS Errors**: Ensure frontend domain is in API CORS configuration
2. **API Connection Failed**: Verify API URL in frontend environment variables
3. **Image Pull Errors**: Check ACR authentication and image tags

## 📝 Environment Variables

### Frontend (.env.production)

```bash
VITE_API_URL=http://4.154.255.64
```

### Backend (Kubernetes ConfigMap)

```yaml
COSMOS_DB_ENDPOINT: "https://your-cosmos-account.documents.azure.com:443/"
COSMOS_DB_NAME: "underwriting"
STORAGE_ACCOUNT_NAME: "your-storage-account"
SERVICE_BUS_NAMESPACE: "your-servicebus-namespace"
AZURE_OPENAI_ENDPOINT: "https://your-openai-account.openai.azure.com/"
```

## 🔄 Update Process

1. **Code Changes**: Push to main branch
2. **Backend Deploy**: Automatic via GitHub Actions
3. **Frontend Update**: Automatic via workflow or manual script
4. **Verification**: Test full application workflow

## 📞 Support

For deployment issues:
1. Check GitHub Actions logs
2. Review Kubernetes pod logs
3. Verify Vercel deployment status
4. Check Azure resource health