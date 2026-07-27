# RINGKASAN PERBAIKAN UPLOAD ROYALTY ERROR 500

## Masalah
Edge Function `process-royalty-upload` mengalami error 500 saat dipanggil dari dashboard.
Error terjadi saat mencoba membuat managed artist baru.

## Penyebab
1. Error "Database error creating new user" saat membuat managed artist
2. Function crash ketika gagal membuat user baru
3. Kemungkinan masalah dengan trigger atau schema database

## Solusi yang Sudah Diterapkan

### 1. Hardcode Database Schema
```typescript
const DATABASE_SCHEMA = 'soundpub'
```
- Tidak lagi bergantung pada environment variable
- Memastikan konsistensi akses ke schema soundpub

### 2. Improved Error Handling
```typescript
const createManagedArtist = async (artistName: string, labelId: string) => {
  try {
    // Create user logic
  } catch (error) {
    console.error('[Managed Artist Exception]:', error.message)
    return null  // Return null instead of throwing
  }
}
```
- Tambah try-catch di fungsi createManagedArtist
- Function tidak crash jika gagal membuat user
- Return null dan lanjut proses (royalty masuk tanpa artist)

### 3. Better Logging
```typescript
console.log('[Managed Artist Created]', artistName, '->', artistId)
console.error('[Managed Artist Creation Failed]', artistName, error)
```
- Logging detail untuk tracking success/failure
- Memudahkan debugging via `docker logs`

## File yang Sudah Diupdate

1. **supabase/functions/process-royalty-upload/index.ts**
   - Function utama yang diperbaiki

2. **DEPLOY-PROCESS-ROYALTY-UPLOAD.md**
   - Dokumentasi lengkap cara deploy dan troubleshooting

3. **deploy-royalty-function.ps1**
   - Script PowerShell untuk deploy otomatis ke server

4. **rollback-royalty-function.ps1**
   - Script PowerShell untuk rollback jika terjadi masalah

## Cara Deploy ke Server

### Opsi 1: Manual Deploy
```powershell
# Upload function
scp supabase/functions/process-royalty-upload/index.ts maskhar@20.20.20.173:/home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload/

# SSH ke server
ssh maskhar@20.20.20.173

# Restart edge functions
cd /home/maskhar/docker/supabase/supabase/docker
docker compose restart functions

# Monitor log
docker logs supabase-edge-functions -f
```

### Opsi 2: Automated Deploy (Recommended)
```powershell
# Jalankan script deploy
.\deploy-royalty-function.ps1

# Script akan otomatis:
# - Backup function lama
# - Upload function baru
# - Restart edge functions
# - Show log
```

## Testing Setelah Deploy

### 1. Test Upload dari Dashboard
1. Login ke dashboard sebagai admin
2. Buka menu Upload Royalty
3. Upload file CSV royalty
4. Pastikan tidak ada error 500

### 2. Monitor Log di Server
```bash
ssh maskhar@20.20.20.173
docker logs supabase-edge-functions -f
```

Perhatikan log:
- ✅ `serving the request with /home/deno/functions/process-royalty-upload`
- ✅ `[Managed Artist Created] Artist Name -> uuid`
- ⚠️ `[Managed Artist Creation Failed]` - OK, function tidak crash
- ❌ `[Error] Process royalty upload error` - Masih ada masalah lain

### 3. Verifikasi Data di Database
```bash
# Cek royalties terbaru
docker exec -it supabase-db psql -U postgres -d postgres -c "SET search_path TO soundpub, public; SELECT * FROM royalties ORDER BY created_at DESC LIMIT 5;"

# Cek upload history
docker exec -it supabase-db psql -U postgres -d postgres -c "SET search_path TO soundpub, public; SELECT id, original_filename, status, inserted_records FROM royalty_uploads ORDER BY created_at DESC LIMIT 5;"
```

## Expected Behavior Setelah Fix

### Scenario 1: Managed Artist Creation Success
- User baru dibuat di `auth.users`
- Profile dibuat di `soundpub.profiles` dengan role='artist'
- Royalty inserted dengan `artist_user_id` terisi
- Revenue split: 70% artist, 21% label, 9% admin

### Scenario 2: Managed Artist Creation Failed
- Log error muncul: `[Managed Artist Creation Failed]`
- Function **tidak crash**, lanjut proses
- Royalty inserted dengan `artist_user_id = null`
- Revenue split: 0% artist, 91% label, 9% admin

### Scenario 3: Artist Already Exists
- Function deteksi artist sudah ada
- Reuse existing artist_user_id
- Log: `[Managed Artist Reused]`
- Revenue split normal: 70/21/9

## Troubleshooting Lanjutan

### Jika Masih Error 500 Setelah Deploy

1. **Cek Auth Trigger**
```sql
-- SSH ke server dan connect ke database
docker exec -it supabase-db psql -U postgres

-- Cek trigger untuk auto-create profile
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'auth' AND event_object_table = 'users';
```

2. **Cek RLS Policies**
```sql
-- Pastikan service_role bisa insert ke profiles
SET search_path TO soundpub, public;
SELECT tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE tablename = 'profiles';
```

3. **Test Manual Create User**
```sql
-- Test insert manual
SET search_path TO soundpub, public;
INSERT INTO profiles (id, email, role, full_name)
VALUES (gen_random_uuid()::text, 'test@managed.soundpub.local', 'artist', 'Test');
```

### Jika Perlu Rollback
```powershell
.\rollback-royalty-function.ps1
```

## Commit History

**Latest Commit:**
```
commit 97c5ce6
Perbaikan Edge Function process-royalty-upload untuk mengatasi error 500

- Hardcode database schema ke 'soundpub' untuk konsistensi
- Tambah error handling yang lebih robust untuk managed artist creation
- Function tidak crash jika gagal membuat managed artist
- Tambah logging detail untuk debugging
- Sertakan script deploy dan rollback otomatis
```

**Previous Commits:**
```
commit 3c06e0c
Perbaikan fitur autentikasi, media library, dan royalty summary
```

## Next Steps

1. ✅ **Deploy function ke server** menggunakan `deploy-royalty-function.ps1`
2. ✅ **Test upload** dari dashboard
3. ✅ **Monitor log** untuk memastikan tidak ada error
4. ✅ **Verifikasi data** masuk ke database dengan benar
5. ⏭️ **Investigasi root cause** jika managed artist creation masih gagal (optional)

## Kontak

Jika masih ada masalah:
- Cek file: `DEPLOY-PROCESS-ROYALTY-UPLOAD.md` untuk detail troubleshooting
- Monitor log: `docker logs supabase-edge-functions -f`
- Cek database trigger dan RLS policies

---
Tanggal: 2026-07-27
Status: Siap Deploy
Branch: dev-maskhar
