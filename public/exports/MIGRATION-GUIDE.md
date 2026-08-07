# SoundPub Dashboard — Migration Guide (Lovable Cloud → Self-Hosted Supabase)

Panduan lengkap migrasi data + aplikasi dari **Lovable Cloud** ke
**Supabase self-hosted** (Docker) di VPS sendiri.

Update: Agustus 2026 (schema `soundpub-dashboard`).

> Untuk setup infrastruktur VPS (Docker, Nginx, SSL) baca dulu
> [`VPS-SETUP-GUIDE.md`](./VPS-SETUP-GUIDE.md). Guide ini fokus ke
> proses migrasi data + rewiring aplikasi.

---

## Overview

```text
Fase 1  → Persiapan target (Supabase Docker aktif di VPS + Nginx + SSL)
Fase 2  → Deploy skema DB (full-schema-v2.sql + APPENDIX Juli 2026)
Fase 3  → Import data (CSV / pg_dump)
Fase 4  → Migrasi file storage
Fase 5  → Deploy edge functions + set secrets + rewiring integrasi eksternal
Fase 6  → Deploy frontend + smoke test
Fase 7  → Cutover DNS + reset password user
```

---

## Fase 1 — Persiapan Target

1. Ikuti `VPS-SETUP-GUIDE.md` sampai `docker compose up -d` sukses dan
   Supabase Studio bisa diakses.
2. Verifikasi:
   - `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` sudah di-generate
     dan tercatat di password manager.
   - Extension `pg_cron` & `pg_net` aktif (butuh untuk backup cron).
   - SMTP siap (untuk email confirm/reset password Supabase Auth).

```sql
-- verify extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

## Fase 2 — Deploy Skema Database

> **Perubahan v2.5 — schema `soundpub-dashboard`.** Semua objek yang
> sebelumnya berada di `public` kini dibuat di schema
> `"soundpub-dashboard"`. Karena nama schema mengandung tanda hubung,
> setiap referensi WAJIB pakai tanda kutip ganda:
> `"soundpub-dashboard".profiles`.

```bash
# 1) Base schema
psql "$SUPABASE_DB_URL" -f docs/full-schema-v2.sql

# 2) Appendix delta (Juni–Juli 2026)
#    Bagian akhir file yang sama sudah berisi APPENDIX. Kalau kamu
#    pisah, jalankan file appendix-nya juga.
```

### 2.1 Expose schema ke PostgREST & frontend

PostgREST hanya melayani schema yang di-whitelist. Tanpa langkah ini
semua query dari frontend akan 404.

```bash
# supabase/docker/.env
PGRST_DB_SCHEMAS="soundpub-dashboard,storage,graphql_public"
PGRST_DB_EXTRA_SEARCH_PATH="public,extensions"

docker compose up -d rest kong
```

Frontend (`src/integrations/supabase/client.ts`) dan semua edge function
harus membuat client dengan schema eksplisit:

```ts
createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'soundpub-dashboard' },
});
```

RPC (`get_royalty_*`) otomatis ikut schema tersebut.

Apa yang harus ada setelah ini:

- Schema `soundpub-dashboard` + `GRANT USAGE` ke `anon`,
  `authenticated`, `service_role`.
- 17 tabel di `soundpub-dashboard`:
  `app_settings`, `artist_profiles`, `artists`, `audit_logs`,
  `composer_royalties`, `email_send_log`, `notifications`,
  `payout_requests`, `profiles`, `release_payments`, `releases`,
  `royalties`, `royalty_uploads`, `storage_backup_log`,
  `storage_backup_runs`, `tracks`, `user_roles`.
- Enum `app_role` = `superadmin, admin, label, whitelabel, artist, copyright`.
- Semua RLS aktif + `SECURITY DEFINER` helpers (`is_admin`, `has_role`,
  `get_user_full_name`, `label_profile_update_safe`,
  `prevent_profile_privilege_escalation`, dll).
- Kolom `profiles.email_notif_*` (payout/release/payment/announcement).
- Kolom `royalties.label_user_id` (FK → `profiles.id`).
- 8 storage bucket (lihat Fase 4).
- `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` dan
  `GRANT ALL ... TO service_role` untuk semua tabel (blok terakhir file
  SQL). Tanpa GRANT, RLS saja tidak cukup — PostgREST balas permission
  denied.

Verifikasi cepat:

```sql
\dt "soundpub-dashboard".*
\df "soundpub-dashboard".*
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='soundpub-dashboard' GROUP BY tablename;
SELECT id, public FROM storage.buckets ORDER BY id;
-- cek grant
SELECT grantee, privilege_type, table_name
  FROM information_schema.role_table_grants
 WHERE table_schema = 'soundpub-dashboard' LIMIT 20;
