# 🎯 LANGKAH DEMI LANGKAH - AUTH VERIFICATION DEPLOYMENT
# Panduan Lengkap untuk Admin/Developer

**Tanggal:** 2026-08-14
**Estimasi Waktu Total:** 2-3 jam
**Tingkat Kesulitan:** Medium

---

## 📋 PERSIAPAN AWAL (15 menit)

### ✅ Checklist Persiapan
- [ ] Akses ke server database (PostgreSQL)
- [ ] Akses ke Supabase dashboard
- [ ] Akses ke server aplikasi (untuk deploy)
- [ ] Backup tools ready (pg_dump)
- [ ] Text editor untuk verify hasil

### 🔧 Tools yang Dibutuhkan
- PostgreSQL client (`psql`)
- Supabase CLI (`supabase`)
- Docker (untuk deployment)
- Git (untuk commit changes)

---

## 📍 LANGKAH 1: BACKUP DATABASE (10 menit)

### 1.1 Buat Backup Database
```bash
# Masuk ke folder backups (atau buat jika belum ada)
cd I:\website-devops\Soundpub-project\Soundpub-dashboard
mkdir -p backups

# Buat backup dengan timestamp
pg_dump -h localhost -U postgres Soundpub > backups/backup_before_auth_migration_20260814.sql
```

**Hasil yang Diharapkan:**
- File backup muncul di folder `backups/`
- Ukuran file > 0 bytes

### 1.2 Verifikasi Backup
```bash
# Check ukuran file
ls -lh backups/backup_before_auth_migration_20260814.sql

# Atau di Windows PowerShell:
Get-Item backups\backup_before_auth_migration_20260814.sql | Select-Object Name, Length
```

**Kriteria Sukses:**
✅ File backup berhasil dibuat
✅ Ukuran file masuk akal (seharusnya beberapa MB)

---

## 📍 LANGKAH 2: JALANKAN MIGRASI DATABASE (20 menit)

### 2.1 Cek File Migrasi Tersedia
```powershell
# Pastikan file migration ada
Test-Path migrations-complete\002_auth_verification_system.sql
```

**Hasil:** Harus `True`

### 2.2 Review Migration Script (PENTING!)
```powershell
# Buka dan review script
notepad migrations-complete\002_auth_verification_system.sql
```

**Yang Harus Dicek:**
- [ ] Semua query menggunakan schema `Soundpub.` (bukan `public.`)
- [ ] Ada BEGIN dan COMMIT transaction
- [ ] Tidak ada DROP TABLE yang berbahaya
- [ ] Ada success message di akhir

### 2.3 Jalankan Migration
```bash
# Connect ke database dan jalankan script
psql -h localhost -U postgres -d Soundpub -f migrations-complete/002_auth_verification_system.sql
```

**Di PowerShell:**
```powershell
psql -h localhost -U postgres -d Soundpub -f migrations-complete\002_auth_verification_system.sql
```

**Output yang Diharapkan:**
```
BEGIN
ALTER TABLE
ALTER TABLE
ALTER TABLE
... (banyak ALTER TABLE statements)
CREATE TABLE
CREATE TABLE
CREATE INDEX
... (statements lainnya)
COMMIT
NOTICE: Migration completed successfully!
```

### 2.4 Verifikasi Migration Berhasil

**Check 1: Kolom Baru di Profiles**
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema='Soundpub' 
  AND table_name='profiles'
  AND (column_name LIKE '%token%' OR column_name = 'email_verified')
ORDER BY column_name;
"
```

**Hasil yang Diharapkan:**
```
column_name                      | data_type                   | is_nullable
---------------------------------+-----------------------------+-------------
email_verified                   | boolean                     | YES
password_reset_sent_at           | timestamp with time zone    | YES
password_reset_token             | text                        | YES
password_reset_token_expires_at  | timestamp with time zone    | YES
verification_sent_at             | timestamp with time zone    | YES
verification_token               | text                        | YES
verification_token_expires_at    | timestamp with time zone    | YES
```

**Check 2: Table Baru**
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='Soundpub' 
  AND table_name IN ('auth_events', 'rate_limits')
ORDER BY table_name;
"
```

