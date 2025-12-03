# Deployment Guide for AKS with Terraform

This guide provides step-by-step instructions to deploy the Underwriting Workbench on AKS using Terraform and GitHub Actions.

## Prerequisites

- Azure subscription with sufficient permissions
- GitHub repository with secrets configured
- Tools installed locally:
  - `az` (Azure CLI)
  - `terraform`
  - `kubectl`
  - `git`

## Architecture Overview

```
Event Grid (Blob Created)
    ↓
Service Bus Queue (document-extraction)
    ↓
KEDA (autoscaling based on queue depth)
    ↓
Document Extract Workers (on AKS)
    ↓
Updates Cosmos DB (job records)
```

## Step 1: Configure GitHub Secrets

The repository must have the following secrets configured:

1. **AZURE_CREDENTIALS**: Output from `az ad sp create-for-rbac --sdk-auth`
   ```bash
   az ad sp create-for-rbac --sdk-auth --name "uw-workbench-sp" | jq . > azure-credentials.json
   # Then copy the JSON content to GitHub Secret
   ```

2. **ACR_NAME**: Your Azure Container Registry name
   ```bash
   echo "uwregistry"  # Replace with your ACR name
   ```

3. **AKS_CLUSTER_NAME**: Your AKS cluster name
   ```bash
   echo "uw-workbench-aks"
   ```

4. **AKS_RESOURCE_GROUP**: Resource group containing AKS
   ```bash
   echo "uw-workbench-aks-rg"
   ```

## Step 2: Update Terraform Configuration

1. Copy `terraform.tfvars.example` to `terraform.tfvars`:
   ```bash
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   ```

2. Edit `terraform/terraform.tfvars` with your Azure subscription ID and preferences:
   ```hcl
   subscription_id = "your-azure-subscription-id"
   resource_group_name = "uw-workbench-aks-rg"
   location = "eastus"
   kubernetes_version = "1.28"
   aks_node_count = 3
   ```

## Step 3: Deploy Infrastructure with Terraform

```bash
cd terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan -out=tfplan

# Apply the plan
terraform apply tfplan

# Save outputs for later use
terraform output -json > ../tf-outputs.json
```

### Terraform Outputs

After successful apply, capture these outputs (needed for k8s secrets):
- `acr_login_server`: ACR login server
- `cosmos_endpoint`: Cosmos DB endpoint
- `servicebus_namespace_name`: Service Bus namespace
- `workload_identity_client_id`: Client ID for Workload Identity

## Step 4: Update Kubernetes Manifests

1. Update `k8s/manifests.yaml` with values from Terraform outputs:

   ```bash
   # Extract values from Terraform output
   ACR_LOGIN_SERVER=$(terraform output -raw acr_login_server)
   COSMOS_ENDPOINT=$(terraform output -raw cosmos_endpoint)
   TENANT_ID=$(az account show --query tenantId -o tsv)
   SUBSCRIPTION_ID=$(terraform output -raw terraform output -json | jq -r .subscription_id.value)
   WORKLOAD_CLIENT_ID=$(terraform output -raw workload_identity_client_id)
   
   # Update ConfigMap in manifests.yaml
   sed -i "s|your-cosmos-account.documents.azure.com|${COSMOS_ENDPOINT}|g" k8s/manifests.yaml
   sed -i "s|your-tenant-id|${TENANT_ID}|g" k8s/manifests.yaml
   sed -i "s|your-subscription-id|${SUBSCRIPTION_ID}|g" k8s/manifests.yaml
   sed -i "s|your-servicebus-namespace|$(terraform output -raw servicebus_namespace_name)|g" k8s/manifests.yaml
   sed -i "s|your-storage-account|$(terraform output -raw storage_account_name)|g" k8s/manifests.yaml
   sed -i "s|your-acr-name.azurecr.io|${ACR_LOGIN_SERVER}|g" k8s/manifests.yaml
   sed -i "s|your-workload-identity-client-id|${WORKLOAD_CLIENT_ID}|g" k8s/manifests.yaml
   ```

