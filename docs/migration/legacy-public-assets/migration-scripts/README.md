# Soundpub Dashboard - Migration Scripts

Script untuk import data dari CSV (hasil export Lovable Cloud) ke Supabase target.

## ⚠️ Catatan Penting

`SOURCE_SUPABASE_SERVICE_KEY` **tidak tersedia** dari Lovable Cloud. Data di-export langsung dari sandbox ke CSV. Script ini mengimport CSV tersebut ke Supabase target Anda.

## Prerequisites

1. Node.js v18+
2. Schema sudah di-deploy ke Supabase target (`full-schema-v2.sql`)
3. Service role key untuk Supabase target

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Taruh file CSV hasil export di `./exported-data/`:
   ```bash
   mkdir -p exported-data
   cp /path/to/export/*.csv exported-data/
   ```

3. Copy environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` dengan credentials Supabase target:
   ```env
   TARGET_SUPABASE_URL=https://your-server.supabase.co
   TARGET_SUPABASE_SERVICE_KEY=your-service-role-key
   CSV_IMPORT_DIR=./exported-data/
   ```

## Usage

```bash
node import-csv.js
```

## Urutan Import

Script akan import data dalam urutan berikut (sesuai FK dependencies):

1. Create users via Auth Admin API (dari profiles.csv)
2. Update profiles dengan data lengkap
3. User roles
4. Artists
5. Releases
6. Tracks
7. Royalty uploads
8. Royalties
9. Composer royalties
10. Payout requests
11. Audit logs
12. App settings

## User ID Mapping

Script otomatis membuat mapping antara user ID lama dan baru. Mapping disimpan di `exported-data/id-mapping.json`. Semua foreign key references otomatis di-update.

## Password Reset

Users yang di-import perlu reset password karena password hash tidak bisa di-copy.

## Storage Files

Storage files harus di-upload manual:
1. Download dari Lovable Cloud → Storage
2. Upload ke Supabase target
3. Buckets: `release-covers`, `track-audio`, `track-video`, `audio-clips`, `label-logos`

## Post-Import

1. Upload storage files
2. Deploy edge functions: `supabase functions deploy`
3. Update frontend `.env` dengan target credentials
4. Send reset password email ke semua users
5. Test semua functionality