**Hasil yang Diharapkan:**
```
table_name
-----------
auth_events
rate_limits
```

**Check 3: Functions Baru**
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema='Soundpub' 
  AND routine_name LIKE '%token%' OR routine_name LIKE '%rate%'
ORDER BY routine_name;
"
```

**Hasil yang Diharapkan:**
```
routine_name
--------------------------
check_rate_limit
cleanup_expired_tokens
cleanup_rate_limits
```

### 2.5 Test Functions
```sql
psql -h localhost -U postgres -d Soundpub -c "
-- Test cleanup functions
SELECT Soundpub.cleanup_rate_limits();
SELECT Soundpub.cleanup_expired_tokens();
"
```

**Kriteria Sukses:**
✅ Semua kolom baru ada di table profiles
✅ Table auth_events dan rate_limits terbuat
✅ Functions bisa dijalankan tanpa error

---

## 📍 LANGKAH 3: VERIFIKASI EDGE FUNCTIONS (15 menit)

### 3.1 Check Edge Functions yang Deployed
```bash
# Login ke Supabase (jika belum)
supabase login

# Link project (jika belum)
supabase link --project-ref <your-project-ref>

# List functions
supabase functions list
```

**Hasil yang Diharapkan:**
```
Functions:
- send-password-reset
- verify-password-reset-token
- reset-password
- send-verification-email
- verify-email
- send-app-email
... (functions lainnya)
```

### 3.2 Jika Functions Belum Deployed
```bash
cd supabase/functions

# Deploy satu per satu
supabase functions deploy send-password-reset
supabase functions deploy verify-password-reset-token
supabase functions deploy reset-password
supabase functions deploy send-verification-email
supabase functions deploy verify-email
```

**Atau deploy semuanya:**
```bash
# Deploy semua functions sekaligus
supabase functions deploy
```

### 3.3 Check Function Logs
```bash
# Check logs untuk verify tidak ada error
supabase functions logs send-password-reset --tail
```

**Kriteria Sukses:**
✅ Semua 5 auth functions sudah deployed
✅ Tidak ada error di logs

---

## 📍 LANGKAH 4: VERIFIKASI EMAIL TEMPLATES (10 menit)

### 4.1 Check send-app-email Function
```powershell
# Buka file
code supabase\functions\send-app-email\index.ts
# Atau
notepad supabase\functions\send-app-email\index.ts
```

### 4.2 Pastikan Template Ada
**Cari di file, harus ada:**
```typescript
// Di bagian SCOPE_TO_OPTIN mapping
'security': true,  // atau false, tergantung requirement

// Di bagian template handling
case 'password-reset':
  // template code
  break;
  
case 'email-verification':
  // template code
  break;
  
case 'password-changed':
  // template code (optional)
  break;
```

### 4.3 Jika Template Belum Ada
**Hubungi developer untuk menambahkan template, atau:**
```bash
# Re-deploy send-app-email dengan template baru
supabase functions deploy send-app-email
```

**Kriteria Sukses:**
✅ Template 'password-reset' ada
✅ Template 'email-verification' ada

---

## 📍 LANGKAH 5: BUILD & TEST FRONTEND (20 menit)

### 5.1 Build Application
```bash
cd I:\website-devops\Soundpub-project\Soundpub-dashboard

# Install dependencies (jika ada yang baru)
pnpm install

# Build
pnpm build
```

**Hasil yang Diharapkan:**
```
✓ built in XXXms
✓ X modules transformed.
dist/index.html                   X.XX kB
dist/assets/index-XXXXX.js        XXX.XX kB
...
```

### 5.2 Test Lokal (Development Mode)
```bash
# Jalankan dev server
pnpm dev
```

**Buka browser:** `http://localhost:5173`

