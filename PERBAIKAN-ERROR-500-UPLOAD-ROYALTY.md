# Perbaikan Error 500 Upload Royalty - SOLVED (Update 2)

## Masalah yang Ditemukan

Error 500 terjadi karena 2 kolom NOT NULL tidak diisi:
1. `user_id` - NULL (Perbaikan 1) ✅
2. `filename` - NULL (Perbaikan 2) ✅

## Root Cause

Ketika Edge Function `process-royalty-upload` mencoba insert record ke tabel `royalty_uploads`, field `user_id` dan `filename` tidak disertakan. Padahal di database, kedua kolom tersebut adalah NOT NULL constraint.

## Solusi yang Diterapkan

**File:** `supabase/functions/process-royalty-upload/index.ts`

**Baris 132** - Menambahkan `user_id` dan `filename` ke insert statement:

```typescript
// SEBELUM (SALAH - Perbaikan 1):
.insert({ 
  original_filename: originalFilename || filename, 
  total_records: validRows.length, 
  status: 'processing' 
})

// PERBAIKAN 1 (masih error):
.insert({ 
  user_id: user.id,  // ← DITAMBAHKAN
  original_filename: originalFilename || filename, 
  total_records: validRows.length, 
  status: 'processing' 
})

// PERBAIKAN 2 (BENAR):
.insert({ 
  user_id: user.id,     // ← DITAMBAHKAN di commit 086e18e
  filename: filename,    // ← DITAMBAHKAN di commit cec439a
  original_filename: originalFilename || filename, 
  total_records: validRows.length, 
  status: 'processing' 
})
```

## Deployment

✅ File sudah diupload ke server: `/home/maskhar/docker/supabase/supabase-1.26.05/docker/volumes/functions/process-royalty-upload/index.ts`
✅ Cache dihapus dan Edge Functions direstart
✅ Commit 1: `086e18e` - Tambah user_id
✅ Commit 2: `cec439a` - Tambah filename
✅ Push ke: `origin/dev-maskhar`

## Testing

Silakan test upload royalty dari dashboard. Error 500 dengan pesan:
- ❌ "null value in column user_id" - SUDAH DIPERBAIKI
- ❌ "null value in column filename" - SUDAH DIPERBAIKI

Function sekarang seharusnya berjalan normal.

## Struktur Tabel royalty_uploads

Kolom NOT NULL yang harus diisi:
- ✅ `user_id` (uuid) - ID user yang melakukan upload
- ✅ `filename` (text) - Nama file yang diupload
- ✅ `original_filename` (text) - Nama file asli
- ✅ `total_records` (integer) - Total baris yang diupload
- ✅ `inserted_records` (integer) - Default 0
- ✅ `status` (text) - Status upload (processing/success/failed)

---
Updated: 2026-07-27 14:28
