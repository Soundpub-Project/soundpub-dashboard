

# Rencana Migrasi Storage: GCS ke Supabase Storage + VPS

## Ringkasan Masalah
GCS tidak bisa diakses karena masalah metode pembayaran. Solusi: gunakan **Supabase Storage** sebagai pengganti GCS untuk upload, dan **VPS** untuk serving file ke website eksternal (opsional).

---

## Langkah 1: Ubah Upload dari GCS ke Supabase Storage

### Yang Perlu Diubah

| File | Perubahan |
|------|-----------|
| `src/components/releases/MediaUploadSection.tsx` | Ganti `uploadToGCS()` dengan upload ke Supabase Storage |
| `src/components/settings/SuperAdminSettings.tsx` | Sudah pakai GCS untuk logo/favicon, perlu ubah ke Supabase Storage |

### Logic Baru untuk MediaUploadSection

```text
Browser -> Supabase Storage (bucket: track-audio, audio-clips)
         -> Dapat public URL dari Supabase
         -> Simpan URL ke database
```

### Buckets yang Sudah Tersedia
- `track-audio` (private) - untuk full audio
- `audio-clips` (public) - untuk audio clips 30-60 detik
- `release-covers` (private) - untuk cover images

---

## Langkah 2: Update RLS Policies untuk Storage Buckets

Perlu pastikan policies storage mengizinkan upload oleh user dengan role yang tepat (superadmin, admin, label, whitelabel).

---

## Langkah 3: (Opsional) Sync ke VPS

Jika kamu tetap ingin file tersedia di VPS untuk website eksternal, ada 2 opsi:

### Opsi A: Manual Sync (Sederhana)
- Download file dari Supabase Storage
- Upload manual via FTP ke VPS
- Update URL di database

### Opsi B: Automated Sync via Edge Function (Advanced)
Butuh setup di VPS:
1. Install web server (Nginx/Apache)
2. Buat API endpoint untuk menerima file
3. Edge Function akan POST file ke VPS setelah upload ke Supabase

---

## Langkah 4: Cleanup (Opsional)
- Hapus secrets GCS jika sudah tidak dipakai
- Archive edge function `gcs-upload` dan `gcs-manage`

---

## Technical Details

### Perubahan di MediaUploadSection.tsx

```text
BEFORE (GCS):
1. Call gcs-upload edge function
2. Get signed URL
3. PUT file to GCS
4. Return public URL

AFTER (Supabase Storage):
1. supabase.storage.from('track-audio').upload(path, file)
2. Get public URL with getPublicUrl()
3. Return URL
```

### Perubahan di SuperAdminSettings.tsx

Logo dan favicon upload akan menggunakan Supabase Storage bucket `release-covers` atau bucket baru `app-assets`.

### Bucket Access Configuration

Untuk bucket yang private (`track-audio`, `release-covers`), perlu signed URLs untuk akses dari website eksternal. Bucket public (`audio-clips`) bisa diakses langsung.

---

## Estimasi Waktu
- Langkah 1-2: ~30 menit (code changes + migration)
- Langkah 3: Tergantung opsi (A: manual, B: 1-2 jam)
- Langkah 4: ~10 menit

---

## Catatan Penting

1. **File yang sudah ada di GCS** tidak akan otomatis pindah. URL lama tetap di database dan akan error jika GCS tetap tidak bisa diakses.

2. **Untuk migrasi data lama**, kamu perlu:
   - Download file dari GCS (jika masih bisa akses)
   - Re-upload ke Supabase Storage
   - Update URL di database

3. **Supabase Storage gratis** hingga 1GB storage dan 2GB bandwidth per bulan.

