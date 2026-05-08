# SoundPub Dashboard — API Documentation

Dokumentasi lengkap semua Edge Functions (REST API) di SoundPub Dashboard.
Update: Mei 2026.

Base URL: `https://<project-ref>.supabase.co/functions/v1/`

Semua endpoint mendukung CORS. Endpoint yang membutuhkan auth meminta header:
```
Authorization: Bearer <supabase_access_token>
```

---

## Daftar Endpoint

| Function                           | Method | Auth         | Deskripsi                                       |
|------------------------------------|--------|--------------|-------------------------------------------------|
| `create-xendit-invoice`            | POST   | User         | Buat invoice Xendit untuk release               |
| `xendit-webhook`                   | POST   | Token Xendit | Callback Xendit (PAID/EXPIRED/FAILED)           |
| `send-royalty-notification`        | POST   | Service      | Kirim email notifikasi royalty (Gmail)          |
| `backup-storage-to-drive`          | POST   | Admin/Cron   | Backup storage ke Google Drive (incremental)    |
| `process-royalty-upload`           | POST   | Admin        | Proses CSV royalty upload                       |
| `delete-royalty-upload`            | POST   | Admin        | Hapus upload royalty + rollback balance         |
| `create-user`                      | POST   | Admin        | Buat user baru (admin/label/whitelabel/artist)  |
| `delete-user`                      | POST   | Admin        | Hapus user                                       |
| `update-user-password`             | POST   | Admin        | Set password user lain                          |
| `change-own-password`              | POST   | User         | User ganti password sendiri                     |
| `update-user-status`               | POST   | Admin        | Aktif/nonaktif user                             |
| `set-artist-password`              | POST   | Admin        | Set password awal artist                        |
| `create-whitelabel-artist`         | POST   | Whitelabel   | Whitelabel buat artist baru                     |
| `remove-artist-from-label`         | POST   | Admin/Label  | Lepas artist dari label parent                  |
| `sso-login`                        | POST   | Public       | Login SSO ICCN (verify token Keycloak)          |
| `info-soundpub`                    | GET    | Public       | Info publik service SoundPub                    |
| `get-catalog-tracks`               | GET    | Public       | Catalog API (proxy)                             |
| `get-ga4-config`                   | GET    | Public       | GA4 measurement ID                              |
| `update-app-settings`              | POST   | Admin        | Update `app_settings` (whitelist key)           |
| `gcs-upload`                       | POST   | Admin        | Upload ke Google Cloud Storage                  |
| `gcs-manage`                       | POST   | Admin        | List/delete file GCS                            |
| `test-gcs`                         | GET    | Admin        | Test koneksi GCS                                |
| `spotify-fetch-artist`             | POST   | User         | Fetch metadata artist dari Spotify              |

---

## Endpoint Details

### POST `/create-xendit-invoice`

Buat invoice pembayaran release. Reuse invoice pending yang masih valid.

**Request:**
```json
{ "release_id": "uuid" }
```

**Response 200:**
```json
{
  "invoice_url": "https://checkout.xendit.co/...",
  "invoice_id": "xnd_inv_xxx",
  "amount": 150000,
  "track_count": 3,
  "price_per_track": 50000,
  "reused": false
}
```

**Errors:** `401` Unauthorized, `404` Release not found, `500` Xendit error.

---

### POST `/xendit-webhook`

Dipanggil Xendit saat status invoice berubah. **Tidak boleh dipanggil manual.**

**Headers:** `x-callback-token: <XENDIT_WEBHOOK_TOKEN>`

**Request:** (dari Xendit)
```json
{ "id": "xnd_inv_xxx", "status": "PAID" }
```

**Behavior:**
- `PAID` / `SETTLED` → release status `pending_paid`, kirim notif user + admin, kirim email Gmail
- `EXPIRED` / `FAILED` → release status `draft`, notif user
- Update `release_payments.status`

---

### POST `/send-royalty-notification`

Kirim email notifikasi royalty via Gmail connector (`publishersoundpub@gmail.com`).

**Request:**
```json
{
  "upload_id": "uuid",
  "period": "2026-04",
  "total_royalties": 5000000,
  "label_breakdown": [...]
}
```

Email dikirim ke: admin (`NOTIFICATION_EMAIL`) + email semua label terkait.

---

### POST `/backup-storage-to-drive`

Backup incremental storage Supabase → Google Drive.
Dipanggil otomatis tiap hari 02:00 WIB via cron `daily-storage-backup`.

**Request:** (kosong, atau)
```json
{ "trigger": "manual", "buckets": ["release-covers"] }
```

**Response 200:**
```json
{
  "run_id": "uuid",
  "files_uploaded": 23,
  "files_skipped": 412,
  "errors_count": 0,
  "duration_ms": 18420
}
```

**Limit:** 40 file/run, 200MB/file, 50 file/bucket.
File >200MB di-skip dan tercatat di `storage_backup_runs.details`.

---

### POST `/process-royalty-upload`

Proses CSV royalty (matching ISRC, hitung net split 70/21/9, update balance).

**Request:**
```json
{ "upload_id": "uuid" }
```

---

### POST `/create-user`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "full_name": "Nama Lengkap",
  "role": "label",
  "parent_label_id": "uuid (artist only)"
}
```

---

### POST `/sso-login`

Verify Keycloak token, sync user ke `profiles` + `user_roles`, return Supabase session.

**Request:**
```json
{ "access_token": "<keycloak-token>", "id_token": "<keycloak-id-token>" }
```

---

### GET `/info-soundpub`

Public unauthenticated. Return info service SoundPub (untuk integrasi external).

**Response:**
```json
{
  "service": "SoundPub Music Distribution",
  "version": "2.0",
  "features": ["distribution", "royalty", "analytics"],
  "support_email": "publisher@soundpub.xyz"
}
```

---

## Standar Response Error

Semua function return:
```json
{ "error": "Pesan error aman", "details": "optional" }
```

Status code:
- `400` — Bad request (validation gagal)
- `401` — Tidak ada / invalid auth token
- `403` — Forbidden (role tidak cukup)
- `404` — Resource not found
- `500` — Internal error (cek edge function logs)

---

## Edge Function Standards

- `verify_jwt = false` (validasi JWT manual di code untuk fleksibilitas signing keys)
- CORS headers di-inline di setiap response (termasuk error)
- Lock `@supabase/supabase-js` ke versi `2.49.1`
- Return HTTP 200 + JSON error untuk client-friendly handling pada beberapa endpoint
- Service role key hanya dipakai di edge function (tidak pernah di-expose ke client)