### 5.3 Test Manual - Forgot Password
1. Buka `http://localhost:5173/forgot-password`
2. Masukkan email yang terdaftar di database
3. Klik "Kirim Link Reset Password"
4. **Expected:** Muncul success message

### 5.4 Check Database - Token Generated
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT 
  email, 
  password_reset_token, 
  password_reset_token_expires_at,
  password_reset_sent_at
FROM Soundpub.profiles 
WHERE email = 'EMAIL_YANG_ANDA_TEST'
LIMIT 1;
"
```

**Hasil yang Diharapkan:**
- `password_reset_token` terisi (UUID format)
- `password_reset_token_expires_at` = NOW() + 24 jam
- `password_reset_sent_at` = NOW()

### 5.5 Check Email Terkirim
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT 
  recipient_email,
  subject,
  status,
  error_message,
  created_at
FROM Soundpub.email_send_log 
WHERE recipient_email = 'EMAIL_YANG_ANDA_TEST'
ORDER BY created_at DESC 
LIMIT 5;
"
```

**Hasil yang Diharapkan:**
- Status = 'sent' atau 'pending'
- Tidak ada error_message

### 5.6 Test Reset Password Page
```bash
# Ambil token dari database (langkah 5.4)
# Buka URL dengan token:
```
**Browser:** `http://localhost:5173/reset-password?token=PASTE_TOKEN_DI_SINI`

**Test:**
1. Halaman harus load
2. Tidak ada error "Invalid token"
3. Form password muncul
4. Masukkan password baru (min 6 karakter)
5. Confirm password
6. Submit

**Expected:** 
- Success message muncul
- Auto redirect ke login
- Password berhasil diubah

### 5.7 Test Login dengan Password Baru
1. Buka `/auth`
2. Login dengan email + password baru
3. **Expected:** Berhasil login

**Kriteria Sukses:**
✅ Build berhasil tanpa error
✅ Forgot password flow works end-to-end
✅ Token generated di database
✅ Email terkirim (atau pending)
✅ Reset password works
✅ Login dengan password baru berhasil

---

## 📍 LANGKAH 6: TEST EMAIL VERIFICATION (20 menit)

### 6.1 Test Signup Flow
1. Buka `http://localhost:5173/auth`
2. Tab "Daftar"
3. Isi form dengan email BARU
4. Submit

**Expected:**
- Muncul success screen
- Instruksi verifikasi ditampilkan

### 6.2 Check Database - Verification Token
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT 
  email,
  email_verified,
  verification_token,
  verification_token_expires_at,
  created_at
FROM Soundpub.profiles 
WHERE email = 'EMAIL_SIGNUP_BARU'
LIMIT 1;
"
```

**Hasil yang Diharapkan:**
- `email_verified` = false
- `verification_token` terisi
- `verification_token_expires_at` = NOW() + 7 hari

### 6.3 Test Verify Email Page
```bash
# Ambil token dari database
# Buka URL:
```
**Browser:** `http://localhost:5173/verify-email?token=PASTE_TOKEN_DI_SINI`

**Expected:**
- Loading state muncul
- Success message
- `email_verified` berubah jadi true di database
- Auto redirect ke dashboard

