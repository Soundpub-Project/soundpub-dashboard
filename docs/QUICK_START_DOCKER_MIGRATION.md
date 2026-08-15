# 🚀 QUICK START - Docker Migration

## Cara Tercepat: Jalankan di Server Supabase Anda

### 1️⃣ Upload file ke server

Dari Windows Anda:
```powershell
scp migrations-complete/002_auth_verification_system_v2.sql maskhar@supabase-server:~/migration_002.sql
scp run_migration_docker.sh maskhar@supabase-server:~/run_migration_docker.sh
```

### 2️⃣ SSH ke server

```bash
ssh maskhar@supabase-server
```

### 3️⃣ Jalankan migration

```bash
chmod +x run_migration_docker.sh
./run_migration_docker.sh
```

Atau langsung manual:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < migration_002.sql
```

### 4️⃣ Verifikasi hasilnya

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema='soundpub' 
  AND table_name='profiles' 
  AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');
"
```

**Expected:** 3 baris (email_verified, verification_token, password_reset_token)

---

## ✅ Selesai!

Setelah migrasi berhasil:

1. **Set environment variables** untuk Edge Functions
2. **Restart container** functions: `docker compose restart functions`
3. **Test** signup & reset password flow

---

## 🔧 Set Environment Variables

Edit file docker-compose.yml atau .env di server:

```bash
cd ~/docker/supabase/supabase-1.26.05/docker
nano docker-compose.yml
```

Tambahkan di section `functions`:

```yaml
functions:
  environment:
    DATABASE_SCHEMA: soundpub
    SUPABASE_URL: https://supabase.carubra.com
    APP_URL: https://your-dashboard-url.com
```

Lalu restart:

```bash
docker compose restart functions
```

---

## 📞 Troubleshooting

### Error: "permission denied"
```bash
# Login as postgres user
docker exec -it supabase-db psql -U postgres -d postgres
# Then run: GRANT ALTER ON soundpub.profiles TO authenticated;
```

### Error: "container not found"
```bash
# List containers
docker ps

# Check nama container yang tepat
# Ganti nama container jika berbeda
```

### Migration sudah pernah dijalankan?
Tidak masalah! Script migration ini idempotent (aman dijalankan berulang kali).

---

## 🎯 Yang Harus Dilakukan Selanjutnya

Setelah migrasi berhasil, ikuti checklist di:
- `docs/BUG_FIXES_AND_SOLUTIONS.md`
- `MIGRATION_DOCKER_GUIDE.md`

**Good luck! 🎵**
