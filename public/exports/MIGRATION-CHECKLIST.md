# SoundPub Dashboard — Migration Checklist

Update terakhir: Mei 2026

Checklist untuk migrasi/setup ulang SoundPub Dashboard ke Supabase target (Lovable Cloud atau self-hosted Supabase).

---

## 1. Pra-Migrasi

- [ ] Pastikan akun Supabase target tersedia (project + service role key)
- [ ] Backup data Lovable Cloud terbaru (export CSV via tool internal)
- [ ] Catat semua secrets yang aktif (lihat `.env-DOCS.md`)
- [ ] Cek koneksi connector aktif: **Google Mail** & **Google Drive**
- [ ] Pastikan Pro plan / Lovable Cloud aktif (untuk edge functions + cron)

## 2. Schema Database

- [ ] Deploy `full-schema-v2.sql` ke Supabase target
- [ ] Verifikasi semua RLS policies aktif (`alter table ... enable row level security`)
- [ ] Verifikasi SECURITY DEFINER functions (`is_admin`, `has_role`, `get_user_full_name`, dll)
- [ ] Verifikasi `app_role` enum: `superadmin, admin, label, whitelabel, artist, copyright`
- [ ] Tabel baru (Mei 2026): `storage_backup_log`, `storage_backup_runs`

## 3. Storage Buckets

Buat 8 buckets:

| Bucket            | Public | Catatan                         |
|-------------------|--------|---------------------------------|
| `track-audio`     | No     | File full track (mp3/wav/flac)  |
| `track-video`     | No     | Music video                     |
| `audio-clips`     | Yes    | Preview clip 30 detik           |
| `release-covers`  | No     | Cover art release               |
| `label-logos`     | Yes    | Logo label                      |
| `avatars`         | Yes    | Avatar user                     |
| `iccn-gallery`    | Yes    | Galeri ICCN                     |
| `klikus-biolink`  | Yes    | Aset bio link                   |

- [ ] Setup RLS storage policies per bucket (lihat `full-schema-v2.sql` bagian storage)
- [ ] Verifikasi pattern path: `{labelId}/{slug}-{stamp}.{ext}` (cover), `{labelId}/{releaseSlug}/{trackSlug}-{full|clip}-{stamp}.{ext}` (audio)

## 4. Cron Jobs (pg_cron)

- [ ] `daily-storage-backup` → `0 19 * * *` (02:00 WIB) — backup ke Google Drive
- [ ] Verifikasi extension `pg_cron` dan `pg_net` aktif

## 5. Edge Functions

Deploy semua function di `supabase/functions/`. Semua otomatis ter-deploy oleh Lovable.

Wajib check:
- [ ] `create-xendit-invoice`
- [ ] `xendit-webhook`
- [ ] `send-royalty-notification` (sudah pakai Gmail connector)
- [ ] `backup-storage-to-drive` (baru, Mei 2026)
- [ ] `process-royalty-upload`, `delete-royalty-upload`
- [ ] `create-user`, `delete-user`, `update-user-password`, `update-user-status`
- [ ] `sso-login`, `info-soundpub`
- [ ] `gcs-manage`, `gcs-upload`, `test-gcs`

## 6. Secrets (Cloud Secrets)

Lihat `.env-DOCS.md` bagian "Cloud Secrets". Wajib:
- [ ] `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`
- [ ] `SSO_REALM_URL`, `SSO_CLIENT_ID`, `ICCN_MEDIA_LABEL_ID`
- [ ] `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`
- [ ] `NOTIFICATION_EMAIL`
- [ ] Connectors: `GOOGLE_MAIL_API_KEY`, `GOOGLE_DRIVE_API_KEY` (auto-managed)
- [ ] `LOVABLE_API_KEY` (auto-managed untuk AI Gateway)

## 7. Webhook External

- [ ] Xendit Dashboard → Webhook URL: `https://<project-ref>.supabase.co/functions/v1/xendit-webhook`
- [ ] Set callback token sesuai `XENDIT_WEBHOOK_TOKEN`

## 8. Build Secrets (Workspace)

Untuk build frontend di production:
- [ ] `VITE_SSO_BASE_URL`
- [ ] `VITE_SSO_REALM`
- [ ] `VITE_SSO_CLIENT_ID`
- [ ] `VITE_SSO_AUTO_REDIRECT` (`true`/`false`)

## 9. Post-Migration

- [ ] Test login: email/password, Google OAuth, ICCN SSO
- [ ] Test upload release + cover + track audio
- [ ] Test pembayaran Xendit (sandbox dulu)
- [ ] Test webhook payment → release status `pending_paid`
- [ ] Test trigger manual backup Drive (POST ke edge function)
- [ ] Test email notifikasi royalty (cek inbox Gmail label/admin)
- [ ] Verifikasi cron `daily-storage-backup` jalan 24 jam pertama
- [ ] Reset password semua user (password hash tidak portable)

## 10. Connector Setup

- [ ] **Google Mail**: connect akun `publishersoundpub@gmail.com` via Connectors
- [ ] **Google Drive**: connect akun dengan kapasitas ≥ 2TB untuk backup storage