### 6.4 Verify di Database
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT email, email_verified 
FROM Soundpub.profiles 
WHERE email = 'EMAIL_SIGNUP_BARU';
"
```

**Hasil:** `email_verified` = true

### 6.5 Test Resend Verification
1. Signup dengan email baru lagi (jangan verify)
2. Login dengan email tersebut
3. Navigate ke `/verify-email-required`
4. Klik "Kirim Ulang Email Verifikasi"

**Expected:**
- Success toast muncul
- Button disabled 60 detik
- Countdown muncul
- Token baru generated di database

**Kriteria Sukses:**
✅ Signup menghasilkan verification token
✅ Verify email page works
✅ email_verified berubah jadi true
✅ Resend verification works dengan cooldown

---

## 📍 LANGKAH 7: TEST RATE LIMITING (10 menit)

### 7.1 Test Rate Limit - Password Reset
1. Buka `/forgot-password`
2. Submit email yang sama **4 kali** cepat-cepat (< 1 menit)

**Expected pada request ke-4:**
- Error message: "Terlalu Banyak Percobaan"
- "Silakan coba lagi dalam X menit"

### 7.2 Check Database
```sql
psql -h localhost -U postgres -d Soundpub -c "
SELECT * FROM Soundpub.rate_limits 
WHERE identifier = 'EMAIL_YANG_DITEST'
ORDER BY last_attempt_at DESC;
"
```

**Hasil yang Diharapkan:**
- `attempt_count` = 4
- `blocked_until` terisi (NOW() + 1 jam)

**Kriteria Sukses:**
✅ Rate limiting berfungsi setelah 3 attempts
✅ User diblok selama 1 jam

---

## 📍 LANGKAH 8: PRODUCTION DEPLOYMENT (30 menit)

### 8.1 Commit Changes ke Git
```bash
git add .
git status  # Review changes

git commit -m "feat: Implement auth verification system (password reset & email verification)

- Add ResetPassword.tsx page
- Add VerifyEmail.tsx page
- Add VerifyEmailRequired.tsx page
- Update Auth.tsx with forgot password link
- Update routing in App.tsx
- Add comprehensive documentation

Database migration required: 002_auth_verification_system.sql"

git push origin main  # atau branch yang sesuai
```

### 8.2 Build Production
```bash
# Clean previous build
Remove-Item -Recurse -Force dist

# Build production
set NODE_ENV=production
pnpm build

# Verify build
Get-ChildItem dist
```

### 8.3 Deploy dengan Docker
```bash
# Build Docker image
docker build -t Soundpub-dashboard:v2.1.0 .

# Tag sebagai latest
docker tag Soundpub-dashboard:v2.1.0 Soundpub-dashboard:latest

# Stop container lama
docker-compose down

# Start container baru
docker-compose up -d

# Check logs
docker-compose logs -f --tail=100
```

### 8.4 Verify Deployment
```bash
# Check container running
docker ps | findstr Soundpub

# Test endpoint
curl http://localhost:5173/
curl http://localhost:5173/forgot-password
```

**Atau buka browser:** `http://your-domain.com`

### 8.5 Test di Production
Ulangi semua test dari Langkah 5 & 6, tapi di production URL

**Kriteria Sukses:**
✅ Application deployed successfully
✅ All pages accessible
✅ Forgot password works di production
✅ Email verification works di production

---

## 📍 LANGKAH 9: MONITORING (Ongoing)

### 9.1 Setup Monitoring Queries
```sql
-- Save query ini untuk monitoring harian

-- Query 1: Email verification rate (7 hari terakhir)
SELECT 
  COUNT(*) FILTER (WHERE email_verified = true) * 100.0 / NULLIF(COUNT(*), 0) AS verification_rate,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE email_verified = true) as verified_users
FROM Soundpub.profiles
WHERE created_at >= NOW() - INTERVAL '7 days';

-- Query 2: Password reset activity (hari ini)
SELECT 
  event_type,
  COUNT(*) as count
FROM Soundpub.auth_events
WHERE event_type LIKE 'password_reset%'
  AND created_at >= CURRENT_DATE
GROUP BY event_type;

-- Query 3: Rate limit blocks (aktif sekarang)
SELECT 
  identifier,
  action_type,
  attempt_count,
  blocked_until
FROM Soundpub.rate_limits
WHERE blocked_until > NOW()
ORDER BY blocked_until DESC;

-- Query 4: Failed email deliveries (hari ini)
SELECT 
  status,
  COUNT(*) as count
FROM Soundpub.email_send_log
WHERE created_at >= CURRENT_DATE
GROUP BY status;
```

