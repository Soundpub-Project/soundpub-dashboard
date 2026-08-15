#!/bin/bash
# ============================================================
# SOUNDPUB DASHBOARD - DOCKER MIGRATION RUNNER
# ============================================================
# Purpose: Run database migration on self-hosted Supabase
# Target: Docker container supabase-db
# Migration: 002_auth_verification_system_v2.sql
# ============================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DOCKER_CONTAINER="supabase-db"
POSTGRES_USER="postgres"
DATABASE_NAME="postgres"
MIGRATION_FILE="002_auth_verification_system_v2.sql"

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  SOUNDPUB - Docker Migration Runner${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}[ERROR] Migration file not found: $MIGRATION_FILE${NC}"
    echo -e "${YELLOW}[INFO] Please upload the migration file to this directory first${NC}"
    exit 1
fi

echo -e "${GREEN}[INFO] Migration file found: $MIGRATION_FILE${NC}"
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker command not found${NC}"
    exit 1
fi

# Check if container exists and is running
if ! docker ps | grep -q "$DOCKER_CONTAINER"; then
    echo -e "${RED}[ERROR] Container $DOCKER_CONTAINER is not running${NC}"
    echo -e "${YELLOW}[INFO] Check your Docker containers with: docker ps${NC}"
    exit 1
fi

echo -e "${GREEN}[INFO] Container $DOCKER_CONTAINER is running${NC}"
echo ""

# Display configuration
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Docker Container: ${CYAN}$DOCKER_CONTAINER${NC}"
echo -e "  Database        : ${CYAN}$DATABASE_NAME${NC}"
echo -e "  Migration File  : ${CYAN}$MIGRATION_FILE${NC}"
echo ""

# Ask for confirmation
echo -e "${YELLOW}This will run the migration on your self-hosted Supabase.${NC}"
read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${RED}[CANCELLED] Migration cancelled by user.${NC}"
    exit 0
fi

echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  Executing Migration${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# Execute migration
echo -e "${YELLOW}[INFO] Executing migration...${NC}"
echo ""

docker exec -i "$DOCKER_CONTAINER" psql -U "$POSTGRES_USER" -d "$DATABASE_NAME" < "$MIGRATION_FILE"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}[ERROR] Migration failed!${NC}"
    echo -e "${YELLOW}[INFO] Check the error messages above${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}[SUCCESS] Migration executed successfully!${NC}"
echo ""

# Verification
echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  Verifying Migration${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

echo -e "${YELLOW}[INFO] Checking new columns in profiles table...${NC}"
docker exec -i "$DOCKER_CONTAINER" psql -U "$POSTGRES_USER" -d "$DATABASE_NAME" << EOF
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema='soundpub' 
  AND table_name='profiles' 
  AND column_name IN ('email_verified', 'verification_token', 'password_reset_token')
ORDER BY column_name;
EOF

echo ""
echo -e "${YELLOW}[INFO] Checking new tables...${NC}"
docker exec -i "$DOCKER_CONTAINER" psql -U "$POSTGRES_USER" -d "$DATABASE_NAME" << EOF
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='soundpub' 
  AND table_name IN ('auth_events', 'rate_limits')
ORDER BY table_name;
EOF

echo ""
echo -e "${YELLOW}[INFO] Checking utility functions...${NC}"
docker exec -i "$DOCKER_CONTAINER" psql -U "$POSTGRES_USER" -d "$DATABASE_NAME" << EOF
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema='soundpub'
  AND routine_name IN ('check_rate_limit', 'cleanup_rate_limits', 'cleanup_expired_tokens', 'cleanup_old_auth_events')
ORDER BY routine_name;
EOF

echo ""
echo -e "${GREEN}[SUCCESS] Verification completed!${NC}"
echo ""

# Summary
echo -e "${CYAN}============================================================${NC}"
echo -e "${GREEN}  Migration Complete!${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""
echo -e "${YELLOW}What was done:${NC}"
echo -e "  ${GREEN}✓${NC} Added email_verified column to profiles"
echo -e "  ${GREEN}✓${NC} Added verification_token columns"
echo -e "  ${GREEN}✓${NC} Added password_reset_token columns"
echo -e "  ${GREEN}✓${NC} Created auth_events table"
echo -e "  ${GREEN}✓${NC} Created rate_limits table"
echo -e "  ${GREEN}✓${NC} Added utility functions"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Set Edge Function environment variables"
echo -e "  2. Restart edge functions container: ${CYAN}docker compose restart functions${NC}"
echo -e "  3. Test signup and password reset flows"
echo ""
echo -e "${YELLOW}For more details, see: MIGRATION_DOCKER_GUIDE.md${NC}"
echo ""
