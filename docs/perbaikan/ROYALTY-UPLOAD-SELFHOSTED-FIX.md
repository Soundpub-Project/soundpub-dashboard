# SOLUSI UPLOAD ROYALTY ERROR 500 - SUPABASE SELF-HOSTED

## Informasi Server
- URL: https://supabase.carubra.com
- Database Schema: soundpub
- Edge Function: process-royalty-upload

## Masalah
Error 500 saat memanggil Edge Function `process-royalty-upload`

## Penyebab Kemungkinan

### 1. Edge Function Belum Di-Deploy ke Server Self-Hosted
File `process-royalty-upload` di repository lokal mungkin berbeda dengan yang ada di server.

### 2. Environment Variables Tidak Lengkap
Edge Function membutuhkan environment variables:
- `DATABASE_SCHEMA=soundpub`
- `SUPABASE_DB_SCHEMA=soundpub`
- `SUPABASE_URL=https://supabase.carubra.com`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
- `SUPABASE_ANON_KEY=<anon-key>`

### 3. Error di Kode Edge Function
Kemungkinan ada error runtime di dalam function.

## Solusi

### Opsi 1: Deploy Manual ke Self-Hosted Server

#### A. Via SSH ke Server
```bash
# 1. SSH ke server
ssh user@supabase.carubra.com

# 2. Navigate ke Supabase functions directory
cd /path/to/supabase/functions

# 3. Copy function dari lokal atau git
# Jika menggunakan git:
git pull origin dev-maskhar

# 4. Restart Deno/Edge Function service
docker-compose restart edge-runtime
# atau
systemctl restart supabase-edge-functions
```

#### B. Via Supabase CLI dengan Custom URL
```powershell
# Set custom Supabase URL
$env:SUPABASE_URL = "https://supabase.carubra.com"

# Deploy function (jika didukung oleh self-hosted)
supabase functions deploy process-royalty-upload --no-verify-jwt
```

### Opsi 2: Cek Log Error di Server

```bash
# SSH ke server
ssh user@supabase.carubra.com

# Cek log Edge Functions
docker logs supabase-edge-runtime -f
# atau
journalctl -u supabase-edge-functions -f
```

### Opsi 3: Test Function Secara Lokal

```powershell
# Di local machine, start Supabase local
supabase start

# Deploy function ke local
supabase functions serve process-royalty-upload

# Test dengan curl
curl -X POST http://localhost:54321/functions/v1/process-royalty-upload \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rows": [], "filename": "test.csv"}'
```

## Checklist Debugging

### 1. Verifikasi Edge Function Exists di Server
- [ ] SSH ke server carubra.com
- [ ] Cek folder functions apakah ada `process-royalty-upload`
- [ ] Cek isi file `index.ts` apakah sama dengan lokal

### 2. Verifikasi Environment Variables
- [ ] Cek file `.env` atau docker-compose environment
- [ ] Pastikan `DATABASE_SCHEMA=soundpub` ada
- [ ] Pastikan `SUPABASE_SERVICE_ROLE_KEY` dan `SUPABASE_ANON_KEY` terisi

### 3. Verifikasi Service Running
- [ ] Cek status Edge Runtime: `docker ps | grep edge`
- [ ] Cek log untuk error: `docker logs supabase-edge-runtime`

### 4. Test Database Connection dari Function
- [ ] Pastikan function bisa connect ke database dengan schema `soundpub`
- [ ] Test query sederhana ke table `profiles` atau `royalties`

## Informasi yang Dibutuhkan

Untuk troubleshooting lebih lanjut, saya membutuhkan:

1. **Akses SSH ke server carubra.com** atau
2. **Log error dari Edge Function** (dari server)
3. **Cara Anda deploy Edge Functions** ke self-hosted Supabase

## Quick Fix Sementara

Jika tidak bisa deploy segera, alternatif sementara:
1. Pindahkan logic upload ke backend API biasa (Express/Fastify)
2. Atau gunakan Server Action jika menggunakan framework yang mendukung

## Kontak Server Admin
Hubungi administrator server carubra.com untuk:
- Deploy Edge Function terbaru
- Set environment variables
- Restart Edge Function service
- Akses log error

---
Dibuat: 2026-07-27
Status: Memerlukan akses ke server self-hosted
