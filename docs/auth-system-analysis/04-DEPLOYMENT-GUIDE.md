# 📦 DEPLOYMENT GUIDE - AUTH SYSTEM FIXES

**Target:** Supabase Self-Hosted Server  
**Deployment Date:** 2026-07-27  
**Downtime:** ~2-5 minutes (auth service restart only)

---

## 🎯 DEPLOYMENT OVERVIEW

**What will be deployed:**
1. Migration file for auto artist role assignment
2. Google OAuth configuration in `.env`
3. Restart auth service

**Impact:**
- ✅ Existing users: NOT affected
- ✅ Active sessions: NOT affected (will remain logged in)
- ⚠️ New signups during restart: Will fail for ~30 seconds
- ⚠️ New logins during restart: Will fail for ~30 seconds

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Before starting, verify:
- [ ] You have SSH access to Supabase server
- [ ] You have sudo/root privileges
- [ ] Backup of current `.env` file exists
- [ ] Google OAuth credentials ready (Client ID + Secret)
- [ ] No critical operations running on the platform
- [ ] You informed team about brief auth downtime

---

## 🚀 DEPLOYMENT STEPS

### STEP 1: Backup Current State

**SSH to server:**
```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase/docker
```

**Backup .env:**
```bash
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
ls -lah .env*
```

**Backup database:**
```bash
docker compose exec db pg_dump -U postgres -d postgres -n soundpub > ~/backup-soundpub-$(date +%Y%m%d-%H%M%S).sql
```

---

### STEP 2: Upload Migration File

**Option A - Via SCP (from local machine):**
```bash
scp supabase/migrations/20260727094500_fix_auto_artist_role_assignment.sql maskhar@supabase-server:~/
```

**Option B - Via nano (directly on server):**
```bash
nano ~/20260727094500_fix_auto_artist_role_assignment.sql
# Paste migration content
# Save: Ctrl+O, Enter, Ctrl+X
```

---

### STEP 3: Run Migration

**Connect to database:**
```bash
cd ~/docker/supabase/supabase/docker
docker compose exec db psql -U postgres -d postgres
```

**Inside psql:**
```sql
-- Check current trigger function
SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';

-- Run migration
\i /home/maskhar/20260727094500_fix_auto_artist_role_assignment.sql

-- Verify Soundpub Music label created
SELECT id, email, full_name FROM soundpub.profiles WHERE email = 'label@soundpub.id';

-- Verify trigger updated
SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';

-- Exit
\q
```

**Expected output:**
```
NOTICE:  Created Soundpub Music label with ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CREATE FUNCTION
DROP TRIGGER
CREATE TRIGGER
COMMENT
```

---

### STEP 4: Configure Google OAuth

**Edit .env file:**
```bash
cd ~/docker/supabase/supabase/docker
nano .env
```

**Add these lines at the end:**
```bash
# -------- GOOGLE OAUTH CONFIGURATION --------
# Added: 2026-07-27 - Fix "Unable to exchange external code" error
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-YOUR_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

**IMPORTANT:** Replace `YOUR_CLIENT_ID` and `YOUR_CLIENT_SECRET` with actual values!

**Save:**
- Press `Ctrl + O` (save)
- Press `Enter`
- Press `Ctrl + X` (exit)

**Verify changes:**
```bash
grep GOTRUE_EXTERNAL_GOOGLE .env
```

---

### STEP 5: Restart Auth Service

**Restart only auth service:**
```bash
cd ~/docker/supabase/supabase/docker
docker compose restart auth
```

**Wait for healthy status:**
```bash
docker compose ps auth
```

Expected: `Up (healthy)` after ~10-30 seconds

**Check logs for errors:**
```bash
docker compose logs auth | tail -50
```

Expected: No errors, should see "External provider 'google' enabled"

---

### STEP 6: Verify Deployment

**Check auth service environment:**
```bash
docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE
```

Expected output:
```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-xxxxx
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

**Test database trigger:**
```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT 
  t.tgname as trigger_name,
  p.proname as function_name,
  c.relname as table_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname = 'on_auth_user_created';
"
```

Expected: Trigger exists and points to `handle_new_user` function

---

### STEP 7: End-to-End Testing

**Test 1: Manual Signup**
1. Open https://web.maskhar.com
2. Register new account: `test-deploy-manual-$(date +%s)@test.com`
3. Verify in database:
   ```bash
   docker compose exec db psql -U postgres -d postgres -c "
   SELECT au.email, ur.role, p.parent_label_id, a.artist_name
   FROM auth.users au
   JOIN soundpub.user_roles ur ON ur.user_id = au.id
   JOIN soundpub.profiles p ON p.id = au.id
   LEFT JOIN soundpub.artists a ON a.user_id = au.id
   WHERE au.email LIKE 'test-deploy%'
   ORDER BY au.created_at DESC LIMIT 1;
   "
   ```
   Expected: role = `artist`, parent_label_id exists, artist_name exists

