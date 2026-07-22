# TODO Migrasi Supabase Backend — SoundPub Dashboard

Target backend:
- Supabase URL: `https://supabase.carubra.com`
- App schema: `soundpub_dash`
- Auth schema: `auth` tetap bawaan Supabase
- Storage schema: `storage` tetap bawaan Supabase
- SQL utama: `docs/full-schema-v3.sql`

## 0. Prinsip Migrasi

- [ ] Database aplikasi tidak lagi memakai schema `public`.
- [ ] Semua tabel, enum, function, trigger, RLS app berada di schema `soundpub_dash`.
- [ ] Supabase Auth tetap memakai `auth.users`.
- [ ] Supabase Storage tetap memakai `storage.objects` dan bucket Supabase bawaan.
- [ ] Schema `soundpub_dash` harus diexpose ke Supabase API/PostgREST.
- [ ] Frontend dan scripts migrasi harus diarahkan ke schema `soundpub_dash`, bukan default `public`.

## 1. Persiapan Server Local / VPS

- [ ] Pastikan domain `supabase.carubra.com` sudah mengarah ke server.
- [ ] Install Docker dan Docker Compose.
- [ ] Clone atau siapkan Supabase self-hosted stack di server.
- [ ] Set environment Supabase untuk domain `https://supabase.carubra.com`.
- [ ] Start Supabase services sampai REST, Auth, Storage, Studio, dan DB aktif.
- [ ] Catat credential penting:
  - `SUPABASE_DB_PASSWORD`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `JWT_SECRET`
  - database host/port/container name

## 2. Konfigurasi Schema Non-Public

- [ ] Jalankan SQL `docs/full-schema-v3.sql` ke database Supabase target.
- [ ] Pastikan schema `soundpub_dash` sudah dibuat.
- [ ] Pastikan grants untuk `anon`, `authenticated`, dan `service_role` sudah ada.
- [ ] Pastikan PostgREST mengekspose schema `soundpub_dash`.
- [ ] Jika self-hosted Supabase memakai env PostgREST, set schema kira-kira seperti:
  - `PGRST_DB_SCHEMAS=public,soundpub_dash,storage,graphql_public`
  - atau konfigurasi ekuivalen sesuai stack Supabase yang dipakai.
- [ ] Restart service REST/PostgREST setelah schema list diubah.

## 3. Eksekusi Schema V3

- [ ] Dari server, copy file schema:
  - `docs/full-schema-v3.sql`
- [ ] Jalankan via `psql` ke database target.
- [ ] Contoh dari host/server:
  - `psql "postgresql://postgres:<DB_PASSWORD>@<DB_HOST>:5432/postgres" -f docs/full-schema-v3.sql`
- [ ] Contoh jika masuk ke container DB:
  - `docker exec -i <db-container> psql -U postgres -d postgres < docs/full-schema-v3.sql`
- [ ] Verifikasi object utama:
  - `select schema_name from information_schema.schemata where schema_name = 'soundpub_dash';`
  - `select table_schema, table_name from information_schema.tables where table_schema = 'soundpub_dash' order by table_name;`
  - `select routine_schema, routine_name from information_schema.routines where routine_schema = 'soundpub_dash' order by routine_name;`

## 4. Verifikasi RLS dan Function

- [ ] Pastikan RLS aktif untuk tabel utama:
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
  - `release_payments`
- [ ] Test helper function:
  - `select soundpub_dash.get_user_role('<user_id>');`
  - `select soundpub_dash.is_admin('<user_id>');`
- [ ] Pastikan policy storage masih menunjuk ke function `soundpub_dash.*`.

## 5. Supabase Storage Buckets

- [ ] Buat bucket berikut di Supabase Storage:
  - `release-covers`
  - `track-audio`
  - `track-video`
  - `audio-clips`
  - `label-logos`
- [ ] Tentukan bucket public/private sesuai kebutuhan aplikasi.
- [ ] Test upload dengan user authenticated.
- [ ] Test read file sesuai policy RLS.
- [ ] Migrasi file storage lama dilakukan setelah database import stabil.

