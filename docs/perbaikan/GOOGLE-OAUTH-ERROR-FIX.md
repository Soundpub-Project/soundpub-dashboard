# 🔴 GOOGLE OAUTH ERROR - DIAGNOSIS & SOLUSI

## Error yang Terjadi

```
Unable to exchange external code: 4/0AXEQxIB0w6bQmR14FzBcm9QvN19O1rLxb5cFXbi2RhyQcFV-DO6ckrKNnvZrsG4soF1x8A
```

**Error Type:** `server_error` / `unexpected_failure`
**Lokasi:** https://web.maskhar.com

---

## 🔍 ROOT CAUSE ANALYSIS

Error "Unable to exchange external code" terjadi karena salah satu dari:

1. **Google OAuth credentials tidak ter-set di Supabase server**
2. **Redirect URI tidak match di Google Cloud Console**
3. **GOTRUE environment variables salah atau kosong**
4. **Auth service Supabase belum restart setelah update .env**

---

## 🎯 SOLUSI STEP-BY-STEP

### STEP 1: Verify Environment Variables di Server

SSH ke server Supabase dan jalankan:

```bash
cd ~/docker/supabase/supabase/docker

# Check apakah Google OAuth env vars ada di .env
grep "GOTRUE_EXTERNAL_GOOGLE" .env
```

**Expected output:**
```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=123456789-xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

**Jika TIDAK ADA atau KOSONG → Lanjut ke STEP 2**

---

### STEP 2: Tambahkan Google OAuth Config ke .env

```bash
# SSH ke server
ssh maskhar@supabase-server

# Masuk ke direktori Supabase
cd ~/docker/supabase/supabase/docker

# Edit .env
nano .env
```

**Tambahkan baris ini di akhir file (atau update jika sudah ada):**

```bash
# Google OAuth Configuration
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=YOUR_ACTUAL_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback

# Additional OAuth settings (optional but recommended)
GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK=false
```

**⚠️ PENTING:** Ganti `YOUR_ACTUAL_CLIENT_ID` dan `YOUR_ACTUAL_CLIENT_SECRET` dengan credentials ASLI dari Google Cloud Console!

**Save:** `Ctrl+O`, `Enter`, `Ctrl+X`

---

### STEP 3: Verify Google Cloud Console Settings

Buka: https://console.cloud.google.com/apis/credentials

**Pilih OAuth 2.0 Client ID Anda, pastikan:**

1. **Authorized JavaScript origins:**
   ```
   https://web.maskhar.com
   https://supabase.carubra.com
   ```

2. **Authorized redirect URIs:**
   ```
   https://supabase.carubra.com/auth/v1/callback
   ```

**⚠️ CRITICAL:** URL harus PERSIS sama (termasuk `/auth/v1/callback`)

**Jika belum ada, TAMBAHKAN dan klik SAVE.**

---

### STEP 4: Restart Supabase Auth Service

```bash
# Restart hanya auth service (cepat)
docker compose restart auth

# Tunggu 10 detik
sleep 10

# Verify auth service healthy
docker compose ps auth
```

**Expected:** Status `Up (healthy)`

**Atau restart semua (lebih aman):**
```bash
docker compose down
docker compose up -d
sleep 30
docker compose ps
```

---

### STEP 5: Verify Auth Service Logs

```bash
# Check auth logs untuk error
docker compose logs auth --tail=50

# Cari baris yang mengandung "google"
docker compose logs auth | grep -i google
```

**Expected (Good):**
```
GoTrue: External provider Google enabled
```

**Bad (Error):**
```
Missing GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID
Missing GOTRUE_EXTERNAL_GOOGLE_SECRET
```

Jika masih ada error "Missing", berarti .env belum ter-load. Restart lagi.

---

### STEP 6: Test Login Google dari Browser

1. Buka: https://web.maskhar.com
2. Clear browser cache (Ctrl+Shift+Delete)
3. Klik: "Login with Google"
4. Pilih akun Google
5. Seharusnya berhasil redirect ke dashboard

---

## 🔧 TROUBLESHOOTING LANJUTAN

### Issue 1: Environment Variables Tidak Ter-load

**Symptom:** Setelah restart masih error yang sama

**Solution:**
```bash
# Verify .env ada di lokasi yang benar
ls -la ~/docker/supabase/supabase/docker/.env

# Verify docker-compose.yml di direktori yang sama
ls -la ~/docker/supabase/supabase/docker/docker-compose.yml

# Jika tidak sama direktori, pindahkan .env
# Ensure both in SAME directory!

# Full restart dengan down
cd ~/docker/supabase/supabase/docker
docker compose down
docker compose up -d
sleep 30
docker compose logs auth --tail=20
```

---

### Issue 2: Client ID atau Secret Salah

**Symptom:** Error "Invalid client" atau "unauthorized_client"

**Solution:**
1. Buka Google Cloud Console
2. Pergi ke: APIs & Services > Credentials
3. Copy ulang Client ID dan Client Secret
4. Paste ke .env (PASTIKAN TIDAK ADA SPASI DI AWAL/AKHIR)
5. Restart auth service

---

### Issue 3: Redirect URI Mismatch

**Symptom:** Error "redirect_uri_mismatch"

**Solution:**
```bash
# Di .env, pastikan persis seperti ini:
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback

# Di Google Cloud Console, pastikan persis seperti ini:
https://supabase.carubra.com/auth/v1/callback

# TIDAK boleh:
http://supabase.carubra.com/auth/v1/callback  ❌ (http bukan https)
https://supabase.carubra.com/auth/v1/        ❌ (kurang /callback)
https://supabase.carubra.com/callback         ❌ (kurang /auth/v1)
```

---

### Issue 4: OAuth Consent Screen Belum Configured

**Symptom:** Error "invalid_client" atau "Access blocked"

**Solution:**
1. Buka Google Cloud Console
2. Pergi ke: APIs & Services > OAuth consent screen
3. Pastikan:
   - User Type: External (atau Internal jika untuk organisasi saja)
   - Status: Published (bukan Testing)
   - Authorized domains: `maskhar.com`
4. Tambahkan test users jika status masih "Testing"

---

## 🧪 QUICK TEST SEQUENCE

Copy-paste ini di server untuk quick test:

```bash
# Full sequence test
cd ~/docker/supabase/supabase/docker

# 1. Check env vars
echo "=== Checking Google OAuth env vars ==="
grep "GOTRUE_EXTERNAL_GOOGLE" .env

# 2. Check if auth service can see them
echo -e "\n=== Checking env vars in auth container ==="
docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE

# 3. Restart auth
echo -e "\n=== Restarting auth service ==="
docker compose restart auth
sleep 10

# 4. Check auth status
echo -e "\n=== Auth service status ==="
docker compose ps auth

# 5. Check auth logs
echo -e "\n=== Recent auth logs ==="
docker compose logs auth --tail=20 | grep -E "google|Google|error|Error"
```

---

## 📋 CHECKLIST LENGKAP

Pastikan SEMUA ini ✓ sebelum test lagi:

**Di Server Supabase:**
- [ ] File .env ada di `~/docker/supabase/supabase/docker/`
- [ ] `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true` ada di .env
- [ ] `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` terisi dengan Client ID yang benar
- [ ] `GOTRUE_EXTERNAL_GOOGLE_SECRET` terisi dengan Client Secret yang benar
- [ ] `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback`
- [ ] Tidak ada spasi di awal/akhir nilai
- [ ] Auth service sudah restart: `docker compose restart auth`
- [ ] Auth service status: `Up (healthy)`
- [ ] Logs tidak ada error: `docker compose logs auth --tail=50`

**Di Google Cloud Console:**
- [ ] OAuth 2.0 Client ID sudah dibuat
- [ ] Authorized JavaScript origins: `https://web.maskhar.com`
- [ ] Authorized redirect URIs: `https://supabase.carubra.com/auth/v1/callback`
- [ ] OAuth consent screen configured
- [ ] Status: Published (atau test users added jika Testing)

**Di Browser:**
- [ ] Clear cache & cookies
- [ ] Try login Google lagi

---

## 🚨 COMMON MISTAKES

**Mistake 1:** Copy-paste Client ID/Secret dengan spasi
```bash
# ❌ SALAH (ada spasi setelah =)
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID= 123456.apps.googleusercontent.com

# ✓ BENAR (tidak ada spasi)
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=123456.apps.googleusercontent.com
```

**Mistake 2:** Lupa restart setelah edit .env
```bash
# Setelah edit .env, HARUS restart!
docker compose restart auth
# atau
docker compose down && docker compose up -d
```

**Mistake 3:** Redirect URI tidak persis sama
```bash
# Google Console: https://supabase.carubra.com/auth/v1/callback
# .env:          https://supabase.carubra.com/auth/v1/callback
# HARUS SAMA PERSIS (case-sensitive)
```

---

## 💡 JIKA MASIH ERROR

Collect diagnostic info dan kirimkan:

```bash
cd ~/docker/supabase/supabase/docker

# Collect info (REMOVE SENSITIVE DATA BEFORE SHARING!)
{
  echo "=== .env Google OAuth Config ==="
  grep "GOTRUE_EXTERNAL_GOOGLE" .env
  
  echo -e "\n=== Auth Container Env Vars ==="
  docker compose exec auth env | grep GOTRUE_EXTERNAL_GOOGLE
  
  echo -e "\n=== Auth Service Status ==="
  docker compose ps auth
  
  echo -e "\n=== Auth Logs (last 50 lines) ==="
  docker compose logs auth --tail=50
  
  echo -e "\n=== Full Service Status ==="
  docker compose ps
} > oauth-debug.txt

cat oauth-debug.txt
```

**Remove CLIENT_SECRET dari output sebelum share!**

---

## 📞 QUICK REFERENCE

**Check env vars:**
```bash
grep "GOTRUE_EXTERNAL_GOOGLE" .env
```

**Restart auth:**
```bash
docker compose restart auth
```

**Check auth logs:**
```bash
docker compose logs auth --tail=50
```

**Full restart:**
```bash
docker compose down && docker compose up -d
```

**Test from browser:**
```
https://web.maskhar.com
```

---

**Created:** 2026-07-27
**Status:** Ready to fix
**Est. Time:** 5-10 minutes