**Test 2: Google OAuth**
1. Open https://web.maskhar.com
2. Click "Masuk dengan Google"
3. Login with Google account
4. Expected: No error, successfully logged in to dashboard

**Test 3: Check Logs**
```bash
docker compose logs auth | grep -i "error\|warning" | tail -20
```
Expected: No critical errors

---

## ✅ POST-DEPLOYMENT VERIFICATION

Run this verification script:
```bash
cd ~/docker/supabase/supabase/docker

# Check all services healthy
docker compose ps

# Check Soundpub Music label
docker compose exec db psql -U postgres -d postgres -c "
SELECT id, email, full_name, status 
FROM soundpub.profiles 
WHERE email = 'label@soundpub.id';
"

# Check trigger function updated
docker compose exec db psql -U postgres -d postgres -c "
SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%artist%' THEN 'Contains artist logic ✓'
    ELSE 'Missing artist logic ✗'
  END as validation
FROM pg_proc 
WHERE proname = 'handle_new_user';
"

# Check Google OAuth enabled
docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE_ENABLED

# Check recent signups (if any)
docker compose exec db psql -U postgres -d postgres -c "
SELECT 
  au.email,
  ur.role,
  CASE WHEN p.parent_label_id IS NOT NULL THEN 'Has label ✓' ELSE 'No label ✗' END as label_check,
  CASE WHEN a.id IS NOT NULL THEN 'Has artist entry ✓' ELSE 'No artist entry ✗' END as artist_check
FROM auth.users au
LEFT JOIN soundpub.user_roles ur ON ur.user_id = au.id
LEFT JOIN soundpub.profiles p ON p.id = au.id
LEFT JOIN soundpub.artists a ON a.user_id = au.id
WHERE au.created_at > NOW() - INTERVAL '1 hour'
ORDER BY au.created_at DESC
LIMIT 5;
"
```

**All checks should pass!**

---

## 🔄 ROLLBACK PLAN

If deployment fails, rollback:

### Rollback Step 1: Restore .env
```bash
cd ~/docker/supabase/supabase/docker
cp .env.backup-YYYYMMDD-HHMMSS .env
docker compose restart auth
```

### Rollback Step 2: Restore Database (if needed)
```bash
# Only if migration caused issues
docker compose exec db psql -U postgres -d postgres < ~/backup-soundpub-YYYYMMDD-HHMMSS.sql
```

### Rollback Step 3: Revert Trigger
```bash
docker compose exec db psql -U postgres -d postgres <<EOF
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS \$\$
BEGIN
  INSERT INTO soundpub.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)));
  
  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::soundpub.app_role);
  
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;
EOF
```

---

## 📊 SUCCESS CRITERIA

Deployment successful if:
- ✅ All Docker services show "Up (healthy)"
- ✅ No errors in auth logs
- ✅ Soundpub Music label exists in database
- ✅ Trigger function contains artist logic
- ✅ Google OAuth env vars present
- ✅ Manual signup creates artist role
- ✅ Google login works without errors
- ✅ Existing users can still login

---

## 🚨 EMERGENCY CONTACTS

If issues occur:
- Check logs: `docker compose logs auth`
- Check database: `docker compose exec db psql -U postgres -d postgres`
- Rollback if critical
- Contact: Team lead / DevOps

---

## 📝 DEPLOYMENT LOG TEMPLATE

```
=== DEPLOYMENT LOG ===
Date: 2026-07-27
Time: [START_TIME]
Deployed by: [YOUR_NAME]
Server: supabase-server

Pre-deployment:
[ ] Backup created: .env.backup-YYYYMMDD-HHMMSS
[ ] Database backup: backup-soundpub-YYYYMMDD-HHMMSS.sql
[ ] Services healthy before deployment

Deployment:
[ ] Migration uploaded
[ ] Migration executed successfully
[ ] Soundpub Music label created
[ ] .env updated with Google OAuth
[ ] Auth service restarted
[ ] Services healthy after restart

Verification:
[ ] Trigger function updated
[ ] Google OAuth env vars present
[ ] Manual signup test passed
[ ] Google OAuth test passed
[ ] No errors in logs

Completion time: [END_TIME]
Status: [SUCCESS / FAILED / ROLLED BACK]
Notes: [ANY NOTES]
```

---

**Last Updated:** 2026-07-27  
**Author:** Kiro AI
