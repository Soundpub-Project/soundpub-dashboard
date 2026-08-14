-- =============================================
-- CHECK: Schema Ownership and Permissions
-- =============================================

-- Check who owns the soundpub schema
SELECT 
  schema_name,
  schema_owner,
  catalog_name
FROM information_schema.schemata
WHERE schema_name = 'soundpub';

-- Check current user
SELECT current_user, session_user;

-- Check what roles current user has
SELECT 
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin
FROM pg_roles r
WHERE r.rolname = current_user;

-- Check permissions on soundpub schema
SELECT 
  nspname as schema_name,
  nspowner::regrole as owner,
  has_schema_privilege(current_user, nspname, 'USAGE') as has_usage,
  has_schema_privilege(current_user, nspname, 'CREATE') as has_create
FROM pg_namespace
WHERE nspname = 'soundpub';
