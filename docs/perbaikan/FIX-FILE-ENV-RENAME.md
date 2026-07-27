# Panduan Fix: File _env vs .env di Supabase Server

## Masalah

Di server Supabase, file environment ada tapi bernama **`_env`** (underscore) bukan **`.env`** (dot).

Docker Compose **hanya membaca file `.env`**, bukan `_env`. Makanya semua environment variables tidak ter-load.

---

## Solusi Cepat

SSH ke server Supabase dan jalankan:

```bash
cd ~/docker/supabase/supabase/docker

# Rename file _env menjadi .env
mv _env .env

# Verifikasi file .env sekarang ada
ls -la .env

# Restart Supabase
docker compose down
docker compose up -d

# Cek status
docker compose ps
```

---

## Penjelasan Detail

### Kenapa File Bernama _env?

Kemungkinan penyebabnya:

1. **Salah upload** - file aslinya `.env` tapi saat upload jadi `_env`
2. **Git ignore** - `.env` di-gitignore, jadi di-rename jadi `_env` untuk version control
3. **Typo manual** - salah ketik saat membuat file

### Kenapa Docker Compose Tidak Baca _env?

Docker Compose by default **hanya mencari file bernama `.env`** di direktori yang sama dengan `docker-compose.yml`.

File dengan nama lain seperti `_env`, `env`, `.env.local` **TIDAK akan dibaca otomatis**.

### Cara Alternatif: Gunakan --env-file

Jika Anda tetap ingin menggunakan nama `_env`:

```bash
docker compose --env-file _env up -d
```

Tapi cara ini **TIDAK recommended** karena Anda harus selalu tambahkan `--env-file _env` setiap kali jalankan docker compose command.

**Lebih baik rename jadi `.env`** supaya standar.

---

## Verifikasi Setelah Rename

### 1. Cek File .env Ada dan Readable

```bash
cd ~/docker/supabase/supabase/docker
ls -la .env
```

Expected output:
```
-rw-r--r-- 1 maskhar maskhar 3456 Jul 26 19:00 .env
```

### 2. Cek Isi File .env

```bash
head -20 .env
```

Pastikan berisi environment variables seperti:
```
POSTGRES_PASSWORD=...
JWT_SECRET=...
ANON_KEY=...
SERVICE_ROLE_KEY=...
```

### 3. Test Load Environment Variables

```bash
# Load .env ke shell
set -a
source .env
set +a

# Cek apakah POSTGRES_PASSWORD ter-load
echo $POSTGRES_PASSWORD
```

Jika output-nya **bukan kosong**, berarti .env berhasil di-load.

### 4. Restart Supabase dan Cek Status

```bash
docker compose down
docker compose up -d

# Tunggu 30 detik, lalu cek status
sleep 30
docker compose ps
```

**Expected result:**
Semua services harus **Up** dan **healthy**, tidak ada yang **unhealthy** atau **starting**.

### 5. Cek Logs untuk Konfirmasi

```bash
# Cek log database - seharusnya tidak ada error "POSTGRES_PASSWORD is not set"
docker compose logs db | grep -i "password"

# Cek log auth - seharusnya tidak ada error "JWT_SECRET is not set"
docker compose logs auth | grep -i "jwt"

# Cek semua logs jika masih ada issue
docker compose logs -f
```

---

## Troubleshooting Lanjutan

### Issue 1: File .env Ada Tapi Masih Error "variable is not set"

**Penyebab:** File .env kosong atau format salah.

**Solusi:**
```bash
# Cek ukuran file
ls -lh .env

# Jika ukuran 0 bytes atau sangat kecil, berarti file kosong
# Download template dari GitHub
curl -o .env https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example

# Edit dan isi semua variabel wajib
nano .env
```

### Issue 2: Permission Denied saat Rename

**Penyebab:** User tidak punya permission write di direktori.

**Solusi:**
```bash
# Cek permission direktori
ls -la ~/docker/supabase/supabase/docker

# Jika owner bukan user Anda, ubah ownership
sudo chown -R $USER:$USER ~/docker/supabase/supabase/docker

# Lalu rename lagi
mv _env .env
```

### Issue 3: File .env Sudah Benar Tapi Database Masih Unhealthy

**Penyebab:** Data di volume PostgreSQL corrupt atau ada conflict.

**Solusi (WARNING: Ini akan HAPUS semua data!):**
```bash
docker compose down -v  # -v flag akan hapus volumes
docker compose up -d
```

Jika tidak ingin hapus data:
```bash
# Stop hanya database
docker compose stop db

# Hapus hanya database container (keep volume)
docker compose rm -f db

# Start lagi
docker compose up -d db

# Tunggu 30 detik, cek status
sleep 30
docker compose ps
```

### Issue 4: Environment Variables Masih Blank di Container

**Verifikasi env vars di dalam container:**
```bash
# Masuk ke container Kong (API Gateway)
docker compose exec kong env | grep -E "ANON_KEY|JWT_SECRET"

# Masuk ke container Auth
docker compose exec auth env | grep -E "JWT_SECRET|GOTRUE"
```

Jika masih blank, berarti `.env` tidak ter-load. Pastikan:
- File `.env` ada di direktori yang **sama** dengan `docker-compose.yml`
- Nama file **persis** `.env` (case-sensitive, dengan dot di depan)
- File bukan symlink (harus file real)

---

## Checklist After Fix

- [ ] File `_env` sudah di-rename jadi `.env`
- [ ] File `.env` readable (ls -la .env berhasil)
- [ ] File `.env` berisi environment variables (tidak kosong)
- [ ] `docker compose down` dan `docker compose up -d` berhasil tanpa warning
- [ ] Semua container status **Up** dan **healthy** (bukan unhealthy)
- [ ] Tidak ada error log "variable is not set"
- [ ] Dashboard bisa diakses di https://supabase.carubra.com
- [ ] Aplikasi bisa login Google di https://web.maskhar.com

---

## Next Steps Setelah Fix

Setelah Supabase berjalan normal:

1. **Backup file .env**
   ```bash
   cp .env .env.backup
   ```

2. **Setup Google OAuth** (jika belum)
   - Login ke dashboard Supabase
   - Pergi ke Authentication > Providers
   - Enable Google dan masukkan Client ID & Secret

3. **Test semua fitur** di aplikasi web Anda

4. **Setup monitoring** (optional)
   ```bash
   # Watch status realtime
   watch -n 5 'docker compose ps'
   ```

---

## Kontak

Jika masih ada masalah setelah ikuti panduan ini, kirimkan:
1. Output dari: `ls -la ~/docker/supabase/supabase/docker`
2. Output dari: `docker compose ps`
3. Output dari: `docker compose logs --tail=50`

