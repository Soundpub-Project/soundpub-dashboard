# Perbaikan Error 500 Upload Royalty - SOLVED

## Masalah yang Ditemukan

Error 500 terjadi karena:
```
null value in column "user_id" of relation "royalty_uploads" violates not-null constraint
```

## Root Cause

Ketika Edge Function `process-royalty-upload` mencoba insert record ke tabel `royalty_uploads`, field `user_id` tidak disertakan. Padahal di database, kolom `user_id` adalah NOT NULL constraint.

## Solusi yang Diterapkan

**File:** `supabase/functions/process-royalty-upload/index.ts`

**Baris 132** - Menambahkan `user_id` ke insert statement:

```typescript
// SEBELUM (SALAH):
.insert({ 
  original_filename: originalFilename || filename, 
  total_records: validRows.length, 
  status: 'processing' 
})

// SESUDAH (BENAR):
.insert({ 
  user_id: user.id,  // ← DITAMBAHKAN
  original_filename: originalFilename || filename, 
  total_records: validRows.length, 
  status: 'processing' 
})
```

## Deployment

✅ File sudah diupload ke server: `/home/maskhar/docker/supabase/supabase-1.26.05/docker/volumes/functions/process-royalty-upload/index.ts`
✅ Cache dihapus dan Edge Functions direstart
✅ Commit: `086e18e`
✅ Push ke: `origin/dev-maskhar`

## Testing

Silakan test upload royalty dari dashboard. Error 500 dengan pesan "null value in column user_id" seharusnya sudah tidak muncul lagi.

## Catatan Tambahan

Error handling untuk managed artist creation sudah ada dan berfungsi dengan baik:
- Jika gagal membuat managed artist, function akan return `null` dan melanjutkan proses
- Royalty tetap akan tersimpan meskipun managed artist gagal dibuat
- Error akan dicatat di log untuk debugging

---
Generated: 2026-07-27
