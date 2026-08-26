# ✅ Schema Ownership Fix - Execution Checklist

## Pre-Execution Checklist

- [ ] You have SSH access to Supabase server
- [ ] Docker container `supabase-db` is running
- [ ] You have backup (optional, but recommended)
- [ ] You understand the changes being made

## Execution Steps

### 1. Connect to Supabase Server

```bash
ssh maskhar@supabase-server
```

**Status:** [ ] Connected

### 2. Navigate to Docker Directory

```bash
cd ~/docker/supabase/supabase-1.26.05/docker
```

**Status:** [ ] In correct directory

### 3. Check Current State (Diagnostic)

```bash
docker exec -it supabase-db psql -U postgres -d postgres << 'EOF'
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS can_use
FROM pg_namespace 
WHERE nspname = 'Soundpub';
EOF
```

**Expected Current State:**
- Owner: `supabase_admin`
- can_create: `f` (false) ❌
- can_use: May vary

**Status:** [ ] Current state verified

### 4. Apply the Fix

Copy and paste this entire command:

```bash
docker exec -it supabase-db psql -U supabase_admin -d postgres << 'EOSQL'
-- Fix schema ownership and permissions
ALTER SCHEMA Soundpub OWNER TO supabase_admin;

-- Grant necessary privileges to postgres
GRANT USAGE, CREATE ON SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA Soundpub 
  GRANT ALL ON FUNCTIONS TO postgres;

-- Grant API access
GRANT USAGE ON SCHEMA Soundpub TO authenticated, service_role, anon, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA Soundpub TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO service_role;

-- Verify
SELECT 
  nspname AS schema_name,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS can_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS can_use
FROM pg_namespace 
WHERE nspname = 'Soundpub';
EOSQL
```

**Expected Output:**
```
 schema_name |     owner      | can_create | can_use
-------------+----------------+------------+---------
 Soundpub    | supabase_admin | t          | t
```

**Status:** [ ] Fix applied successfully

### 5. Verify Fix (Detailed)

```bash
docker exec -it supabase-db psql -U postgres -d postgres << 'EOF'
-- Check schema permissions
SELECT 
  nspname AS schema,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_usage,
  has_schema_privilege('authenticated', nspname, 'USAGE') AS api_usage
FROM pg_namespace 
WHERE nspname = 'Soundpub';

-- Check table permissions (sample)
SELECT 
  tablename,
  has_table_privilege('postgres', 'Soundpub.' || tablename, 'SELECT') AS can_select,
  has_table_privilege('postgres', 'Soundpub.' || tablename, 'INSERT') AS can_insert
FROM pg_tables
WHERE schemaname = 'Soundpub'
ORDER BY tablename
LIMIT 5;
EOF
```

**Expected:** All permissions should be `t` (true)

**Status:** [ ] Verification passed

### 6. Test Trigger Creation

```bash
docker exec -it supabase-db psql -U postgres -d postgres << 'EOF'
-- Test: Create a simple function
CREATE OR REPLACE FUNCTION Soundpub.test_permission()
RETURNS boolean AS $$
BEGIN
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Verify it was created
SELECT proname FROM pg_proc 
WHERE proname = 'test_permission' 
  AND pronamespace = 'Soundpub'::regnamespace;

-- Clean up
DROP FUNCTION Soundpub.test_permission();

SELECT 'Test PASSED: postgres can create functions in Soundpub schema' AS result;
EOF
```

**Expected Output:**
```
result
------------------------------------------------------
Test PASSED: postgres can create functions in Soundpub schema
```

**Status:** [ ] Test passed

### 7. Apply Trigger Creation Script

Now that permissions are fixed, create the actual triggers:

```bash
docker exec -it supabase-db psql -U postgres -d postgres << 'EOSQL'
-- Create auto-assignment functions
CREATE OR REPLACE FUNCTION Soundpub.auto_assign_new_user_to_Soundpub_label()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = Soundpub, public
AS \$\$
DECLARE
  Soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_label_id IS NULL THEN
    NEW.parent_label_id := Soundpub_label_id;
  END IF;
  
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION Soundpub.auto_assign_artist_role()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = Soundpub, public
AS \$\$
DECLARE
  Soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF NEW.parent_label_id = Soundpub_label_id THEN
    INSERT INTO Soundpub.user_roles (user_id, role)
    VALUES (NEW.id, 'artist'::Soundpub.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trigger_auto_assign_Soundpub_label ON Soundpub.profiles;
DROP TRIGGER IF EXISTS trigger_auto_assign_artist_role ON Soundpub.profiles;

-- Create triggers
CREATE TRIGGER trigger_auto_assign_Soundpub_label
  BEFORE INSERT ON Soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION Soundpub.auto_assign_new_user_to_Soundpub_label();

CREATE TRIGGER trigger_auto_assign_artist_role
  AFTER INSERT ON Soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION Soundpub.auto_assign_artist_role();

-- Verify triggers
SELECT 
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'Soundpub'
  AND event_object_table = 'profiles'
  AND trigger_name IN ('trigger_auto_assign_Soundpub_label', 'trigger_auto_assign_artist_role')
ORDER BY trigger_name;
EOSQL
```

