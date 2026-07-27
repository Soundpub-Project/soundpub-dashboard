# Testing Checklist - Media Library Fixes

## Pre-Deployment Checklist
- [x] Code changes applied to `src/pages/MediaLibrary.tsx`
- [x] Migration file created: `20260727000001_fix_release_covers_bucket.sql`
- [x] Build successful without errors
- [x] TypeScript compilation passed

## Deployment Steps

### 1. Apply Database Migration
Login ke Supabase Dashboard dan jalankan SQL berikut:

```sql
-- Fix release-covers bucket to be private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'release-covers';
```

Atau jika menggunakan Supabase CLI:
```bash
supabase db push
```

### 2. Deploy Code Changes
```bash
# Build production
npm run build

# Deploy (sesuaikan dengan deployment method Anda)
# contoh: vercel deploy --prod
```

## Post-Deployment Testing

### Test 1: Cover Images Tab
1. Buka http://localhost:8182/dashboard/media-library (atau URL production)
2. Click tab "Cover Images"
3. **Expected**: 
   - Files muncul dengan thumbnails
   - Tidak ada badge "URL tidak tersedia"
   - Button "Lihat file" dan "Download" tidak disabled
4. **Check Console**: Lihat apakah ada error log

### Test 2: Full Audio Tab
1. Click tab "Full Audio"
2. **Expected**:
   - Audio files muncul dengan icon
   - Tidak ada badge "URL tidak tersedia"
   - Button "Lihat file" dan "Download" tidak disabled
3. Try click "Download" pada salah satu file
4. **Check Console**: Lihat apakah ada error log

### Test 3: Audio Clips Tab
1. Click tab "Audio Clips"
2. **Expected**:
   - Clips muncul (ini public bucket, jadi lebih mudah)
   - Semua buttons berfungsi

### Test 4: Scan Orphan Files
1. Click tombol "Scan Orphan Files" 
2. Wait for scan to complete
3. **Expected**:
   - Toast notification muncul dengan hasil scan
   - Tab "Orphan Files" menunjukkan jumlah yang benar
4. **Check Console Logs**:
   ```
   Total files found: <number>
   Referenced URLs: <number>
   Orphan found: <bucket>:<filename> (untuk setiap orphan)
   ```
5. Click tab "Orphan Files"
6. **Expected**:
   - List orphan files muncul jika ada
   - Setiap file menunjukkan reason: "Tidak ada referensi di database"

### Test 5: Delete File
1. Pilih salah satu file (sebaiknya orphan file)
2. Click icon trash
3. Confirm delete
4. **Expected**:
   - File terhapus dari list
   - Toast notification "File berhasil dihapus"
   - Stats counter berkurang

## Debug Console Logs

Buka browser console (F12) dan cari logs berikut:

### Normal Operation Logs:
```
Total files found: X
Referenced URLs: Y
```

### Error Logs (jika ada masalah):
```
Error creating signed URL for <bucket>/<path>: <error message>
Exception creating signed URL for <bucket>/<path>: <error message>
Error listing files in bucket <bucket>: <error message>
```

### Orphan Detection Logs:
```
Orphan found: release-covers:path/to/file.jpg
Orphan found: track-audio:some-audio.wav
```

## Common Issues & Solutions

### Issue: "URL tidak tersedia" badge masih muncul
**Solution**:
- Check console untuk error message
- Verify RLS policies di Supabase untuk bucket tersebut
- Pastikan user memiliki permission SELECT pada storage.objects

### Issue: Orphan scan tidak menemukan file apapun
**Solution**:
- Check console log "Total files found"
- Jika 0, check RLS policies untuk storage.objects SELECT
- Verify bucket names di code match dengan database

### Issue: Files tidak muncul sama sekali
**Solution**:
- Check network tab di browser DevTools
- Verify Supabase connection (check .env.local)
- Check auth status (pastikan user sudah login sebagai admin)

## Rollback Plan

Jika ada masalah critical setelah deployment:

### 1. Rollback Migration (jika perlu)
```sql
-- Kembalikan release-covers ke public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'release-covers';
```

### 2. Rollback Code
```bash
git revert <commit-hash>
npm run build
# Deploy previous version
```

## Success Criteria
- ✅ Semua tabs menampilkan files dengan benar
- ✅ Cover images preview terlihat
- ✅ Tidak ada "URL tidak tersedia" error
- ✅ Scan Orphan Files berjalan dan menampilkan hasil
- ✅ Delete file functionality berfungsi
- ✅ Stats counter akurat
