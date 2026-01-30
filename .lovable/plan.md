# Rencana Migrasi Storage: GCS ke Supabase Storage + VPS

## Status: ✅ Langkah 1-2 Selesai

---

## Ringkasan Perubahan

### ✅ Langkah 1: Upload Diubah ke Supabase Storage

| File | Perubahan | Status |
|------|-----------|--------|
| `src/components/releases/MediaUploadSection.tsx` | `uploadToGCS()` → `uploadToSupabaseStorage()` | ✅ Selesai |
| `src/components/settings/SuperAdminSettings.tsx` | GCS logic dihapus, selalu pakai Supabase Storage | ✅ Selesai |

### ✅ Langkah 2: RLS Policies Dibuat

Policies dibuat untuk bucket:
- `track-audio` (private) - untuk full audio
- `audio-clips` (public) - untuk audio clips 30-60 detik  
- `release-covers` (private) - untuk cover images
- `label-logos` (public) - untuk logo dashboard dan favicon

Roles yang bisa upload:
- `superadmin`, `admin` - semua bucket
- `label`, `whitelabel` - track-audio, audio-clips, release-covers

---

## Langkah Selanjutnya (Opsional)

### Langkah 3: Sync ke VPS

Ada 2 opsi jika ingin file tersedia di VPS:

#### Opsi A: Manual Sync (Sederhana)
1. Download file dari Supabase Storage dashboard
2. Upload manual via FTP ke VPS
3. Update URL di database jika diperlukan

#### Opsi B: Automated Sync via Edge Function (Advanced)
Butuh setup di VPS:
1. Install web server (Nginx/Apache)
2. Buat API endpoint untuk menerima file
3. Edge Function akan POST file ke VPS setelah upload ke Supabase

### Langkah 4: Cleanup (Opsional)
- ❌ Hapus secrets GCS jika sudah tidak dipakai (`GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`)
- ❌ Hapus edge function `gcs-upload` dan `gcs-manage` jika tidak diperlukan
- ❌ Hapus `test-gcs` edge function

---

## Catatan Penting

1. **File lama di GCS** tidak otomatis pindah. URL lama tetap di database dan akan error jika GCS tidak bisa diakses.

2. **Untuk migrasi data lama**, kamu perlu:
   - Download file dari GCS (jika masih bisa akses)
   - Re-upload ke Supabase Storage
   - Update URL di database

3. **Supabase Storage gratis** hingga 1GB storage dan 2GB bandwidth per bulan.

4. **Bucket Access:**
   - `audio-clips` dan `label-logos` = PUBLIC (bisa diakses langsung)
   - `track-audio` dan `release-covers` = PRIVATE (perlu signed URL untuk akses eksternal)
