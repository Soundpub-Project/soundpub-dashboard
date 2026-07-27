# 🚀 QUICK FIX - Google OAuth Error

## Problem
Error: Unable to exchange external code
URL: https://web.maskhar.com/?error=server_error

## Root Cause
Google OAuth credentials tidak ter-set di Supabase server .env

## Quick Fix (Copy-Paste ke Server)

### Step 1: Check Current Config
```bash
cd ~/docker/supabase/supabase/docker
grep "GOTRUE_EXTERNAL_GOOGLE" .env
```

### Step 2: Add/Update Google OAuth Config
```bash
# Edit .env
nano .env

# Tambahkan atau update baris ini:
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=YOUR_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback

# Save: Ctrl+O, Enter, Ctrl+X
```

### Step 3: Get Your Google OAuth Credentials

**Buka:** https://console.cloud.google.com/apis/credentials

1. Pilih OAuth 2.0 Client ID Anda
2. Copy **Client ID** (format: xxxxx.apps.googleusercontent.com)
3. Copy **Client Secret** (format: GOCSPX-xxxxxxxxxxxx)

### Step 4: Update .env dengan Credentials Asli
```bash
nano .env

# Ganti YOUR_CLIENT_ID dan YOUR_CLIENT_SECRET dengan nilai asli
# PASTIKAN TIDAK ADA SPASI!

# Save: Ctrl+O, Enter, Ctrl+X
```

### Step 5: Verify Google Cloud Console Redirect URI

**Di Google Cloud Console, pastikan Authorized redirect URIs:**
```
https://supabase.carubra.com/auth/v1/callback
```

**Jika belum ada, TAMBAHKAN dan SAVE!**

### Step 6: Restart Supabase Auth
```bash
# Restart auth service
docker compose restart auth

# Wait 10 seconds
sleep 10

# Check status
docker compose ps auth

# Should show: Up (healthy)
```

### Step 7: Test Login
1. Clear browser cache
2. Buka: https://web.maskhar.com
3. Klik: Login with Google
4. Should work! ✅

---

## ONE-LINER DIAGNOSTIC

```bash
cd ~/docker/supabase/supabase/docker && grep "GOTRUE_EXTERNAL_GOOGLE" .env && docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE && docker compose logs auth --tail=20
```

---

## If Still Error

**Full restart:**
```bash
cd ~/docker/supabase/supabase/docker
docker compose down
docker compose up -d
sleep 30
docker compose ps
```

**Check logs:**
```bash
docker compose logs auth --tail=50 | grep -i error
```

---

## Common Issues

**Issue 1: Env vars empty**
→ Check .env file exists in same directory as docker-compose.yml

**Issue 2: "redirect_uri_mismatch"**
→ URL in Google Console must be: https://supabase.carubra.com/auth/v1/callback

**Issue 3: "invalid_client"**
→ Double-check Client ID and Secret (no spaces!)

---

## Success Criteria

✅ `grep "GOTRUE_EXTERNAL_GOOGLE" .env` shows all 4 variables
✅ `docker compose ps auth` shows "Up (healthy)"
✅ `docker compose logs auth` no errors
✅ Login Google works at https://web.maskhar.com

---

Read full guide: GOOGLE-OAUTH-ERROR-FIX.md