## 6. Update Script Migrasi CSV

- [ ] Update script import agar memakai schema `soundpub_dash`.
- [ ] Untuk `@supabase/supabase-js`, opsi yang perlu dipakai:
  - `createClient(url, serviceKey, { db: { schema: 'soundpub_dash' } })`
  - atau gunakan `.schema('soundpub_dash')` sebelum `.from(...)` jika pola client mendukung.
- [ ] File yang perlu dicek:
  - `docs/migration-scripts/import-csv.js`
  - `docs/migration-scripts/migrate.js`
  - `dist/exports/migration-scripts/import-csv.js`
  - `dist/exports/migration-scripts/migrate.js`
- [ ] Pastikan auth admin create user tetap memakai Supabase Auth, bukan schema app.
- [ ] Pastikan foreign key mapping lama ke baru tetap berjalan.
- [ ] Pastikan import order tetap:
  - users auth dari `profiles.csv`
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

## 7. Import Data CSV

- [ ] Isi `.env` script migrasi:
  - `TARGET_SUPABASE_URL=https://supabase.carubra.com`
  - `TARGET_SUPABASE_SERVICE_KEY=<service-role-key>`
  - `CSV_IMPORT_DIR=./exported-data/`
- [ ] Jalankan install dependency di folder migration script:
  - `npm install`
- [ ] Jalankan import:
  - `node import-csv.js`
- [ ] Simpan file mapping:
  - `exported-data/id-mapping.json`
- [ ] Jangan hapus mapping sampai seluruh migrasi dan verifikasi selesai.

## 8. Validasi Data Setelah Import

- [ ] Cek jumlah data per tabel di schema `soundpub_dash`.
- [ ] Bandingkan dengan CSV export:
  - `profiles`: 67 row
  - `artists`: 28 row
  - `releases`: 268 row
  - `tracks`: 3569 row
  - `royalties`: 23934 row
  - `royalty_uploads`: 9 row
  - `audit_logs`: 1329 row
  - `app_settings`: 10 row
- [ ] Cek release tanpa label/profile.
- [ ] Cek track tanpa release.
- [ ] Cek royalties tanpa upload.
- [ ] Cek `artist_user_id` pada `releases`, `tracks`, dan `royalties`.

## 9. Edge Functions Backend

- [ ] Audit semua edge functions yang query tabel app.
- [ ] Update semua query supaya memakai schema `soundpub_dash`.
- [ ] Pastikan secrets tersedia di Supabase target:
  - email/Gmail connector secrets jika dipakai
  - Xendit secrets jika payment aktif
  - SSO/ICCN secrets jika SSO aktif
- [ ] Deploy edge functions ke Supabase target.
- [ ] Test function penting:
  - create payment invoice
  - webhook payment
  - email notification
  - backup storage jika masih dipakai

## 10. Checklist Backend Selesai

- [ ] Supabase berjalan di `https://supabase.carubra.com`.
- [ ] Schema `soundpub_dash` aktif dan diexpose API.
- [ ] SQL v3 sukses dijalankan tanpa error.
- [ ] RLS aktif dan policy berjalan.
- [ ] Storage bucket tersedia.
- [ ] Data CSV berhasil diimport.
- [ ] Edge functions sudah diarahkan ke schema `soundpub_dash`.
- [ ] Service role import tidak digunakan lagi di frontend.
- [ ] Setelah semua backend stabil, lanjut tahap frontend dashboard utama.

## 11. Nanti Saat Lanjut Frontend

- [ ] Update `.env` frontend:
  - `VITE_SUPABASE_URL=https://supabase.carubra.com`
  - `VITE_SUPABASE_ANON_KEY=<anon-key>`
- [ ] Update Supabase client agar memakai schema `soundpub_dash`.
- [ ] Audit query frontend yang hardcode `public` atau RPC tanpa schema.
- [ ] Build dan test dashboard setelah backend selesai.
