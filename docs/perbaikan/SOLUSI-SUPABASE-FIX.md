# Panduan Memperbaiki Supabase Self-Hosted

## Masalah yang Terjadi

Dari error log yang Anda berikan, masalahnya jelas:

1. **131+ environment variables tidak ter-set** - semua defaulting ke blank string
2. **Container supabase-db UNHEALTHY** - database gagal start
3. **Dependency failed** - semua service lain tidak bisa start karena database down

## Root Cause

File .env tidak ditemukan atau tidak di-load oleh docker compose di direktori:
`
~/docker/supabase/supabase/docker/
`

## Solusi Step-by-Step

### 1. Cek Apakah File .env Ada

Jalankan di server Supabase:
`ash
cd ~/docker/supabase/supabase/docker
ls -la .env
`

Jika file tidak ada atau kosong, lanjut ke step 2.

### 2. Generate File .env Baru

Supabase menyediakan template .env.example. Copy dan edit:

`ash
cd ~/docker/supabase/supabase/docker
cp .env.example .env
`

Atau jika tidak ada .env.example, download dari repository resmi:

`ash
curl -o .env https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example
`

### 3. Edit Environment Variables Penting

Buka file .env dan edit minimal variabel berikut:

`ash
nano .env
`

**Variabel Wajib:**

`ash
# Database Password (ganti dengan password kuat)
POSTGRES_PASSWORD=YourSuperSecretPostgresPassword123!

# JWT Secret (generate random 32+ karakter)
JWT_SECRET=YourSuperSecretJWTTokenWith32CharactersOrMore

# API Keys (generate dari https://supabase.com/docs/guides/self-hosting#api-keys)
ANON_KEY=your-generated-anon-key
SERVICE_ROLE_KEY=your-generated-service-role-key

# Dashboard Credentials
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=YourSecureDashboardPassword123!

# Public URLs
SITE_URL=https://web.maskhar.com
API_EXTERNAL_URL=https://supabase.carubra.com
SUPABASE_PUBLIC_URL=https://supabase.carubra.com

# Database Config
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# API Config
PGRST_DB_SCHEMAS=public,storage,graphql_public

# Kong Ports
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# Google OAuth (dari Google Cloud Console)
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=YOUR_CLIENT_SECRET
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.carubra.com/auth/v1/callback

# Storage Config
STORAGE_TENANT_ID=stub
GLOBAL_S3_BUCKET=supabase-storage
REGION=us-east-1
S3_PROTOCOL_ACCESS_KEY_ID=stub
S3_PROTOCOL_ACCESS_KEY_SECRET=stub

# Vault & Meta Keys (generate random 32+ karakter)
VAULT_ENC_KEY=YourSuperSecretVaultKey32CharactersOrMore
PG_META_CRYPTO_KEY=YourSuperSecretPGMetaKey32CharactersOrMore
SECRET_KEY_BASE=YourSuperSecretKeyBase32CharactersOrMore

# Pooler Config
POOLER_TENANT_ID=stub
POOLER_DB_POOL_SIZE=20
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_PROXY_PORT_TRANSACTION=6543

# ImgProxy
IMGPROXY_AUTO_WEBP=true

# Email Config (optional, bisa diisi nanti)
SMTP_ADMIN_EMAIL=admin@maskhar.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
`

### 4. Generate API Keys (Anon & Service Role)

Gunakan tool online atau command berikut untuk generate JWT:

**Cara 1: Menggunakan Supabase CLI**
`ash
npx supabase gen keys --anon > anon_key.txt
npx supabase gen keys --service-role > service_role_key.txt
`

**Cara 2: Menggunakan JWT.io**
1. Buka https://jwt.io
2. Untuk **ANON_KEY**, payload:
`json
{
  "iss": "supabase",
  "role": "anon",
  "exp": 1983812996
}
`
3. Untuk **SERVICE_ROLE_KEY**, payload:
`json
{
  "iss": "supabase",
  "role": "service_role",
  "exp": 1983812996
}
`
4. Gunakan JWT_SECRET yang sama untuk signing

### 5. Restart Supabase Services

Stop semua container dan hapus volume (HATI-HATI: ini akan menghapus data):

`ash
cd ~/docker/supabase/supabase/docker
docker compose down -v
docker compose up -d
`

Jika tidak ingin menghapus data, cukup restart:

`ash
docker compose down
docker compose up -d
`

### 6. Verifikasi Services Running

Cek status semua container:

`ash
docker compose ps
`

Semua services harus status **Up** dan **healthy**.

### 7. Cek Logs Jika Masih Error

`ash
# Cek log database
docker compose logs db

# Cek log auth
docker compose logs auth

# Cek semua logs
docker compose logs -f
`

### 8. Test Akses Dashboard

Buka browser dan akses:
`
https://supabase.carubra.com
`

Login dengan DASHBOARD_USERNAME dan DASHBOARD_PASSWORD yang Anda set di .env.

### 9. Konfigurasi Google OAuth di Supabase Dashboard

Setelah login ke dashboard:

1. Pergi ke **Authentication > Providers**
2. Enable **Google**
3. Masukkan **Client ID** dan **Client Secret** dari Google Cloud Console
4. Save

### 10. Test Google OAuth di Aplikasi

Buka aplikasi Anda di https://web.maskhar.com dan test login dengan Google.

---

## Checklist Verifikasi

- [ ] File .env ada di ~/docker/supabase/supabase/docker/
- [ ] Semua environment variables wajib sudah diisi
- [ ] JWT_SECRET, POSTGRES_PASSWORD, dan keys lainnya sudah diisi dengan nilai kuat
- [ ] Google OAuth Client ID dan Secret sudah diisi
- [ ] docker compose up -d berhasil tanpa error
- [ ] Semua container status **Up** dan **healthy**
- [ ] Dashboard bisa diakses di https://supabase.carubra.com
- [ ] Google OAuth enabled di dashboard
- [ ] Authorized redirect URI di Google Cloud Console: https://supabase.carubra.com/auth/v1/callback
- [ ] Test login dengan Google berhasil

---

## Troubleshooting

### Error: "POSTGRES_PASSWORD variable is not set"
- Pastikan file .env ada di direktori yang sama dengan docker-compose.yml
- Pastikan tidak ada typo di nama file (harus .env, bukan env atau .env.local)

### Error: "supabase-db is unhealthy"
- Cek log: docker compose logs db
- Biasanya karena POSTGRES_PASSWORD tidak ter-set atau port 5432 sudah dipakai
- Coba hapus volume: docker compose down -v (WARNING: menghapus data!)

### Error: "Unable to exchange external code" saat Google OAuth
- Pastikan GOTRUE_EXTERNAL_GOOGLE_* variables sudah diisi di .env
- Restart service auth: docker compose restart auth
- Verifikasi Google Cloud Console redirect URI: https://supabase.carubra.com/auth/v1/callback

### Port sudah dipakai
- Cek port yang conflict: 
etstat -tulpn | grep :8000
- Edit KONG_HTTP_PORT dan KONG_HTTPS_PORT di .env jika perlu

---

## File Template

Saya sudah buat file supabase-env-template.env dengan semua environment variables yang diperlukan. Copy dan edit sesuai kebutuhan Anda.

