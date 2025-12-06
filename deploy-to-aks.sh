#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Underwriting Workbench to AKS${NC}"

# Get Terraform outputs
cd terraform
echo -e "${YELLOW}📊 Getting Terraform outputs...${NC}"
AKS_NAME=$(terraform output -raw aks_cluster_name)
RG_NAME=$(terraform output -raw resource_group_name)
ACR_NAME=$(terraform output -raw acr_name)
WORKLOAD_CLIENT_ID=$(terraform output -raw workload_identity_client_id)
COSMOS_ENDPOINT=$(terraform output -raw cosmos_endpoint)
COSMOS_NAME=$(terraform output -raw cosmos_account_name)
STORAGE_NAME=$(terraform output -raw storage_account_name)
SERVICEBUS_NAME=$(terraform output -raw servicebus_namespace_name)
LB_IP=$(terraform output -raw aks_load_balancer_ip)

cd ..

# Get AKS credentials
echo -e "${YELLOW}🔑 Getting AKS credentials...${NC}"
az aks get-credentials --resource-group $RG_NAME --name $AKS_NAME --overwrite-existing

# Install NGINX Ingress Controller
echo -e "${YELLOW}🌐 Installing NGINX Ingress Controller...${NC}"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-system \
  --create-namespace \
  --set controller.service.loadBalancerIP=$LB_IP \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-resource-group"=$RG_NAME

# Wait for ingress controller
echo -e "${YELLOW}⏳ Waiting for ingress controller...${NC}"
kubectl wait --namespace ingress-system \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=300s

# Create updated manifests
echo -e "${YELLOW}📝 Creating updated manifests...${NC}"
cat > k8s/manifests-updated.yaml << EOF
---
# Namespace
apiVersion: v1
kind: Namespace
metadata:
  name: underwriting
  labels:
    name: underwriting

---
# ConfigMap for application configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: uw-config
  namespace: underwriting
data:
  COSMOS_DB_ENDPOINT: "$COSMOS_ENDPOINT"
  COSMOS_DB_NAME: "underwriting"
  COSMOS_JOBS_CONTAINER: "jobs"
  STORAGE_ACCOUNT_NAME: "$STORAGE_NAME"
  STORAGE_CONTAINER_NAME: "documents"
  SERVICE_BUS_NAMESPACE: "$SERVICEBUS_NAME"
  SERVICE_BUS_QUEUE_NAME: "document-extraction"
  LOG_LEVEL: "INFO"

---
# ServiceAccount with Workload Identity annotation
apiVersion: v1
kind: ServiceAccount
metadata:
  name: underwriting-workload-sa
  namespace: underwriting
  annotations:
    azure.workload.identity/client-id: "$WORKLOAD_CLIENT_ID"

---
# API Handler Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-handler
  namespace: underwriting
  labels:
    app: api-handler
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-handler
  template:
    metadata:
      labels:
        app: api-handler
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: underwriting-workload-sa
      containers:
        - name: api
          image: $ACR_NAME.azurecr.io/uw/api:latest
          ports:
            - containerPort: 8080
          env:
            - name: AZURE_CLIENT_ID
              value: "$WORKLOAD_CLIENT_ID"
          envFrom:
            - configMapRef:
                name: uw-config
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"

---
# Service for API
apiVersion: v1
kind: Service
metadata:
  name: api-handler-svc
  namespace: underwriting
spec:
  selector:
    app: api-handler
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP

---
# Ingress for API
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: uw-api-ingress
  namespace: underwriting
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://uw.sagesure.io"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization"
spec:
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-handler-svc
                port:
                  number: 80
EOF

# Apply manifests
echo -e "${YELLOW}🚀 Deploying to AKS...${NC}"
kubectl apply -f k8s/manifests-updated.yaml

# Wait for deployment
echo -e "${YELLOW}⏳ Waiting for deployment...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/api-handler -n underwriting

# Get ingress IP
echo -e "${YELLOW}🔍 Getting ingress IP...${NC}"
INGRESS_IP=$(kubectl get service ingress-nginx-controller -n ingress-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}🌐 API Endpoint: http://$INGRESS_IP${NC}"
echo -e "${GREEN}📝 Update your frontend to use: http://$INGRESS_IP${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update frontend API URL to: http://$INGRESS_IP"
echo "2. Build and push your application containers to ACR"
echo "3. Update the image tags in the manifests"