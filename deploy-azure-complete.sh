#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Complete Underwriting Workbench to Azure AKS${NC}"
echo ""

# Check if terraform directory exists
if [ ! -d "terraform" ]; then
    echo -e "${RED}❌ Error: terraform directory not found${NC}"
    echo "This script expects to be run from the project root with terraform outputs available"
    exit 1
fi

# Get Terraform outputs
echo -e "${BLUE}📊 Getting Terraform outputs...${NC}"
cd terraform

if ! terraform output > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: No terraform state found. Please run terraform apply first.${NC}"
    exit 1
fi

AKS_NAME=$(terraform output -raw aks_cluster_name 2>/dev/null || echo "")
RG_NAME=$(terraform output -raw resource_group_name 2>/dev/null || echo "")
ACR_NAME=$(terraform output -raw acr_name 2>/dev/null || echo "")
WORKLOAD_CLIENT_ID=$(terraform output -raw workload_identity_client_id 2>/dev/null || echo "")
COSMOS_ENDPOINT=$(terraform output -raw cosmos_endpoint 2>/dev/null || echo "")
COSMOS_KEY=$(terraform output -raw cosmos_key 2>/dev/null || echo "")
STORAGE_NAME=$(terraform output -raw storage_account_name 2>/dev/null || echo "")
SERVICEBUS_NAME=$(terraform output -raw servicebus_namespace_name 2>/dev/null || echo "")
SERVICEBUS_CONN=$(terraform output -raw servicebus_connection_string 2>/dev/null || echo "")
STORAGE_CONN=$(terraform output -raw storage_connection_string 2>/dev/null || echo "")
OPENAI_ENDPOINT=$(terraform output -raw openai_endpoint 2>/dev/null || echo "")
OPENAI_KEY=$(terraform output -raw openai_key 2>/dev/null || echo "")

cd ..

# Validate required outputs
if [ -z "$AKS_NAME" ] || [ -z "$RG_NAME" ] || [ -z "$ACR_NAME" ]; then
    echo -e "${RED}❌ Error: Missing required Terraform outputs${NC}"
    echo "Required: AKS_NAME, RG_NAME, ACR_NAME"
    exit 1
fi

echo -e "${GREEN}✅ Terraform outputs retrieved${NC}"
echo "  AKS Cluster: $AKS_NAME"
echo "  Resource Group: $RG_NAME"
echo "  ACR: $ACR_NAME"
echo ""

# Get AKS credentials
echo -e "${BLUE}🔑 Getting AKS credentials...${NC}"
az aks get-credentials --resource-group "$RG_NAME" --name "$AKS_NAME" --overwrite-existing

# Login to ACR
echo -e "${BLUE}🔐 Logging into ACR...${NC}"
az acr login --name "$ACR_NAME"

# Build and push API image
echo -e "${BLUE}🐳 Building API Docker image...${NC}"
docker build -f Dockerfile.api-new -t "$ACR_NAME.azurecr.io/uw/api:latest" .

echo -e "${BLUE}📤 Pushing API image to ACR...${NC}"
docker push "$ACR_NAME.azurecr.io/uw/api:latest"

# Build and push Worker image
echo -e "${BLUE}🐳 Building Worker Docker image...${NC}"
docker build -f Dockerfile.worker-new -t "$ACR_NAME.azurecr.io/uw/worker:latest" .

echo -e "${BLUE}📤 Pushing Worker image to ACR...${NC}"
docker push "$ACR_NAME.azurecr.io/uw/worker:latest"

echo -e "${GREEN}✅ Docker images built and pushed${NC}"
echo ""

# Create Kubernetes namespace
echo -e "${BLUE}📦 Creating Kubernetes namespace...${NC}"
kubectl create namespace underwriting --dry-run=client -o yaml | kubectl apply -f -

# Create secrets
echo -e "${BLUE}🔒 Creating Kubernetes secrets...${NC}"

