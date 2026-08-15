# 🔍 DEBUGGING CHECKLIST - AUTH VERIFICATION ISSUES

**Reported Issues:**
1. ❌ Reset password tidak berfungsi
2. ❌ Email verification setelah signup tidak jalan (langsung masuk dashboard)
3. ❌ Edge Functions yang baru tidak berjalan

**Status:** Functions sudah deployed ke Supabase local

---

## 🔍 CHECKLIST YANG MUNGKIN TERLEWAT

### ☑️ 1. DATABASE MIGRATION
Status: **Perlu dicek**

Query untuk cek:
```sql
-- Check apakah kolom baru ada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema='soundpub' 
  AND table_name='profiles'
  AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');
```

**Jika tidak ada hasil:** Migration belum dijalankan!

---

### ☑️ 2. EMAIL VERIFICATION LOGIC DI SIGNUP
Status: **Perlu dicek**

**Masalah:** User langsung masuk dashboard tanpa verifikasi

**Root Cause Kemungkinan:**
- Migration belum jalan (kolom email_verified tidak ada)
- Logic verification tidak dipanggil saat signup
- Edge function send-verification-email tidak dipanggil

**Check:** Apakah send-verification-email dipanggil saat signup?

---

### ☑️ 3. EDGE FUNCTION ENVIRONMENT VARIABLES
Status: **Perlu dicek**

Functions membutuhkan env vars untuk berjalan.

Check di Supabase Dashboard atau CLI:
```bash
supabase secrets list
```

**Required secrets:**
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- DATABASE_SCHEMA (harus 'soundpub')
- LOVABLE_API_KEY (untuk email)
- GOOGLE_MAIL_API_KEY (untuk email)
- APP_URL (untuk link reset/verify)
```

---

### ☑️ 4. CORS CONFIGURATION
Status: **Perlu dicek**

Edge functions harus allow CORS dari frontend domain.

---

### ☑️ 5. FUNCTION INVOCATION
Status: **Perlu dicek**

**Check:** Apakah function benar-benar dipanggil dari frontend?

Browser DevTools → Network → Filter "functions" → Check request/response

---

## 🛠️ LANGKAH DEBUGGING DETAIL

Mari kita check satu per satu...
