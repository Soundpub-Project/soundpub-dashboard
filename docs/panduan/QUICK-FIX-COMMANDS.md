# Quick Commands - Fix _env to .env di Supabase Server

## Copy-Paste Commands (Urutan dari atas ke bawah)

### 1. Masuk ke direktori Supabase
```bash
cd ~/docker/supabase/supabase/docker
```

### 2. Cek file apa yang ada
```bash
ls -la | grep -E "^-.*env"
```

**Expected:** Akan muncul file `_env` atau `.env` atau keduanya

---

### 3. Backup file .env jika sudah ada (opsional tapi recommended)
```bash
[ -f .env ] && cp .env .env.backup.$(date +%s) && echo "Backup created" || echo "No existing .env to backup"
```

### 4. Rename _env menjadi .env
```bash
[ -f _env ] && mv _env .env && echo "Renamed _env to .env" || echo "File _env not found"
```

### 5. Verify file .env sekarang ada
```bash
ls -la .env
```

**Expected output:**
```
-rw-r--r-- 1 maskhar maskhar 3456 Jul 26 19:00 .env
```

### 6. Cek isi file .env (preview 20 baris pertama)
```bash
head -20 .env
```

**Expected:** Harus berisi environment variables seperti:
- POSTGRES_PASSWORD=...
- JWT_SECRET=...
- ANON_KEY=...
- SERVICE_ROLE_KEY=...

---

## Jika File .env Kosong atau Tidak Lengkap

### Download template dari GitHub
```bash
curl -o .env https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example
```

### Atau copy dari .env.example jika ada
```bash
cp .env.example .env
```

### Edit file .env
```bash
nano .env
```

**Minimal isi variabel ini:**
- `POSTGRES_PASSWORD` - password kuat untuk database
- `JWT_SECRET` - random string 32+ karakter
- `ANON_KEY` - JWT token (generate di jwt.io)
- `SERVICE_ROLE_KEY` - JWT token (generate di jwt.io)
- `DASHBOARD_USERNAME` - username untuk dashboard
- `DASHBOARD_PASSWORD` - password untuk dashboard
- `SITE_URL=https://web.maskhar.com`
- `API_EXTERNAL_URL=https://supabase.carubra.com`
- `SUPABASE_PUBLIC_URL=https://supabase.carubra.com`

**Google OAuth variables:**
- `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`
- `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com`
- `GOTRUE_EXTERNAL_GOOGLE_SECRET=YOUR_CLIENT_SECRET`

Save dengan `Ctrl+O` lalu `Enter`, exit dengan `Ctrl+X`

---

## Restart Supabase

### Stop semua services
```bash
docker compose down
```

### Start semua services
```bash
docker compose up -d
```

### Tunggu 30 detik untuk initialization
```bash
sleep 30
```

### Cek status semua services
```bash
docker compose ps
```

**Expected:** Semua services `Up` dan `healthy`, tidak ada yang `unhealthy`

---

## Verifikasi dan Troubleshooting

### Cek logs database (untuk error POSTGRES_PASSWORD)
```bash
docker compose logs db | tail -50
```

### Cek logs auth (untuk error JWT_SECRET)
```bash
docker compose logs auth | tail -50
```

### Cek logs semua services realtime
```bash
docker compose logs -f
```

(Tekan `Ctrl+C` untuk exit)

### Cek environment variables di dalam container Kong
```bash
docker compose exec kong env | grep -E "ANON_KEY|JWT_SECRET|POSTGRES"
```

**Expected:** Harus muncul nilai-nilai yang Anda isi di .env, BUKAN blank

### Cek container mana yang unhealthy
```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Health}}"
```

### Restart service spesifik yang bermasalah (contoh: auth)
```bash
docker compose restart auth
sleep 10
docker compose ps
```

---

## One-Liner: Full Fix Sequence

Copy-paste ini jika Anda yakin file `_env` sudah ada dan lengkap:

