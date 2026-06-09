# SoundPub Dashboard — Migration Guide

Panduan migrasi data dari Lovable Cloud ke Supabase target. Update: Mei 2026.

---

## Overview

Migrasi terdiri dari 4 fase:

```text
1. Schema      → deploy SQL skema kosong
2. Data        → import CSV ke tabel
3. Storage     → upload file dari backup ke bucket
4. Functions   → deploy edge functions + secrets + webhooks
```

---

## Fase 1 — Deploy Schema

```bash
# Login Supabase target
supabase link --project-ref <target-ref>

# Apply schema
psql "$DATABASE_URL" -f public/exports/full-schema-v2.sql
```

Verifikasi:
- Semua tabel ter-create (`profiles`, `user_roles`, `releases`, `tracks`, `royalties`, dll)
- Tabel storage backup: `storage_backup_log`, `storage_backup_runs`
- Function & trigger SECURITY DEFINER aktif
- Storage buckets ter-create

---

## Fase 2 — Import Data dari CSV

Gunakan script di `public/exports/migration-scripts/`.

```bash
cd public/exports/migration-scripts
npm install
cp .env.example .env
# Edit .env dengan TARGET_SUPABASE_URL & TARGET_SUPABASE_SERVICE_KEY
mkdir -p exported-data && cp /path/to/csv-export/*.csv exported-data/
node import-csv.js
```

Urutan import:
1. `profiles` (via Auth Admin API)
2. `user_roles`
3. `artists` / `artist_profiles`
4. `releases` → `tracks`
5. `royalty_uploads` → `royalties`
6. `composer_royalties`
7. `payout_requests`
8. `audit_logs`
9. `app_settings`

ID mapping disimpan di `exported-data/id-mapping.json`. FK references otomatis di-rewrite.

---

## Fase 3 — Migrasi Storage

### Opsi A — Restore dari backup Google Drive

Backup harian otomatis ke folder `SoundPub-Backup/YYYY-MM-DD/{bucket}/...` di Drive.
Gunakan rclone atau manual download → upload ke Supabase target.

```bash
# Contoh dengan rclone
rclone sync gdrive:SoundPub-Backup/2026-05-07 supabase-target:storage/
```

### Opsi B — Re-upload manual

Download semua file dari Lovable Cloud Storage → upload ke bucket target.
Pastikan path persis sama (URL di DB sudah point ke path lama).

---

## Fase 4 — Deploy Functions + Connect External

### 4.1 Edge Functions

Semua function di `supabase/functions/` ter-deploy otomatis di Lovable.
Untuk Supabase target manual:

```bash
supabase functions deploy --project-ref <target-ref>
```

### 4.2 Set Secrets

Lihat `.env-DOCS.md`. Set lewat Lovable Cloud → Secrets, atau:

```bash
supabase secrets set XENDIT_SECRET_KEY=xxx XENDIT_WEBHOOK_TOKEN=xxx ...
```

### 4.3 Connect Connectors

- **Google Mail** (untuk notifikasi email)
- **Google Drive** (untuk backup harian)

Setup via Lovable → Connectors.

### 4.4 Webhook Xendit

Update di Xendit Dashboard:
```
URL: https://<project-ref>.supabase.co/functions/v1/xendit-webhook
Token: <XENDIT_WEBHOOK_TOKEN>
```

### 4.5 SSO ICCN

Update build secrets workspace:
```
VITE_SSO_BASE_URL=https://sso.iccn.or.id
VITE_SSO_REALM=PORTALICCN
VITE_SSO_CLIENT_ID=soundpub
```

Update redirect URI di Keycloak ICCN: `https://<custom-domain>/auth`

---

## Catatan Penting

- **Password user tidak portable** → kirim email reset ke semua user setelah migrasi.
- **File lama tetap dengan nama lama** (URL di DB sudah final). Hanya upload baru memakai pattern penamaan baru (`{labelId}/{slug}-{stamp}.{ext}`).
- **RLS Policies wajib aktif** sebelum import data, atau gunakan service role key (script sudah handle).
- **Cron `daily-storage-backup`** jalan tiap 02:00 WIB. Verifikasi entry di `storage_backup_runs` setelah 24 jam.

---

## Troubleshooting

| Masalah                              | Solusi                                                 |
|--------------------------------------|--------------------------------------------------------|
| RLS recursion error                  | Pastikan SECURITY DEFINER functions ter-create dulu    |
| `auth.users` insert gagal            | Gunakan Auth Admin API, bukan INSERT langsung          |
| Webhook Xendit return 403            | Cek `XENDIT_WEBHOOK_TOKEN` match header `x-callback-token` |
| Email notif tidak terkirim           | Cek connector Google Mail aktif & `NOTIFICATION_EMAIL` |
| Backup Drive 0 file                  | Cek connector Google Drive + log `storage_backup_runs` |

