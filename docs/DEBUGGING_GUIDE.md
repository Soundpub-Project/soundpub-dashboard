# 🔍 DEBUGGING GUIDE - AUTH VERIFICATION TIDAK BERFUNGSI

**Reported Issues:**
1. ❌ Reset password tidak berfungsi
2. ❌ Email verification setelah signup tidak jalan (langsung masuk dashboard)
3. ❌ Edge Functions tidak berjalan meskipun sudah deployed

---

## 🎯 DIAGNOSIS MASALAH

### KEMUNGKINAN ROOT CAUSE:

#### 1. DATABASE MIGRATION BELUM DIJALANKAN ⚠️ (PALING MUNGKIN)
**Gejala:**
- User langsung masuk dashboard tanpa verifikasi
- Token tidak tersimpan di database
- Functions error karena kolom tidak ada

**Solusi:** Jalankan migration script

---

#### 2. EDGE FUNCTION SECRETS/ENV VARS BELUM DIKONFIGURASI
**Gejala:**
- Functions deployed tapi error saat dipanggil
- Email tidak terkirim
- Token tidak di-generate

**Solusi:** Set environment variables

---

#### 3. SIGNUP LOGIC TIDAK MEMANGGIL SEND-VERIFICATION-EMAIL
**Gejala:**
- User bisa signup
- Langsung masuk dashboard
- Tidak ada email verifikasi terkirim

**Solusi:** Update signup flow

---

## 📋 LANGKAH DEBUGGING (URUT!)

### STEP 1: CEK DATABASE MIGRATION ⭐ PENTING!
```sql
-- Jalankan di PostgreSQL client (pgAdmin, DBeaver, atau Supabase SQL Editor)

-- Query 1: Cek apakah kolom baru ada
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
  )
ORDER BY column_name;
```

**EXPECTED RESULT:**
```
column_name                      | data_type                   | is_nullable
---------------------------------+-----------------------------+------------
email_verified                   | boolean                     | YES
password_reset_token             | text                        | YES
password_reset_token_expires_at  | timestamp with time zone    | YES
verification_token               | text                        | YES
verification_token_expires_at    | timestamp with time zone    | YES
```

**❌ JIKA KOSONG/ERROR:** Migration belum dijalankan!
**✅ JIKA ADA 5 KOLOM:** Migration sudah jalan, lanjut ke Step 2

---

### STEP 1B: JIKA MIGRATION BELUM JALAN - JALANKAN SEKARANG!
```sql
-- Copy paste ISI FILE ini ke SQL Editor:
-- File: migrations-complete/002_auth_verification_system.sql

-- Atau jalankan via command line (jika psql tersedia):
-- psql -h localhost -U postgres -d Soundpub -f migrations-complete/002_auth_verification_system.sql
```

**PENTING:** Setelah migration, cek lagi dengan Query 1 di atas!

---

### STEP 2: CEK TABLE BARU (auth_events & rate_limits)
```sql
-- Query 2: Cek table baru
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='Soundpub' 
  AND table_name IN ('auth_events', 'rate_limits')
ORDER BY table_name;
```

**EXPECTED RESULT:**
```
table_name
-----------
auth_events
rate_limits
```

**❌ JIKA KOSONG:** Migration tidak selesai sempurna, jalankan ulang!
**✅ JIKA ADA 2 TABLE:** OK, lanjut Step 3

---

### STEP 3: CEK EDGE FUNCTION SECRETS/ENV VARS
```bash
# Jalankan di terminal
supabase secrets list
```

**EXPECTED:**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_SCHEMA
LOVABLE_API_KEY
GOOGLE_MAIL_API_KEY
APP_URL
```

**❌ JIKA KOSONG/KURANG:** Set secrets dulu!
**✅ JIKA LENGKAP:** Lanjut Step 4

---

### STEP 3B: SET SECRETS (JIKA BELUM ADA)
```bash
# Set secrets untuk Edge Functions
supabase secrets set SUPABASE_URL=https://supabase.carubra.com
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set DATABASE_SCHEMA=Soundpub
supabase secrets set LOVABLE_API_KEY=your-lovable-key
supabase secrets set GOOGLE_MAIL_API_KEY=your-gmail-key
supabase secrets set APP_URL=http://localhost:5173

# Verify
supabase secrets list
```

**PENTING:** Setelah set secrets, RESTART functions atau re-deploy!
```bash
supabase functions deploy send-password-reset
supabase functions deploy verify-password-reset-token
supabase functions deploy reset-password
supabase functions deploy send-verification-email
supabase functions deploy verify-email
```

---

### STEP 4: TEST FORGOT PASSWORD FUNCTION
```bash
# Test via curl atau browser console

# Buka browser console (F12) di halaman forgot-password
# Paste dan run:

