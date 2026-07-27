# MASALAH UPLOAD ROYALTY - ERROR 500

## Deskripsi Masalah
Edge Function `process-royalty-upload` mengalami error 500 (Internal Server Error) saat dipanggil dari frontend.

Error terjadi di:
```
POST https://supabase.carubra.com/functions/v1/process-royalty-upload 500 (Internal Server Error)
```

## Kemungkinan Penyebab

### 1. Edge Function Belum Di-Deploy atau Versi Lama
File `supabase/functions/process-royalty-upload/index.ts` di repository lokal sudah diupdate, tapi kemungkinan belum di-deploy ke server production Supabase.

### 2. Environment Variables Tidak Lengkap di Supabase
Edge Function membutuhkan environment variables berikut:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `DATABASE_SCHEMA` atau `SUPABASE_DB_SCHEMA` (harus diset ke "soundpub")

### 3. Database Schema Configuration
Function menggunakan custom schema "soundpub" yang perlu dikonfigurasi:
```typescript
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'
```

## Solusi yang Perlu Dilakukan

### Langkah 1: Deploy Edge Function ke Production
Anda perlu login ke Supabase CLI dengan access token:

```bash
# Set access token (dapatkan dari Supabase Dashboard > Settings > Access Tokens)
$env:SUPABASE_ACCESS_TOKEN="your-access-token-here"

# Link project
supabase link --project-ref opkvvdgnhhopkkeaokzo

# Deploy function
supabase functions deploy process-royalty-upload
```

### Langkah 2: Set Environment Variables di Supabase Dashboard
Masuk ke Supabase Dashboard > Project Settings > Edge Functions > Environment Variables

Tambahkan/cek variables berikut:
- `DATABASE_SCHEMA=soundpub`
- `SUPABASE_DB_SCHEMA=soundpub`
- `SUPABASE_URL=https://supabase.carubra.com`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
- `SUPABASE_ANON_KEY=<your-anon-key>`

### Langkah 3: Restart Edge Functions
Setelah deploy dan set environment variables, restart Edge Functions dari Dashboard.

## Cara Cek Log Error
Untuk melihat detail error 500, cek di Supabase Dashboard:
1. Buka Supabase Dashboard
2. Pilih project: opkvvdgnhhopkkeaokzo
3. Masuk ke Edge Functions > process-royalty-upload
4. Lihat tab "Logs" atau "Invocations"
5. Cari error terbaru untuk melihat stack trace lengkap

## Testing Setelah Fix
1. Upload file CSV royalty dari dashboard
2. Cek apakah process berhasil tanpa error 500
3. Verifikasi data masuk ke table `royalties`
4. Verifikasi balance profile terupdate dengan benar

## Catatan
File Edge Function sudah ada di repository lokal dan terlihat sudah lengkap. Masalahnya kemungkinan besar adalah:
1. Belum di-deploy ke production, atau
2. Environment variables belum diset dengan benar di server

---
Dibuat: 2026-07-27
Status: Memerlukan akses Supabase Dashboard untuk deploy
