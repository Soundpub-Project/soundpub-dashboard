# 🗄️ DATABASE MIGRATION GUIDE
**Soundpub Dashboard - Auth Verification System**

---

## 📋 OVERVIEW

File ini adalah panduan lengkap untuk menjalankan database migration untuk Auth Verification System.

**Migration Script:** `migrations-complete/002_auth_verification_system.sql`  
**Target Database:** Soundpub  
**Target Schema:** Soundpub  
**Estimated Time:** 5-10 minutes  

---

## ⚠️ PRE-REQUISITES

### 1. Backup MUST Be Completed
```bash
# Check if backup exists
ls -lh backups/backup_Soundpub_*.sql

# Backup should be > 0 bytes
# If not done yet, run:
pg_dump -h supabase.carubra.com -U postgres -d Soundpub > backups/backup_Soundpub_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Database Connection
```bash
# Test connection
psql -h supabase.carubra.com -U postgres -d Soundpub -c "SELECT current_database(), current_schema();"

# Should output:
# current_database | current_schema
# Soundpub         | Soundpub
```

### 3. Check Current Schema
```sql
-- Verify 'Soundpub' schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'Soundpub';

-- Check current tables in Soundpub schema
SELECT table_name FROM information_schema.tables WHERE table_schema = 'Soundpub' ORDER BY table_name;
```

---

## 🚀 MIGRATION STEPS

### Step 1: Dry Run (Review Only)
```bash
# Open and review the migration script
code migrations-complete/002_auth_verification_system.sql

# Or view in terminal
cat migrations-complete/002_auth_verification_system.sql | less
```

**What to check:**
- ✅ All queries use `Soundpub.` prefix
- ✅ Uses `IF NOT EXISTS` (idempotent)
- ✅ Wrapped in BEGIN/COMMIT transaction
- ✅ No hardcoded sensitive data

---

### Step 2: Run Migration (STAGING FIRST!)

**Option A: Interactive (Recommended for first time)**
```bash
# Connect to database
psql -h staging-db-host -U postgres -d Soundpub

# Inside psql, run:
\i migrations-complete/002_auth_verification_system.sql

# Watch for output messages
# Should end with: "Migration 002_auth_verification_system.sql completed successfully!"
```

**Option B: Non-Interactive**
```bash
# Run directly
psql -h staging-db-host -U postgres -d Soundpub -f migrations-complete/002_auth_verification_system.sql

# Or with output to file
psql -h staging-db-host -U postgres -d Soundpub -f migrations-complete/002_auth_verification_system.sql > migration_output.log 2>&1

# Check log
cat migration_output.log
```

**Option C: Windows PowerShell**
```powershell
# Run migration
Get-Content migrations-complete\002_auth_verification_system.sql | psql -h supabase.carubra.com -U postgres -d Soundpub

# Or save output
Get-Content migrations-complete\002_auth_verification_system.sql | psql -h supabase.carubra.com -U postgres -d Soundpub > migration_output.log
```

---

### Step 3: Check for Errors

**During Migration:**
- ✅ No ERROR messages
- ✅ Only NOTICE messages are OK
- ✅ Final message: "Migration 002_auth_verification_system.sql completed successfully!"

**Common Errors & Solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| `permission denied` | User lacks permissions | Use superuser or grant permissions |
| `relation already exists` | Migration already run | OK if idempotent (IF NOT EXISTS) |
| `column already exists` | Column added before | OK if idempotent |
| `syntax error` | SQL syntax issue | Review script, check PostgreSQL version |
| `connection refused` | Can't connect to DB | Check host, port, credentials |

---

## ✅ VERIFICATION SCRIPTS

### Verification 1: Check New Columns
```sql
-- Check new columns in profiles table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'Soundpub' 
  AND table_name = 'profiles'
  AND column_name IN (
    'email_verified',
    'verification_token',
    'verification_token_expires_at',
    'verification_sent_at',
    'password_reset_token',
    'password_reset_token_expires_at',
    'password_reset_sent_at'
  )
ORDER BY column_name;
```

**Expected Output:** 7 rows

---

### Verification 2: Check New Tables
```sql
-- Check new tables exist
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'Soundpub' AND table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'Soundpub' 
  AND table_name IN ('auth_events', 'rate_limits');
```

**Expected Output:** 2 rows (auth_events, rate_limits)

---

### Verification 3: Check Indexes
```sql
-- Check indexes created
SELECT 
    indexname,
    tablename
FROM pg_indexes 
WHERE schemaname = 'Soundpub' 
  AND (
    indexname LIKE 'idx_profiles_%token%' OR
    indexname LIKE 'idx_auth_events_%' OR
    indexname LIKE 'idx_rate_limits_%'
  )
ORDER BY tablename, indexname;
```

**Expected Output:** 12+ rows

---

### Verification 4: Check Functions
```sql
-- Check new functions
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'Soundpub' 
  AND routine_name IN (
    'cleanup_rate_limits',
    'cleanup_expired_tokens',
    'cleanup_old_auth_events',
    'check_rate_limit'
  )
ORDER BY routine_name;
```

**Expected Output:** 4 rows

---

### Verification 5: Check RLS Policies
```sql
-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'Soundpub' 
  AND tablename IN ('auth_events', 'rate_limits')
ORDER BY tablename, policyname;
```

**Expected Output:** 5+ rows

---

### Verification 6: Test Functions
```sql
-- Test cleanup functions (safe to run, they cleanup nothing if empty)
SELECT Soundpub.cleanup_rate_limits();
SELECT Soundpub.cleanup_expired_tokens();

