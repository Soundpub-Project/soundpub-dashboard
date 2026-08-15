#!/bin/bash
# ============================================================
# MIGRATION RUNNER SCRIPT (Bash)
# ============================================================
# Quick script to run migration and verification
# Usage: ./run_migration.sh

HOST=${1:-supabase.carubra.com}
USER=${2:-postgres}
DATABASE=${3:-soundpub}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║              DATABASE MIGRATION RUNNER                     ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Configuration:"
echo "  Host: $HOST"
echo "  User: $USER"
echo "  Database: $DATABASE"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ ERROR: psql command not found!"
    echo "   Please install PostgreSQL client tools"
    exit 1
fi

echo "✅ psql command found"
echo ""

# Confirm before running
echo "⚠️  WARNING: This will modify the database structure!"
echo ""
read -p "Have you completed the backup? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled. Please backup first!"
    exit 0
fi

echo ""
echo "🚀 Running migration..."
echo ""

# Run migration
MIGRATION_FILE="migrations-complete/002_auth_verification_system.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ ERROR: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

psql -h $HOST -U $USER -d $DATABASE -f $MIGRATION_FILE

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed!"
    echo ""
    
    echo "🔍 Running verification..."
    echo ""
    
    # Run verification
    VERIFY_FILE="migrations-complete/verify_migration.sql"
    if [ -f "$VERIFY_FILE" ]; then
        psql -h $HOST -U $USER -d $DATABASE -f $VERIFY_FILE
    else
        echo "⚠️  Verification script not found. Skipping..."
    fi
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║              MIGRATION SUCCESSFUL! ✅                      ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
else
    echo ""
    echo "❌ Migration failed! Check errors above."
    echo ""
    exit 1
fi
