# DIAGNOSIS & SOLUSI: Masalah File _env di Supabase

## 🔴 Masalah yang Teridentifikasi

```
Server: supabase-server (maskhar@supabase-server)
Path: ~/docker/supabase/supabase/docker/
Issue: File environment bernama "_env" (underscore) bukan ".env" (dot)
Impact: Docker Compose TIDAK membaca file _env
Result: 131+ environment variables tidak ter-set → Database unhealthy → Semua service down
```

---

## 🔍 Root Cause Analysis

### Mengapa Docker Compose Tidak Membaca _env?

Docker Compose memiliki **default behavior** untuk membaca environment variables:

1. **Priority order:**
   ```
   1. Environment variables di shell
   2. File .env di direktori docker-compose.yml
   3. Default values di docker-compose.yml
   ```

2. **File .env behavior:**
   - Docker Compose **HANYA** mencari file bernama `.env` (case-sensitive)
   - File dengan nama lain (`_env`, `env`, `.env.local`, dll) **TIDAK dibaca otomatis**
   - Harus eksplisit gunakan flag: `docker compose --env-file _env up`

3. **Akibat jika .env tidak ada:**
   ```
   ❌ POSTGRES_PASSWORD → blank string
   ❌ JWT_SECRET → blank string
   ❌ ANON_KEY → blank string
   ❌ SERVICE_ROLE_KEY → blank string
   ❌ 131+ variables lainnya → blank string
   ```

4. **Dampak cascading:**
   ```
   PostgreSQL cannot start → POSTGRES_PASSWORD blank
       ↓
   Database container UNHEALTHY
       ↓
   Auth service depends_on db → fails to start
       ↓
   REST API depends_on db → fails to start
       ↓
   Storage depends_on db → fails to start
       ↓
   Realtime depends_on db → fails to start
       ↓
   ALL SERVICES DOWN
   ```

---

## 🎯 Solusi Ringkas

### Opsi 1: Rename File (RECOMMENDED)

```bash
cd ~/docker/supabase/supabase/docker
mv _env .env
docker compose down
docker compose up -d
```

**Pros:**
- ✅ Standar Docker Compose convention
- ✅ Tidak perlu flag tambahan di setiap command
- ✅ Compatible dengan semua tools

**Cons:**
- ❌ Tidak ada (ini cara terbaik)

---

### Opsi 2: Gunakan --env-file Flag (NOT RECOMMENDED)

```bash
cd ~/docker/supabase/supabase/docker
docker compose --env-file _env up -d
```

**Pros:**
- ✅ Bisa pakai nama file custom

**Cons:**
- ❌ Harus ingat tambahkan `--env-file _env` di SETIAP command
- ❌ `docker compose ps`, `logs`, `restart` juga butuh flag yang sama
- ❌ Mudah lupa dan confusing
- ❌ Tidak standar

---

## 📋 Step-by-Step Fix Guide

### Step 1: Backup (Safety First)

```bash
cd ~/docker/supabase/supabase/docker

# Backup file _env (jika ada)
[ -f _env ] && cp _env _env.backup.$(date +%s)

# Backup file .env (jika sudah ada sebelumnya)
[ -f .env ] && cp .env .env.backup.$(date +%s)

echo "Backup complete"
```

### Step 2: Rename File

```bash
# Rename _env to .env
mv _env .env

# Verify
ls -la .env
```

**Expected output:**
```
-rw-r--r-- 1 maskhar maskhar 3456 Jul 26 19:00 .env
```

### Step 3: Verify File Content

```bash
# Check file size (should be > 1000 bytes)
ls -lh .env

# Preview first 30 lines
head -30 .env

# Check critical variables
grep -E "^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY)=" .env
```

**Expected:** Semua variabel di atas harus ada dan TIDAK blank

### Step 4: Restart Supabase

```bash
# Stop all services
docker compose down

# Start all services with new .env
docker compose up -d

# Wait for initialization
sleep 30

# Check status
docker compose ps
```

### Step 5: Verify All Services Healthy

```bash
# Should show all services as "Up" and "healthy"
docker compose ps

# Check logs for any errors
docker compose logs --tail=50

# Specific check for database
docker compose logs db | grep -i error

# Specific check for auth
docker compose logs auth | grep -i error
```

