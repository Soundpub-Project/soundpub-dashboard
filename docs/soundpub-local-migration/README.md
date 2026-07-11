# SoundPub Local Migration

Paket ini dibuat khusus untuk migrasi data SoundPub dari export Lovable CSV ke Supabase Local/self-hosted dengan schema `soundpub`.

Target saat ini:

- Supabase API: `http://20.20.20.173:8000`
- Supabase Studio: `https://supabase.carubra.com/project/default`
- Database schema: `soundpub`
- Package manager: `pnpm`

## Isi Folder

- `01-reset-and-recreate-soundpub.sql` — reset schema `soundpub` lalu membuat ulang table, function, policy, trigger, dan index.
- `02-initial-seed.sql` — seed default `app_settings` dan template admin role.
- `.env.example` — template environment import CSV.
- `package.json` — script pnpm untuk import/check CSV.
- `import-csv-soundpub.js` — import CSV ke schema `soundpub`.
- `exported-data/` — CSV hasil export Lovable.

## Alur Migrasi

### 1. Backup Dulu

Sebelum reset schema, pastikan tidak ada data penting di schema `soundpub` local.

Script reset hanya menghapus schema `soundpub`, bukan schema lain.

### 2. Reset dan Buat Ulang Schema

Buka Supabase Studio:

`https://supabase.carubra.com/project/default`

Lalu:

1. Masuk ke SQL Editor.
2. Buat New Query.
3. Copy isi `01-reset-and-recreate-soundpub.sql`.
4. Run.
5. Pastikan selesai tanpa error.

Script ini menjalankan:

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP SCHEMA IF EXISTS soundpub CASCADE;
CREATE SCHEMA soundpub;
```

Lalu membuat ulang seluruh object schema `soundpub`.

### 3. Seed Default Settings

Masih di SQL Editor:

1. Copy isi `02-initial-seed.sql`.
2. Run bagian default `app_settings`.
3. Jika ingin membuat superadmin, buat user dulu di Supabase Auth UI.
4. Edit blok admin template di `02-initial-seed.sql`, ganti `admin@example.com` dengan email admin sebenarnya.
5. Run blok admin template.

### 4. Setup Environment Import

Masuk ke folder ini:

```bash
cd docs/soundpub-local-migration
```

Copy env:

```bash
cp .env.example .env
```

Isi `.env`:

```env
TARGET_SUPABASE_URL=http://20.20.20.173:8000
TARGET_SUPABASE_SERVICE_KEY=ISI_SERVICE_ROLE_KEY_LOCAL
TARGET_DB_SCHEMA=soundpub
CSV_IMPORT_DIR=./exported-data
DEFAULT_USER_PASSWORD=ChangeMe123456!
```

Catatan:

- `TARGET_SUPABASE_SERVICE_KEY` wajib service role key, bukan anon key.
- `DEFAULT_USER_PASSWORD` hanya password sementara untuk user import.
- Setelah import, user sebaiknya reset password.

### 5. Install Dependency dengan pnpm

```bash
pnpm install
```

### 6. Cek CSV Sebelum Import

```bash
pnpm check:csv
```

Perintah ini hanya memeriksa file CSV dan jumlah row, belum melakukan import.

### 7. Import CSV

```bash
pnpm import:csv
```

Script akan:

1. Membuat user Auth dari `profiles.csv`.
2. Menyimpan mapping ID lama ke ID baru di `exported-data/id-mapping.json`.
3. Import `profiles`.
4. Import `user_roles`.
5. Import table lain sesuai dependency.

### 8. Verifikasi di Supabase Studio

Cek schema `soundpub` dan pastikan row count masuk untuk table utama:

- `profiles`
- `user_roles`
- `artists`
- `releases`
- `tracks`
- `royalty_uploads`
- `royalties`
- `composer_royalties`
- `payout_requests`
- `audit_logs`
- `app_settings`

### 9. Storage Buckets

Data CSV tidak otomatis memindahkan file storage.

Pastikan bucket berikut ada di Supabase local:

- `avatars`
- `release-covers`
- `track-audio`
- `track-video`
- `audio-clips`
- `label-logos`
- `iccn-gallery`

File storage perlu dipindahkan manual atau dengan script terpisah.

### 10. Update Frontend

Pastikan root `.env.local` project utama berisi:

```env
VITE_SUPABASE_URL=http://20.20.20.173:8000
VITE_SUPABASE_PUBLISHABLE_KEY=ISI_ANON_KEY_LOCAL
VITE_DATABASE_SCHEMA=soundpub
```

Lalu dari root project:

```bash
pnpm dev
```

## Troubleshooting

### Error table/type/trigger already exists

Jalankan ulang `01-reset-and-recreate-soundpub.sql`. Script ini reset schema `soundpub` dari nol.

### Error service role unauthorized

Pastikan `TARGET_SUPABASE_SERVICE_KEY` adalah service role key dari Supabase local.

### Data masuk ke public, bukan soundpub

Pastikan `.env` berisi:

```env
TARGET_DB_SCHEMA=soundpub
```

Script import menggunakan:

```js
db: { schema: TARGET_SCHEMA }
```

### User tidak bisa login

User hasil import memakai password sementara `DEFAULT_USER_PASSWORD`. Untuk production, kirim reset password ke user.
## 9. Fix Storage Bucket Error

Kalau upload gambar/audio/video gagal dengan error dari `/storage/v1/object/...`, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/09-storage-buckets-and-policies.sql
```

