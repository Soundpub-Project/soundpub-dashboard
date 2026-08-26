# 📦 Fix 002 - Auth Verification System Migration

**Status:** ✅ Ready to Deploy  
**Target:** Self-hosted Supabase Docker  
**Date:** 2026-08-14

---

## 📁 Files Included

### 🚀 Scripts

| File | Purpose | Platform |
|------|---------|----------|
| `run_migration_docker_ssh.ps1` | PowerShell script untuk run migration via SSH | Windows |
| `run_migration_docker.sh` | Bash script untuk run migration langsung di server | Linux |
| `run_migration_docker.ps1` | PowerShell script alternatif | Windows |

### 📖 Documentation

| File | Description |
|------|-------------|
| `MIGRATION_DOCKER_GUIDE.md` | Panduan lengkap dengan 3 opsi deployment |
| `QUICK_START_DOCKER_MIGRATION.md` | Quick start guide (cara tercepat) |
| `COMMANDS_CHEATSHEET.md` | Copy-paste commands untuk semua tahapan |
| `README_FIX_002.md` | File ini |

### 💾 Migration File

| File | Description |
|------|-------------|
| `migrations-complete/002_auth_verification_system_v2.sql` | Migration SQL (sudah ada) |

---

## 🎯 Apa yang Akan Dilakukan Migration Ini?

Migration ini akan menambahkan Auth Verification System ke database Anda:

### ✅ Database Changes

**Kolom baru di `Soundpub.profiles`:**
- `email_verified` (BOOLEAN) - Status verifikasi email
- `verification_token` (TEXT) - Token untuk verifikasi email
- `verification_token_expires_at` (TIMESTAMPTZ) - Expiry token verifikasi
- `verification_sent_at` (TIMESTAMPTZ) - Kapan email verifikasi dikirim
- `password_reset_token` (TEXT) - Token untuk reset password
- `password_reset_token_expires_at` (TIMESTAMPTZ) - Expiry token reset password
- `password_reset_sent_at` (TIMESTAMPTZ) - Kapan email reset dikirim

**Table baru:**
- `Soundpub.auth_events` - Log semua auth events (signup, login, reset, dll)
- `Soundpub.rate_limits` - Rate limiting untuk mencegah abuse

**Functions baru:**
- `check_rate_limit()` - Check apakah user kena rate limit
- `cleanup_rate_limits()` - Cleanup rate limit records lama
- `cleanup_expired_tokens()` - Cleanup token yang expired
- `cleanup_old_auth_events()` - Cleanup auth events lama (90 hari)

**Indexes:**
- Index untuk token lookups (performance)
- Index untuk email_verified filtering
- Index untuk token expiry queries

**RLS Policies:**
- Policies untuk auth_events table
- Policies untuk rate_limits table

---

## 🚀 Quick Start (Recommended)

### Cara Tercepat: 3 Langkah

#### 1️⃣ Upload file ke server (dari Windows)
```powershell
scp migrations-complete\002_auth_verification_system_v2.sql maskhar@supabase-server:~/migration_002.sql
```

#### 2️⃣ SSH ke server
```powershell
ssh maskhar@supabase-server
```

#### 3️⃣ Jalankan migration
```bash
docker exec -i supabase-db psql -U postgres -d postgres < ~/migration_002.sql
```

**Done!** ✅

---

## 📋 Detailed Instructions

Pilih salah satu metode:

### Option A: PowerShell Script via SSH (Automated)
```powershell
.\run_migration_docker_ssh.ps1
```
Script akan otomatis upload, execute, verify, dan cleanup.

### Option B: Bash Script di Server (Semi-Automated)
```powershell
# 1. Upload script
scp run_migration_docker.sh maskhar@supabase-server:~/

# 2. SSH
ssh maskhar@supabase-server

# 3. Execute
chmod +x run_migration_docker.sh
./run_migration_docker.sh
```

### Option C: Manual Commands (Full Control)
Ikuti panduan di `COMMANDS_CHEATSHEET.md`

---

## ✅ Verification

Setelah migration selesai, verify dengan:

```bash
# Check kolom baru (harus 3 rows)
docker exec -i supabase-db psql -U postgres -d postgres -c "
SELECT column_name FROM information_schema.columns 
WHERE table_schema='Soundpub' AND table_name='profiles' 
AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');
"

# Check table baru (harus 2 rows)
docker exec -i supabase-db psql -U postgres -d postgres -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema='Soundpub' AND table_name IN ('auth_events', 'rate_limits');
"
```

**Expected Results:**
- ✅ 3 kolom baru di profiles
- ✅ 2 table baru (auth_events, rate_limits)
- ✅ 4 utility functions
- ✅ Indexes dan RLS policies terbuat

