# PANDUAN DEPLOY EDGE FUNCTION - PROCESS ROYALTY UPLOAD

## Perubahan yang Dilakukan

### 1. Fixed Database Schema
- Hardcode schema menjadi `soundpub` (tidak lagi bergantung pada environment variable)
- Ini memastikan konsistensi akses ke database

### 2. Improved Error Handling untuk Managed Artist
- Tambah try-catch block di fungsi `createManagedArtist`
- Jika gagal membuat user, function akan skip dan lanjut proses (tidak crash)
- Tambah logging yang lebih detail untuk debugging
- Return `null` jika gagal, bukan throw error

### 3. Better Logging
- Console log saat managed artist berhasil dibuat
- Console error saat gagal dengan detail error message
- Memudahkan troubleshooting via docker logs

## Cara Deploy ke Server Self-Hosted

### Step 1: Upload File Function ke Server

```powershell
# Dari local machine
scp supabase/functions/process-royalty-upload/index.ts maskhar@20.20.20.173:/home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload/
```

### Step 2: Restart Edge Function Service

```bash
# SSH ke server
ssh maskhar@20.20.20.173

# Masuk ke directory docker
cd /home/maskhar/docker/supabase/supabase/docker

# Restart edge functions
docker compose restart functions

# Cek status
docker compose ps functions
```

### Step 3: Verifikasi Function Running

```bash
# Cek log untuk memastikan tidak ada error startup
docker logs supabase-edge-functions --tail 20

# Seharusnya tidak ada error, hanya "main function started"
```

### Step 4: Test Upload dari Dashboard

1. Buka https://supabase.carubra.com/dashboard (atau URL dashboard Anda)
2. Login sebagai admin
3. Upload file CSV royalty
4. Perhatikan response - seharusnya tidak error 500 lagi

### Step 5: Monitor Log Saat Upload

```bash
# Di terminal server, monitor log real-time
docker logs supabase-edge-functions -f

# Anda akan melihat:
# - serving the request with /home/deno/functions/process-royalty-upload
# - [Managed Artist Created] NamaArtist -> uuid
# - atau [Managed Artist Creation Failed] jika gagal (tapi tidak crash)
```

## Troubleshooting

### Jika Masih Error 500

#### 1. Cek Environment Variables
```bash
docker inspect supabase-edge-functions | grep -A 20 "Env"
```

Pastikan ada:
- `SUPABASE_URL=http://kong:8000`
- `SUPABASE_SERVICE_ROLE_KEY=<key>`
- `SUPABASE_ANON_KEY=<key>`
- `SUPABASE_DB_URL=postgresql://postgres:kujuam123@db:5432/postgres`

#### 2. Cek Database Schema
```bash
# Connect ke postgres
docker exec -it supabase-db psql -U postgres

# List schemas
\dn

# Pastikan ada schema 'soundpub'
# Jika belum ada, create:
CREATE SCHEMA IF NOT EXISTS soundpub;

# Set search path
ALTER DATABASE postgres SET search_path TO soundpub, public;

# Exit
\q
```

#### 3. Cek Table Profiles di Schema Soundpub
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "SET search_path TO soundpub, public; SELECT id, email, role FROM profiles LIMIT 5;"
```

#### 4. Cek Auth Schema vs Soundpub Schema
Auth users ada di `auth.users` (default schema)
Profiles ada di `soundpub.profiles`

Pastikan ada trigger yang sync auth.users ke soundpub.profiles saat user baru dibuat.

```sql
-- Cek trigger
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'auth' 
  AND event_object_table = 'users';
```

#### 5. Manual Test Create User
```bash
# Test manual create user via psql
docker exec -it supabase-db psql -U postgres -d postgres

SET search_path TO soundpub, public;

-- Insert test profile
INSERT INTO soundpub.profiles (id, email, role, full_name)
VALUES (
  gen_random_uuid()::text,
  'test-artist@managed.soundpub.local',
  'artist',
  'Test Artist'
);

-- Jika error, cek message error
```

### Jika Managed Artist Creation Masih Gagal

Dengan versi baru ini, function tidak akan crash meskipun managed artist gagal dibuat.
Function akan:
1. Log error ke console
2. Return null untuk artist_user_id
3. Continue process dengan royalty tanpa artist (100% ke label)

### Log Error yang Perlu Dicari

```bash
docker logs supabase-edge-functions -f | grep -i "error\|failed"
```

Perhatikan:
- `[Managed Artist Creation Failed]` - User creation gagal
- `[Profile Update Failed]` - User created tapi profile update gagal
- `[Managed Artist Exception]` - Unexpected error

## Environment Variable yang Diperlukan (Opsional)

Jika ingin set DATABASE_SCHEMA via env var, edit docker-compose.yml:

```yaml
functions:
  environment:
    DATABASE_SCHEMA: soundpub
    SUPABASE_DB_SCHEMA: soundpub
```

Tapi dengan fix terbaru, ini tidak mandatory karena sudah hardcode di code.

## Verifikasi Setelah Deploy

### 1. Upload Test File
Buat CSV sederhana:
```csv
period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue
2024-01,USTEST123456,,Test Song,Test Artist,Test Label,Spotify,US,Stream,100,10.50
```

### 2. Cek Hasil di Database
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "SET search_path TO soundpub, public; SELECT * FROM royalties ORDER BY created_at DESC LIMIT 5;"
```

### 3. Cek Upload History
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "SET search_path TO soundpub, public; SELECT id, original_filename, status, inserted_records FROM royalty_uploads ORDER BY created_at DESC LIMIT 5;"
```

## Backup Function Lama (Jika Perlu Rollback)

```bash
# Sebelum deploy, backup function lama
ssh maskhar@20.20.20.173
cd /home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload
cp index.ts index.ts.backup.$(date +%Y%m%d_%H%M%S)
```

## Rollback Jika Perlu

```bash
ssh maskhar@20.20.20.173
cd /home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload
cp index.ts.backup.TIMESTAMP index.ts
docker compose restart functions
```

---
Dibuat: 2026-07-27
Status: Siap untuk deploy
File: supabase/functions/process-royalty-upload/index.ts