File ini membuat/memperbaiki bucket SoundPub:

- `avatars`
- `label-logos`
- `iccn-gallery`
- `release-covers`
- `track-audio`
- `track-video`
- `audio-clips`

Catatan: patch ini sengaja dibuat cukup longgar untuk fase migrasi/debug lokal. Setelah semua fitur stabil, policy bisa diketatkan lagi per role/folder owner.

### Jika masih muncul `The object exceeded the maximum allowed size`

Jalankan ulang `09-storage-buckets-and-policies.sql` terlebih dahulu karena patch terbaru menaikkan limit `track-audio` dan `track-video` menjadi 2GB.

Kalau error tetap muncul, berarti batas global service Supabase Storage di server masih lebih kecil dari bucket. Naikkan konfigurasi Storage self-hosted, biasanya env seperti:

```env
STORAGE_FILE_SIZE_LIMIT=2147483648
FILE_SIZE_LIMIT=2147483648
```

Nama env bisa berbeda tergantung docker-compose self-hosted yang dipakai. Setelah env diubah, restart container/service Storage.

## 10. Reconcile User Roles dari CSV

Kalau role user hasil import tidak sesuai dengan export Lovable, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/10-reconcile-user-roles-from-csv.sql
```

File ini hanya mengubah `soundpub.user_roles` untuk user yang ada di `exported-data/user_roles_2026-07-10.csv`. Data `auth.users`, `soundpub.profiles`, releases, tracks, royalties, dan data lain tidak dihapus.

Expected role dari CSV:

- `artist`: 78
- `admin`: 2
- `copyright`: 3
- `user`: 5
- `superadmin`: 2
- `whitelabel`: 10
- `label`: 4

Setelah selesai, refresh halaman Users/Admin dan cek lagi filter/role Whitelabel.

## 11. Fix Auth Signup CORS

Kalau registrasi manual gagal dengan error CORS di `/auth/v1/signup`, perbaiki konfigurasi service `auth` pada Docker Supabase self-hosted.

Contoh env yang perlu ada/diubah di service `auth`:

```yaml
API_EXTERNAL_URL: https://supabase.carubra.com
GOTRUE_SITE_URL: https://web.maskhar.com
GOTRUE_URI_ALLOW_LIST: https://web.maskhar.com,https://web.maskhar.com/**,http://localhost:5173,http://localhost:8080,http://20.20.20.173:5173,http://20.20.20.173:8080
GOTRUE_DISABLE_SIGNUP: "false"
GOTRUE_EXTERNAL_GOOGLE_ENABLED: "false"
```

Kalau belum memakai SMTP/email verification, untuk sementara bisa aktifkan auto-confirm:

```yaml
GOTRUE_MAILER_AUTOCONFIRM: "true"
```

Setelah mengubah env, restart container `supabase-auth` dan bila perlu `kong`/gateway. Pastikan frontend production memakai `VITE_SUPABASE_URL=https://supabase.carubra.com`.

