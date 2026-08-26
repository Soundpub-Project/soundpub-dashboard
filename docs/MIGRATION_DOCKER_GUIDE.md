# 🐳 MIGRATION GUIDE - Self-Hosted Supabase Docker

**Target:** Self-hosted Supabase running in Docker
**Server:** maskhar@supabase-server
**Container:** supabase-db
**Migration:** 002_auth_verification_system_v2.sql

---

## 📋 Prerequisites

Before running the migration, ensure you have:

1. ✅ SSH access to supabase-server
2. ✅ Docker containers running (supabase-db must be healthy)
3. ✅ Database credentials (postgres user)
4. ✅ Migration file: `migrations-complete/002_auth_verification_system_v2.sql`

---

## 🚀 Option 1: Using PowerShell Script (Recommended)

### Step 1: Run the migration script

```powershell
.\run_migration_docker_ssh.ps1
```

The script will:
- Upload migration file to remote server
- Execute migration in Docker container
- Verify the results
- Cleanup temporary files

### Step 2: Follow the prompts

- Confirm the server hostname/IP
- Type "yes" to proceed
- Wait for completion

---

## 🔧 Option 2: Manual Migration (SSH)

If the script doesn't work, run these commands manually:

### Step 1: SSH to your Supabase server

```bash
ssh maskhar@supabase-server
```

### Step 2: Navigate to docker directory

```bash
cd ~/docker/supabase/supabase-1.26.05/docker
```

### Step 3: Copy migration file to server

From your Windows machine:
```powershell
scp migrations-complete/002_auth_verification_system_v2.sql maskhar@supabase-server:/tmp/migration_002.sql
```

### Step 4: Execute migration in Docker

On the server:
```bash
docker exec -i supabase-db psql -U postgres -d postgres < /tmp/migration_002.sql
```

### Step 5: Verify migration

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema='Soundpub' 
  AND table_name='profiles' 
  AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');
"
```

Expected output: 3 rows (email_verified, verification_token, password_reset_token)

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='Soundpub' 
  AND table_name IN ('auth_events', 'rate_limits');
"
```

Expected output: 2 rows (auth_events, rate_limits)

### Step 6: Cleanup

```bash
rm /tmp/migration_002.sql
```

---

## 🔧 Option 3: Using Docker Compose Exec

From the docker compose directory on the server:

```bash
cd ~/docker/supabase/supabase-1.26.05/docker

# Copy migration file
docker compose cp /tmp/migration_002.sql db:/tmp/

# Execute migration
docker compose exec -T db psql -U postgres -d postgres < /tmp/migration_002.sql

# Verify
docker compose exec db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM Soundpub.auth_events;"
```

---

## ✅ Verification Checklist

After migration completes, verify:

### 1. Check new columns in profiles table

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema='Soundpub' 
  AND table_name='profiles'
  AND column_name IN (
    'email_verified', 
    'verification_token', 
    'verification_token_expires_at',
    'password_reset_token', 
    'password_reset_token_expires_at'
  );
```

**Expected:** 5 rows

### 2. Check new tables

```sql
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_schema='Soundpub' AND table_name=t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema='Soundpub' 
  AND table_name IN ('auth_events', 'rate_limits');
```

**Expected:** 
- auth_events (8 columns)
- rate_limits (7 columns)

### 3. Check utility functions

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema='Soundpub'
  AND routine_name IN (
    'check_rate_limit',
    'cleanup_rate_limits',
    'cleanup_expired_tokens',
    'cleanup_old_auth_events'
  );
```

**Expected:** 4 functions

### 4. Test a simple query

```sql
SELECT 
  id, 
  email, 
  email_verified, 
  verification_token IS NOT NULL as has_token
FROM Soundpub.profiles 
LIMIT 5;
```

Should return without errors.

---

## 🐛 Troubleshooting

### Error: "permission denied"

**Solution:** Run with postgres superuser or grant permissions first:

```sql
GRANT ALTER ON Soundpub.profiles TO authenticated;
```

### Error: "schema Soundpub does not exist"

