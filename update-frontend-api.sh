#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <AKS_INGRESS_IP>"
    echo "Example: $0 20.1.2.3"
    exit 1
fi

AKS_IP=$1

echo "🔄 Updating frontend API configuration..."

# Update .env.local
sed -i.bak "s|VITE_API_URL=.*|VITE_API_URL=http://$AKS_IP/api|" frontend/.env.local

# Update .env.production  
sed -i.bak "s|VITE_API_URL=.*|VITE_API_URL=http://$AKS_IP/api|" frontend/.env.production

echo "✅ Frontend configuration updated!"
echo "📝 API URL is now: http://$AKS_IP/api"
echo ""
echo "Next steps:"
echo "1. Rebuild and redeploy your frontend"
echo "2. Test the connection to your new AKS backend"