## 12. Signup Manual Jadi Artist di Bawah Soundpub

Kalau user daftar mandiri harus otomatis menjadi `artist` di bawah label Soundpub, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/11-signup-default-artist-under-soundpub.sql
```

Patch ini mengganti trigger `soundpub.handle_new_user()` agar signup baru otomatis:

- membuat row di `soundpub.profiles`
- mengisi `parent_label_id` ke Soundpub Music Ecosystem
- memberi role `artist`
- memperbaiki user self-register lama yang masih role `user` dan belum punya `parent_label_id`

## 13. Add Missing Royalties Columns

Kalau frontend error `column royalties.net_revenue does not exist`, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/12-add-missing-royalties-columns.sql
```

Patch ini menambahkan kolom yang ada di CSV export tapi belum di schema lokal:

- `net_revenue` - revenue bersih untuk tiap royalty row
- `artist_user_id` - UUID user artist (mapped dari nama)
- `label_user_id` - UUID user label (mapped dari nama)

Kolom ini dipakai oleh frontend untuk kalkulasi dan display royalty dashboard.

## 14. Recalculate Royalty Balances

Setelah logic upload/delete royalty diperbaiki, jalankan file ini untuk menyamakan saldo user dari data `soundpub.royalties` yang masih ada:

```sql
-- docs/soundpub-local-migration/13-recalculate-royalty-balances.sql
```

Rumus yang dipakai:

- Artist mapped: `70%` dari `net_revenue`
- Label/whitelabel kalau artist ada: `21%` dari `net_revenue`
- Label/whitelabel kalau artist tidak ada: `91%` dari `net_revenue`
- Admin/platform share: `9%`, tidak masuk saldo user

File ini reset hanya kolom saldo royalty-derived: `balance`, `artist_revenue`, dan `label_revenue`.

## 15. Reset Semua Saldo Profile

Kalau ingin mengosongkan semua saldo profile terlebih dahulu, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/14-reset-all-profile-balances.sql
```

File ini akan mereset:

- `soundpub.profiles.balance`
- `soundpub.profiles.artist_revenue`
- `soundpub.profiles.label_revenue`
- `soundpub.composer_royalties.total_net_royalti`

Tidak menghapus user, profile, release, track, atau royalty rows.

## 16. Scan Orphan Artist Data

Kalau daftar artist di label/whitelabel menampilkan artist yang tidak punya akun/role valid, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/15-scan-orphan-artist-data.sql
```

File ini mengecek:

- profile yang tidak punya row di `auth.users`
- child profile di bawah label/whitelabel yang bukan role `artist`
- release yang `artist_user_id`-nya invalid
- track yang `artist_user_id`-nya invalid
- release yang punya `artist_name` tetapi belum terhubung ke `artist_user_id`

Bagian bawah file berisi optional fix yang masih dikomentari. Review hasil scan dulu sebelum menjalankan fix.

## 17. Normalize Soundpub Split dan Recalculate Royalty

Setelah rumus split final disepakati, jalankan file ini di Supabase Studio SQL Editor:

```sql
-- docs/soundpub-local-migration/16-normalize-soundpub-split-and-recalculate.sql
```

File ini:

- menambahkan kolom `soundpub.royalties.label_revenue`
- menormalisasi variasi nama `Soundpub`, `Soundpub Music`, dan `Soundpub Music Ecosystem` menjadi `SOUNDPUB MUSIC`
- menghitung ulang split royalty:
  - `SOUNDPUB MUSIC`: 70% artist, 30% label utama
  - label/whitelabel lain: 49% artist, 21% label, 30% admin
- menghitung ulang `profiles.balance`, `profiles.artist_revenue`, dan `profiles.label_revenue`
