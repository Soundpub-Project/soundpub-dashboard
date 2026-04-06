

## Solusi: Export Data Langsung via Database

### Masalah
- `SUPABASE_SERVICE_ROLE_KEY` **tidak tersedia** di Lovable Cloud untuk pengguna
- Script `migrate.js` membutuhkan key ini untuk membaca data dari source
- Ini adalah limitasi Lovable Cloud yang tidak bisa diatasi

### Solusi: Export Langsung ke File

Karena kita punya akses `psql` (read-only) ke database dari sandbox, kita bisa:

1. **Export semua tabel ke CSV** langsung dari database
2. **Generate SQL INSERT statements** untuk import di server target
3. User tinggal download file dan import di Supabase target

### Rencana Implementasi

#### 1. Buat script export (`/tmp/export-data.sh`)
Script akan export data dari semua tabel dalam urutan yang benar:
- `profiles` → `user_roles` → `artists` → `releases` → `tracks`
- `royalty_uploads` → `royalties` → `composer_royalties`
- `payout_requests` → `audit_logs` → `app_settings`

Output: CSV files di `/mnt/documents/export/`

#### 2. Update migration script (`migrate.js`)
Ubah agar mendukung **mode CSV import** — tidak perlu source service key lagi, cukup:
```env
# Hanya perlu TARGET
TARGET_SUPABASE_URL=https://your-server.supabase.co
TARGET_SUPABASE_SERVICE_KEY=your-target-service-role-key
CSV_IMPORT_DIR=./exported-data/
```

#### 3. Update dokumentasi migrasi
- Jelaskan bahwa export dilakukan dari Lovable sandbox
- Hapus requirement `SOURCE_SUPABASE_SERVICE_KEY`
- Tambah instruksi import CSV ke Supabase target

### Output Files
```
/mnt/documents/export/
├── profiles.csv
├── user_roles.csv
├── artists.csv
├── releases.csv
├── tracks.csv
├── royalty_uploads.csv
├── royalties.csv
├── composer_royalties.csv
├── payout_requests.csv
├── audit_logs.csv
├── app_settings.csv
└── import-guide.md
```

### Catatan Penting
- **Users/Auth**: Data auth (email, password hash) tidak bisa diexport via `psql` karena tabel `auth.users` di-manage Supabase. User harus di-create ulang di target dan reset password.
- **Storage files**: Harus di-download manual dari Cloud view → Storage
- **User ID mapping**: Karena user di-create ulang, ID akan berubah. CSV perlu di-update dengan ID baru setelah create users di target.

