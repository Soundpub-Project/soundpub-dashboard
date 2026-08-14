# 🔧 Fix Schema Ownership Issue - Complete Guide

## 📋 Problem Summary

The `soundpub` schema is owned by `supabase_admin`, and the `postgres` user cannot create triggers or modify the schema because it lacks the necessary permissions.

**Error encountered:**
```
ERROR:  must be owner of schema soundpub
WARNING:  no privileges were granted for "soundpub"
```

## 🎯 Root Cause

1. Schema `soundpub` is owned by `supabase_admin`
2. User `postgres` doesn't have CREATE privilege on the schema
3. Without CREATE privilege, triggers cannot be created
4. Attempted `ALTER SCHEMA` commands fail because `postgres` is not the owner

## ✅ Solution Overview

We need to:
1. Run commands as `supabase_admin` (the schema owner)
2. Grant necessary permissions to `postgres` user
3. Set default privileges for future objects
4. Verify the fix worked

## 🚀 Implementation Methods

### Method 1: Docker Exec (Recommended)

This is the most reliable method for self-hosted Supabase.

**Step 1:** Connect to your Supabase server via SSH

**Step 2:** Run the fix script:

```bash
cd ~/docker/supabase/supabase-1.26.05/docker

# Option A: Use the provided shell script
bash /path/to/fix-schema-ownership.sh

# Option B: Run commands directly
docker exec -it supabase-db psql -U supabase_admin -d postgres -c "
  ALTER SCHEMA soundpub OWNER TO supabase_admin;
  GRANT USAGE, CREATE ON SCHEMA soundpub TO postgres;
  GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO postgres;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA soundpub TO postgres;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA soundpub TO postgres;
  
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
    GRANT ALL ON TABLES TO postgres;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
    GRANT ALL ON SEQUENCES TO postgres;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
    GRANT ALL ON FUNCTIONS TO postgres;
  
  GRANT USAGE ON SCHEMA soundpub TO authenticated, service_role, anon, authenticator;
  GRANT SELECT ON ALL TABLES IN SCHEMA soundpub TO authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO service_role;
"
```

**Step 3:** Verify the fix:

```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT 
    nspname AS schema_name,
    nspowner::regrole AS owner,
    has_schema_privilege('postgres', nspname, 'CREATE') AS can_create,
    has_schema_privilege('postgres', nspname, 'USAGE') AS can_use
  FROM pg_namespace 
  WHERE nspname = 'soundpub';
"
```

Expected output:
```
 schema_name |     owner      | can_create | can_use
-------------+----------------+------------+---------
 soundpub    | supabase_admin | t          | t
```

### Method 2: SQL Editor with Role Switch

If you have access to Supabase Studio SQL Editor:

**Step 1:** Open SQL Editor in Supabase Studio

**Step 2:** Run the comprehensive fix script:

```sql
-- File: 46-fix-schema-ownership-comprehensive.sql
SET ROLE supabase_admin;

ALTER SCHEMA soundpub OWNER TO supabase_admin;
GRANT USAGE, CREATE ON SCHEMA soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA soundpub TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA soundpub 
  GRANT ALL ON FUNCTIONS TO postgres;

GRANT USAGE ON SCHEMA soundpub TO authenticated, service_role, anon, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA soundpub TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO service_role;

RESET ROLE;

-- Verify
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS can_create
FROM pg_namespace 
WHERE nspname = 'soundpub';
```

### Method 3: Direct psql Connection

If you can connect directly to the database:

```bash
# Connect as supabase_admin
psql "postgresql://supabase_admin:your_password@localhost:5432/postgres"

# Run the fix commands
\i /path/to/46-fix-schema-ownership-comprehensive.sql
```

## 🔍 Verification Steps

After applying the fix, verify with these queries:

### 1. Check Schema Permissions

```sql
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_can_use,
  has_schema_privilege('authenticated', nspname, 'USAGE') AS authenticated_can_use
FROM pg_namespace 
WHERE nspname = 'soundpub';
```

**Expected:**
- Owner: `supabase_admin`
- `postgres_can_create`: `t` (true)
- `postgres_can_use`: `t` (true)
- `authenticated_can_use`: `t` (true)

### 2. Check Table Permissions

