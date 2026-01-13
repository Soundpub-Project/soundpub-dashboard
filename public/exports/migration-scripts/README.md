# SoundPub Dashboard - Migration Scripts

Script automasi untuk migrasi data dari Lovable Cloud ke Supabase eksternal.

## Prerequisites

1. Node.js v18 atau lebih baru
2. Schema database sudah di-deploy ke Supabase target (jalankan `full-schema.sql` terlebih dahulu)
3. Service role keys untuk kedua Supabase projects

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` dengan credentials Supabase:
   - `SOURCE_SUPABASE_URL` - URL Lovable Cloud project
   - `SOURCE_SUPABASE_SERVICE_KEY` - Service role key Lovable Cloud
   - `TARGET_SUPABASE_URL` - URL Supabase target
   - `TARGET_SUPABASE_SERVICE_KEY` - Service role key Supabase target

## Usage

```bash
npm run migrate
# atau
node migrate.js
```

## Urutan Migrasi

Script akan migrasi data dalam urutan berikut (sesuai foreign key dependencies):

1. Users (via Auth Admin API)
2. Profiles
3. User Roles
4. Artists
5. Releases
6. Tracks
7. Royalty Uploads
8. Royalties
9. Payout Requests
10. Audit Logs
11. App Settings
12. Storage (info only - manual)

## Catatan Penting

### User ID Mapping

Script secara otomatis membuat mapping antara user ID lama dan baru karena Supabase akan generate ID baru saat create user. Semua foreign key references akan di-update sesuai mapping ini.

### Password Reset

Users yang di-migrate akan perlu reset password karena password hash tidak bisa di-copy. Kirim email reset password setelah migrasi selesai.

### Storage Files

Storage files tidak di-migrate otomatis oleh script ini. Anda perlu:
1. Download semua files dari Lovable Cloud storage
2. Upload ke Supabase target storage
3. Pastikan path file sama persis

### Error Handling

Jika ada error saat migrasi:
- Script akan log error tapi tetap lanjut ke step berikutnya
- Cek output untuk melihat berapa row yang berhasil di-migrate
- Re-run script aman dilakukan (akan skip data yang sudah ada)

## Troubleshooting

### "duplicate key value violates unique constraint"

Data sudah ada di target. Script akan skip row ini.

### "violates foreign key constraint"

Parent record belum ada. Pastikan menjalankan script dari awal, bukan partial.

### Auth API errors

Pastikan menggunakan SERVICE_ROLE_KEY, bukan anon key.

## Post-Migration

Setelah script selesai:

1. Migrate storage files manually
2. Deploy edge functions: `supabase functions deploy`
3. Update frontend `.env` dengan Supabase target credentials
4. Test semua functionality
5. Kirim reset password email ke semua users
