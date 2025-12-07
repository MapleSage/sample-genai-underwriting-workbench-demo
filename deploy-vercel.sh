#!/bin/bash

# Quick Vercel Deployment Script
# This script triggers a new Vercel deployment with updated environment variables

set -euo pipefail

echo "🚀 Triggering Vercel deployment..."

cd frontend

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel@latest
fi

# Deploy to production
echo "📦 Building and deploying to production..."
vercel --prod --yes --force

echo "✅ Deployment triggered successfully!"
echo "🌐 Check status at: https://vercel.com/maplesage-s-projects/azure-underwriting"
echo "🔗 Live site: https://uw.sagesure.io"

cd ..