```sql
SELECT 
  tablename,
  tableowner,
  has_table_privilege('postgres', 'soundpub.' || tablename, 'SELECT') AS can_select,
  has_table_privilege('postgres', 'soundpub.' || tablename, 'INSERT') AS can_insert
FROM pg_tables
WHERE schemaname = 'soundpub'
ORDER BY tablename
LIMIT 5;
```

**Expected:** All permissions should be `t` (true)

### 3. Test Trigger Creation

```sql
-- This should now work without errors
CREATE OR REPLACE FUNCTION soundpub.test_function()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS soundpub.test_function();
```

**Expected:** No errors, function created and dropped successfully

## 📁 Files Included

- `46-fix-schema-ownership-comprehensive.sql` - Complete SQL fix script
- `fix-schema-ownership.sh` - Bash script for Docker execution
- `FIX-SCHEMA-OWNERSHIP.md` - This documentation file

## 🔄 Next Steps After Fix

Once the schema ownership is fixed:

1. ✅ Run trigger creation scripts:
   - `43-create-trigger-as-supabase-admin.sql` OR
   - `44-create-trigger-direct-as-admin.sql`

2. ✅ Verify triggers are created:
   ```sql
   SELECT trigger_name, event_object_table, action_timing
   FROM information_schema.triggers
   WHERE trigger_schema = 'soundpub'
   ORDER BY trigger_name;
   ```

3. ✅ Test user creation flow:
   - Create a new user via your application
   - Check if they are automatically assigned to soundpub label
   - Verify they get the 'artist' role automatically

## 🐛 Troubleshooting

### Issue: "SET ROLE supabase_admin" fails

**Solution:** Use Docker exec method instead:
```bash
docker exec -it supabase-db psql -U supabase_admin -d postgres
```

### Issue: "permission denied for schema soundpub"

**Cause:** The fix wasn't applied with correct permissions

**Solution:** Ensure you're running as `supabase_admin`, not `postgres`

### Issue: Triggers still can't be created

**Solution:** Check if postgres has CREATE privilege:
```sql
SELECT has_schema_privilege('postgres', 'soundpub', 'CREATE');
```

If false, re-run the fix script.

### Issue: API can't access soundpub tables

**Cause:** Missing grants to authenticated/service_role

**Solution:** Run these additional grants:
```sql
GRANT USAGE ON SCHEMA soundpub TO authenticated, service_role, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA soundpub TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO service_role;
```

## 📊 Technical Details

### Why This Happens

In Supabase, schemas are typically created by `supabase_admin`. When you create objects via migrations or SQL editor using the default connection (which uses `postgres` role), you may encounter permission issues.

### Permission Hierarchy

```
supabase_admin (superuser-like)
  └─ postgres (application user)
      └─ authenticated (API user)
          └─ anon (public API user)
```

### What Each Grant Does

| Command | Purpose |
|---------|---------|
| `GRANT USAGE` | Allows seeing objects in schema |
| `GRANT CREATE` | Allows creating new objects in schema |
| `GRANT ALL ON TABLES` | Full access to existing tables |
| `ALTER DEFAULT PRIVILEGES` | Applies to future objects |

## 🎓 Best Practices

1. **Always use supabase_admin for schema changes** in self-hosted environments
2. **Set default privileges** to avoid permission issues with new objects
3. **Grant minimal necessary permissions** to API roles (authenticated, anon)
4. **Keep schema ownership consistent** - don't mix owners
5. **Test permissions** after any schema modification

## 📞 Support

If you encounter issues:

1. Check the error message carefully
2. Verify which user is running the command (`SELECT current_user;`)
3. Check schema ownership (`SELECT nspowner::regrole FROM pg_namespace WHERE nspname = 'soundpub';`)
4. Review PostgreSQL logs for detailed errors

## ✅ Success Criteria

You'll know the fix worked when:

- ✅ `postgres` user can create triggers on `soundpub.profiles`
- ✅ No "must be owner of schema" errors
- ✅ Triggers execute successfully on INSERT
- ✅ New users are automatically assigned to soundpub label
- ✅ New users get the 'artist' role automatically

---

**Last Updated:** 2026-08-14  
**Related Issues:** Schema ownership, trigger creation, permission denied  
**Prerequisites:** Supabase self-hosted, Docker access, supabase_admin credentials