```

---

## Fase 3 — Import Data

### Opsi A — Full `pg_dump` (recommended)

Kalau kamu punya akses ke DB Lovable Cloud (via `SUPABASE_DB_URL`):

```bash
# Sumber (Lovable Cloud) masih memakai schema `public`.
# Dump data saja — struktur sudah dideploy di Fase 2.
pg_dump "$SOURCE_DB_URL" \
  --data-only \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=supabase_functions \
  --exclude-schema=vault \
  --schema=public \
  --file=soundpub-data.sql

# Rewrite referensi schema public -> soundpub-dashboard sebelum restore
sed -i 's/\bpublic\./"soundpub-dashboard"./g; s/SET search_path = public/SET search_path = "soundpub-dashboard"/g' \
  soundpub-data.sql

# Restore ke target (matikan trigger dulu supaya urutan FK aman)
psql "$TARGET_DB_URL" -c 'SET session_replication_role = replica;' \
                      -f soundpub-data.sql
```

> Alternatif lebih aman: restore dump apa adanya ke schema `public`
> sementara, lalu pindahkan dengan
> `ALTER TABLE public.<t> SET SCHEMA "soundpub-dashboard";` per tabel.

`auth.users` di-migrasi terpisah pakai Auth Admin API (lihat Opsi B) —
jangan copy langsung, hash password tidak portable dan trigger
`handle_new_user` harus jalan agar `profiles` + `user_roles` konsisten.

### Opsi B — CSV via script Node (kalau tidak ada akses `pg_dump`)

```bash
cd docs/migration-scripts
npm install
cp .env.example .env
#   TARGET_SUPABASE_URL        = https://api.yourdomain.com
#   TARGET_SUPABASE_SERVICE_KEY= <SERVICE_ROLE_KEY>

# Letakkan CSV export ke ./exported-data/
node import-csv.js
```

Urutan import (script otomatis handle FK):

1. `profiles` (via Auth Admin API `POST /admin/users`)
2. `user_roles`
3. `artist_profiles`, `artists`
4. `releases` → `tracks`
5. `royalty_uploads` → `royalties` (dengan `label_user_id` di-backfill)
6. `composer_royalties`
7. `release_payments`, `payout_requests`
8. `notifications`, `audit_logs`
9. `app_settings`, `email_send_log`
10. `storage_backup_log`, `storage_backup_runs`

ID mapping user (source→target) disimpan di `exported-data/id-mapping.json`.

### Backfill `royalties.label_user_id`

```sql
WITH unique_labels AS (
  SELECT lower(trim(p.full_name)) AS name_key, MIN(p.id::text)::uuid AS only_id
  FROM "soundpub-dashboard".profiles p
  JOIN "soundpub-dashboard".user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('label','whitelabel')
    AND p.full_name IS NOT NULL AND trim(p.full_name) <> ''
  GROUP BY 1
  HAVING COUNT(*) = 1
)
UPDATE "soundpub-dashboard".royalties r
   SET label_user_id = ul.only_id
  FROM unique_labels ul
 WHERE r.label_user_id IS NULL
   AND lower(trim(r.label_name)) = ul.name_key;
```

---

## Fase 4 — Migrasi Storage

8 bucket:

| Bucket           | Public | Isi                          |
|------------------|--------|------------------------------|
| `track-audio`    | No     | Full track (wav/flac/mp3)    |
| `track-video`    | No     | Music video                  |
| `audio-clips`    | Yes    | Preview 30–60 detik          |
| `release-covers` | No     | Cover art (scoped read)      |
| `label-logos`    | Yes    | Logo label                   |
| `avatars`        | Yes    | Avatar user                  |
| `iccn-gallery`   | Yes    | Galeri ICCN                  |
| `klikus-biolink` | Yes    | Aset biolink                 |

Buat bucket:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('track-audio','track-audio',false),
  ('track-video','track-video',false),
  ('audio-clips','audio-clips',true),
  ('release-covers','release-covers',false),
  ('label-logos','label-logos',true),
  ('avatars','avatars',true),
  ('iccn-gallery','iccn-gallery',true),
  ('klikus-biolink','klikus-biolink',true)
ON CONFLICT (id) DO NOTHING;
```

