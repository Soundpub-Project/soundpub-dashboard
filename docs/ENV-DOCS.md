# SoundPub Dashboard — Environment Variables Documentation

Dokumentasi lengkap environment variables untuk **Lovable Cloud** maupun
**Supabase self-hosted (Docker + VPS)**.

Update: Juli 2026.

---

## Tipe Variables

| Tipe              | Lokasi (Lovable Cloud)                  | Lokasi (Self-Hosted)                        | Akses                        |
|-------------------|-----------------------------------------|---------------------------------------------|------------------------------|
| Auto `.env`       | File `.env` (auto-generated)            | `.env` frontend (di-set manual)             | Frontend (Vite build-time)   |
| Build Secrets     | Workspace Settings → Build Secrets      | CI/CD env vars (Vercel/Netlify/GH Actions)  | Frontend (Vite build-time)   |
| Cloud Secrets     | Lovable → Cloud → Secrets               | `supabase secrets set` / docker `.env`      | Edge Functions runtime       |

> Semua secret backend **tidak boleh** memakai prefix `VITE_` — variabel
> `VITE_*` akan ter-bundle ke JS frontend (public).

---

## 1. Frontend (`.env` / Build Secrets)

### 1.1 Supabase client

| Key                             | Wajib | Deskripsi                                    |
|---------------------------------|-------|----------------------------------------------|
| `VITE_SUPABASE_URL`             | ✅    | URL project. Cloud: `https://<ref>.supabase.co`. Self-host: `https://api.yourdomain.com` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅    | Anon/publishable key                         |
| `VITE_SUPABASE_PROJECT_ID`      | ✅    | Slug/ref project                             |

> Lovable Cloud men-generate ketiganya otomatis. **Jangan** edit manual.
> Di self-host, isi sendiri di `.env` sebelum build dan pastikan file ini
> ada saat CI/CD build; kalau kosong, aplikasi ter-build tapi request
> Supabase akan gagal.

### 1.2 SSO ICCN (keycloak-js)

| Key                       | Wajib | Default        | Deskripsi                                                 |
|---------------------------|-------|----------------|-----------------------------------------------------------|
| `VITE_SSO_BASE_URL`       | ✅    | —              | Base URL Keycloak ICCN, tanpa trailing slash              |
| `VITE_SSO_REALM`          | ✅    | `playground`   | Staging: `playground`. Production: `PORTALICCN`           |
| `VITE_SSO_CLIENT_ID`      | ✅    | `soundpub`     | Client ID terdaftar di Keycloak                           |
| `VITE_SSO_AUTO_REDIRECT`  | ❌    | `false`        | `true` → auto-redirect ke ICCN jika silent SSO gagal      |

Callback ICCN datang lewat **URL fragment** (`/auth#code=...`), bukan
query string. Jangan ubah `redirect_uri` dari `${origin}/auth`.

### 1.3 Analytics (opsional)

| Key                        | Deskripsi                                    |
|----------------------------|----------------------------------------------|
| `VITE_GA4_MEASUREMENT_ID`  | GA4 measurement ID (opsional, tracking)      |

---

## 2. Backend / Edge Functions (Cloud Secrets)

### 2.1 Supabase internal

| Key                          | Cloud | Self-Host                                                                   |
|------------------------------|-------|-----------------------------------------------------------------------------|
| `SUPABASE_URL`               | Auto  | Wajib manual (URL API self-host)                                            |
| `SUPABASE_ANON_KEY`          | Auto  | Wajib manual (ANON_KEY dari `supabase/docker/.env`)                         |
| `SUPABASE_SERVICE_ROLE_KEY`  | Auto  | Wajib manual (SERVICE_ROLE_KEY). **RAHASIA**, tidak boleh di frontend.      |
| `SUPABASE_DB_URL`            | Auto  | Wajib manual (`postgres://postgres:PASS@db:5432/postgres`)                  |
| `SUPABASE_JWKS`              | Auto  | Opsional (URL JWKS Auth)                                                    |
| `SUPABASE_PUBLISHABLE_KEY`   | Auto  | Sama dengan `ANON_KEY` di self-host                                         |

### 2.2 Lovable AI Gateway

| Key               | Cloud | Self-Host                                                    |
|-------------------|-------|--------------------------------------------------------------|
| `LOVABLE_API_KEY` | Auto managed. Rotate via tool. | **Tidak tersedia.** Ganti dengan API key provider AI sendiri (OpenAI/Anthropic/Gemini) di edge function yang memakainya. |

### 2.3 SSO ICCN (Edge Function `sso-login`)

| Key                  | Contoh                                                 |
|----------------------|--------------------------------------------------------|
| `SSO_REALM_URL`      | `https://sso.iccn.or.id/realms/PORTALICCN`             |
| `SSO_CLIENT_ID`      | `soundpub`                                             |
| `ICCN_MEDIA_LABEL_ID`| UUID label "ICCN Media" di tabel `profiles`            |

Cari UUID:
```sql
SELECT id FROM profiles WHERE email = 'halo.iccn@gmail.com';
```

Fallback (opsional, kalau `SSO_REALM_URL` kosong):
```
SSO_BASE_URL=https://sso.iccn.or.id
SSO_REALM=PORTALICCN
```

