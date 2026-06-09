# SoundPub Dashboard — Environment Variables Documentation

Dokumentasi semua environment variables untuk SoundPub Dashboard.
Update: Mei 2026.

---

## Tipe Variables

Ada **3 jenis** environment di Lovable:

| Tipe              | Lokasi                                  | Akses                  | Dikelola Manual? |
|-------------------|------------------------------------------|------------------------|------------------|
| **Auto `.env`**   | File `.env` (auto-generated Lovable)    | Frontend (Vite)        | ❌ JANGAN edit   |
| **Build Secrets** | Workspace Settings → Build Secrets       | Build-time (`bun install`) | ✅ Ya         |
| **Cloud Secrets** | Lovable → Cloud → Secrets                | Edge Functions runtime | ✅ Ya            |

---

## 1. Auto `.env` (Frontend)

Otomatis di-inject Lovable Cloud. **JANGAN edit manual.**

```env
VITE_SUPABASE_PROJECT_ID="opkvvdgnhhopkkeaokzo"
VITE_SUPABASE_URL="https://opkvvdgnhhopkkeaokzo.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<auto>"
```

---

## 2. Build Secrets (Workspace)

Set di **Workspace Settings → Build Secrets**. Tersedia saat build (Vite akan inject ke bundle).

| Key                       | Wajib | Default        | Deskripsi                                                         |
|---------------------------|-------|----------------|-------------------------------------------------------------------|
| `VITE_SSO_BASE_URL`       | ✅    | —              | Base URL Keycloak ICCN, tanpa trailing slash                      |
| `VITE_SSO_REALM`          | ✅    | `playground`   | Realm Keycloak. Production: `PORTALICCN`                          |
| `VITE_SSO_CLIENT_ID`      | ✅    | `soundpub`     | Client ID terdaftar di Keycloak ICCN                              |
| `VITE_SSO_AUTO_REDIRECT`  | ❌    | `false`        | Jika `true`, user belum login auto-redirect ke ICCN               |
| `VITE_GA4_MEASUREMENT_ID` | ❌    | —              | GA4 measurement ID (opsional, frontend tracking)                  |

**Catatan SSO:**
- Callback ICCN datang via URL fragment (`/auth#code=...`), bukan query string.
- Jangan ubah `redirect_uri` ke path selain `${origin}/auth`.

---

## 3. Cloud Secrets (Edge Functions)

Set lewat **Lovable → Cloud → Secrets** (atau `supabase secrets set` untuk self-hosted).

### 3.1 Supabase Internal (auto-managed)
| Key                          | Catatan                                         |
|------------------------------|--------------------------------------------------|
| `SUPABASE_URL`               | Auto                                             |
| `SUPABASE_ANON_KEY`          | Auto                                             |
| `SUPABASE_SERVICE_ROLE_KEY`  | Auto, **rahasia** — hanya untuk edge function   |
| `SUPABASE_JWKS`              | Auto                                             |
| `SUPABASE_DB_URL`            | Auto                                             |
| `SUPABASE_PUBLISHABLE_KEY`   | Auto                                             |

### 3.2 Lovable AI Gateway
| Key               | Catatan                                            |
|-------------------|----------------------------------------------------|
| `LOVABLE_API_KEY` | Auto, managed. Rotate via tool, jangan edit manual.|

### 3.3 SSO ICCN (Backend Verification)
| Key                  | Contoh                                                 |
|----------------------|--------------------------------------------------------|
| `SSO_REALM_URL`      | `https://sso.iccn.or.id/realms/PORTALICCN`             |
| `SSO_CLIENT_ID`      | `soundpub`                                             |
| `ICCN_MEDIA_LABEL_ID`| UUID label "ICCN Media" di tabel `profiles`            |

### 3.4 Payment Gateway (Xendit)
| Key                    | Sumber                                                    |
|------------------------|-----------------------------------------------------------|
| `XENDIT_SECRET_KEY`    | Xendit Dashboard → Settings → Developers → API Keys       |
| `XENDIT_WEBHOOK_TOKEN` | Xendit Dashboard → Settings → Developers → Callback Tokens|

### 3.5 Email Notification
| Key                  | Catatan                                                                |
|----------------------|------------------------------------------------------------------------|
| `NOTIFICATION_EMAIL` | Email default penerima notifikasi admin                                 |
| `RESEND_API_KEY`     | (Legacy) Tidak dipakai lagi sejak Mei 2026 — diganti Gmail connector   |

### 3.6 Google Connectors (Auto-Managed)
| Key                       | Catatan                                                    |
|---------------------------|------------------------------------------------------------|
| `GOOGLE_MAIL_API_KEY`     | Auto. Edit via **Connectors → Google Mail**                |
| `GOOGLE_DRIVE_API_KEY`    | Auto. Edit via **Connectors → Google Drive**               |

### 3.7 Google Cloud Storage (Media Library)
| Key                          | Catatan                                                  |
|------------------------------|----------------------------------------------------------|
| `GCS_PROJECT_ID`             | GCP project ID                                           |
| `GCS_BUCKET_NAME`            | Nama bucket GCS                                          |
| `GCS_SERVICE_ACCOUNT_KEY`    | JSON service account (satu baris)                        |

### 3.8 Spotify (Metadata Fetch)
| Key                   | Sumber                                            |
|-----------------------|---------------------------------------------------|
| `SPOTIFY_CLIENT_ID`   | Spotify for Developers → App                      |
| `SPOTIFY_CLIENT_SECRET`| Spotify for Developers → App                     |

### 3.9 Analytics
| Key                  | Catatan                                              |
|----------------------|------------------------------------------------------|
| `GA4_MEASUREMENT_ID` | Backend access (untuk endpoint `get-ga4-config`)     |

---

## Connector vs Secret Manual

Beberapa secret di-manage via **Connectors** (Google Mail, Google Drive). Untuk rotate atau ganti akun:

1. Buka **Lovable → Connectors**
2. Pilih connector (e.g. Google Mail)
3. Klik **Reconnect** atau **Disconnect** → connect ulang

**Jangan** pakai `update_secret` / `delete_secret` untuk key connector — akan ter-overwrite.

---

## Security Notes

- **JANGAN commit** `.env` ke git (sudah di `.gitignore` Lovable secara internal — file `.env` di repo hanya placeholder dev).
- `SUPABASE_SERVICE_ROLE_KEY` **tidak boleh** dipakai di frontend.
- Rotate secret Xendit jika bocor: ganti di Xendit Dashboard → update di Lovable Secrets.
- Build Secrets ter-bundle ke JS — **jangan masukkan rahasia** di `VITE_*`. Hanya konfigurasi publik.

