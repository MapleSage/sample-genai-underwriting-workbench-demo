#!/bin/bash

# Deployment Status Check Script
# This script checks the status of both frontend and backend deployments

set -euo pipefail

echo "🔍 Checking Deployment Status"
echo "================================"

# Check Backend API
echo "📡 Backend API Status:"
API_URL="http://4.154.255.64"
if curl -s -f "${API_URL}/health" > /dev/null 2>&1; then
    echo "✅ Backend API is responding at: $API_URL"
    echo "   Health check: $(curl -s "${API_URL}/health" | jq -r '.status // "OK"' 2>/dev/null || echo "OK")"
else
    echo "❌ Backend API is not responding at: $API_URL"
fi

echo ""

# Check Frontend
echo "🌐 Frontend Status:"
FRONTEND_URL="https://uw.sagesure.io"
if curl -s -f "$FRONTEND_URL" > /dev/null 2>&1; then
    echo "✅ Frontend is accessible at: $FRONTEND_URL"
else
    echo "❌ Frontend is not accessible at: $FRONTEND_URL"
fi

echo ""

# Check Vercel Environment Variables
echo "🔧 Vercel Environment Variables:"
if command -v vercel &> /dev/null; then
    cd frontend
    echo "   Current VITE_API_URL: $(vercel env ls | grep VITE_API_URL | head -1 || echo 'Not set')"
    cd ..
else
    echo "   Vercel CLI not installed - cannot check environment variables"
fi

echo ""

# Check Kubernetes Status (if kubectl is available)
echo "☸️  Kubernetes Status:"
if command -v kubectl &> /dev/null; then
    echo "   API Handler Pods:"
    kubectl get pods -n underwriting -l app=api-handler --no-headers 2>/dev/null | awk '{print "     " $1 ": " $3}' || echo "     Cannot connect to cluster"
    
    echo "   Worker Pods:"
    kubectl get pods -n underwriting -l app=document-extract --no-headers 2>/dev/null | awk '{print "     " $1 ": " $3}' || echo "     Cannot connect to cluster"
    
    echo "   Services:"
    kubectl get svc -n underwriting --no-headers 2>/dev/null | awk '{print "     " $1 ": " $2 ":" $5}' || echo "     Cannot connect to cluster"
else
    echo "   kubectl not available - cannot check Kubernetes status"
fi

echo ""
echo "🎯 Summary:"
echo "   Frontend: $FRONTEND_URL"
echo "   Backend:  $API_URL"
echo "   Project:  azure-underwriting on Vercel"