```bash
cd ~/docker/supabase/supabase/docker && \
[ -f .env ] && cp .env .env.backup.$(date +%s) && \
[ -f _env ] && mv _env .env && \
docker compose down && \
docker compose up -d && \
sleep 30 && \
docker compose ps
```

**Breakdown:**
1. Masuk ke direktori Supabase
2. Backup .env jika ada
3. Rename _env ke .env jika ada
4. Stop services
5. Start services
6. Tunggu 30 detik
7. Show status

---

## Generate Secrets (Jika .env Kosong)

### Generate random 32-character string untuk JWT_SECRET
```bash
openssl rand -base64 32
```

### Generate random 32-character string untuk POSTGRES_PASSWORD
```bash
openssl rand -base64 24
```

### Generate random 32-character string untuk VAULT_ENC_KEY
```bash
openssl rand -base64 32
```

Copy output ini dan paste ke file .env untuk variabel terkait.

---

## Test Akses Setelah Fix

### Test dashboard
```bash
curl -I https://supabase.carubra.com
```

**Expected:** HTTP 200 atau 302 (redirect to login)

### Test API health
```bash
curl https://supabase.carubra.com/rest/v1/
```

**Expected:** JSON response dengan API info

### Test dari browser
1. Buka https://supabase.carubra.com
2. Login dengan DASHBOARD_USERNAME dan DASHBOARD_PASSWORD
3. Pergi ke Authentication > Providers
4. Enable Google dan isi Client ID & Secret
5. Save

### Test aplikasi
1. Buka https://web.maskhar.com
2. Klik tombol "Login with Google"
3. Pilih akun Google
4. Seharusnya berhasil login

---

## Monitoring

### Watch status realtime (auto-refresh setiap 5 detik)
```bash
watch -n 5 'docker compose ps'
```

(Tekan `Ctrl+C` untuk exit)

### Monitor logs realtime dengan timestamp
```bash
docker compose logs -f --timestamps
```

### Cek resource usage
```bash
docker stats
```

---

## Rollback Jika Ada Masalah

### Restore backup .env
```bash
# List semua backup
ls -la .env.backup.*

# Restore backup terbaru
LATEST_BACKUP=$(ls -t .env.backup.* | head -1)
cp $LATEST_BACKUP .env
echo "Restored from $LATEST_BACKUP"

# Restart
docker compose down && docker compose up -d
```

### Reset semua (WARNING: HAPUS SEMUA DATA!)
```bash
docker compose down -v
docker compose up -d
```

---

## Checklist - Semua Sudah OK?

- [ ] File `_env` sudah di-rename jadi `.env`
- [ ] `ls -la .env` berhasil (file exists)
- [ ] `head .env` menampilkan environment variables (bukan kosong)
- [ ] `docker compose ps` - semua services `Up` dan `healthy`
- [ ] `docker compose logs db` - tidak ada error "POSTGRES_PASSWORD is not set"
- [ ] `docker compose logs auth` - tidak ada error "JWT_SECRET is not set"
- [ ] Dashboard bisa diakses: https://supabase.carubra.com
- [ ] Bisa login ke dashboard dengan DASHBOARD_USERNAME/PASSWORD
- [ ] Google OAuth enabled di dashboard (Authentication > Providers)
- [ ] Aplikasi bisa login Google: https://web.maskhar.com

Jika semua ✓ berarti **SUKSES!**

---

## Contact / Get Help

Jika masih ada error setelah ikuti semua langkah di atas, kirimkan output dari:

```bash
cd ~/docker/supabase/supabase/docker
echo "=== Directory listing ===" && ls -la && \
echo -e "\n=== .env file preview ===" && head -20 .env && \
echo -e "\n=== Docker compose status ===" && docker compose ps && \
echo -e "\n=== DB logs ===" && docker compose logs db --tail=30 && \
echo -e "\n=== Auth logs ===" && docker compose logs auth --tail=30
```

Copy semua output dan kirimkan untuk analisis lebih lanjut.

