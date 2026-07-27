# 🧪 TESTING GUIDE - AUTH SYSTEM FIXES

**Purpose:** Verify that both fixes work correctly

---

## 🎯 TEST SCENARIOS

### TEST 1: Manual Signup (Email/Password)

**Objective:** Verify new users get `artist` role and assigned to Soundpub Music label

**Steps:**
1. Open https://web.maskhar.com
2. Click tab "Daftar"
3. Fill form:
   - Nama Lengkap: `Test Artist Manual`
   - Email: `test-artist-manual@example.com`
   - Password: `Test123456`
   - Konfirmasi Password: `Test123456`
4. Click "Daftar"
5. Check email for verification link (if enabled)
6. Login with the new account

**Verification (Database):**
```sql
-- Check user created
SELECT id, email, email_confirmed_at, raw_user_meta_data
FROM auth.users
WHERE email = 'test-artist-manual@example.com';

-- Check profile created with parent_label_id
SELECT id, email, full_name, parent_label_id, status, password_set, artist_profile_completed
FROM soundpub.profiles
WHERE email = 'test-artist-manual@example.com';

-- Check role is 'artist' (not 'user')
SELECT user_id, role
FROM soundpub.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'test-artist-manual@example.com');

-- Check artist entry created
SELECT id, user_id, label_id, artist_name, status
FROM soundpub.artists
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'test-artist-manual@example.com');

-- Check parent_label_id points to Soundpub Music
SELECT p.email, p.full_name, p.parent_label_id, parent.full_name as parent_label_name
FROM soundpub.profiles p
LEFT JOIN soundpub.profiles parent ON p.parent_label_id = parent.id
WHERE p.email = 'test-artist-manual@example.com';
```

**Expected Results:**
- ✅ User created in `auth.users`
- ✅ Profile created in `soundpub.profiles`
- ✅ Role = `artist` in `soundpub.user_roles`
- ✅ `parent_label_id` = Soundpub Music label ID
- ✅ Entry exists in `soundpub.artists`
- ✅ `artist_profile_completed` = false
- ✅ `password_set` = true

---

### TEST 2: Google OAuth Login

**Objective:** Verify Google login works without "Unable to exchange external code" error

**Steps:**
1. Open https://web.maskhar.com
2. Click "Masuk dengan Google"
3. Select Google account
4. Grant permissions
5. Wait for redirect back to dashboard

**Verification (Database):**
```sql
-- Check user created with Google provider
SELECT id, email, email_confirmed_at, 
       raw_user_meta_data->>'provider' as provider,
       raw_user_meta_data->>'full_name' as full_name
FROM auth.users
WHERE email = 'YOUR_GOOGLE_EMAIL@gmail.com';

-- Check profile created
SELECT id, email, full_name, parent_label_id, status
FROM soundpub.profiles
WHERE email = 'YOUR_GOOGLE_EMAIL@gmail.com';

-- Check role assigned
SELECT user_id, role
FROM soundpub.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_GOOGLE_EMAIL@gmail.com');

-- Check artist entry
SELECT id, user_id, label_id, artist_name
FROM soundpub.artists
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_GOOGLE_EMAIL@gmail.com');
```

**Expected Results:**
- ✅ No error "Unable to exchange external code"
- ✅ Successfully redirected to dashboard
- ✅ User created with provider = 'google'
- ✅ Profile created with correct name from Google
- ✅ Role = `artist`
- ✅ `parent_label_id` = Soundpub Music label ID
- ✅ Entry exists in `soundpub.artists`

---

### TEST 3: SSO (ICCN) Login

**Objective:** Verify SSO still works correctly (should not be affected by changes)

**Steps:**
1. Open https://web.maskhar.com
2. Click "Login via SSO"
3. Login at ICCN Keycloak
4. Wait for redirect back to dashboard

**Verification (Database):**
```sql
-- Check user with SSO provider
SELECT id, email, 
       raw_user_meta_data->>'provider' as provider,
       raw_user_meta_data->>'full_name' as full_name
FROM auth.users
WHERE email = 'YOUR_ICCN_EMAIL@example.com';

-- Check profile with ICCN label
SELECT p.id, p.email, p.full_name, p.sso_provider, 
       p.parent_label_id, parent.full_name as parent_label_name
FROM soundpub.profiles p
LEFT JOIN soundpub.profiles parent ON p.parent_label_id = parent.id
WHERE p.email = 'YOUR_ICCN_EMAIL@example.com';

-- Check role
SELECT user_id, role
FROM soundpub.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_ICCN_EMAIL@example.com');
```

