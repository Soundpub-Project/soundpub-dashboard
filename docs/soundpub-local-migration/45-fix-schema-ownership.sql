-- =============================================
-- FIX OWNERSHIP: Transfer Soundpub schema to postgres
-- Run as postgres superuser
-- =============================================

-- Check current owner
SELECT nspname, nspowner::regrole as owner 
FROM pg_namespace 
WHERE nspname = 'Soundpub';

-- Transfer ownership to postgres
ALTER SCHEMA Soundpub OWNER TO postgres;

-- Grant all privileges
GRANT ALL ON SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA Soundpub GRANT ALL ON FUNCTIONS TO postgres;

-- Verify
SELECT nspname, nspowner::regrole as owner,
       has_schema_privilege('postgres', nspname, 'CREATE') as can_create
FROM pg_namespace 
WHERE nspname = 'Soundpub';
