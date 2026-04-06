# SoundPub Dashboard - Migration Guide v2.2

Panduan lengkap untuk migrasi dari Lovable Cloud ke Supabase eksternal atau Self-Hosted di VPS.
Updated: April 2026

## 📚 Dokumentasi Terkait

| Dokumen | Deskripsi |
|---------|-----------|
| **[VPS-SETUP-GUIDE.md](./VPS-SETUP-GUIDE.md)** | Panduan lengkap setup Supabase Self-Hosted di VPS |
| **[full-schema-v2.sql](./full-schema-v2.sql)** | Schema database terbaru dengan semua RLS policies |
| **[MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md)** | Checklist untuk memastikan migrasi lengkap |
| **[migration-scripts/](./migration-scripts/)** | Script automasi migrasi data |

---

## Daftar Isi

1. [Persiapan](#1-persiapan)
2. [Setup Supabase Baru](#2-setup-supabase-baru)
3. [Migrasi Schema Database](#3-migrasi-schema-database)
4. [Migrasi Data](#4-migrasi-data)
5. [Migrasi Storage](#5-migrasi-storage)
6. [Setup Edge Functions](#6-setup-edge-functions)
7. [Konfigurasi Environment](#7-konfigurasi-environment)
8. [Testing & Validasi](#8-testing--validasi)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Persiapan

### Prerequisites

- Node.js v18+ terinstall
- Supabase CLI terinstall (`npm install -g supabase`)
- Akses ke Lovable Cloud dashboard
- Akses ke Supabase dashboard target

### Export Data dari Lovable Cloud

1. Buka Lovable Cloud dashboard
2. Export data dari setiap tabel dalam format CSV
3. Download semua file dari storage buckets

### Files yang Diperlukan

```
public/exports/
├── full-schema-v2.sql        # Schema lengkap database (terbaru)
├── full-schema.sql           # Schema lama (legacy)
├── MIGRATION-GUIDE.md        # Panduan ini
├── MIGRATION-CHECKLIST.md    # Checklist migrasi
├── VPS-SETUP-GUIDE.md        # Panduan VPS setup
└── migration-scripts/
    ├── migrate.js            # Script automasi migrasi
    ├── package.json          # Dependencies
    ├── .env.example          # Template environment variables
    └── README.md             # Dokumentasi script
```

---

## 2. Setup Supabase Baru

### Buat Project Baru

1. Buka [Supabase Dashboard](https://supabase.com/dashboard)
2. Klik "New Project"
3. Isi detail project:
   - **Name**: SoundPub Dashboard
   - **Database Password**: (simpan dengan aman!)
   - **Region**: Pilih yang terdekat dengan users

### Catat Credentials

Setelah project dibuat, catat:

- **Project URL**: `https://[project-id].supabase.co`
- **Anon Key**: Di Settings > API > anon public
- **Service Role Key**: Di Settings > API > service_role (RAHASIA!)
- **Database URL**: Di Settings > Database > Connection string

---

## 3. Migrasi Schema Database

### Jalankan Schema SQL

1. Buka SQL Editor di Supabase Dashboard
2. Copy seluruh isi file `full-schema-v2.sql`
3. Paste dan jalankan di SQL Editor
4. Pastikan tidak ada error

### Schema Highlights (v2)

Schema v2 mencakup fitur-fitur terbaru:

- **ID-based matching**: Kolom `artist_user_id` di tabel `releases`, `tracks`, `royalties`
- **Hybrid RLS policies**: Primary ID-based, fallback name-based
- **Function `get_artist_user_id_by_name()`**: Helper untuk artist matching
- **7 roles**: superadmin, admin, label, whitelabel, artist, copyright, user
- **SECURITY DEFINER functions**: Mencegah infinite recursion di RLS

### Verifikasi

Cek bahwa semua object telah dibuat:

```sql
-- Cek tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Cek functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public';

-- Cek policies
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public';
```

---

## 4. Migrasi Data

### Urutan Import Data

⚠️ **PENTING**: Import harus dilakukan dalam urutan ini karena foreign key dependencies!

1. **Users** (via Supabase Auth)
2. **profiles**
3. **user_roles**
4. **artists**
5. **releases**
6. **tracks**
7. **royalty_uploads**
8. **royalties**
9. **composer_royalties**
10. **payout_requests**
11. **audit_logs**
12. **app_settings**

### Migrasi Users

Users harus di-recreate via Supabase Auth API:

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Untuk setiap user dari export
const { data, error } = await supabase.auth.admin.createUser({
  email: user.email,
  password: 'temporary-password-123', // User harus reset
  email_confirm: true,
  user_metadata: {
    full_name: user.full_name
  }
});
```

### Import CSV Data

Untuk tabel lainnya, gunakan Supabase Table Editor:

1. Buka Table Editor
2. Pilih tabel target
3. Klik "Insert" > "Import data from CSV"
4. Upload file CSV

Atau gunakan script automasi di `migration-scripts/migrate.js`.

### Post-Migration: Populate artist_user_id

Setelah data di-import, jalankan query berikut untuk mengisi `artist_user_id`:

```sql
-- Populate artist_user_id di releases
UPDATE releases r
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(r.artist_name)) = LOWER(TRIM(p.full_name))
    AND (r.label_id = p.parent_label_id OR p.parent_label_id IS NULL)
  LIMIT 1
)
WHERE r.artist_user_id IS NULL;

-- Populate artist_user_id di tracks
UPDATE tracks t
SET artist_user_id = (
  SELECT r.artist_user_id 
  FROM releases r
  WHERE r.id = t.release_id
)
WHERE t.artist_user_id IS NULL;

-- Populate artist_user_id di royalties
UPDATE royalties r
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(r.artist)) = LOWER(TRIM(p.full_name))
  LIMIT 1
)
WHERE r.artist_user_id IS NULL AND r.artist IS NOT NULL;
```

### Menggunakan Script Automasi

```bash
cd public/exports/migration-scripts

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env dengan credentials

# Jalankan migrasi
node migrate.js
```

---

## 5. Migrasi Storage

### Download dari Lovable Cloud

1. Buka Storage di Lovable Cloud
2. Download semua files dari setiap bucket:
   - `release-covers/`
   - `track-audio/`
   - `track-video/`
   - `audio-clips/`
   - `label-logos/`

### Upload ke Supabase Baru

1. Buka Storage di Supabase Dashboard baru
2. Buckets sudah dibuat oleh schema SQL
3. Upload files ke masing-masing bucket
4. Pastikan path file sama persis

### Verifikasi URLs

Setelah upload, URLs akan berubah. Jika ada data yang menyimpan full URL (bukan path), perlu di-update:

```sql
-- Contoh update cover_url di releases
UPDATE releases 
SET cover_url = REPLACE(cover_url, 
  'https://old-project.supabase.co', 
  'https://new-project.supabase.co'
)
WHERE cover_url LIKE '%old-project.supabase.co%';
```

---

## 6. Setup Edge Functions

### Deploy Edge Functions

Copy folder `supabase/functions/` ke project baru:

```bash
# Clone/copy edge functions
cp -r supabase/functions/ /path/to/new-project/supabase/functions/

# Login ke Supabase CLI
supabase login

# Link ke project baru
supabase link --project-ref [new-project-id]

# Deploy semua functions
supabase functions deploy
```

### Daftar Edge Functions

| # | Function | Deskripsi | Status |
|---|----------|-----------|--------|
| 1 | `change-own-password` | User ganti password sendiri | ✅ Aktif |
| 2 | `create-user` | Admin/Label buat user baru | ✅ Aktif |
| 3 | `create-whitelabel-artist` | Buat artist whitelabel (tanpa password) | ✅ Aktif |
| 4 | `delete-user` | Admin hapus user | ✅ Aktif |
| 5 | `get-catalog-tracks` | API publik katalog (releases + tracks + label) | ✅ Aktif |
| 6 | `get-ga4-config` | Get Google Analytics config | ✅ Aktif |
| 7 | `process-royalty-upload` | Process CSV royalty (auto-match artist_user_id) | ✅ Aktif |
| 8 | `remove-artist-from-label` | Hapus artist dari label (validasi releases) | ✅ Aktif |
| 9 | `send-royalty-notification` | Kirim notifikasi royalty via email (Resend) | ✅ Aktif |
| 10 | `set-artist-password` | Set password artist whitelabel | ✅ Aktif |
| 11 | `update-app-settings` | Update settings (superadmin only) | ✅ Aktif |
| 12 | `update-user-password` | Admin reset password user | ✅ Aktif |
| 13 | `update-user-status` | Admin ubah status user | ✅ Aktif |
| 14 | `test-gcs` | Test koneksi GCS | ⚠️ Opsional |
| 15 | `gcs-upload` | Upload ke Google Cloud Storage | ❌ Disabled |
| 16 | `gcs-manage` | Manage file di GCS (delete, list) | ❌ Disabled |

### Edge Function Standards

⚠️ Semua edge functions harus mengikuti standar ini untuk menghindari bundle timeout:

```typescript
// 1. Pin version (WAJIB)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// 2. Full CORS headers (WAJIB)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// 3. Handle preflight (WAJIB)
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders })
}
```

### Setup Secrets

```bash
# Set secrets untuk edge functions
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
supabase secrets set GA4_MEASUREMENT_ID=G-XXXXXXXXXX
supabase secrets set GCS_PROJECT_ID=your-project-id
supabase secrets set GCS_BUCKET_NAME=your-bucket
supabase secrets set GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

---

## 7. Konfigurasi Environment

### Update Frontend .env

```env
VITE_SUPABASE_URL=https://[new-project-id].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=[new-anon-key]
VITE_SUPABASE_PROJECT_ID=[new-project-id]
```

### Update Edge Function Secrets

Di Supabase Dashboard > Settings > Edge Functions > Secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `GCS_PROJECT_ID`
- `GCS_BUCKET_NAME`
- `GCS_SERVICE_ACCOUNT_KEY`
- `GA4_MEASUREMENT_ID`

---

## 8. Testing & Validasi

### Checklist Testing

- [ ] Login/Register berfungsi
- [ ] Dashboard load dengan benar
- [ ] Data profiles muncul
- [ ] Data releases muncul
- [ ] Upload cover berfungsi
- [ ] Upload audio/video berfungsi
- [ ] Royalty upload berfungsi
- [ ] Royalty Summary & Analytics (RPC functions) berfungsi
- [ ] Payout request berfungsi
- [ ] Audit logs tercatat
- [ ] Role permissions benar (semua 7 role)
- [ ] Artist bisa buat release lewat ReleaseFormDialog
- [ ] Edge functions tidak CORS error
- [ ] `get-catalog-tracks` mengembalikan label info
- [ ] AllRoyalties page tidak white screen

### Test RLS Policies

```sql
-- Test sebagai user biasa
SET request.jwt.claims = '{"sub": "[user-id]", "role": "authenticated"}';

-- Coba query yang seharusnya dibatasi
SELECT * FROM profiles; -- Harus hanya return profile sendiri
SELECT * FROM releases; -- Tergantung role
```

### Test RPC Functions

```sql
-- Pastikan semua RPC functions terbuat
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Functions yang harus ada:
-- get_royalty_stats, get_royalty_monthly_summary, get_royalty_platform_summary,
-- get_royalty_country_summary, get_royalty_periods, get_royalty_period_summary,
-- get_royalty_comparison, get_royalty_top_performers, get_royalty_label_breakdown,
-- get_royalty_artist_breakdown, get_royalty_track_breakdown,
-- has_role, is_admin, is_whitelabel, get_user_role, get_user_full_name,
-- get_user_parent_label_id, get_user_release_label_ids, get_artist_user_id_by_name,
-- handle_new_user, update_timestamp, update_balance_on_payout_status_change
```

### Verifikasi Data Count

```sql
-- Bandingkan dengan data di Lovable Cloud
SELECT 'profiles' as table_name, COUNT(*) FROM profiles
UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL SELECT 'artists', COUNT(*) FROM artists
UNION ALL SELECT 'releases', COUNT(*) FROM releases
UNION ALL SELECT 'tracks', COUNT(*) FROM tracks
UNION ALL SELECT 'royalties', COUNT(*) FROM royalties
UNION ALL SELECT 'composer_royalties', COUNT(*) FROM composer_royalties
UNION ALL SELECT 'payout_requests', COUNT(*) FROM payout_requests
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;
```

---

## 9. Troubleshooting

### Error: "duplicate key value violates unique constraint"

Data sudah ada. Hapus dulu atau gunakan UPSERT:

```sql
INSERT INTO table_name (...) 
VALUES (...) 
ON CONFLICT (id) DO UPDATE SET ...;
```

### Error: "violates foreign key constraint"

Import dalam urutan yang benar. Parent table harus diisi dulu.

### Error: "permission denied for table"

RLS policies blocking. Gunakan service role key atau cek policy.

### Error: "Bundle generation timed out" (Edge Functions)

1. Pastikan `@supabase/supabase-js` di-pin ke versi `2.49.1`
2. Jangan import dari shared files (`_shared/cors.ts`) — inline semua
3. Minimasi dependensi eksternal
4. Re-deploy function beberapa kali jika perlu

### Error: CORS pada domain production

1. Pastikan CORS headers lengkap termasuk `Access-Control-Allow-Methods`
2. Pastikan handler `OPTIONS` mengembalikan `Response` dengan status 200
3. Pastikan `verify_jwt = false` di `config.toml`

### Users Tidak Bisa Login

1. Pastikan email_confirmed = true
2. Cek password sudah di-set
3. Kirim reset password email

### Storage Files Tidak Muncul

1. Cek bucket sudah dibuat
2. Cek path file benar
3. Cek RLS policies storage

### Edge Functions Error

1. Cek secrets sudah di-set
2. Cek logs: `supabase functions logs [function-name]`
3. Test local dulu: `supabase functions serve`

---

## Kontak & Support

Jika ada masalah dalam migrasi, hubungi tim development.

---

*Dokumen ini di-generate untuk SoundPub Dashboard migration. Updated: April 2026 (v2.2)*