2. Create and configure Kubernetes secrets:

   ```bash
   # Get AKS credentials
   az aks get-credentials \
     --resource-group $(terraform output -raw resource_group_name) \
     --name $(terraform output -raw aks_cluster_name) \
     --overwrite-existing
   
   # Create namespace
   kubectl create namespace underwriting || true
   
   # Create secrets (replace with actual values)
   kubectl create secret generic uw-secrets -n underwriting \
     --from-literal=OPENAI_API_KEY="your-openai-key" \
     --from-literal=COSMOS_DB_KEY="your-cosmos-key" \
     --from-literal=SERVICE_BUS_CONNECTION_STRING="your-sb-connection-string" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

## Step 5: Deploy via GitHub Actions

Push changes to trigger the automated workflow:

```bash
# Update your local files
git add -A
git commit -m "chore: update k8s manifests and trigger deployment"
git push origin main
```

The `.github/workflows/aks-deploy.yml` workflow will:
1. Build Docker images for API and Worker
2. Push images to ACR
3. Apply Kubernetes manifests
4. Wait for rollout to complete
5. Verify deployments and pods

Monitor the workflow:
- GitHub Actions tab: https://github.com/MapleSage/uw-workbench-aks-deploy/actions

## Step 6: Verify Deployment

```bash
# Check deployments
kubectl get deployments -n underwriting

# Check pods
kubectl get pods -n underwriting -o wide

# Check services and ingress
kubectl get svc,ingress -n underwriting

# View API Handler logs
kubectl logs -n underwriting -l app=api-handler -f --tail=50

# View Worker logs
kubectl logs -n underwriting -l app=document-extract -f --tail=50

# Check KEDA scaler status
kubectl get scaledobjects -n underwriting

# Get HPA status
kubectl get hpa -n underwriting
```

## Step 7: Test End-to-End

1. Find the API endpoint:
   ```bash
   kubectl get ingress -n underwriting
   # Or use port-forward for testing:
   kubectl port-forward svc/api-handler-svc -n underwriting 8080:80
   ```

2. Run the test script:
   ```bash
   ./azure-version/test-upload.sh http://localhost:8080
   ```

3. Monitor queue and worker scaling:
   ```bash
   # Watch Service Bus queue
   az servicebus queue show \
     --resource-group $(terraform output -raw resource_group_name) \
     --namespace-name $(terraform output -raw servicebus_namespace_name) \
     --name document-extraction \
     --query messageCount
   
   # Watch pod autoscaling
   kubectl get pods -n underwriting -w
   ```

## Troubleshooting

### Pods failing to start

```bash
# Check pod events
kubectl describe pod <pod-name> -n underwriting

# Check logs
kubectl logs <pod-name> -n underwriting

# Check resource requests/limits
kubectl top pods -n underwriting
```

### Image pull failures

```bash
# Verify ACR login
az acr login --name $(terraform output -raw acr_name)

# Check image exists
az acr repository list --name $(terraform output -raw acr_name)

# Verify pod has correct ServiceAccount annotation
kubectl get sa underwriting-workload-sa -n underwriting -o yaml
```

### Workload Identity issues

```bash
# Verify federated credential
az identity federated-credential list \
  --resource-group $(terraform output -raw resource_group_name) \
  --identity-name $(terraform output -raw workload_identity_client_id)-mi

# Verify pod annotations
kubectl get pod <pod-name> -n underwriting -o jsonpath='{.metadata.annotations}'
```

### Service Bus connection issues

```bash
# Check queue exists
az servicebus queue show \
  --resource-group $(terraform output -raw resource_group_name) \
  --namespace-name $(terraform output -raw servicebus_namespace_name) \
  --name document-extraction

# Check KEDA trigger configuration
kubectl get scaledobjects document-extract-scaler -n underwriting -o yaml
```

## Cleanup

To destroy all resources:

```bash
# Delete Kubernetes resources
kubectl delete namespace underwriting

# Destroy Azure resources
cd terraform
terraform destroy
```

## Production Checklist

- [ ] Enable pod security policies
- [ ] Configure network policies (already in manifests)
- [ ] Setup Azure KeyVault for secrets management
- [ ] Enable Azure Policy for compliance
- [ ] Configure backup and disaster recovery
- [ ] Setup monitoring and alerting
- [ ] Enable Pod Disruption Budgets
- [ ] Configure resource quotas and limits
- [ ] Enable audit logging
- [ ] Setup automated patching for nodes

## Next Steps

1. **Setup DNS**: Point your domain to the Ingress IP
2. **TLS Certificates**: Install cert-manager and configure Let's Encrypt
3. **Monitoring**: Setup Application Insights and Prometheus
4. **CI/CD**: Customize the GitHub Actions workflow for your needs
5. **Scaling**: Adjust KEDA trigger thresholds based on your workload

## Support

For issues or questions:
1. Check logs: `kubectl logs -n underwriting -l app=<app-name>`
2. Review Terraform outputs: `terraform output -json`
3. Check Azure resources: `az resource list --resource-group <rg-name>`
4. Monitor events: `kubectl get events -n underwriting`
