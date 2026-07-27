#!/bin/bash
# =============================================
# QUICK DEPLOYMENT SCRIPT - AUTH FIXES
# Run this on Supabase server to deploy both fixes
# =============================================

set -e  # Exit on error

echo "=================================="
echo "AUTH SYSTEM FIXES - DEPLOYMENT"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on server
if [ ! -d "~/docker/supabase/supabase/docker" ]; then
  echo -e "${RED}Error: Not running on Supabase server${NC}"
  echo "Please SSH to server first: ssh maskhar@supabase-server"
  exit 1
fi

cd ~/docker/supabase/supabase/docker

echo "Step 1: Backup current state..."
echo "=================================="

# Backup .env
BACKUP_ENV=".env.backup-$(date +%Y%m%d-%H%M%S)"
cp .env "$BACKUP_ENV"
echo -e "${GREEN}✓${NC} .env backed up to: $BACKUP_ENV"

# Backup database
BACKUP_DB="$HOME/backup-soundpub-$(date +%Y%m%d-%H%M%S).sql"
docker compose exec -T db pg_dump -U postgres -d postgres -n soundpub > "$BACKUP_DB"
echo -e "${GREEN}✓${NC} Database backed up to: $BACKUP_DB"

echo ""
echo "Step 2: Run database migration..."
echo "=================================="

# Check if migration file exists
if [ ! -f "$HOME/20260727094500_fix_auto_artist_role_assignment.sql" ]; then
  echo -e "${RED}Error: Migration file not found${NC}"
  echo "Please upload: 20260727094500_fix_auto_artist_role_assignment.sql"
  exit 1
fi

# Run migration
echo "Running migration..."
docker compose exec -T db psql -U postgres -d postgres < "$HOME/20260727094500_fix_auto_artist_role_assignment.sql"
echo -e "${GREEN}✓${NC} Migration completed"

# Verify Soundpub Music label
echo ""
echo "Verifying Soundpub Music label..."
LABEL_CHECK=$(docker compose exec -T db psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM soundpub.profiles WHERE email = 'label@soundpub.id';")
if [ "$LABEL_CHECK" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Soundpub Music label exists"
else
  echo -e "${RED}✗${NC} Soundpub Music label NOT found!"
  exit 1
fi

echo ""
echo "Step 3: Configure Google OAuth..."
echo "=================================="

# Check if Google OAuth already configured
if grep -q "GOTRUE_EXTERNAL_GOOGLE_ENABLED" .env; then
  echo -e "${YELLOW}⚠${NC} Google OAuth already configured in .env"
  echo "Skipping Google OAuth configuration..."
else
  echo -e "${YELLOW}⚠${NC} Google OAuth NOT configured"
  echo "Please manually add these lines to .env:"
  echo ""
  echo "GOTRUE_EXTERNAL_GOOGLE_ENABLED=true"
  echo "GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com"
  echo "GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-<your-secret>"
  echo "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback"
  echo ""
  read -p "Press Enter after you've added the configuration..."
fi

echo ""
echo "Step 4: Restart auth service..."
echo "=================================="

docker compose restart auth
echo "Waiting for auth service to be healthy..."
sleep 10

# Check if auth service is healthy
AUTH_STATUS=$(docker compose ps auth --format json | grep -o '"Health":"[^"]*"' | cut -d'"' -f4)
if [ "$AUTH_STATUS" == "healthy" ]; then
  echo -e "${GREEN}✓${NC} Auth service is healthy"
else
  echo -e "${YELLOW}⚠${NC} Auth service status: $AUTH_STATUS"
  echo "Waiting another 10 seconds..."
  sleep 10
fi

echo ""
echo "Step 5: Verification..."
echo "=================================="

# Check trigger function
echo "Checking trigger function..."
TRIGGER_CHECK=$(docker compose exec -T db psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM pg_proc WHERE proname = 'handle_new_user' AND prosrc LIKE '%artist%';")
if [ "$TRIGGER_CHECK" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Trigger function updated with artist logic"
else
  echo -e "${RED}✗${NC} Trigger function NOT updated!"
fi

# Check Google OAuth env vars
echo "Checking Google OAuth configuration..."
GOOGLE_ENABLED=$(docker compose exec -T auth env | grep GOTRUE_EXTERNAL_GOOGLE_ENABLED || echo "NOT FOUND")
if [[ "$GOOGLE_ENABLED" == *"true"* ]]; then
  echo -e "${GREEN}✓${NC} Google OAuth enabled"
else
  echo -e "${YELLOW}⚠${NC} Google OAuth not enabled or not configured"
fi

# Check all services
echo ""
echo "Checking all services..."
docker compose ps

echo ""
echo "=================================="
echo "DEPLOYMENT COMPLETED!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Test manual signup at: https://web.maskhar.com"
echo "2. Test Google login at: https://web.maskhar.com"
echo "3. Monitor logs: docker compose logs -f auth"
echo ""
echo "Backups created:"
echo "  - .env: $BACKUP_ENV"
echo "  - Database: $BACKUP_DB"
echo ""
echo "For detailed testing, see: docs/auth-system-analysis/03-TESTING-GUIDE.md"
