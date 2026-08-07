# SoundPub Dashboard — Migration Checklist

Checklist end-to-end untuk migrasi/setup ulang ke **Supabase
self-hosted** di VPS. Pair dengan [`MIGRATION-GUIDE.md`](./MIGRATION-GUIDE.md)
dan [`VPS-SETUP-GUIDE.md`](./VPS-SETUP-GUIDE.md).

Update terakhir: Agustus 2026 (schema `soundpub-dashboard`).

---

## 1. Pra-Migrasi

- [ ] VPS siap (spesifikasi minimal di VPS-SETUP-GUIDE §1)
- [ ] Domain sudah point ke VPS (`dashboard.*`, `api.*`, `studio.*`)
- [ ] Backup terbaru data Lovable Cloud (`pg_dump` atau CSV export)
- [ ] Backup terbaru file storage (Google Drive backup harian)
- [ ] Catat semua secret aktif (lihat `ENV-DOCS.md`)
- [ ] Password manager siap untuk generate `JWT_SECRET`, `ANON_KEY`,
      `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`

## 2. Infrastruktur (Fase 1)

- [ ] Docker Engine 24+ & Docker Compose 2.20+ terinstall
- [ ] `supabase/docker` di-clone, `.env` di-set (nilai unik, aman)
- [ ] `docker compose up -d` semua container `healthy`
- [ ] Nginx + SSL (Let's Encrypt) untuk `api.*`, `studio.*`, `dashboard.*`
- [ ] Extension `pg_cron`, `pg_net` aktif

## 3. Schema Database (Fase 2)

- [ ] Deploy `docs/full-schema-v2.sql` (termasuk APPENDIX Juli 2026)
- [ ] Enum `app_role`: `superadmin, admin, label, whitelabel, artist, copyright`
- [ ] 17 tabel di schema `soundpub-dashboard`:
      `app_settings`, `artist_profiles`, `artists`, `audit_logs`,
      `composer_royalties`, `email_send_log`, `notifications`,
      `payout_requests`, `profiles`, `release_payments`, `releases`,
      `royalties`, `royalty_uploads`, `storage_backup_log`,
      `storage_backup_runs`, `tracks`, `user_roles`
- [ ] `profiles.email_notif_{payout,release,payment,announcement}` ada
- [ ] `royalties.label_user_id` ada + index
- [ ] Semua RLS `ENABLE`d, policies ter-create
- [ ] Helper `SECURITY DEFINER` aktif:
      `is_admin`, `is_whitelabel`, `has_role`, `get_user_role`,
      `get_user_full_name`, `get_user_artist_name`,
      `get_user_parent_label_id`, `get_user_release_label_ids`,
      `get_artist_user_id_by_name`, `label_profile_update_safe`,
      `prevent_profile_privilege_escalation`,
      `update_balance_on_payout_status_change`, `update_timestamp`,
      `handle_new_user`, dan seluruh `get_royalty_*` (10 RPC agregat)
- [ ] Trigger `on_auth_user_created` di `auth.users`

## 4. Storage Buckets (Fase 4)

8 bucket:

| Bucket           | Public | Catatan                          |
|------------------|--------|----------------------------------|
| `track-audio`    | No     | Full track (mp3/wav/flac)        |
| `track-video`    | No     | Music video                      |
| `audio-clips`    | Yes    | Preview 30–60 detik              |
| `release-covers` | No     | Scoped read (owner/admin/label)  |
| `label-logos`    | Yes    | Logo label                       |
| `avatars`        | Yes    | Avatar user                      |
| `iccn-gallery`   | Yes    | Galeri ICCN                      |
| `klikus-biolink` | Yes    | Aset biolink                     |

- [ ] 8 bucket ter-create
- [ ] Storage policies (folder-scoped INSERT/UPDATE/DELETE) ter-create
- [ ] Policy `Scoped read release-covers` aktif
- [ ] Path baru mengikuti `{userId}/{filename}`

## 5. Cron Jobs (`pg_cron`)

- [ ] Job `daily-storage-backup` — schedule `0 19 * * *` (02:00 WIB)
- [ ] Verifikasi entry di `storage_backup_runs` setelah 24 jam

## 6. Edge Functions (Fase 5)

- [ ] Semua function di `supabase/functions/` ter-deploy:
  - [ ] `create-user`, `delete-user`, `update-user-status`,
        `update-user-password`, `change-own-password`,
        `create-whitelabel-artist`, `set-artist-password`,
        `remove-artist-from-label`
  - [ ] `process-royalty-upload`, `delete-royalty-upload`
  - [ ] `send-app-email` **(baru — Juni 2026)**
  - [ ] `send-royalty-notification`
  - [ ] `create-xendit-invoice`, `xendit-webhook`
  - [ ] `backup-storage-to-drive`
  - [ ] `gcs-manage`, `gcs-upload`, `test-gcs`
  - [ ] `sso-login`, `info-soundpub`, `get-catalog-tracks`
  - [ ] `get-ga4-config`, `update-app-settings`, `spotify-fetch-artist`
- [ ] `verify_jwt=false` sesuai `supabase/config.toml` (jangan diubah)

## 7. Cloud Secrets (Backend)

Lihat detail di [`ENV-DOCS.md`](./ENV-DOCS.md).

- [ ] Supabase internal: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`,
      `SUPABASE_PUBLISHABLE_KEY`
- [ ] SSO ICCN: `SSO_REALM_URL`, `SSO_CLIENT_ID`, `ICCN_MEDIA_LABEL_ID`
- [ ] Xendit: `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`
- [ ] Email: `NOTIFICATION_EMAIL` (+ `RESEND_API_KEY` kalau ganti Gmail)
- [ ] GCS: `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`
- [ ] Spotify: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- [ ] Analytics: `GA4_MEASUREMENT_ID`
- [ ] Provider AI pengganti `LOVABLE_API_KEY` (tidak tersedia di self-host)

## 8. Frontend Build Secrets

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
      `VITE_SUPABASE_PROJECT_ID`
- [ ] `VITE_SSO_BASE_URL`, `VITE_SSO_REALM` (`PORTALICCN`/`playground`),
      `VITE_SSO_CLIENT_ID`, `VITE_SSO_AUTO_REDIRECT`
- [ ] `VITE_GA4_MEASUREMENT_ID` (opsional)

## 9. Webhook & Redirect Eksternal

- [ ] Xendit Dashboard → webhook URL:
      `https://api.yourdomain.com/functions/v1/xendit-webhook`
      + `x-callback-token = XENDIT_WEBHOOK_TOKEN`
- [ ] Keycloak ICCN → Valid redirect URI:
      `https://dashboard.yourdomain.com/auth`
      + Web Origins: `https://dashboard.yourdomain.com`
- [ ] Google OAuth (jika enabled) → redirect URI: `https://api.yourdomain.com/auth/v1/callback`

## 10. Migrasi Data (Fase 3)

- [ ] `pg_dump --data-only` (opsi A) atau CSV via `import-csv.js` (opsi B)
- [ ] `auth.users` di-migrasi via Auth Admin API (bukan INSERT langsung)
- [ ] `id-mapping.json` disimpan
- [ ] Backfill `royalties.label_user_id`
- [ ] Verifikasi row count semua tabel match source

## 11. Migrasi File Storage (Fase 4)

- [ ] Semua file dari Google Drive backup ter-upload ke bucket target
- [ ] URL di DB (`releases.cover_url`, `tracks.audio_url`, dll) masih
      resolve — buka 5 sampel manual
- [ ] Signed URL untuk `track-audio` masih valid (1 tahun)

## 12. Frontend Deployment (Fase 6)

- [ ] `bun install && bun run build`
- [ ] Nginx serve `dist/` dengan SPA fallback (`try_files ... /index.html`)
- [ ] HTTPS aktif di `dashboard.yourdomain.com`
- [ ] Preview: buka URL, DevTools tidak error 404 Supabase

## 13. Post-Migration Smoke Test (Fase 7)

- [ ] Login email/password
- [ ] Login Google OAuth (jika enabled)
- [ ] Login ICCN SSO
- [ ] Upload release + cover + track audio
- [ ] Payout request → notif email admin
- [ ] Payout approve/paid → email user + balance ter-update
- [ ] Buat invoice Xendit sandbox → webhook → status `pending_paid`
- [ ] Trigger manual `backup-storage-to-drive`
- [ ] Cron `daily-storage-backup` jalan (verifikasi H+1)
- [ ] Email notif royalty (via `send-royalty-notification`)
- [ ] Announcement broadcast (via `send-app-email` template `announcement`)
- [ ] Cek `email_send_log` untuk semua template (sent/failed/suppressed)
- [ ] Cek `audit_logs` bertambah untuk aksi admin

## 14. Cutover

- [ ] Freeze source (Lovable Cloud) — announce ke user
- [ ] Delta sync data terakhir
- [ ] Point DNS `dashboard.yourdomain.com` ke VPS
- [ ] Kirim email reset password ke semua user (hash tidak portable)
- [ ] Monitor 24 jam pertama (error rate, cron, email log)

## 15. Security Hardening

- [ ] Firewall VPS: hanya 80, 443, 22 (dengan IP allowlist bila bisa)
- [ ] SSH key-only, disable password auth
- [ ] `POSTGRES_PASSWORD`, `JWT_SECRET`, `DASHBOARD_PASSWORD` kuat & unik
- [ ] `SERVICE_ROLE_KEY` **tidak** ada di frontend bundle
- [ ] Rotate secret Xendit/Spotify/GCS jika bocor
- [ ] Backup harian DB (`pg_dump`) + storage → external location
- [ ] Update Supabase Docker image berkala (`docker compose pull`)