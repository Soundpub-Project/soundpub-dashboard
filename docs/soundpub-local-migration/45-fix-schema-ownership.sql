-- =============================================
-- FIX OWNERSHIP: Transfer soundpub schema to postgres
-- Run as postgres superuser
-- =============================================

-- Check current owner
SELECT nspname, nspowner::regrole as owner 
FROM pg_namespace 
WHERE nspname = 'soundpub';

-- Transfer ownership to postgres
ALTER SCHEMA soundpub OWNER TO postgres;

-- Grant all privileges
GRANT ALL ON SCHEMA soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA soundpub TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON FUNCTIONS TO postgres;

-- Verify
SELECT nspname, nspowner::regrole as owner,
       has_schema_privilege('postgres', nspname, 'CREATE') as can_create
FROM pg_namespace 
WHERE nspname = 'soundpub';