Policy storage sudah include di skema. Pattern path:

- Upload baru: `{userId}/{filename}` (kecuali `audio-clips` yang legacy).
- File lama tetap dengan path lama; jangan rename (URL di DB point ke
  path lama).

### Opsi A — Restore dari backup Google Drive

Backup harian ke `SoundPub-Backup/YYYY-MM-DD/{bucket}/...`. Download →
upload ke bucket target via `rclone` atau `supabase storage cp`:

```bash
# Contoh dengan supabase CLI (per bucket)
supabase storage cp --recursive ./restore/track-audio ss://track-audio \
  --project-ref self --experimental
```

### Opsi B — Rsync langsung dari source

Kalau punya akses ke storage backend Lovable Cloud (S3-compatible),
pakai `aws s3 sync` / `rclone` bucket-to-bucket.

### Opsi C — Re-upload via API

```bash
curl -X POST "https://api.yourdomain.com/storage/v1/object/track-audio/USERID/song.wav" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @song.wav
```

---

## Fase 5 — Edge Functions + Integrasi Eksternal

### 5.1 Deploy edge functions

```bash
# Repo project frontend
supabase link --project-ref self
supabase functions deploy \
  backup-storage-to-drive \
  change-own-password \
  create-user \
  create-whitelabel-artist \
  create-xendit-invoice \
  delete-royalty-upload \
  delete-user \
  gcs-manage \
  gcs-upload \
  get-catalog-tracks \
  get-ga4-config \
  info-soundpub \
  process-royalty-upload \
  remove-artist-from-label \
  send-app-email \
  send-royalty-notification \
  set-artist-password \
  spotify-fetch-artist \
  sso-login \
  test-gcs \
  update-app-settings \
  update-user-password \
  update-user-status \
  xendit-webhook
```

`supabase/config.toml` sudah men-set `verify_jwt = false` untuk function
yang butuh custom auth (Xendit webhook, SSO, dsb) — jangan diubah.

### 5.2 Set secrets

```bash
supabase secrets set \
  SSO_REALM_URL="https://sso.iccn.or.id/realms/PORTALICCN" \
  SSO_CLIENT_ID="soundpub" \
  ICCN_MEDIA_LABEL_ID="<uuid>" \
  XENDIT_SECRET_KEY="xnd_..." \
  XENDIT_WEBHOOK_TOKEN="..." \
  NOTIFICATION_EMAIL="notif@yourdomain.com" \
  GCS_PROJECT_ID="..." \
  GCS_BUCKET_NAME="..." \
  GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
  SPOTIFY_CLIENT_ID="..." \
  SPOTIFY_CLIENT_SECRET="..." \
  GA4_MEASUREMENT_ID="G-XXXXXXXXXX"
```

Full daftar & catatan per secret di [`ENV-DOCS.md`](./ENV-DOCS.md).

### 5.3 Ganti connector Lovable Cloud (Gmail + Drive)

Di Lovable Cloud, email + backup Drive pakai **connector Google**
(secret `GOOGLE_MAIL_API_KEY`, `GOOGLE_DRIVE_API_KEY`). Di self-host
connector tidak ada — pilih salah satu jalur:

| Fitur                   | Opsi self-host                                                   |
|-------------------------|-------------------------------------------------------------------|
| Email (`send-app-email` & `send-royalty-notification`) | (a) Resend + `RESEND_API_KEY`, (b) SMTP langsung, atau (c) Gmail OAuth service account. Ganti helper `sendGmail` → `sendResend`/`sendSmtp`. |
| Backup Drive (`backup-storage-to-drive`) | Pakai `googleapis` SDK + service account (`GDRIVE_SERVICE_ACCOUNT_KEY`) atau alihkan backup ke S3/B2/wasabi. |

`RESEND_API_KEY` legacy sudah ada di secret list — reuse saja.

### 5.4 Webhook Xendit

Xendit Dashboard → Webhook:

```
URL   : https://api.yourdomain.com/functions/v1/xendit-webhook
Header: x-callback-token = $XENDIT_WEBHOOK_TOKEN
Events: invoice.paid, invoice.expired
```

### 5.5 Cron backup harian

```sql
SELECT cron.schedule(
  'daily-storage-backup',
  '0 19 * * *',   -- 02:00 WIB
  $$SELECT net.http_post(
      url := 'https://api.yourdomain.com/functions/v1/backup-storage-to-drive',
      headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>","x-trigger":"cron"}'::jsonb,
      body := '{}'::jsonb
    );$$
);
```

