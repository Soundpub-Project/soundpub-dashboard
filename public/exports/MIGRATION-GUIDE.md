# 📦 Panduan Migrasi SoundPub Dashboard
## Dari Lovable Cloud ke Supabase Eksternal

---

## 📋 Daftar Isi

1. [Persiapan](#1-persiapan)
2. [Setup Supabase Project Baru](#2-setup-supabase-project-baru)
3. [Migrasi Database Schema](#3-migrasi-database-schema)
4. [Migrasi Data](#4-migrasi-data)
5. [Migrasi Storage](#5-migrasi-storage)
6. [Setup Edge Functions](#6-setup-edge-functions)
7. [Konfigurasi Environment](#7-konfigurasi-environment)
8. [Testing & Validasi](#8-testing--validasi)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Persiapan

### 1.1 Prasyarat
- [ ] Akun Supabase (https://supabase.com)
- [ ] Supabase CLI terinstall (`npm install -g supabase`)
- [ ] Node.js v18+ 
- [ ] Git
- [ ] Text editor (VS Code recommended)

### 1.2 Informasi yang Diperlukan
Catat informasi berikut dari Lovable Cloud (project saat ini):

| Item | Nilai |
|------|-------|
| Project ID | `opkvvdgnhhopkkeaokzo` |
| Supabase URL | `https://opkvvdgnhhopkkeaokzo.supabase.co` |

### 1.3 File yang Perlu Diexport
Dari aplikasi SoundPub Dashboard, akses `/dashboard/export` untuk mendownload:

- [x] `profiles.csv`
- [x] `user_roles.csv`
- [x] `releases.csv`
- [x] `tracks.csv`
- [x] `royalties.csv`
- [x] `royalty_uploads.csv`
- [x] `payout_requests.csv`
- [x] `app_settings.csv`
- [x] `audit_logs.csv`

---

## 2. Setup Supabase Project Baru

### 2.1 Buat Project Baru
1. Login ke https://supabase.com/dashboard
2. Klik **New Project**
3. Isi detail project:
   - **Name**: `soundpub-production` (atau nama lain)
   - **Database Password**: (simpan dengan aman!)
   - **Region**: Pilih region terdekat (Singapore untuk Indonesia)
4. Tunggu project selesai dibuat (~2 menit)

### 2.2 Catat Kredensial
Setelah project dibuat, catat informasi berikut dari **Settings > API**:

```
SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (RAHASIA!)
```

### 2.3 Konfigurasi Auth
1. Buka **Authentication > Providers**
2. Pastikan **Email** provider aktif
3. Buka **Authentication > Settings**
4. **PENTING**: Disable "Confirm email" untuk testing:
   - Scroll ke "Email Auth"
   - Toggle OFF "Enable email confirmations"

---

## 3. Migrasi Database Schema

### 3.1 Jalankan Schema SQL
1. Buka **SQL Editor** di Supabase Dashboard
2. Copy seluruh isi file `public/exports/full-schema.sql`
3. Paste ke SQL Editor
4. Klik **Run**

### 3.2 Verifikasi Tabel
Pastikan tabel-tabel berikut terbuat di **Table Editor**:
- [x] `profiles`
- [x] `user_roles`
- [x] `artists`
- [x] `releases`
- [x] `tracks`
- [x] `royalties`
- [x] `royalty_uploads`
- [x] `payout_requests`
- [x] `app_settings`
- [x] `audit_logs`

### 3.3 Verifikasi Functions
Buka **Database > Functions** dan pastikan fungsi-fungsi berikut ada:
- [x] `has_role`
- [x] `is_admin`
- [x] `get_user_role`
- [x] `get_user_full_name`
- [x] `handle_new_user`
- [x] `update_timestamp`
- [x] `update_balance_on_payout_status_change`

### 3.4 Verifikasi Storage Buckets
Buka **Storage** dan pastikan bucket berikut ada:
- [x] `release-covers` (public)
- [x] `track-audio` (private)
- [x] `track-video` (private)
- [x] `audio-clips` (public)

---

## 4. Migrasi Data

### 4.1 Urutan Import Data
**PENTING**: Import data sesuai urutan berikut (karena foreign key dependencies):

1. `app_settings.csv`
2. `profiles.csv` (tanpa parent_label_id dulu)
3. `user_roles.csv`
4. Update `profiles` dengan `parent_label_id`
5. `releases.csv`
6. `tracks.csv`
7. `royalty_uploads.csv`
8. `royalties.csv`
9. `payout_requests.csv`
10. `audit_logs.csv`

### 4.2 Recreate Users di Auth
**⚠️ PENTING**: Data `auth.users` TIDAK bisa diexport. Anda harus membuat ulang users.

#### Opsi A: Manual (untuk sedikit user)
1. Buka **Authentication > Users**
2. Klik **Add User**
3. Masukkan email dan password
4. **KRITIS**: Catat UUID yang dihasilkan

#### Opsi B: Via SQL (untuk banyak user)
Gunakan Supabase Admin API atau service role key:

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SERVICE_ROLE_KEY', // BUKAN anon key!
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Buat user dengan UUID spesifik
const { data, error } = await supabase.auth.admin.createUser({
  email: 'user@example.com',
  password: 'temporary-password-123',
  email_confirm: true,
  user_metadata: { full_name: 'User Name' },
  // UUID akan auto-generate, perlu update profiles setelahnya
});
```

### 4.3 Import CSV ke Supabase
1. Buka **Table Editor**
2. Pilih tabel (misal: `app_settings`)
3. Klik **Insert** > **Import data from CSV**
4. Upload file CSV
5. Map kolom jika diperlukan
6. Klik **Import**

### 4.4 Update Foreign Keys Profiles
Setelah semua user dibuat, update `parent_label_id`:

```sql
-- Contoh: Set parent_label_id untuk artist
UPDATE profiles 
SET parent_label_id = 'UUID_LABEL_BARU'
WHERE email = 'artist@example.com';
```

---

## 5. Migrasi Storage

### 5.1 Download Files dari Lovable Cloud
File-file yang perlu didownload:
- Cover images dari `release-covers` bucket
- Audio files dari `track-audio` bucket
- Audio clips dari `audio-clips` bucket

#### Via Browser
1. Buka setiap URL cover di database
2. Download manual

#### Via Script (Recommended)
```javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Source (Lovable Cloud)
const sourceSupabase = createClient(
  'https://opkvvdgnhhopkkeaokzo.supabase.co',
  'YOUR_ANON_KEY'
);

// Download file
async function downloadFile(bucket, filePath) {
  const { data, error } = await sourceSupabase.storage
    .from(bucket)
    .download(filePath);
  
  if (error) throw error;
  
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(`./downloads/${bucket}/${filePath}`, buffer);
}
```

### 5.2 Upload ke Supabase Baru
```javascript
// Target (New Supabase)
const targetSupabase = createClient(
  'YOUR_NEW_SUPABASE_URL',
  'YOUR_SERVICE_ROLE_KEY'
);

async function uploadFile(bucket, filePath, fileBuffer) {
  const { data, error } = await targetSupabase.storage
    .from(bucket)
    .upload(filePath, fileBuffer, {
      contentType: 'image/jpeg', // atau sesuaikan
      upsert: true
    });
  
  if (error) throw error;
  return data;
}
```

### 5.3 Update URL di Database
Setelah upload, update URL di tabel `releases` dan `tracks`:

```sql
-- Update cover_url di releases
UPDATE releases
SET cover_url = REPLACE(
  cover_url, 
  'https://opkvvdgnhhopkkeaokzo.supabase.co',
  'https://YOUR_NEW_PROJECT_ID.supabase.co'
);

-- Update audio_url, video_url, clip_url di tracks
UPDATE tracks
SET 
  audio_url = REPLACE(audio_url, 'opkvvdgnhhopkkeaokzo', 'YOUR_NEW_PROJECT_ID'),
  video_url = REPLACE(video_url, 'opkvvdgnhhopkkeaokzo', 'YOUR_NEW_PROJECT_ID'),
  clip_url = REPLACE(clip_url, 'opkvvdgnhhopkkeaokzo', 'YOUR_NEW_PROJECT_ID');
```

---

## 6. Setup Edge Functions

### 6.1 Clone Edge Functions
Copy folder `supabase/functions/` dari project Lovable ke project lokal Anda.

### 6.2 Struktur Edge Functions
```
supabase/
└── functions/
    ├── _shared/
    │   └── cors.ts
    ├── change-own-password/
    │   └── index.ts
    ├── create-user/
    │   └── index.ts
    ├── delete-user/
    │   └── index.ts
    ├── gcs-upload/
    │   └── index.ts
    ├── get-ga4-config/
    │   └── index.ts
    ├── process-royalty-upload/
    │   └── index.ts
    ├── remove-artist-from-label/
    │   └── index.ts
    ├── update-app-settings/
    │   └── index.ts
    ├── update-user-password/
    │   └── index.ts
    └── update-user-status/
        └── index.ts
```

### 6.3 Deploy Edge Functions
```bash
# Login ke Supabase
supabase login

# Link ke project
supabase link --project-ref YOUR_PROJECT_ID

# Deploy semua functions
supabase functions deploy
```

### 6.4 Set Secrets
```bash
# Supabase secrets
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Cloud Storage (jika digunakan)
supabase secrets set GCS_PROJECT_ID=your_gcs_project
supabase secrets set GCS_BUCKET_NAME=your_bucket
supabase secrets set GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Google Analytics (jika digunakan)
supabase secrets set GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

---

## 7. Konfigurasi Environment

### 7.1 Update Frontend Environment
Edit file `.env` di project frontend:

```env
VITE_SUPABASE_URL=https://YOUR_NEW_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_new_anon_key
VITE_SUPABASE_PROJECT_ID=YOUR_NEW_PROJECT_ID
```

### 7.2 Update Supabase Client
File `src/integrations/supabase/client.ts` akan otomatis menggunakan environment variables.

### 7.3 Regenerate Types (Optional)
Jika menggunakan Supabase CLI:
```bash
supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts
```

---

## 8. Testing & Validasi

### 8.1 Checklist Fungsionalitas

#### Authentication
- [ ] Login dengan email/password
- [ ] Signup user baru
- [ ] Logout
- [ ] Password reset

#### Profiles & Users
- [ ] View profile
- [ ] Update profile
- [ ] Admin: View all users
- [ ] Admin: Change user role
- [ ] Admin: Change user status
- [ ] Admin: Reset password

#### Releases & Tracks
- [ ] View releases list
- [ ] Create new release
- [ ] Upload cover image
- [ ] Add tracks to release
- [ ] Edit release/track
- [ ] Delete release

#### Royalties
- [ ] Upload royalty CSV
- [ ] View royalty data
- [ ] Filter by period/platform
- [ ] Balance calculation correct

#### Payouts
- [ ] Create payout request
- [ ] View payout history
- [ ] Admin: Approve/reject payout
- [ ] Admin: Mark as paid
- [ ] Balance deduction correct

#### Settings
- [ ] Update app settings
- [ ] Upload logo
- [ ] Toggle GA4/GCS

### 8.2 Data Integrity Check
```sql
-- Verify row counts match
SELECT 'profiles' as table_name, COUNT(*) as count FROM profiles
UNION ALL
SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL
SELECT 'releases', COUNT(*) FROM releases
UNION ALL
SELECT 'tracks', COUNT(*) FROM tracks
UNION ALL
SELECT 'royalties', COUNT(*) FROM royalties;
```

### 8.3 RLS Policy Check
```sql
-- Test RLS as specific user
SET request.jwt.claim.sub = 'USER_UUID_HERE';
SELECT * FROM profiles; -- Should only see allowed rows
```

---

## 9. Troubleshooting

### 9.1 Common Errors

#### "permission denied for table X"
- Pastikan RLS policies sudah dibuat
- Cek apakah user sudah login
- Verifikasi role user di `user_roles`

#### "infinite recursion detected in policy"
- Jangan query tabel yang sama dalam RLS policy
- Gunakan security definer function

#### "foreign key constraint violation"
- Import data sesuai urutan dependencies
- Pastikan UUID match antara tabel

#### "storage bucket not found"
- Jalankan SQL untuk create bucket
- Cek nama bucket (case-sensitive)

### 9.2 Debug Edge Functions
```bash
# View function logs
supabase functions logs FUNCTION_NAME --project-ref YOUR_PROJECT_ID

# Test function locally
supabase functions serve FUNCTION_NAME --env-file .env.local
```

### 9.3 Reset Database (Jika Perlu)
```sql
-- HATI-HATI: Ini akan menghapus SEMUA data!
TRUNCATE profiles, user_roles, releases, tracks, royalties, 
         royalty_uploads, payout_requests, app_settings, audit_logs 
CASCADE;
```

---

## 📞 Bantuan

Jika mengalami kesulitan:
1. Cek [Supabase Documentation](https://supabase.com/docs)
2. Join [Supabase Discord](https://discord.supabase.com)
3. Buka issue di repository project

---

## ✅ Checklist Final

- [ ] Schema database berhasil dibuat
- [ ] Semua data berhasil diimport
- [ ] Users berhasil dibuat di Auth
- [ ] Storage files berhasil dimigrasi
- [ ] Edge functions berhasil di-deploy
- [ ] Secrets berhasil di-set
- [ ] Environment variables diupdate
- [ ] Semua fitur berfungsi normal
- [ ] Production URL dikonfigurasi

---

**Selamat! Migrasi selesai! 🎉**

*Dokumen ini dibuat pada: 13 Januari 2026*
*Versi: 1.0*
