# ✅ QUICK CHECKLIST - AUTH VERIFICATION DEPLOYMENT
# Versi Singkat untuk Eksekusi Cepat

---

## 🚀 YANG HARUS ANDA LAKUKAN (Urut dari Atas ke Bawah)

### ☑️ LANGKAH 1: BACKUP DATABASE (WAJIB!)
```bash
cd I:\website-devops\soundpub-project\soundpub-dashboard
mkdir -p backups
pg_dump -h localhost -U postgres soundpub > backups/backup_20260814.sql
```
**✅ Sukses jika:** File backup muncul di folder backups/

---

### ☑️ LANGKAH 2: JALANKAN MIGRATION
```bash
psql -h localhost -U postgres -d soundpub -f migrations-complete\002_auth_verification_system.sql
```
**✅ Sukses jika:** Muncul "Migration completed successfully!"

**Verify:**
```sql
psql -h localhost -U postgres -d soundpub -c "SELECT column_name FROM information_schema.columns WHERE table_schema='soundpub' AND table_name='profiles' AND column_name = 'email_verified';"
```
**✅ Harus return:** `email_verified`

---

### ☑️ LANGKAH 3: CHECK EDGE FUNCTIONS
```bash
supabase functions list
```
**✅ Harus ada:**
- send-password-reset
- verify-password-reset-token  
- reset-password
- send-verification-email
- verify-email

**Jika belum ada, deploy:**
```bash
supabase functions deploy send-password-reset
supabase functions deploy verify-password-reset-token
supabase functions deploy reset-password
supabase functions deploy send-verification-email
supabase functions deploy verify-email
```

---

### ☑️ LANGKAH 4: TEST LOKAL
```bash
pnpm dev
```

**Test Manual:**
1. Buka: `http://localhost:5173/forgot-password`
2. Masukkan email yang ada di database
3. Submit
4. **✅ Sukses:** Muncul "Email Terkirim!"

**Check Database:**
```sql
psql -h localhost -U postgres -d soundpub -c "SELECT email, password_reset_token FROM soundpub.profiles WHERE email = 'EMAIL_ANDA' LIMIT 1;"
```
**✅ Harus ada:** Token terisi (bukan NULL)

---

### ☑️ LANGKAH 5: TEST RESET PASSWORD
1. Ambil token dari database (query di atas)
2. Buka: `http://localhost:5173/reset-password?token=PASTE_TOKEN_DISINI`
3. Masukkan password baru
4. Submit
5. **✅ Sukses:** Muncul "Password Berhasil Diubah!"
6. Test login dengan password baru

---

### ☑️ LANGKAH 6: DEPLOY PRODUCTION
```bash
# Build
pnpm build

# Deploy Docker
docker build -t soundpub-dashboard:v2.1.0 .
docker tag soundpub-dashboard:v2.1.0 soundpub-dashboard:latest
docker-compose down
docker-compose up -d

# Check logs
docker-compose logs -f --tail=50
```
**✅ Sukses:** Container running, no error di logs

---

### ☑️ LANGKAH 7: TEST DI PRODUCTION
1. Buka: `https://your-domain.com/forgot-password`
2. Test forgot password flow
3. Test reset password flow
4. **✅ Sukses:** Semua berfungsi seperti di lokal

---

## 📊 MONITORING HARIAN (Week 1)

**Jalankan query ini setiap hari:**
```sql
-- Email verification rate
SELECT COUNT(*) FILTER (WHERE email_verified = true) * 100.0 / COUNT(*) 
FROM soundpub.profiles 
WHERE created_at >= NOW() - INTERVAL '7 days';

-- Password reset today
SELECT COUNT(*) FROM soundpub.auth_events 
WHERE event_type = 'password_reset_requested' 
AND created_at >= CURRENT_DATE;

-- Email delivery errors
SELECT status, COUNT(*) FROM soundpub.email_send_log 
WHERE created_at >= CURRENT_DATE 
GROUP BY status;
```

---

## 🆘 JIKA ADA MASALAH

### Problem: Migration Error
```bash
# Restore backup
psql -h localhost -U postgres -d soundpub < backups/backup_20260814.sql
```

### Problem: Email Tidak Terkirim
```sql
-- Check email logs
SELECT * FROM soundpub.email_send_log ORDER BY created_at DESC LIMIT 10;
```
**Fix:** Verify Gmail API credentials di Supabase

### Problem: Token Invalid
```sql
-- Generate token manual
UPDATE soundpub.profiles 
SET password_reset_token = gen_random_uuid()::text,
    password_reset_token_expires_at = NOW() + INTERVAL '24 hours'
WHERE email = 'user@example.com';
```

---

## 🎯 SUCCESS CRITERIA

**✅ Deployment Sukses Jika:**
- [ ] Migration completed tanpa error
- [ ] Forgot password works end-to-end
- [ ] Reset password works
- [ ] Email verification untuk signup baru works
- [ ] Container running di production
- [ ] No critical errors di logs

**🚨 Rollback Jika:**
- Migration gagal (restore backup)
- Critical error di production (rollback Docker image)
- Email tidak terkirim sama sekali (check Gmail API)

---

## 📞 NEED HELP?

**Dokumentasi Lengkap:**
- `docs/STEP_BY_STEP_DEPLOYMENT.md` (detail lengkap)
- `docs/DEPLOYMENT_GUIDE_AUTH.md` (troubleshooting)
- `docs/FRONTEND_AUTH_IMPLEMENTATION_COMPLETE.md` (tech details)

**Contact:** dev@soundpub.xyz

---

**Estimasi Waktu Total:** 1-2 jam
**Mulai Dari:** Langkah 1 (Backup Database)
**Status:** Ready to Execute

🎵 **Selamat Deployment!** 🎵
