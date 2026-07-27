# 🎯 QUICK START GUIDE

**For the impatient admin who wants to fix it NOW!** ⚡

---

## ⏱️ Time Required: 15 minutes

---

## 🚀 Option 1: Automated Deployment (Recommended)

```bash
# 1. SSH to server
ssh maskhar@supabase-server

# 2. Upload files
# - supabase/migrations/20260727094500_fix_auto_artist_role_assignment.sql
# - docs/auth-system-analysis/deploy.sh

# 3. Make script executable
chmod +x ~/deploy.sh

# 4. Run deployment script
./deploy.sh

# 5. Done! Test at https://web.maskhar.com
```

---

## 🛠️ Option 2: Manual Deployment (Step-by-step)

### Fix #1: Auto Artist Role (3 minutes)

```bash
ssh maskhar@supabase-server
cd ~/docker/supabase/supabase/docker

# Backup
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)

# Run migration
docker compose exec db psql -U postgres -d postgres < ~/20260727094500_fix_auto_artist_role_assignment.sql

# Verify
docker compose exec db psql -U postgres -d postgres -c "SELECT email, full_name FROM soundpub.profiles WHERE email = 'label@soundpub.id';"
```

**Expected:** Soundpub Music label should exist ✅

---

### Fix #2: Google OAuth (10 minutes)

```bash
# 1. Get Google OAuth credentials from:
# https://console.cloud.google.com/apis/credentials

# 2. Edit .env
nano .env

# 3. Add at the end:
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<your-id>.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-<your-secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback

# 4. Save (Ctrl+O, Enter, Ctrl+X)

# 5. Restart auth
docker compose restart auth

# 6. Wait 30 seconds
sleep 30

# 7. Check status
docker compose ps auth
```

**Expected:** Status = "Up (healthy)" ✅

---

## ✅ Quick Test

### Test 1: Manual Signup
1. Go to: https://web.maskhar.com
2. Click "Daftar"
3. Register with: `test-$(date +%s)@test.com`
4. Check database:
   ```bash
   docker compose exec db psql -U postgres -d postgres -c "SELECT au.email, ur.role FROM auth.users au JOIN soundpub.user_roles ur ON ur.user_id = au.id WHERE au.email LIKE 'test-%' ORDER BY au.created_at DESC LIMIT 1;"
   ```
5. **Expected:** role = `artist` ✅

### Test 2: Google Login
1. Go to: https://web.maskhar.com
2. Click "Masuk dengan Google"
3. Login with Google account
4. **Expected:** Successfully logged in to dashboard ✅

---

## 🚨 Troubleshooting One-Liners

**Problem:** Migration fails
```bash
# Check error
docker compose logs db | tail -20
```

**Problem:** Google OAuth not working
```bash
# Check if configured
docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE
```

**Problem:** Auth service unhealthy
```bash
# Check logs
docker compose logs auth | tail -50
```

**Problem:** User gets role 'user' instead of 'artist'
```bash
# Check trigger
docker compose exec db psql -U postgres -d postgres -c "SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';"
```

---

## 📞 Need Help?

Read detailed guides:
- **Diagnosis:** `docs/auth-system-analysis/01-DIAGNOSIS.md`
- **Google OAuth:** `docs/auth-system-analysis/02-GOOGLE-OAUTH-SETUP.md`
- **Testing:** `docs/auth-system-analysis/03-TESTING-GUIDE.md`
- **Deployment:** `docs/auth-system-analysis/04-DEPLOYMENT-GUIDE.md`
- **Summary:** `docs/auth-system-analysis/05-EXECUTIVE-SUMMARY.md`

---

## 🎉 Success Indicators

You're done when:
- ✅ New manual signups get role `artist`
- ✅ Google login works without errors
- ✅ Users are assigned to "Soundpub Music" label
- ✅ No errors in auth logs
- ✅ All services show "healthy"

---

**Last Updated:** 2026-07-27  
**Deployment Time:** ~15 minutes  
**Difficulty:** Easy 😊
