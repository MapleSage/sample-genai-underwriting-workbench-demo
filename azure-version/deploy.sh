#!/bin/bash

# Azure Underwriting Workbench Deployment Script

set -e

echo "🚀 Starting Azure Underwriting Workbench Deployment"

# Configuration
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-underwriting-workbench-rg}"
LOCATION="${AZURE_LOCATION:-eastus}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID}"

# Check prerequisites
echo "✅ Checking prerequisites..."

if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! command -v func &> /dev/null; then
    echo "❌ Azure Functions Core Tools not found. Install: npm install -g azure-functions-core-tools@4"
    exit 1
fi

# Login check
echo "🔐 Checking Azure login..."
az account show &> /dev/null || az login

# Set subscription
if [ -n "$SUBSCRIPTION_ID" ]; then
    echo "📋 Setting subscription: $SUBSCRIPTION_ID"
    az account set --subscription "$SUBSCRIPTION_ID"
fi

# Create resource group
echo "📦 Creating resource group: $RESOURCE_GROUP"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
cd infrastructure
DEPLOYMENT_OUTPUT=$(az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file main.bicep \
    --parameters location="$LOCATION" \
    --query properties.outputs \
    --output json)

echo "$DEPLOYMENT_OUTPUT" > deployment-output.json

# Extract outputs
FUNCTION_APP_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.functionAppName.value')
STORAGE_ACCOUNT_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.storageAccountName.value')
FUNCTION_APP_URL=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.functionAppUrl.value')
STATIC_WEB_APP_URL=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.staticWebAppUrl.value')

echo "✅ Infrastructure deployed!"
echo "   Function App: $FUNCTION_APP_NAME"
echo "   Storage Account: $STORAGE_ACCOUNT_NAME"

cd ..

# Deploy functions
echo "⚡ Deploying Azure Functions..."
cd functions

# Set environment variables for function app
echo "🔧 Configuring function app settings..."
az functionapp config appsettings set \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
    "AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}" \
    "AZURE_OPENAI_KEY=${AZURE_OPENAI_KEY}" \
    "AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT:-gpt-4}" \
    "FUNCTIONS_EXTENSION_VERSION=~4" \
    "STORAGE_ACCOUNT_NAME=${STORAGE_ACCOUNT_NAME}"

# Deploy functions
func azure functionapp publish "$FUNCTION_APP_NAME" --python

cd ..

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "📊 Deployment Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Resource Group:    $RESOURCE_GROUP"
echo "Location:          $LOCATION"
echo "Function App URL:  $FUNCTION_APP_URL"
echo "Frontend URL:      $STATIC_WEB_APP_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next Steps:"
echo "1. Configure Azure OpenAI endpoint and key if not already set"
echo "2. Upload test documents to test the system"
echo "3. Access the frontend at: $STATIC_WEB_APP_URL"
echo ""
