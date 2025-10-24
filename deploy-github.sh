#!/bin/bash

# 🏏 Cricket Auction App - GitHub Pages Deployment Script
# Automatically builds and deploys to GitHub Pages

echo "🏏 Cricket Auction App - GitHub Pages Deployment"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "build-production.js" ]; then
    echo "❌ Error: build-production.js not found!"
    echo "Please run this script from the auctionApp directory"
    exit 1
fi

# Step 1: Build production version
echo "📦 Step 1: Building production version..."
node build-production.js

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✅ Build complete!"
echo ""

# Step 2: Replace index.html with production version
echo "🔄 Step 2: Replacing index.html with production version..."

if [ ! -f "index-production.html" ]; then
    echo "❌ Error: index-production.html not found!"
    exit 1
fi

# Backup current index.html
if [ -f "index.html" ]; then
    cp index.html index.html.backup
    echo "   ✓ Backed up current index.html"
fi

# Replace with production version
cp index-production.html index.html
echo "   ✓ Replaced index.html with production version"
echo ""

# Step 3: Git status check
echo "📊 Step 3: Checking git status..."
git status --short
echo ""

# Step 4: Ask for commit message
read -p "📝 Enter commit message (or press Enter for default): " COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update production version - $(date '+%Y-%m-%d %H:%M')"
fi

echo ""
echo "💾 Step 4: Committing changes..."
git add index.html config.js assets/
git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo "⚠️  Nothing to commit or commit failed"
else
    echo "   ✓ Changes committed"
fi

echo ""

# Step 5: Push to GitHub
read -p "🚀 Push to GitHub Pages? (y/n): " PUSH_CONFIRM

if [ "$PUSH_CONFIRM" = "y" ] || [ "$PUSH_CONFIRM" = "Y" ]; then
    echo ""
    echo "📤 Step 5: Pushing to GitHub..."
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully deployed to GitHub Pages!"
        echo ""
        echo "🌐 Your app will be live in 1-2 minutes at:"
        echo "   https://nawabjaffer.github.io/cricket-auction-app/"
        echo ""
        echo "💡 Pro tip: Clear your browser cache (Cmd+Shift+R / Ctrl+Shift+R) to see changes"
        echo ""
    else
        echo "❌ Push failed!"
        exit 1
    fi
else
    echo ""
    echo "⏸️  Deployment cancelled. Changes are committed but not pushed."
    echo "   Run 'git push origin main' when ready to deploy."
    echo ""
fi

echo "🎉 Deployment process complete!"