**Expected Output:** 2 triggers listed

**Status:** [ ] Triggers created successfully

### 8. Final Verification

```bash
docker exec -it supabase-db psql -U postgres -d postgres << 'EOF'
-- Comprehensive status check
SELECT '=== SCHEMA PERMISSIONS ===' AS section;
SELECT 
  nspname AS schema,
  nspowner::regrole AS owner,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_create,
  has_schema_privilege('postgres', nspname, 'USAGE') AS postgres_usage
FROM pg_namespace 
WHERE nspname = 'Soundpub';

SELECT '=== TRIGGERS ===' AS section;
SELECT 
  trigger_name,
  event_object_table AS table,
  action_timing || ' ' || event_manipulation AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'Soundpub'
  AND event_object_table = 'profiles'
ORDER BY trigger_name;

SELECT '=== FUNCTIONS ===' AS section;
SELECT 
  proname AS function_name,
  pg_get_userbyid(proowner) AS owner
FROM pg_proc 
WHERE pronamespace = 'Soundpub'::regnamespace
  AND proname LIKE '%auto_assign%'
ORDER BY proname;

SELECT '=== STATUS ===' AS section;
SELECT 
  CASE 
    WHEN has_schema_privilege('postgres', 'Soundpub', 'CREATE') 
    THEN '✅ FIX SUCCESSFUL - All permissions granted'
    ELSE '❌ FIX FAILED - Missing permissions'
  END AS overall_status;
EOF
```

**Status:** [ ] All checks passed

## Post-Execution Checklist

- [ ] Schema ownership verified (supabase_admin)
- [ ] postgres has CREATE privilege
- [ ] All table permissions working
- [ ] Triggers created successfully
- [ ] Functions created successfully
- [ ] No error messages in output
- [ ] Ready to test user creation

## Testing the Fix

To test that everything works:

1. **Create a test user** via your application
2. **Check the user's profile:**
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres -c "
     SELECT id, email, parent_label_id 
     FROM Soundpub.profiles 
     WHERE email = 'test@example.com';
   "
   ```
3. **Check the user's role:**
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres -c "
     SELECT user_id, role 
     FROM Soundpub.user_roles 
     WHERE user_id = (SELECT id FROM Soundpub.profiles WHERE email = 'test@example.com');
   "
   ```

**Expected:**
- parent_label_id should be: `9fd5ab85-c603-496a-95e2-1045b30847f8`
- role should be: `artist`

## Rollback (If Needed)

If something goes wrong, you can remove the grants:

```bash
docker exec -it supabase-db psql -U supabase_admin -d postgres -c "
  REVOKE CREATE ON SCHEMA Soundpub FROM postgres;
"
```

However, this fix only ADDS permissions, it doesn't modify data, so rollback is rarely needed.

## Troubleshooting

### Issue: "role supabase_admin does not exist"

**Solution:** Check available roles:
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "\du"
```

Use the appropriate admin role name.

### Issue: Still getting "permission denied"

**Solution:** Verify postgres has the privilege:
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT has_schema_privilege('postgres', 'Soundpub', 'CREATE');
"
```

If false, re-run step 4.

### Issue: Triggers not firing

**Solution:** Check trigger status:
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "
  SELECT tgname, tgenabled FROM pg_trigger 
  WHERE tgname LIKE '%auto_assign%';
"
```

tgenabled should be 'O' (enabled).

## Success Criteria

✅ All checklist items marked as complete
✅ No error messages during execution
✅ Verification queries show `t` (true) for permissions
✅ Triggers listed in information_schema
✅ Test function creation succeeded
✅ Ready for production use

## Time Estimate

- Pre-checks: 2 minutes
- Execution: 2 minutes
- Verification: 2 minutes
- Testing: 3 minutes
- **Total: ~10 minutes**

---

**Next Steps:** Test user creation flow end-to-end

**Documentation:** See FIX-SCHEMA-OWNERSHIP.md for detailed explanation

**Support:** Check SUMMARY.md for troubleshooting tips