-- Test rate limit function
SELECT Soundpub.check_rate_limit('test@example.com', 'password_reset', 3, 60);
```

**Expected Output:** Functions execute without errors

---

## 📊 COMPLETE VERIFICATION CHECKLIST

Run this comprehensive check:

```sql
-- Comprehensive verification query
WITH verification AS (
  SELECT 'New Columns in profiles' as check_item,
         (SELECT COUNT(*) FROM information_schema.columns 
          WHERE table_schema='Soundpub' AND table_name='profiles'
          AND column_name LIKE '%token%' OR column_name = 'email_verified') as actual,
         7 as expected
  
  UNION ALL
  
  SELECT 'New Tables',
         (SELECT COUNT(*) FROM information_schema.tables 
          WHERE table_schema='Soundpub' 
          AND table_name IN ('auth_events', 'rate_limits')),
         2
  
  UNION ALL
  
  SELECT 'New Indexes',
         (SELECT COUNT(*) FROM pg_indexes 
          WHERE schemaname='Soundpub' 
          AND (indexname LIKE 'idx_profiles_%token%' 
               OR indexname LIKE 'idx_auth_events_%' 
               OR indexname LIKE 'idx_rate_limits_%')),
         12
  
  UNION ALL
  
  SELECT 'New Functions',
         (SELECT COUNT(*) FROM information_schema.routines 
          WHERE routine_schema='Soundpub' 
          AND routine_name IN ('cleanup_rate_limits', 'cleanup_expired_tokens', 
                               'cleanup_old_auth_events', 'check_rate_limit')),
         4
  
  UNION ALL
  
  SELECT 'RLS Policies',
         (SELECT COUNT(*) FROM pg_policies 
          WHERE schemaname='Soundpub' 
          AND tablename IN ('auth_events', 'rate_limits')),
         5
)
SELECT 
  check_item,
  actual,
  expected,
  CASE 
    WHEN actual >= expected THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status
FROM verification;
```

**All items should show ✅ PASS**

---

## 🔄 ROLLBACK PROCEDURE

If something goes wrong and you need to rollback:

### Option 1: Restore from Backup (Nuclear Option)
```bash
# Drop current database (CAREFUL!)
dropdb Soundpub

# Recreate
createdb Soundpub

# Restore from backup
psql Soundpub < backups/backup_Soundpub_YYYYMMDD_HHMMSS.sql
```

### Option 2: Manual Rollback (Surgical)
```sql
-- Remove new columns
ALTER TABLE Soundpub.profiles 
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS verification_token,
  DROP COLUMN IF EXISTS verification_token_expires_at,
  DROP COLUMN IF EXISTS verification_sent_at,
  DROP COLUMN IF EXISTS password_reset_token,
  DROP COLUMN IF EXISTS password_reset_token_expires_at,
  DROP COLUMN IF EXISTS password_reset_sent_at;

-- Drop new tables
DROP TABLE IF EXISTS Soundpub.auth_events CASCADE;
DROP TABLE IF EXISTS Soundpub.rate_limits CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS Soundpub.cleanup_rate_limits();
DROP FUNCTION IF EXISTS Soundpub.cleanup_expired_tokens();
DROP FUNCTION IF EXISTS Soundpub.cleanup_old_auth_events();
DROP FUNCTION IF EXISTS Soundpub.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER);
```

---

## 📈 POST-MIGRATION TASKS

### 1. Update Existing Users (Optional)
```sql
-- Set existing users as verified if they have confirmed_at
UPDATE Soundpub.profiles p
SET email_verified = true
FROM auth.users u
WHERE p.id = u.id
  AND u.confirmed_at IS NOT NULL
  AND p.email_verified = false;

-- Check result
SELECT COUNT(*) as verified_users 
FROM Soundpub.profiles 
WHERE email_verified = true;
```

### 2. Monitor Initial State
```sql
-- Check current state
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
  COUNT(*) FILTER (WHERE email_verified = false) as unverified_users
FROM Soundpub.profiles;
```

### 3. Test Edge Functions Ready
```bash
# Check edge functions directory ready for next phase
ls -la supabase/functions/

# Should show: send-app-email/ (existing)
# Ready to add: send-password-reset/, verify-email/, etc.
```

---

## ✅ SUCCESS CRITERIA

Migration is successful when:

- [ ] Migration script runs without errors
- [ ] All verification checks pass
- [ ] 7 new columns exist in profiles
- [ ] 2 new tables created (auth_events, rate_limits)
- [ ] 12+ indexes created
- [ ] 4 functions created
- [ ] 5+ RLS policies active
- [ ] Test functions execute correctly
- [ ] No data loss (row counts match)
- [ ] Backup is safe and verified

---

## 📞 TROUBLESHOOTING

### Issue: Permission Denied
```sql
-- Grant necessary permissions
GRANT ALL ON SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres;
```

### Issue: Connection Timeout
```bash
# Increase timeout
psql -h supabase.carubra.com -U postgres -d Soundpub --set=statement_timeout=300000
```

### Issue: Transaction Block
```sql
-- Check for locks
SELECT * FROM pg_locks WHERE NOT granted;

-- Check active connections
SELECT * FROM pg_stat_activity WHERE datname = 'Soundpub';
```

---

## 🎯 NEXT STEPS AFTER MIGRATION

1. ✅ Mark Step 1.2 as complete
2. ✅ Move to Step 1.3: Verify & Test
3. ✅ Then proceed to Phase 2: Backend Functions

---

## 📝 NOTES

- Migration is idempotent (can run multiple times safely)
- Uses transactions (all-or-nothing)
- Preserves existing data
- No downtime required (adds new features only)
- RLS policies protect new tables
- Functions are SECURITY DEFINER (safe)

---

**Created:** 2026-08-14  
**Version:** 1.0  
**Status:** Ready to Execute

🎵 **Soundpub - Empowering Musicians, Securing Accounts** 🎵
