#!/bin/bash
# ============================================================
# EDGE FUNCTIONS DEPLOYMENT SCRIPT (Bash)
# ============================================================
# Usage: ./deploy_functions.sh [staging|prod]

ENV=${1:-staging}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║           EDGE FUNCTIONS DEPLOYMENT                        ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Target Environment: $ENV"
echo ""

# Check supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ ERROR: supabase CLI not found!"
    echo "   Install: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Functions to deploy
functions=(
    "send-password-reset"
    "verify-password-reset-token"
    "reset-password"
    "send-verification-email"
    "verify-email"
    "send-app-email"
)

echo "Functions to deploy: ${#functions[@]}"
for func in "${functions[@]}"; do
    echo "  • $func"
done
echo ""

# Confirm
read -p "Deploy to $ENV? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting deployment..."
echo ""

success=0
failed=0

for func in "${functions[@]}"; do
    echo "Deploying $func..."
    
    if supabase functions deploy $func --project-ref $ENV; then
        echo "✅ $func deployed successfully"
        ((success++))
    else
        echo "❌ $func deployment failed"
        ((failed++))
    fi
    
    echo ""
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║              DEPLOYMENT SUMMARY                            ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Environment: $ENV"
echo "  Successful: $success"
echo "  Failed: $failed"
echo ""

if [ $failed -eq 0 ]; then
    echo "✅ All functions deployed successfully!"
else
    echo "⚠️  Some functions failed to deploy. Check errors above."
fi

echo ""