**Expected Results:**
- ✅ SSO login works as before
- ✅ Role = `artist`
- ✅ `parent_label_id` = ICCN Media label ID (not Soundpub Music)
- ✅ `sso_provider` = 'iccn'

---

## 🔍 DETAILED VERIFICATION QUERIES

### Query 1: Check Soundpub Music Label Exists
```sql
SELECT id, email, full_name, status
FROM soundpub.profiles
WHERE email = 'label@soundpub.id' OR full_name = 'Soundpub Music';

SELECT user_id, role
FROM soundpub.user_roles
WHERE user_id = (SELECT id FROM soundpub.profiles WHERE email = 'label@soundpub.id');
```

**Expected:**
- ✅ 1 row returned
- ✅ email = `label@soundpub.id`
- ✅ full_name = `Soundpub Music`
- ✅ status = `active`
- ✅ role = `label`

---

### Query 2: Check All New Artists After Migration
```sql
SELECT 
  au.email,
  p.full_name,
  ur.role,
  parent.full_name as parent_label,
  a.artist_name,
  au.created_at
FROM auth.users au
JOIN soundpub.profiles p ON p.id = au.id
JOIN soundpub.user_roles ur ON ur.user_id = au.id
LEFT JOIN soundpub.profiles parent ON p.parent_label_id = parent.id
LEFT JOIN soundpub.artists a ON a.user_id = au.id
WHERE au.created_at > '2026-07-27 09:00:00'  -- After migration
ORDER BY au.created_at DESC;
```

**Expected for each new user:**
- ✅ role = `artist`
- ✅ parent_label = `Soundpub Music` (for manual/Google) or `ICCN Media` (for SSO)
- ✅ artist_name exists

---

### Query 3: Check Trigger Function
```sql
SELECT 
  proname as function_name,
  prosrc as function_code
FROM pg_proc
WHERE proname = 'handle_new_user';
```

**Expected:**
- Function code includes `'artist'::soundpub.app_role`
- Function code includes parent_label_id assignment
- Function code includes INSERT into soundpub.artists

---

### Query 4: Test Trigger Manually
```sql
-- Simulate a new user signup
DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_email TEXT := 'trigger-test-' || floor(random() * 1000)::text || '@test.com';
BEGIN
  -- Insert test user
  INSERT INTO auth.users (
    id, 
    email, 
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    test_user_id,
    test_email,
    crypt('test123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Test Trigger User"}',
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Test user created: %', test_email;
END $$;

-- Check results
SELECT au.email, p.full_name, ur.role, a.artist_name
FROM auth.users au
LEFT JOIN soundpub.profiles p ON p.id = au.id
LEFT JOIN soundpub.user_roles ur ON ur.user_id = au.id
LEFT JOIN soundpub.artists a ON a.user_id = au.id
WHERE au.email LIKE 'trigger-test-%@test.com'
ORDER BY au.created_at DESC
LIMIT 5;
```

---

## 🚨 ERROR SCENARIOS TO TEST

### Scenario 1: Google OAuth Misconfigured

**Simulate:**
- Remove `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` from `.env`
- Restart auth service
- Try Google login

**Expected:**
- ❌ Error message shown
- ❌ Login fails gracefully (no crash)

### Scenario 2: Label Not Found

**Simulate:**
```sql
-- Temporarily delete Soundpub Music label
DELETE FROM soundpub.profiles WHERE email = 'label@soundpub.id';

-- Try to create new user
-- Check logs
```

**Expected:**
- ⚠️ Warning in logs: "Soundpub Music label not found!"
- ✅ User still created
- ✅ parent_label_id = NULL

### Scenario 3: Duplicate Email

**Test:**
- Try to sign up with existing email

**Expected:**
- ❌ Error: "User already exists" or similar
- ✅ No duplicate profile created

---

## 📊 SUCCESS METRICS

All tests pass if:
- ✅ Manual signup: role = `artist`, parent_label = Soundpub Music
- ✅ Google OAuth: no "exchange code" error, user created correctly
- ✅ SSO: still works, parent_label = ICCN Media
- ✅ All new users have entry in `soundpub.artists`
- ✅ No errors in Docker logs
- ✅ Dashboard loads correctly after login

---

## 🛠️ TESTING TOOLS

### SSH Command to Check Logs
```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase/docker
docker compose logs -f auth | grep -i "error\|warning\|artist"
```

### Database Connection
```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase/docker
docker compose exec db psql -U postgres -d postgres
\c postgres
SET search_path TO soundpub, public;
```

---

**Last Updated:** 2026-07-27  
**Author:** Kiro AI