fetch('https://supabase.carubra.com/functions/v1/send-password-reset', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  },
  body: JSON.stringify({
    email: 'test@example.com'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**EXPECTED RESPONSE:**
```json
{
  "success": true,
  "message": "If email exists, reset link sent."
}
```

**❌ JIKA ERROR:** Check function logs
**✅ JIKA SUCCESS:** Lanjut Step 5

---

### STEP 5: CHECK FUNCTION LOGS
```bash
# Lihat logs untuk debugging
supabase functions logs send-password-reset --tail

# Atau untuk function lain:
supabase functions logs verify-email --tail
supabase functions logs send-verification-email --tail
```

**CARI ERROR MESSAGE:**
- "Cannot read property of undefined" → Env var tidak ada
- "relation does not exist" → Migration belum jalan
- "CORS error" → CORS configuration issue

---

### STEP 6: CEK SIGNUP FLOW (Email Verification)

**MASALAH:** User langsung masuk dashboard tanpa verifikasi

**ROOT CAUSE:** Signup di Auth.tsx tidak memanggil send-verification-email!

**SOLUSI:** Update signup handler

---

## 🛠️ FIX UNTUK MASALAH #2 (Email Verification)

### ISSUE: Signup Tidak Trigger Email Verification

File: `src/pages/Auth.tsx`

**Cari function handleSignup, setelah signup sukses, HARUS panggil:**

```typescript
// Setelah signup sukses
if (!error) {
  // ✅ TAMBAHKAN INI: Trigger verification email
  try {
    await supabase.functions.invoke('send-verification-email', {
      body: {
        userId: user.id, // dari response signup
        email: signupData.email,
        isResend: false
      }
    });
  } catch (emailError) {
    console.error('Failed to send verification email:', emailError);
  }
  
  // Show success screen
  setSignupSuccess(true);
  setSignupEmail(signupData.email);
}
```

---

## 🛠️ FIX UNTUK MASALAH #1 (Reset Password)

### ISSUE: Reset Password Tidak Berfungsi

**CHECKLIST:**
1. ✅ Function `send-password-reset` deployed?
2. ✅ Database kolom `password_reset_token` ada?
3. ✅ Secrets/env vars sudah di-set?
4. ✅ CORS configuration OK?

**DEBUG:**
```javascript
// Di browser console, test function:
supabase.functions.invoke('send-password-reset', {
  body: { email: 'your-email@example.com' }
})
.then(res => console.log('Response:', res))
.catch(err => console.error('Error:', err));
```

---

## 🛠️ FIX UNTUK MASALAH #3 (Functions Tidak Berjalan)

### COMMON ISSUES:

#### Issue A: Secrets Tidak Ada
```bash
supabase secrets list
# Jika kosong, set dengan command di Step 3B
```

#### Issue B: Schema Salah
```typescript
// Check di function code, harus ada:
const getDatabaseSchema = () => 
  Deno.env.get('DATABASE_SCHEMA') || 'Soundpub'
```

#### Issue C: CORS Error
```typescript
// Check CORS headers di function:
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

---

## ✅ CHECKLIST FINAL

### WAJIB DISELESAIKAN:
- [ ] Database migration executed (Step 1)
- [ ] Kolom email_verified, verification_token, password_reset_token ADA
- [ ] Table auth_events dan rate_limits ADA
- [ ] Edge function secrets/env vars SUDAH DI-SET
- [ ] Functions re-deployed setelah set secrets
- [ ] Signup flow MEMANGGIL send-verification-email
- [ ] Test forgot password berhasil

### VERIFIKASI:
- [ ] Forgot password generate token di database
- [ ] Signup tidak langsung masuk dashboard
- [ ] Email verification flow berjalan
- [ ] Reset password flow berjalan

---

## 🎯 PRIORITAS EKSEKUSI

**1. MIGRATION DATABASE (TERTINGGI)**
Jika kolom tidak ada, SEMUA fitur tidak akan jalan!

**2. SET SECRETS/ENV VARS**
Functions butuh ini untuk connect ke database dan send email

**3. UPDATE SIGNUP FLOW**
Tambah panggilan ke send-verification-email

**4. TEST & VERIFY**
Test semua flow end-to-end

---

## 📞 UNTUK BANTUAN LEBIH LANJUT

Kirimkan hasil dari:
1. Query Step 1 (kolom di profiles)
2. Query Step 2 (table auth_events & rate_limits)
3. Output dari `supabase secrets list`
4. Logs dari `supabase functions logs send-password-reset`

Dengan info ini, saya bisa bantu diagnose lebih detail!

---

**Kemungkinan Besar Masalahnya:** 
🎯 **DATABASE MIGRATION BELUM DIJALANKAN!**

Silakan jalankan Step 1 dulu dan report hasilnya!