---

## 🧪 Testing & Verification

### Test 1: Environment Variables Loaded

```bash
# Check if POSTGRES_PASSWORD is loaded in container
docker compose exec db env | grep POSTGRES_PASSWORD

# Should output: POSTGRES_PASSWORD=your-actual-password
# NOT: POSTGRES_PASSWORD= (blank)
```

### Test 2: Database Connection

```bash
# Try to connect to PostgreSQL
docker compose exec db psql -U postgres -c "SELECT version();"

# Should return PostgreSQL version info
```

### Test 3: Auth Service

```bash
# Check auth service health
curl -s http://localhost:9999/health | jq .

# Should return: {"status":"ok"}
```

### Test 4: API Gateway

```bash
# Check Kong (API Gateway)
curl -I http://localhost:8000

# Should return: HTTP/1.1 404 (not 502 Bad Gateway)
```

### Test 5: Dashboard Access

```bash
# Check dashboard endpoint
curl -I https://supabase.carubra.com

# Should return: HTTP/2 200 or 302
```

### Test 6: Full Stack Test

1. **Browser → Dashboard**
   ```
   https://supabase.carubra.com
   Login: DASHBOARD_USERNAME / DASHBOARD_PASSWORD
   ```

2. **Browser → Application**
   ```
   https://web.maskhar.com
   Click: "Login with Google"
   ```

---

## 🐛 Troubleshooting Common Issues

### Issue 1: File .env Ada Tapi Masih Error

**Symptom:**
```
docker compose up -d
WARNING: The POSTGRES_PASSWORD variable is not set. Defaulting to a blank string.
```

**Diagnosis:**
```bash
# Check if .env is in correct directory
pwd
# Should output: /home/maskhar/docker/supabase/supabase/docker

# Check if docker-compose.yml is in same directory
ls -la docker-compose.yml .env
# Both should exist in same directory
```

**Solution:**
```bash
# Make sure .env is in SAME directory as docker-compose.yml
mv /path/to/.env $(pwd)/.env

# Restart
docker compose down && docker compose up -d
```

---

### Issue 2: Database Masih Unhealthy

**Symptom:**
```
docker compose ps
supabase-db  ... Up (unhealthy)
```

**Diagnosis:**
```bash
# Check database logs
docker compose logs db --tail=100

# Common errors:
# - "FATAL: password authentication failed"
# - "FATAL: database files are incompatible"
# - "FATAL: could not create shared memory segment"
```

**Solution A: Wrong password in old volume**
```bash
# Stop and remove volumes (WARNING: DATA LOSS!)
docker compose down -v

# Start fresh
docker compose up -d
```

**Solution B: Port conflict**
```bash
# Check if port 5432 is in use
sudo netstat -tulpn | grep 5432

# Kill the process or change POSTGRES_PORT in .env
```

**Solution C: Corrupt data**
```bash
# Backup and remove volume
docker compose down
docker volume ls | grep supabase
docker volume rm supabase_db_data
docker compose up -d
```

---

### Issue 3: Auth Service Error "JWT_SECRET not set"

**Symptom:**
```
docker compose logs auth
Error: JWT_SECRET environment variable is not set
```

**Diagnosis:**
```bash
# Check if JWT_SECRET is in .env
grep "^JWT_SECRET=" .env

# Check if loaded in container
docker compose exec auth env | grep JWT_SECRET
```

**Solution:**
```bash
# Generate new JWT_SECRET
openssl rand -base64 32 > /tmp/jwt_secret.txt

# Add to .env
echo "JWT_SECRET=$(cat /tmp/jwt_secret.txt)" >> .env

# Restart auth service
docker compose restart auth
```

---

### Issue 4: Google OAuth "Unable to exchange code"

**Symptom:**
Di aplikasi web, setelah login Google muncul error:
```
Unable to exchange external code: <error_description>
```

**Diagnosis:**
```bash
# Check Google OAuth config in .env
grep "GOTRUE_EXTERNAL_GOOGLE" .env
```

**Required variables:**
```bash
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=GOCSPX-xxxxxxxxxxxxx
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback
```