### 5.6 Redirect URI SSO ICCN

Update di Keycloak ICCN Admin:

```
Valid redirect URIs: https://dashboard.yourdomain.com/auth
Web origins        : https://dashboard.yourdomain.com
```

---

## Fase 6 — Deploy Frontend + Smoke Test

```bash
# Set build-time env
VITE_SUPABASE_URL="https://api.yourdomain.com" \
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>" \
VITE_SUPABASE_PROJECT_ID="self" \
VITE_SSO_BASE_URL="https://sso.iccn.or.id" \
VITE_SSO_REALM="PORTALICCN" \
VITE_SSO_CLIENT_ID="soundpub" \
VITE_SSO_AUTO_REDIRECT="false" \
bun install && bun run build

# Copy dist ke server (Nginx serve)
rsync -avz dist/ user@vps:/var/www/soundpub-dashboard/
```

Smoke test wajib:

- [ ] Login email/password (buat user admin dulu via SQL)
- [ ] Login Google (jika di-enable)
- [ ] Login ICCN SSO
- [ ] Upload release + cover + track audio (verify path `{uid}/...`)
- [ ] Buat payout request → notif ke admin (`send-app-email`)
- [ ] Admin approve/paid → email ke user + balance ter-update
- [ ] Buat invoice Xendit (sandbox) → webhook masuk → status `pending_paid`
- [ ] Trigger manual backup: `POST /functions/v1/backup-storage-to-drive`
- [ ] Verifikasi entry di `storage_backup_runs`
- [ ] Cek `email_send_log` untuk semua template

---

## Fase 7 — Cutover + Post-Migration

1. Freeze source (Lovable Cloud) — tolak semua write dari user.
2. Delta sync data terakhir (`pg_dump --data-only` diff run).
3. Point DNS `dashboard.yourdomain.com` → VPS.
4. Kirim email reset password ke semua user (hash tidak portable):

   ```sql
   -- ambil semua email aktif
   SELECT email FROM auth.users WHERE deleted_at IS NULL;
   ```

   Bulk reset via Auth Admin API atau tombol "kirim reset" di Studio.
5. Monitor 24 jam: `email_send_log`, `storage_backup_runs`, edge
   function logs, error rate.

---

## Catatan Penting

- **Password user tidak portable** antar deployment. Trigger reset
  password wajib setelah cutover.
- **File lama tetap dengan path lama** — URL di DB sudah final.
- **RLS wajib aktif** sebelum import — script pakai service role
  (bypass RLS) untuk insert, tapi jangan lupa `ENABLE ROW LEVEL SECURITY`
  di target sudah on (default di skema).
- **`app.jwt_secret` self-host** harus sama dengan `JWT_SECRET` di
  `supabase/docker/.env` — kalau tidak, `auth.uid()` tidak resolve dan
  semua RLS gagal.
- Cron `daily-storage-backup` verifikasi entry di `storage_backup_runs`
  setelah 24 jam pertama.

---

## Troubleshooting

| Masalah                                          | Solusi                                                                 |
|--------------------------------------------------|------------------------------------------------------------------------|
| RLS recursion error                              | Pastikan `SECURITY DEFINER` helper (`is_admin`, `has_role`) ter-create dulu. |
| Insert `auth.users` gagal (constraint)           | Gunakan Auth Admin API, jangan INSERT langsung.                        |
| `handle_new_user` tidak jalan                    | Cek trigger `on_auth_user_created` di `auth.users` ter-create.         |
| Label tidak lihat royalti-nya                    | `royalties.label_user_id` NULL — jalankan backfill (Fase 3).           |
| Cover release 403 saat dilihat label             | Pastikan `parent_label_id` artist = id label, dan policy `Scoped read release-covers` ada. |
| Webhook Xendit 403                               | Header `x-callback-token` harus persis = `XENDIT_WEBHOOK_TOKEN`.       |
| Email notif tidak terkirim                       | Cek helper email di self-host (Gmail connector tidak ada). Lihat §5.3. |
| Backup Drive 0 file                              | Cek `GDRIVE_SERVICE_ACCOUNT_KEY` + `storage_backup_runs.error`.        |
| `LOVABLE_API_KEY` tidak ditemukan di self-host   | Ganti pemakaian di edge function dengan API key AI provider sendiri.   |
| `Not allowed to modify privileged profile fields` saat SSO baru | Pastikan `handle_new_user` sudah insert row `profiles`; SSO login jangan update kolom protected untuk user existing. |