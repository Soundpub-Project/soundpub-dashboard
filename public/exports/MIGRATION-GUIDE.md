# SoundPub Dashboard - Migration Guide

Panduan lengkap untuk migrasi dari Lovable Cloud ke Supabase eksternal atau Self-Hosted di VPS.

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
├── full-schema.sql           # Schema lengkap database
├── MIGRATION-GUIDE.md        # Panduan ini
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
2. Copy seluruh isi file `full-schema.sql`
3. Paste dan jalankan di SQL Editor
4. Pastikan tidak ada error

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
9. **payout_requests**
10. **audit_logs**
11. **app_settings**

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

1. `change-own-password` - User ganti password sendiri
2. `create-user` - Admin/Label buat user baru
3. `delete-user` - Admin hapus user
4. `gcs-upload` - Upload ke Google Cloud Storage
5. `get-ga4-config` - Get Google Analytics config
6. `process-royalty-upload` - Process CSV royalty
7. `remove-artist-from-label` - Hapus artist dari label
8. `update-app-settings` - Update settings
9. `update-user-password` - Admin reset password user
10. `update-user-status` - Admin ubah status user

### Setup Secrets

```bash
# Set secrets untuk edge functions
supabase secrets set GCS_PROJECT_ID=your-project-id
supabase secrets set GCS_BUCKET_NAME=your-bucket
supabase secrets set GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
supabase secrets set GA4_MEASUREMENT_ID=G-XXXXXXXXXX
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
- [ ] Payout request berfungsi
- [ ] Audit logs tercatat
- [ ] Role permissions benar

### Test RLS Policies

```sql
-- Test sebagai user biasa
SET request.jwt.claims = '{"sub": "[user-id]", "role": "authenticated"}';

-- Coba query yang seharusnya dibatasi
SELECT * FROM profiles; -- Harus hanya return profile sendiri
SELECT * FROM releases; -- Tergantung role
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

*Dokumen ini di-generate untuk SoundPub Dashboard migration.*
