#!/bin/bash

# Simple Vercel Environment Variable Update Script
# This script only updates the environment variable without deploying

set -euo pipefail

# Configuration
API_URL="${1:-http://4.154.255.64}"

echo "🚀 Updating Vercel environment variable to: $API_URL"

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel@latest
fi

# Navigate to frontend directory
cd frontend

# Update local environment file
echo "📝 Updating local .env.production file..."
echo "VITE_API_URL=$API_URL" > .env.production

# Update Vercel environment variable
echo "🔧 Updating Vercel environment variable..."
vercel env rm VITE_API_URL production --yes 2>/dev/null || true
echo "$API_URL" | vercel env add VITE_API_URL production

echo "✅ Environment variable updated successfully!"
echo "🔗 API URL: $API_URL"
echo "📝 Note: You may need to trigger a new deployment manually in Vercel dashboard"
echo "🌐 Vercel Dashboard: https://vercel.com/maplesage-s-projects/azure-underwriting"

# Go back to root directory
cd ..

echo "🎉 Done! Environment variable is now set to: $API_URL"