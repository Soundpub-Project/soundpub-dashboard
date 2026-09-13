# 🚀 Quick Fix - Schema Ownership Issue

## One-Liner Fix (Copy & Paste)

### On Supabase Server (via SSH):

```bash
docker exec -it supabase-db psql -U supabase_admin -d postgres -c "ALTER SCHEMA Soundpub OWNER TO supabase_admin; GRANT USAGE, CREATE ON SCHEMA Soundpub TO postgres; GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres; GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres; GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub GRANT ALL ON TABLES TO postgres; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub GRANT ALL ON SEQUENCES TO postgres; ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub GRANT ALL ON FUNCTIONS TO postgres; GRANT USAGE ON SCHEMA Soundpub TO authenticated, service_role, anon, authenticator; GRANT SELECT ON ALL TABLES IN SCHEMA Soundpub TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO service_role;"
```

### Verify (should show can_create = t):

```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "SELECT nspname, nspowner::regrole AS owner, has_schema_privilege('postgres', nspname, 'CREATE') AS can_create FROM pg_namespace WHERE nspname = 'Soundpub';"
```

## What This Does:

1. ✅ Keeps schema owned by supabase_admin
2. ✅ Grants CREATE privilege to postgres
3. ✅ Grants all permissions on existing objects
4. ✅ Sets default privileges for future objects
5. ✅ Enables API access for authenticated users

## After Fix:

Run trigger creation:
```bash
docker exec -it supabase-db psql -U postgres -d postgres < 44-create-trigger-direct-as-admin.sql
```

---

**See FIX-SCHEMA-OWNERSHIP.md for detailed explanation**
