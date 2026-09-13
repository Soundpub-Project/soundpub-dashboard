-- =============================================
-- COMPREHENSIVE FIX: Schema Ownership & Permissions
-- Problem: Soundpub schema owned by supabase_admin, postgres can't modify
-- Solution: Run as supabase_admin to grant necessary permissions
-- =============================================

-- =============================================
-- STEP 1: Check Current State
-- =============================================
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_can_use
FROM pg_namespace 
WHERE nspname = 'Soundpub';

-- Check what role we are currently using
SELECT current_user, session_user;

-- =============================================
-- STEP 2: Transfer Ownership (Run as supabase_admin)
-- =============================================
-- Note: This must be run by a user who has permission to alter the schema
-- In Supabase, this is typically supabase_admin

-- Option A: If you can connect as supabase_admin directly
SET ROLE supabase_admin;

-- Transfer schema ownership to supabase_admin (to ensure we can modify it)
ALTER SCHEMA Soundpub OWNER TO supabase_admin;

-- Grant USAGE and CREATE to postgres
GRANT USAGE, CREATE ON SCHEMA Soundpub TO postgres;

-- Grant ALL privileges on existing objects to postgres
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA Soundpub TO postgres;

-- Set default privileges so future objects are also accessible
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON TABLES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON SEQUENCES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON ROUTINES TO postgres;

-- Also grant to authenticated and service_role for API access
GRANT USAGE ON SCHEMA Soundpub TO authenticated, service_role, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA Soundpub TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO service_role;

-- =============================================
-- STEP 3: Grant Permissions to authenticator
-- =============================================
-- The authenticator role is what PostgREST uses
GRANT USAGE ON SCHEMA Soundpub TO authenticator;

-- =============================================
-- STEP 4: Verification
-- =============================================
-- Check schema ownership and permissions
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_can_use,
  has_schema_privilege('authenticated', nspname, 'USAGE') AS authenticated_can_use,
  has_schema_privilege('service_role', nspname, 'USAGE') AS service_role_can_use
FROM pg_namespace 
WHERE nspname = 'Soundpub';

-- Check table permissions
SELECT 
  schemaname,
  tablename,
  tableowner,
  has_table_privilege('postgres', schemaname || '.' || tablename, 'SELECT') AS postgres_can_select,
  has_table_privilege('postgres', schemaname || '.' || tablename, 'INSERT') AS postgres_can_insert
FROM pg_tables
WHERE schemaname = 'Soundpub'
ORDER BY tablename
LIMIT 5;

-- Check function ownership
SELECT 
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'Soundpub'
ORDER BY p.proname
LIMIT 10;

-- Reset role if needed
RESET ROLE;

-- =============================================
-- ALTERNATIVE: Docker exec method (if SQL editor fails)
-- =============================================
-- Run this from your terminal on the Supabase server:
-- 
-- docker exec -it supabase-db psql -U supabase_admin -d postgres -c "
--   ALTER SCHEMA Soundpub OWNER TO supabase_admin;
--   GRANT USAGE, CREATE ON SCHEMA Soundpub TO postgres;
--   GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres;
--   GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres;
-- "
-- =============================================

-- =============================================
-- NOTES:
-- =============================================
-- 1. The schema is owned by supabase_admin (not postgres)
-- 2. postgres user needs USAGE and CREATE privileges
-- 3. All objects (tables, functions, sequences) need grants to postgres
-- 4. Default privileges ensure future objects are also accessible
-- 5. If you can't SET ROLE supabase_admin in SQL editor, use docker exec
-- 6. After this fix, triggers can be created by postgres user
-- =============================================