### 9.2 Daily Checklist (Week 1)
**Setiap hari, check:**
- [ ] Email delivery rate > 95%
- [ ] Verification rate trending up
- [ ] No critical errors in logs
- [ ] Rate limit violations < 10/day

**Kriteria Sukses:**
✅ Monitoring queries saved
✅ Dashboard untuk monitoring ready

---

## 📍 LANGKAH 10: ROLLBACK PLAN (Jika Ada Masalah)

### 10.1 Rollback Frontend Only
```bash
# Gunakan versi Docker sebelumnya
docker tag Soundpub-dashboard:v2.0.0 Soundpub-dashboard:latest
docker-compose down
docker-compose up -d
```

### 10.2 Rollback Database (EXTREME - Hanya jika database corrupt)
```bash
# HATI-HATI: Ini akan menghapus semua data setelah backup!
psql -h localhost -U postgres -d Soundpub < backups/backup_before_auth_migration_20260814.sql
```

### 10.3 Disable Email Verification Requirement (Temporary Fix)
```sql
-- Jika banyak user complain tidak bisa verify
UPDATE Soundpub.profiles 
SET email_verified = true 
WHERE email_verified = false 
  AND created_at < NOW() - INTERVAL '24 hours';
```

---

## ✅ CHECKLIST FINAL

### Pre-Deployment
- [ ] Database backup dibuat
- [ ] Migration script reviewed
- [ ] Edge functions verified

### Deployment
- [ ] Database migration executed successfully
- [ ] All new columns exist in profiles table
- [ ] auth_events & rate_limits tables created
- [ ] Edge functions deployed
- [ ] Email templates configured
- [ ] Frontend built successfully
- [ ] Docker image created

### Testing
- [ ] Forgot password flow tested
- [ ] Reset password works
- [ ] Email verification tested
- [ ] Resend verification works
- [ ] Rate limiting works
- [ ] All tests passed in production

### Post-Deployment
- [ ] Monitoring queries setup
- [ ] No critical errors in logs
- [ ] Email delivery working
- [ ] User feedback positive
- [ ] Documentation updated

---

## 🆘 TROUBLESHOOTING UMUM

### Masalah: Migration gagal
**Error:** `relation "Soundpub.profiles" does not exist`
**Solution:**
```sql
-- Check schema
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'Soundpub';

-- Jika tidak ada, create schema
CREATE SCHEMA Soundpub;
```

### Masalah: Email tidak terkirim
**Check:**
```sql
SELECT * FROM Soundpub.email_send_log 
ORDER BY created_at DESC LIMIT 10;
```
**Solution:** Verify Gmail API credentials, check Lovable connector

### Masalah: Token tidak valid
**Check:**
```sql
SELECT verification_token, verification_token_expires_at 
FROM Soundpub.profiles 
WHERE email = 'user@example.com';
```
**Solution:** Token mungkin expired, generate token baru

### Masalah: Build error
**Error:** `Module not found`
**Solution:**
```bash
# Clear cache dan reinstall
Remove-Item -Recurse -Force node_modules
Remove-Item pnpm-lock.yaml
pnpm install
pnpm build
```

---

## 📞 SUPPORT

**Jika ada masalah:**
1. Check dokumentasi lengkap di `docs/DEPLOYMENT_GUIDE_AUTH.md`
2. Check logs: `docker-compose logs -f`
3. Check database: Run verification queries
4. Contact: dev@Soundpub.xyz

---

## 🎯 TARGET METRICS

**Week 1:**
- Email verification rate: >60%
- Password reset completion: >70%
- Zero critical bugs

**Month 1:**
- Email verification rate: >80%
- Support tickets down 30%

---

**Total Estimasi Waktu:** 2-3 jam
**Tingkat Kesulitan:** Medium
**Status:** Ready to Execute

🎵 **Good luck dengan deployment!** 🎵
