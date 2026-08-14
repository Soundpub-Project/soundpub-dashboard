#!/bin/bash
# =============================================
# Fix Schema Ownership via Docker
# Run this script on your Supabase server
# =============================================

echo "🔧 Fixing soundpub schema ownership and permissions..."
echo ""

# Execute as supabase_admin user
docker exec -it supabase-db psql -U supabase_admin -d postgres << 'EOSQL'

-- Check current state
\echo '📊 Current Schema State:'
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create
FROM pg_namespace 
WHERE nspname = 'soundpub';

\echo ''
\echo '🔄 Applying fixes...'

-- Transfer ownership and grant permissions
ALTER SCHEMA soundpub OWNER TO supabase_admin;
GRANT USAGE, CREATE ON SCHEMA soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA soundpub TO postgres;

-- Set default privileges
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON FUNCTIONS TO postgres;

-- Grant to API roles
GRANT USAGE ON SCHEMA soundpub TO authenticated, service_role, anon, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA soundpub TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO service_role;

\echo ''
\echo '✅ Verification:'
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_can_use
FROM pg_namespace 
WHERE nspname = 'soundpub';

EOSQL

echo ""
echo "✅ Schema ownership fix completed!"
echo ""
echo "Next steps:"
echo "1. Verify postgres can now create objects in soundpub schema"
echo "2. Run trigger creation scripts (43 or 44)"
echo "3. Test by creating a new user"