**Solution:** Create schema first:

```sql
CREATE SCHEMA IF NOT EXISTS Soundpub;
```

### Error: "relation profiles does not exist"

**Solution:** Ensure you're running migrations in correct order. Run base migrations first.

### Error: "column already exists"

**Solution:** The migration has idempotent checks, so this should not happen. If it does, the migration will skip existing columns.

---

## 🔐 Next Steps: Configure Edge Functions

After successful migration, you need to:

### 1. Set Environment Variables in Docker

Edit your Supabase docker configuration to add these environment variables for Edge Functions:

On the server, edit: `~/docker/supabase/supabase-1.26.05/docker/.env` or docker-compose.yml

Add/update:
```bash
# Database Schema
DATABASE_SCHEMA=Soundpub

# Supabase Config
SUPABASE_URL=https://supabase.carubra.com
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Config
APP_URL=https://your-dashboard-url.com

# Email Config (if using email features)
RESEND_API_KEY=your-resend-api-key
NOTIFICATION_EMAIL=no-reply@yourdomain.com
```

### 2. Restart Edge Functions Container

```bash
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose restart functions
```

### 3. Deploy Edge Functions

From your development machine, deploy the auth-related functions:

```powershell
# Update these functions
supabase functions deploy send-verification-email --project-ref default
supabase functions deploy verify-email --project-ref default
supabase functions deploy send-password-reset --project-ref default
supabase functions deploy verify-password-reset-token --project-ref default
supabase functions deploy reset-password --project-ref default
```

Or use the deploy script:
```powershell
.\deploy_functions.ps1
```

---

## 🧪 Testing the Migration

### Test 1: Signup Flow

1. Open dashboard: http://localhost:5173
2. Navigate to signup page
3. Register with new email
4. Check database:

```sql
SELECT email, email_verified, verification_token IS NOT NULL as has_token
FROM Soundpub.profiles 
WHERE email = 'test@example.com';
```

**Expected:** email_verified = false, has_token = true

### Test 2: Password Reset Flow

1. Go to forgot password page
2. Enter registered email
3. Check database:

```sql
SELECT email, password_reset_token IS NOT NULL as has_reset_token
FROM Soundpub.profiles 
WHERE email = 'test@example.com';
```

**Expected:** has_reset_token = true

### Test 3: Auth Events Logging

```sql
SELECT event_type, COUNT(*) as count
FROM Soundpub.auth_events
GROUP BY event_type
ORDER BY count DESC;
```

Should show events like: signup_attempted, password_reset_requested, etc.

---

## 📊 Monitoring Queries

### Recent Auth Events

```sql
SELECT 
  event_type,
  user_id,
  metadata,
  created_at
FROM Soundpub.auth_events
ORDER BY created_at DESC
LIMIT 20;
```

### Active Rate Limits

```sql
SELECT 
  identifier,
  action_type,
  attempt_count,
  blocked_until
FROM Soundpub.rate_limits
WHERE blocked_until > NOW()
ORDER BY blocked_until DESC;
```

### Pending Verifications

```sql
SELECT 
  email,
  email_verified,
  verification_sent_at,
  verification_token_expires_at
FROM Soundpub.profiles
WHERE email_verified = false
  AND verification_token IS NOT NULL
ORDER BY verification_sent_at DESC;
```

---

## 📝 Summary

**What This Migration Does:**

✅ Adds email verification system
✅ Adds password reset functionality
✅ Creates auth event logging
✅ Implements rate limiting
✅ Adds utility functions for cleanup

**Database Changes:**

- 7 new columns in `profiles` table
- 2 new tables (`auth_events`, `rate_limits`)
- 4 new utility functions
- Multiple indexes for performance
- RLS policies for security

**Status:** Ready to deploy! 🚀

---

## 🆘 Need Help?

Check these resources:

- Full bug fix documentation: `docs/BUG_FIXES_AND_SOLUTIONS.md`
- Edge Functions guide: `docs/README.md`
- API documentation: `docs/API_DOCUMENTATION.md`

**Good luck! 🎵**
