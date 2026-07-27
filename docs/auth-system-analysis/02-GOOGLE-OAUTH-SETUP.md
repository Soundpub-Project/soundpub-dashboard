# 🔧 GOOGLE OAUTH SETUP GUIDE

**Tujuan:** Memperbaiki error "Unable to exchange external code" pada Google login

---

## 📋 PREREQUISITES

- Akses ke Google Cloud Console
- Akses SSH ke server Supabase self-hosted
- Sudo/root privileges untuk restart Docker services

---

## 🎯 STEP-BY-STEP SETUP

### STEP 1: Get Google OAuth Credentials

1. **Buka Google Cloud Console:**
   - URL: https://console.cloud.google.com/apis/credentials
   - Login dengan akun Google yang mengelola project

2. **Pilih atau Buat Project:**
   - Pilih project yang sudah ada (jika ada)
   - Atau klik "Create Project" untuk project baru

3. **Enable Google+ API:**
   - Menu: APIs & Services → Library
   - Cari: "Google+ API"
   - Klik "Enable"

4. **Create OAuth 2.0 Credentials:**
   - Menu: APIs & Services → Credentials
   - Klik "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Soundpub Dashboard"

5. **Configure Authorized Redirect URIs:**
   - Authorized JavaScript origins:
     ```
     https://web.maskhar.com
     https://supabase.carubra.com
     ```
   - Authorized redirect URIs:
     ```
     https://supabase.carubra.com/auth/v1/callback
     https://web.maskhar.com
     ```

6. **Save and Copy Credentials:**
   - Klik "Create"
   - **COPY** dan **SIMPAN**:
     - Client ID: `xxxxx.apps.googleusercontent.com`
     - Client Secret: `GOCSPX-xxxxx`

---

### STEP 2: Update Supabase .env File

1. **SSH ke Server:**
   ```bash
   ssh maskhar@supabase-server
   ```

2. **Navigate to Supabase Docker Directory:**
   ```bash
   cd ~/docker/supabase/supabase/docker
   ```

3. **Backup .env File:**
   ```bash
   cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
   ```

4. **Edit .env File:**
   ```bash
   nano .env
   ```

5. **Add Google OAuth Configuration:**
   
   Cari bagian `# GoTrue (Auth) Configuration` atau tambahkan di bagian bawah:
   
   ```bash
   # -------- GOOGLE OAUTH CONFIGURATION --------
   GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
   GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
   GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-YOUR_SECRET_HERE
   GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
   ```

   **REPLACE:**
   - `YOUR_CLIENT_ID_HERE` → dengan Client ID dari Step 1
   - `YOUR_SECRET_HERE` → dengan Client Secret dari Step 1

6. **Save File:**
   - Tekan `Ctrl + O` (save)
   - Tekan `Enter`
   - Tekan `Ctrl + X` (exit)

---

### STEP 3: Restart Supabase Auth Service

**Option A - Restart Only Auth Service (Recommended):**
```bash
cd ~/docker/supabase/supabase/docker
docker compose restart auth
```

**Option B - Restart All Services (If Option A doesn't work):**
```bash
cd ~/docker/supabase/supabase/docker
docker compose down
docker compose up -d
```

**Wait for services to be healthy:**
```bash
docker compose ps
```

Expected output: All services should show "Up (healthy)"

---

### STEP 4: Verify Configuration

1. **Check Auth Service Logs:**
   ```bash
   docker compose logs auth | grep -i google
   ```

   Expected output should show Google provider enabled:
   ```
   [auth] External provider 'google' enabled
   ```

2. **Check Environment Variables:**
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

---

### STEP 5: Test Google Login

1. **Open Dashboard:**
   - URL: https://web.maskhar.com

2. **Click "Masuk dengan Google"**

3. **Expected Flow:**
   ```
   web.maskhar.com
     ↓
   Redirect to Google OAuth
     ↓
   Google Login Page (pilih akun)
     ↓
   Google asks for permission
     ↓
   Redirect back to web.maskhar.com
     ↓
   ✅ LOGIN SUCCESS → Dashboard appears
   ```

4. **Verify in Database:**
   ```bash
   # SSH to Supabase server
   docker compose exec db psql -U postgres -d postgres

   # Check user exists
   SELECT id, email, raw_user_meta_data->'provider' as provider 
   FROM auth.users 
   WHERE email = 'YOUR_TEST_EMAIL@gmail.com';

   # Check profile created
   SELECT id, email, full_name, parent_label_id 
   FROM soundpub.profiles 
   WHERE email = 'YOUR_TEST_EMAIL@gmail.com';

   # Check role assigned
   SELECT user_id, role 
   FROM soundpub.user_roles 
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_TEST_EMAIL@gmail.com');

   # Exit psql
   \q
   ```

---

## ✅ SUCCESS CRITERIA

Google OAuth setup berhasil jika:

- ✅ Tombol "Masuk dengan Google" berfungsi
- ✅ Tidak ada error "Unable to exchange external code"
- ✅ User berhasil login dan masuk dashboard
- ✅ Profile dibuat di `soundpub.profiles`
- ✅ Role `artist` assigned di `soundpub.user_roles`
- ✅ `parent_label_id` diisi dengan Soundpub Music label
- ✅ Entry dibuat di `soundpub.artists`

---

## 🐛 TROUBLESHOOTING

### Problem: "Unable to exchange external code"

**Solution:**
- Pastikan `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` dan `SECRET` benar
- Pastikan redirect URI di Google Console sama persis dengan `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`
- Restart auth service: `docker compose restart auth`

### Problem: "redirect_uri_mismatch"

**Solution:**
- Buka Google Cloud Console → Credentials
- Edit OAuth client ID
- Tambahkan exact redirect URI: `https://supabase.carubra.com/auth/v1/callback`

### Problem: Auth service tidak restart

**Solution:**
```bash
docker compose logs auth | tail -50
# Check for errors
```

### Problem: User created but no role assigned

**Solution:**
- Check trigger function: `soundpub.handle_new_user()`
- Run migration: `20260727094500_fix_auto_artist_role_assignment.sql`

---

## 📝 CHECKLIST

Before testing, verify:
- [ ] Google OAuth credentials copied
- [ ] `.env` file updated with correct values
- [ ] `.env` file backed up
- [ ] Auth service restarted
- [ ] No errors in `docker compose logs auth`
- [ ] Redirect URIs match exactly in Google Console and `.env`

---

## 🔐 SECURITY NOTES

- **NEVER** commit `.env` file to Git
- **NEVER** share Client Secret publicly
- Keep backup of `.env` file in secure location
- Use environment-specific credentials (dev vs production)

---

**Last Updated:** 2026-07-27  
**Author:** Kiro AI
