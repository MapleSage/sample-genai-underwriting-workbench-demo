#!/bin/bash

set -e

echo "🚀 Deploying to existing AKS infrastructure..."

# Use existing resource group
RG_NAME="uw-workbench-aks-rg"

# Check if AKS cluster exists, if not create a simple one
AKS_EXISTS=$(az aks list --resource-group $RG_NAME --query "length(@)")

if [ "$AKS_EXISTS" -eq 0 ]; then
    echo "📦 Creating AKS cluster..."
    az aks create \
        --resource-group $RG_NAME \
        --name uw-workbench-aks \
        --node-count 2 \
        --node-vm-size Standard_D4s_v3 \
        --enable-managed-identity \
        --generate-ssh-keys \
        --enable-workload-identity \
        --enable-oidc-issuer
fi

# Get AKS credentials
echo "🔑 Getting AKS credentials..."
az aks get-credentials --resource-group $RG_NAME --name uw-workbench-aks --overwrite-existing

# Install NGINX Ingress
echo "🌐 Installing NGINX Ingress..."
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-system \
    --create-namespace \
    --wait

# Get ingress IP
echo "⏳ Waiting for ingress IP..."
INGRESS_IP=""
for i in {1..30}; do
    INGRESS_IP=$(kubectl get service ingress-nginx-controller -n ingress-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
    if [ ! -z "$INGRESS_IP" ]; then
        break
    fi
    echo "Waiting for IP... ($i/30)"
    sleep 10
done

if [ -z "$INGRESS_IP" ]; then
    echo "❌ Failed to get ingress IP"
    exit 1
fi

echo "✅ AKS cluster ready!"
echo "🌐 Ingress IP: $INGRESS_IP"
echo ""
echo "Next steps:"
echo "1. Update frontend API URL to: http://$INGRESS_IP/api"
echo "2. Deploy your application containers to AKS"