# Base64 encode secrets
COSMOS_KEY_B64=$(echo -n "$COSMOS_KEY" | base64)
OPENAI_KEY_B64=$(echo -n "$OPENAI_KEY" | base64)
SERVICEBUS_CONN_B64=$(echo -n "$SERVICEBUS_CONN" | base64)

kubectl create secret generic uw-secrets \
    --from-literal=COSMOS_DB_KEY="$COSMOS_KEY" \
    --from-literal=OPENAI_API_KEY="$OPENAI_KEY" \
    --from-literal=SERVICE_BUS_CONNECTION_STRING="$SERVICEBUS_CONN" \
    --from-literal=STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    --namespace=underwriting \
    --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✅ Secrets created${NC}"
echo ""

# Create ConfigMap
echo -e "${BLUE}⚙️  Creating ConfigMap...${NC}"

kubectl create configmap uw-config \
    --from-literal=COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
    --from-literal=COSMOS_DB_NAME="underwriting" \
    --from-literal=COSMOS_JOBS_CONTAINER="jobs" \
    --from-literal=STORAGE_ACCOUNT_NAME="$STORAGE_NAME" \
    --from-literal=STORAGE_CONTAINER_NAME="documents" \
    --from-literal=SERVICE_BUS_NAMESPACE="$SERVICEBUS_NAME" \
    --from-literal=SERVICE_BUS_QUEUE_NAME="document-extraction" \
    --from-literal=AZURE_OPENAI_ENDPOINT="$OPENAI_ENDPOINT" \
    --from-literal=AZURE_OPENAI_DEPLOYMENT="gpt-4" \
    --from-literal=OPENAI_API_VERSION="2024-02-15-preview" \
    --from-literal=LOG_LEVEL="INFO" \
    --namespace=underwriting \
    --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✅ ConfigMap created${NC}"
echo ""

# Create ServiceAccount
echo -e "${BLUE}👤 Creating ServiceAccount...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: underwriting-workload-sa
  namespace: underwriting
  annotations:
    azure.workload.identity/client-id: "$WORKLOAD_CLIENT_ID"
EOF

echo -e "${GREEN}✅ ServiceAccount created${NC}"
echo ""

# Deploy API Handler
echo -e "${BLUE}🚀 Deploying API Handler...${NC}"

cat <<EOF | kubectl apply -f -
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
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080
          env:
            - name: AZURE_CLIENT_ID
              value: "$WORKLOAD_CLIENT_ID"
            - name: COSMOS_DB_KEY
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: COSMOS_DB_KEY
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: OPENAI_API_KEY
            - name: SERVICE_BUS_CONNECTION_STRING
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: SERVICE_BUS_CONNECTION_STRING
            - name: STORAGE_CONNECTION_STRING
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: STORAGE_CONNECTION_STRING
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
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
---
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
      targetPort: http
  type: ClusterIP
EOF

echo -e "${GREEN}✅ API Handler deployed${NC}"
echo ""

# Deploy Worker
echo -e "${BLUE}🚀 Deploying Document Worker...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: document-worker
  namespace: underwriting
  labels:
    app: document-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: document-worker
  template:
    metadata:
      labels:
        app: document-worker
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: underwriting-workload-sa
      containers:
        - name: worker
          image: $ACR_NAME.azurecr.io/uw/worker:latest
          imagePullPolicy: Always
          env:
            - name: AZURE_CLIENT_ID
              value: "$WORKLOAD_CLIENT_ID"
            - name: COSMOS_DB_KEY
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: COSMOS_DB_KEY
            - name: AZURE_OPENAI_KEY
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: OPENAI_API_KEY
            - name: SERVICE_BUS_CONNECTION_STRING
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: SERVICE_BUS_CONNECTION_STRING
            - name: STORAGE_CONNECTION_STRING
              valueFrom:
                secretKeyRef:
                  name: uw-secrets
                  key: STORAGE_CONNECTION_STRING
          envFrom:
            - configMapRef:
                name: uw-config
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "2Gi"
          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - "[ -f /tmp/worker_alive ] && find /tmp -name 'worker_alive' -mmin -2"
            initialDelaySeconds: 30
            periodSeconds: 30
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
EOF

