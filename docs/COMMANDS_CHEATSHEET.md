# 📋 COPY-PASTE COMMANDS - Docker Migration

Salin dan jalankan command-command ini sesuai urutan.

---

## 🖥️ DARI WINDOWS (PowerShell)

### 1. Upload file migrasi ke server
```powershell
scp migrations-complete\002_auth_verification_system_v2.sql maskhar@supabase-server:~/migration_002.sql
```

### 2. SSH ke server
```powershell
ssh maskhar@supabase-server
```

---

## 🐧 DI SERVER LINUX (setelah SSH)

### 3. Check Docker containers
```bash
docker ps | grep supabase
```

### 4. Jalankan migrasi
```bash
docker exec -i supabase-db psql -U postgres -d postgres < ~/migration_002.sql
```

### 5. Verifikasi - Check kolom baru
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='Soundpub' AND table_name='profiles' AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');"
```

**Expected output:** 3 rows

### 6. Verifikasi - Check table baru
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT table_name FROM information_schema.tables WHERE table_schema='Soundpub' AND table_name IN ('auth_events', 'rate_limits');"
```

**Expected output:** 2 rows

### 7. Verifikasi - Check functions
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema='Soundpub' AND routine_name LIKE '%rate_limit%' OR routine_name LIKE '%cleanup%';"
```

**Expected output:** 4 functions

### 8. Cleanup file migrasi
```bash
rm ~/migration_002.sql
```

---

## 🔧 KONFIGURASI ENVIRONMENT (OPSIONAL tapi RECOMMENDED)

### 9. Navigate ke docker directory
```bash
cd ~/docker/supabase/supabase-1.26.05/docker
```

### 10. Edit docker-compose.yml
```bash
nano docker-compose.yml
```

**Tambahkan di section `functions > environment`:**
```yaml
DATABASE_SCHEMA: "Soundpub"
SUPABASE_URL: "https://supabase.carubra.com"
APP_URL: "https://dashboard.Soundpub.com"
```

### 11. Restart functions container
```bash
docker compose restart functions
```

### 12. Check logs
```bash
docker compose logs -f functions --tail=50
```

Press `Ctrl+C` untuk stop watching logs.

---

## 🧪 TESTING (OPSIONAL)

### Test query - Check struktur table profiles
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d Soundpub.profiles"
```

### Test query - Check auth_events table
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d Soundpub.auth_events"
```

### Test query - Insert test auth event
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "INSERT INTO Soundpub.auth_events (event_type, user_id, ip_address, user_agent) VALUES ('test_event', gen_random_uuid(), '127.0.0.1', 'Test Agent');"
```

### Test query - Check test event
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT * FROM Soundpub.auth_events WHERE event_type='test_event' ORDER BY created_at DESC LIMIT 1;"
```

### Test query - Delete test event
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "DELETE FROM Soundpub.auth_events WHERE event_type='test_event';"
```

---

## 🐛 TROUBLESHOOTING COMMANDS

### Check container status
```bash
docker ps -a | grep supabase
```

### Check container logs
```bash
docker logs supabase-db --tail=50
```

### Restart database container (if needed)
```bash
cd ~/docker/supabase/supabase-1.26.05/docker
docker compose restart db
```

### Enter PostgreSQL shell interactively
```bash
docker exec -it supabase-db psql -U postgres -d postgres
```

Dalam psql shell:
```sql
-- Switch to Soundpub schema
SET search_path TO Soundpub;

-- List all tables
\dt

-- List all functions
\df

-- Check a table structure
\d profiles

-- Exit
\q
```

### Check database connection
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT version();"
```

### Check current schemas
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"
```

### Check if Soundpub schema exists
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name='Soundpub';"
```

---

## 🔐 SECURITY CHECKS (OPSIONAL)

### Check RLS policies on profiles
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT schemaname, tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname='Soundpub' AND tablename='profiles';"
```

### Check RLS policies on auth_events
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT schemaname, tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname='Soundpub' AND tablename='auth_events';"
```

### Check indexes on profiles
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='Soundpub' AND tablename='profiles';"
```

---

## 📊 MONITORING QUERIES

### Count total profiles
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) as total_profiles FROM Soundpub.profiles;"
```

### Count verified vs unverified users
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT email_verified, COUNT(*) as count FROM Soundpub.profiles GROUP BY email_verified;"
```

### Check recent auth events
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT event_type, COUNT(*) as count FROM Soundpub.auth_events WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY event_type ORDER BY count DESC;"
```

### Check active rate limits
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT identifier, action_type, attempt_count, blocked_until FROM Soundpub.rate_limits WHERE blocked_until > NOW();"
```

---

## ✅ VERIFICATION CHECKLIST

Centang setelah berhasil:

- [ ] Migration file uploaded ke server
- [ ] Migration dijalankan tanpa error
- [ ] 3 kolom baru ada di profiles table
- [ ] 2 table baru (auth_events, rate_limits) terbuat
- [ ] 4 utility functions terbuat
- [ ] Environment variables di-set (opsional)
- [ ] Functions container di-restart (opsional)
- [ ] Test queries berhasil

---

## 🎯 NEXT STEPS

Setelah semua checklist di atas selesai:

1. ✅ **Kembali ke Windows** - Test aplikasi dashboard
2. ✅ **Test Signup** - Coba daftar dengan email baru
3. ✅ **Test Forgot Password** - Coba reset password
4. ✅ **Deploy Edge Functions** - Update functions yang berhubungan dengan auth

---

## 📞 HELP

Jika ada masalah, cek file-file ini:

- `MIGRATION_DOCKER_GUIDE.md` - Panduan lengkap
- `QUICK_START_DOCKER_MIGRATION.md` - Quick start guide
- `docs/BUG_FIXES_AND_SOLUTIONS.md` - Bug fixes & solutions

**Semoga berhasil! 🎵**