### 2.4 Payment Gateway (Xendit)

| Key                    | Sumber                                                    |
|------------------------|-----------------------------------------------------------|
| `XENDIT_SECRET_KEY`    | Xendit Dashboard → Settings → Developers → API Keys       |
| `XENDIT_WEBHOOK_TOKEN` | Xendit Dashboard → Settings → Developers → Callback Tokens|

Webhook URL:
- Cloud: `https://<ref>.supabase.co/functions/v1/xendit-webhook`
- Self-host: `https://api.yourdomain.com/functions/v1/xendit-webhook`

### 2.5 Email Notification

Sistem email notif (Juli 2026) menggunakan edge function
**`send-app-email`** dengan template opt-in. Semua profil punya 4 flag
opt-in (`email_notif_payout|release|payment|announcement`), default
`true`. Log kirim tercatat di `public.email_send_log`.

| Key                    | Cloud                                            | Self-Host                                                             |
|------------------------|--------------------------------------------------|-----------------------------------------------------------------------|
| `NOTIFICATION_EMAIL`   | Email default penerima notifikasi admin          | Sama                                                                  |
| `GOOGLE_MAIL_API_KEY`  | Auto (connector Gmail `publishersoundpub@…`)     | **Tidak tersedia** — ganti provider (Resend/SMTP), lihat catatan self-host di MIGRATION-GUIDE §5 |
| `RESEND_API_KEY`       | Legacy, sudah tidak dipakai                      | Opsional, kalau mau pakai Resend sebagai pengganti Gmail connector    |

### 2.6 Google Connectors (Lovable Cloud only)

| Key                    | Catatan                                                  |
|------------------------|----------------------------------------------------------|
| `GOOGLE_MAIL_API_KEY`  | Auto. Kelola via Lovable → Connectors → Google Mail.      |
| `GOOGLE_DRIVE_API_KEY` | Auto. Kelola via Lovable → Connectors → Google Drive.     |

> Untuk self-host, edge function `backup-storage-to-drive` harus
> di-refactor pakai service account GCP + `googleapis` SDK — lihat
> MIGRATION-GUIDE §5.

### 2.7 Google Cloud Storage (Media Library)

| Key                        | Deskripsi                                              |
|----------------------------|--------------------------------------------------------|
| `GCS_PROJECT_ID`           | GCP project ID                                         |
| `GCS_BUCKET_NAME`          | Nama bucket                                            |
| `GCS_SERVICE_ACCOUNT_KEY`  | JSON service account, dijadikan satu baris             |

### 2.8 Spotify (Metadata Fetch)

| Key                       | Sumber                                        |
|---------------------------|-----------------------------------------------|
| `SPOTIFY_CLIENT_ID`       | Spotify for Developers → App                  |
| `SPOTIFY_CLIENT_SECRET`   | Spotify for Developers → App                  |

### 2.9 Analytics

| Key                   | Deskripsi                                       |
|-----------------------|-------------------------------------------------|
| `GA4_MEASUREMENT_ID`  | Backend endpoint `get-ga4-config`               |

---

## Ringkasan Daftar Secret Aktif

```
# Frontend (build-time)
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_SSO_BASE_URL
VITE_SSO_REALM
VITE_SSO_CLIENT_ID
VITE_SSO_AUTO_REDIRECT       # opsional
VITE_GA4_MEASUREMENT_ID      # opsional

# Backend (edge functions)
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_JWKS
SUPABASE_PUBLISHABLE_KEY
LOVABLE_API_KEY              # cloud only
SSO_REALM_URL
SSO_CLIENT_ID
ICCN_MEDIA_LABEL_ID
XENDIT_SECRET_KEY
XENDIT_WEBHOOK_TOKEN
NOTIFICATION_EMAIL
GOOGLE_MAIL_API_KEY          # cloud only (connector)
GOOGLE_DRIVE_API_KEY         # cloud only (connector)
GCS_PROJECT_ID
GCS_BUCKET_NAME
GCS_SERVICE_ACCOUNT_KEY
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
GA4_MEASUREMENT_ID
```

---

## Connector vs Manual Secret

Di Lovable Cloud beberapa secret di-manage lewat **Connectors** (Google
Mail, Google Drive, Search Console, dll). Jangan pakai
`update_secret`/`delete_secret` untuk key-key connector — akan
ter-overwrite. Untuk rotate: buka **Lovable → Connectors → pilih
connector → Reconnect**.

Di self-hosted, connector tidak tersedia — gunakan API key sendiri +
SMTP/service account, dan set lewat `supabase secrets set` atau via
docker-compose environment.

---

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` **hanya** untuk edge function / server.
  Jangan pernah masuk ke frontend bundle atau `VITE_*`.
- Rotate `XENDIT_*` di Xendit Dashboard, lalu update secret.
- Rotate `SPOTIFY_CLIENT_SECRET` via Spotify Developer dashboard.
- Build Secrets ter-bundle ke JS — hanya untuk config publik.
- `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEY`, `ANON_KEY` semua public.
- Password user (`auth.users.encrypted_password`) **tidak portable**
  antar deployment — user perlu reset password setelah migrasi.