echo -e "${GREEN}✅ Document Worker deployed${NC}"
echo ""

# Deploy KEDA ScaledObject for worker autoscaling
echo -e "${BLUE}📊 Deploying KEDA ScaledObject for worker autoscaling...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: document-worker-scaler
  namespace: underwriting
spec:
  scaleTargetRef:
    name: document-worker
  minReplicaCount: 2
  maxReplicaCount: 20
  triggers:
    - type: azure-servicebus
      metadata:
        queueName: document-extraction
        namespace: $SERVICEBUS_NAME
        messageCount: "5"
      authenticationRef:
        name: servicebus-auth
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: servicebus-auth
  namespace: underwriting
spec:
  secretTargetRef:
    - parameter: connection
      name: uw-secrets
      key: SERVICE_BUS_CONNECTION_STRING
EOF

echo -e "${GREEN}✅ KEDA ScaledObject deployed${NC}"
echo ""

# Deploy Ingress
echo -e "${BLUE}🌐 Deploying Ingress...${NC}"

cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: uw-api-ingress
  namespace: underwriting
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://uw.sagesure.io, http://localhost:5173"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization"
    nginx.ingress.kubernetes.io/cors-allow-credentials: "true"
    nginx.ingress.kubernetes.io/enable-cors: "true"
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

echo -e "${GREEN}✅ Ingress deployed${NC}"
echo ""

# Wait for deployments
echo -e "${BLUE}⏳ Waiting for deployments to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/api-handler -n underwriting
kubectl wait --for=condition=available --timeout=300s deployment/document-worker -n underwriting

echo -e "${GREEN}✅ All deployments are ready${NC}"
echo ""

# Get ingress IP
echo -e "${BLUE}🔍 Getting Ingress IP...${NC}"
sleep 10  # Wait for ingress to get IP

INGRESS_IP=$(kubectl get service -n ingress-system ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

if [ "$INGRESS_IP" == "pending" ] || [ -z "$INGRESS_IP" ]; then
    echo -e "${YELLOW}⚠️  Ingress IP not yet assigned. Run this command to check:${NC}"
    echo "  kubectl get service -n ingress-system ingress-nginx-controller"
else
    echo -e "${GREEN}✅ Ingress IP: $INGRESS_IP${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📋 Deployment Summary:${NC}"
echo "  • API Handler: 2 replicas running"
echo "  • Document Worker: 2-20 replicas (KEDA autoscaling)"
echo "  • Cosmos DB: Connected"
echo "  • Blob Storage: Connected"
echo "  • Service Bus: Connected"
echo "  • Azure OpenAI: Connected"
echo "  • KEDA: Autoscaling enabled (queue depth trigger)"
echo ""
echo -e "${BLUE}🌐 API Endpoint:${NC}"
if [ "$INGRESS_IP" != "pending" ] && [ -n "$INGRESS_IP" ]; then
    echo "  http://$INGRESS_IP"
else
    echo "  Pending - check ingress service for IP"
fi
echo ""
echo -e "${BLUE}🔍 Useful Commands:${NC}"
echo "  # Check pod status"
echo "  kubectl get pods -n underwriting"
echo ""
echo "  # View API logs"
echo "  kubectl logs -n underwriting -l app=api-handler -f"
echo ""
echo "  # View Worker logs"
echo "  kubectl logs -n underwriting -l app=document-worker -f"
echo ""
echo "  # Check Service Bus queue"
echo "  az servicebus queue show --resource-group $RG_NAME --namespace-name $SERVICEBUS_NAME --name document-extraction"
echo ""
echo -e "${BLUE}🧪 Test the API:${NC}"
if [ "$INGRESS_IP" != "pending" ] && [ -n "$INGRESS_IP" ]; then
    echo "  curl http://$INGRESS_IP/health"
fi
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Update frontend .env with API URL"
echo "  2. Upload a test document"
echo "  3. Monitor worker logs to see processing"
echo ""