**Solution:**
1. Edit .env dan pastikan variabel di atas ada dan benar
2. Di Google Cloud Console, tambahkan Authorized redirect URI:
   ```
   https://supabase.carubra.com/auth/v1/callback
   ```
3. Restart auth service:
   ```bash
   docker compose restart auth
   ```

---

## 📊 Health Check Matrix

| Component | Check Command | Expected Output | Healthy? |
|-----------|--------------|-----------------|----------|
| File .env | `ls -la .env` | File exists, > 1KB | ✅/❌ |
| Variables | `grep -c "^[A-Z]" .env` | > 50 | ✅/❌ |
| Docker | `docker compose ps` | All "Up (healthy)" | ✅/❌ |
| Database | `docker compose exec db psql -U postgres -c "\l"` | List databases | ✅/❌ |
| Auth | `curl localhost:9999/health` | {"status":"ok"} | ✅/❌ |
| API | `curl -I localhost:8000` | HTTP/1.1 404 | ✅/❌ |
| Dashboard | `curl -I https://supabase.carubra.com` | HTTP/2 200 | ✅/❌ |
| App | Open https://web.maskhar.com | Page loads | ✅/❌ |

---

## 🎓 Lessons Learned

### Why This Happened

1. **Possible causes:**
   - Manual file creation with typo: `touch _env` instead of `touch .env`
   - File transfer issue: Windows → Linux (hidden file handling)
   - Git ignore workaround: `.env` di-ignore, jadi di-rename `_env` untuk track
   - Copy-paste from tutorial yang salah

2. **Prevention:**
   - Gunakan template resmi: `curl -o .env https://.../.env.example`
   - Double-check nama file: `ls -la .env` before docker compose
   - Automate dengan script

---

## 📚 References

**Official Docs:**
- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)

**Files Created:**
- `FIX-FILE-ENV-RENAME.md` - Panduan lengkap fix
- `QUICK-FIX-COMMANDS.md` - Copy-paste commands
- `fix-env-rename.sh` - Auto-fix script
- `SOLUSI-SUPABASE-FIX.md` - Dokumentasi general Supabase fix
- `supabase-env-template.env` - Template .env
- `generate-supabase-keys.sh` - Generate secrets script

---

## ✅ Success Criteria

Supabase dianggap **SUKSES** jika:

- [ ] File `.env` ada di `~/docker/supabase/supabase/docker/`
- [ ] File `.env` berisi 50+ environment variables
- [ ] `docker compose ps` menampilkan semua service **Up (healthy)**
- [ ] `docker compose logs` tidak ada error critical
- [ ] Dashboard accessible: https://supabase.carubra.com
- [ ] Bisa login ke dashboard dengan credentials dari .env
- [ ] Google OAuth enabled di dashboard (Authentication > Providers)
- [ ] Aplikasi bisa login Google: https://web.maskhar.com
- [ ] Tidak ada warning "variable is not set" saat `docker compose up`

---

## 🚀 Next Steps After Fix

1. **Enable Google OAuth di Dashboard**
   - Login: https://supabase.carubra.com
   - Go to: Authentication > Providers > Google
   - Enable dan masukkan Client ID & Secret
   - Save

2. **Test Aplikasi**
   - Buka: https://web.maskhar.com
   - Click: Login with Google
   - Verify: Login berhasil dan redirect ke dashboard

3. **Setup Monitoring (Optional)**
   ```bash
   # Realtime monitoring
   watch -n 5 'docker compose ps'
   
   # Log monitoring
   docker compose logs -f
   ```

4. **Backup .env**
   ```bash
   # Backup ke lokasi aman
   cp .env ~/.env.supabase.backup
   
   # Backup ke cloud (optional)
   # WARNING: Jangan upload ke public repo!
   ```

5. **Document Credentials**
   - Save DASHBOARD_USERNAME & PASSWORD di password manager
   - Save POSTGRES_PASSWORD
   - Save JWT_SECRET (untuk generate keys nanti)

---

**Status:** READY TO DEPLOY 🚀

Upload script `fix-env-rename.sh` ke server dan jalankan untuk auto-fix!

