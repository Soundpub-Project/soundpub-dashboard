-- =============================================
-- FIX: Grant CREATE Permission on Soundpub schema
-- Run this as supabase_admin or postgres superuser
-- =============================================

-- Grant CREATE permission to current user and common roles
GRANT CREATE ON SCHEMA Soundpub TO postgres, authenticated, service_role, anon;

-- Also grant to supabase_admin if needed
GRANT ALL ON SCHEMA Soundpub TO supabase_admin;

-- Verify permissions
SELECT 
  nspname as schema_name,
  nspowner::regrole as owner,
  has_schema_privilege(current_user, nspname, 'USAGE') as has_usage,
  has_schema_privilege(current_user, nspname, 'CREATE') as has_create
FROM pg_namespace
WHERE nspname = 'Soundpub';