---

## 🔧 Post-Migration Steps

### 1. Set Environment Variables

Edit docker-compose.yml atau .env di server:

```yaml
functions:
  environment:
    DATABASE_SCHEMA: "Soundpub"
    SUPABASE_URL: "https://supabase.carubra.com"
    APP_URL: "https://dashboard.Soundpub.com"
    # Optional untuk email
    RESEND_API_KEY: "your-key"
    NOTIFICATION_EMAIL: "no-reply@Soundpub.com"
```

### 2. Restart Functions Container

```bash
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose restart functions
```

### 3. Deploy Edge Functions (dari Windows)

```powershell
# Deploy auth-related functions
supabase functions deploy send-verification-email
supabase functions deploy verify-email
supabase functions deploy send-password-reset
supabase functions deploy verify-password-reset-token
supabase functions deploy reset-password
```

Atau gunakan script:
```powershell
.\deploy_functions.ps1
```

---

## 🧪 Testing

### Test 1: Signup Flow
1. Buka dashboard
2. Register dengan email baru
3. Check database:
```sql
SELECT email, email_verified, verification_token IS NOT NULL 
FROM Soundpub.profiles 
WHERE email = 'test@example.com';
```
**Expected:** `email_verified = false`, token exists

### Test 2: Password Reset Flow
1. Go to forgot password
2. Submit email
3. Check database:
```sql
SELECT email, password_reset_token IS NOT NULL 
FROM Soundpub.profiles 
WHERE email = 'test@example.com';
```
**Expected:** token exists

### Test 3: Auth Events
```sql
SELECT event_type, COUNT(*) 
FROM Soundpub.auth_events 
GROUP BY event_type;
```
**Expected:** Events logged (signup_attempted, etc.)

---

## 🐛 Troubleshooting

### ❌ "permission denied"
**Solution:**
```sql
GRANT ALTER ON Soundpub.profiles TO authenticated;
```

### ❌ "container not found"
**Solution:**
```bash
# Check container name
docker ps | grep supabase

# Update DOCKER_CONTAINER variable in script
```

### ❌ "schema Soundpub does not exist"
**Solution:**
```sql
CREATE SCHEMA IF NOT EXISTS Soundpub;
```

### ❌ "column already exists"
**Don't worry!** Migration script is idempotent. It will skip existing columns.

---

## 📊 Monitoring

### Auth Events Dashboard
```sql
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM Soundpub.auth_events
WHERE created_at >= CURRENT_DATE
GROUP BY event_type
ORDER BY count DESC;
```

### Rate Limit Status
```sql
SELECT * FROM Soundpub.rate_limits 
WHERE blocked_until > NOW()
ORDER BY last_attempt_at DESC;
```

### Pending Verifications
```sql
SELECT 
  email,
  verification_sent_at,
  verification_token_expires_at
FROM Soundpub.profiles
WHERE email_verified = false
  AND verification_token IS NOT NULL;
```

---

## 📚 Documentation Links

- **Full Migration Guide:** `MIGRATION_DOCKER_GUIDE.md`
- **Quick Start:** `QUICK_START_DOCKER_MIGRATION.md`
- **Commands Cheatsheet:** `COMMANDS_CHEATSHEET.md`
- **Bug Fixes:** `docs/BUG_FIXES_AND_SOLUTIONS.md`
- **API Docs:** `docs/API_DOCUMENTATION.md`

---

## 🎯 Summary

### What to Do:
1. ✅ Run migration (3 langkah di Quick Start)
2. ✅ Verify results (check kolom & table baru)
3. ✅ Set environment variables (optional tapi recommended)
4. ✅ Restart functions container
5. ✅ Test signup & reset password flows

### What You Get:
- ✅ Email verification system
- ✅ Password reset functionality
- ✅ Auth event logging
- ✅ Rate limiting protection
- ✅ Utility functions for maintenance

---

## 🆘 Need Help?

1. **Check logs:**
   ```bash
   docker logs supabase-db --tail=50
   ```

2. **Enter PostgreSQL shell:**
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres
   ```

3. **Check COMMANDS_CHEATSHEET.md** untuk semua commands

4. **Baca MIGRATION_DOCKER_GUIDE.md** untuk troubleshooting lengkap

---

## ✨ Status

- ✅ Migration SQL ready
- ✅ PowerShell scripts ready
- ✅ Bash scripts ready
- ✅ Documentation complete
- ✅ Verification queries ready
- ✅ Troubleshooting guide ready

**Everything is ready to deploy!** 🚀

---

**Good luck with your migration! 🎵**

*Last updated: 2026-08-14*
