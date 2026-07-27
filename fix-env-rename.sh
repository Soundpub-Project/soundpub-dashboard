#!/bin/bash

# Script Auto-Fix: Rename _env to .env dan Restart Supabase
# Usage: chmod +x fix-env-rename.sh && ./fix-env-rename.sh

set -e  # Exit on error

echo "=========================================="
echo "Supabase Environment File Fix Script"
echo "=========================================="
echo ""

# Colors untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SUPABASE_DIR="$HOME/docker/supabase/supabase/docker"

# Function untuk print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# 1. Check apakah direktori Supabase ada
print_info "Checking Supabase directory..."
if [ ! -d "$SUPABASE_DIR" ]; then
    print_error "Supabase directory not found: $SUPABASE_DIR"
    echo "Please check the path and try again."
    exit 1
fi
print_success "Supabase directory found"

# 2. Pindah ke direktori Supabase
cd "$SUPABASE_DIR" || exit 1
print_info "Working directory: $(pwd)"
echo ""

# 3. Check apakah file _env ada
print_info "Checking for _env file..."
if [ -f "_env" ]; then
    print_success "Found _env file"
    
    # 4. Check apakah .env sudah ada (backup dulu jika ada)
    if [ -f ".env" ]; then
        print_warning ".env file already exists"
        print_info "Backing up existing .env to .env.backup.$(date +%s)"
        cp .env ".env.backup.$(date +%s)"
        print_success "Backup created"
    fi
    
    # 5. Rename _env to .env
    print_info "Renaming _env to .env..."
    mv _env .env
    print_success "File renamed successfully"
    
else
    print_warning "_env file not found"
    
    # Check apakah .env sudah ada
    if [ -f ".env" ]; then
        print_success ".env file already exists (good!)"
    else
        print_error "Neither _env nor .env found!"
        print_info "You need to create a .env file first"
        echo ""
        echo "Options:"
        echo "1. Download template: curl -o .env https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example"
        echo "2. Copy from example: cp .env.example .env"
        echo "3. Use the supabase-env-template.env from the documentation"
        exit 1
    fi
fi

echo ""

# 6. Verify .env file exists and is readable
print_info "Verifying .env file..."
if [ -f ".env" ] && [ -r ".env" ]; then
    FILE_SIZE=$(stat -f%z ".env" 2>/dev/null || stat -c%s ".env" 2>/dev/null || echo "0")
    print_success ".env file exists and is readable"
    print_info "File size: $FILE_SIZE bytes"
    
    if [ "$FILE_SIZE" -lt 100 ]; then
        print_warning ".env file seems too small (< 100 bytes)"
        print_warning "Please check if the file contains all required environment variables"
    fi
else
    print_error ".env file not found or not readable"
    exit 1
fi

echo ""

# 7. Check critical environment variables
print_info "Checking critical environment variables in .env..."
REQUIRED_VARS=("POSTGRES_PASSWORD" "JWT_SECRET" "ANON_KEY" "SERVICE_ROLE_KEY")
MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${VAR}=" .env && ! grep -q "^${VAR}=$" .env; then
        print_success "$VAR is set"
    else
        print_warning "$VAR is NOT set or empty"
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo ""
    print_error "Missing or empty required variables:"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "  - $VAR"
    done
    echo ""
    print_warning "Please edit .env and fill in these variables before proceeding"
    echo ""
    read -p "Do you want to edit .env now? (y/n): " EDIT_NOW
    if [ "$EDIT_NOW" = "y" ] || [ "$EDIT_NOW" = "Y" ]; then
        ${EDITOR:-nano} .env
    else
        print_info "Please edit .env manually: nano $SUPABASE_DIR/.env"
        exit 1
    fi
fi

echo ""

# 8. Ask user confirmation to restart Supabase
print_warning "This script will now restart Supabase services"
print_info "This will cause a brief downtime (~30-60 seconds)"
echo ""
read -p "Do you want to proceed? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    print_info "Restart cancelled. You can manually restart later with:"
    echo "  cd $SUPABASE_DIR"
    echo "  docker compose down"
    echo "  docker compose up -d"
    exit 0
fi

echo ""

# 9. Stop Supabase
print_info "Stopping Supabase services..."
if docker compose down; then
    print_success "Services stopped"
else
    print_error "Failed to stop services"
    exit 1
fi

echo ""

# 10. Start Supabase
print_info "Starting Supabase services..."
if docker compose up -d; then
    print_success "Services started"
else
    print_error "Failed to start services"
    print_info "Check logs with: docker compose logs -f"
    exit 1
fi

echo ""
print_info "Waiting 30 seconds for services to initialize..."
sleep 30

echo ""

# 11. Check services status
print_info "Checking services status..."
echo ""
docker compose ps

echo ""
echo "=========================================="

# 12. Check for unhealthy services
UNHEALTHY=$(docker compose ps --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | grep -v "healthy" | wc -l || echo "0")

if [ "$UNHEALTHY" -gt 0 ]; then
    print_warning "Some services are not healthy yet"
    print_info "This is normal, they may still be initializing"
    print_info "Wait a few more minutes and check again with: docker compose ps"
    echo ""
    print_info "Check logs for details: docker compose logs -f"
else
    print_success "All services appear to be healthy!"
    echo ""
    print_success "Supabase is now running with the correct .env file"
    echo ""
    print_info "Next steps:"
    echo "  1. Access dashboard: https://supabase.carubra.com"
    echo "  2. Test your application: https://web.maskhar.com"
    echo "  3. Check logs if needed: cd $SUPABASE_DIR && docker compose logs -f"
fi

echo "=========================================="

