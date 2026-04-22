

## Analisis Lengkap Sistem SSO ICCN

### Arsitektur Saat Ini

```text
┌────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  /auth     │───▶│  Keycloak    │───▶│  Edge Function    │───▶│  Supabase    │
│  (browser) │◀───│  ICCN SSO    │    │  sso-login        │    │  Auth + DB   │
└────────────┘    └──────────────┘    └──────────────────┘    └──────────────┘
       │                                       │
       │  keycloak-js (PKCE S256)              │  verifyJwt + JWKS
       │  redirect_uri: /auth                  │  generateLink + verifyOtp
       │  exchange code → token                │  return Supabase session
```

### Komponen Inti

| File | Peran |
|------|-------|
| `src/lib/keycloak.ts` | Singleton Keycloak client, lazy init |
| `src/context/SsoAuthContext.tsx` | Context React untuk login/logout SSO + auto-callback |
| `src/pages/Auth.tsx` | UI tombol "Login via SSO" |
| `supabase/functions/sso-login/index.ts` | Verifikasi JWT, upsert user, generate session |
| `public/silent-check-sso.html` | Helper untuk silent SSO (tidak dipakai saat ini) |

### Masalah yang Ditemukan (Akar Penyebab Auto-Login Gagal)

**1. Tidak Ada Auto-Login / Silent SSO**
Saat ini Keycloak hanya di-init **dua kondisi**:
- User klik tombol "Login via SSO" (`triggerSsoLogin`)
- URL berisi `?code=...&state=...` (callback)

Tidak ada mekanisme **silent check** saat user buka `/auth`. Akibatnya, meskipun user sudah login di portal ICCN lain (cookie SSO aktif di `sso.iccn.or.id`), aplikasi SoundPub **tidak mendeteksinya** dan tetap menampilkan form login.

**2. `redirect_uri` Inkonsisten**
- `initKeycloakAndLogin` redirect ke `/auth`
- `keycloakLogout` redirect ke `/`
- Callback diproses di mana saja (`SsoAuthProvider` mount di App root), tapi user yang refresh di `/dashboard` dengan token SSO valid tidak akan ter-trigger silent login.

**3. Refresh Token Supabase Hilang**
Log auth menunjukkan `400: Invalid Refresh Token: Refresh Token Not Found` dari `dev.soundpub.xyz`. Ini terjadi karena:
- Session Supabase yang dibuat via `setSession` tidak persisten lintas tab/refresh
- Tidak ada mekanisme **auto-refresh** dari Keycloak ke Supabase saat token Supabase expired

**4. Tidak Ada `silent-check-sso.html` Workflow**
File HTML sudah ada (`public/silent-check-sso.html`), tapi **tidak pernah dipanggil** dari kode. Padahal ini fitur penting Keycloak untuk auto-detect session tanpa redirect penuh.

**5. Reset Instance Terlalu Agresif**
`resetKeycloak()` dipanggil setiap init, sehingga state authenticated/token Keycloak tidak pernah persisten antar pemanggilan dalam satu session browser. Ini menggagalkan refresh token Keycloak (`kc.updateToken()`).

**6. Edge Function `sso-login` Selalu Generate Session Baru**
Setiap kali token SSO ditukar, function generate magiclink + verifyOtp baru. Ini membuat refresh token lama invalid → menyebabkan error `refresh_token_not_found` ketika tab lain mencoba refresh.

---

### Perbaikan yang Diusulkan

#### A. Tambah Silent SSO Check saat App Mount
- Modifikasi `SsoAuthContext` untuk menjalankan `kc.init({ onLoad: 'check-sso', silentCheckSsoRedirectUri: '/silent-check-sso.html' })` **sekali saat mount** (bukan auto redirect login)
- Jika `authenticated === true` dari silent check → otomatis tukar token ke Supabase session
- Jika `false` → tidak ada redirect, user tetap di `/auth` dan bisa pilih login manual

#### B. Persistent Keycloak Instance + Token Refresh
- Hapus `resetKeycloak()` dari `initKeycloak` (hanya reset di error/logout)
- Setup interval `kc.updateToken(60)` setiap 30 detik agar token Keycloak fresh
- Saat token Keycloak refresh sukses → trigger refresh Supabase session juga

#### C. Konsisten redirect_uri
- Semua flow (login, callback, logout) gunakan `${window.location.origin}/auth`
- Setelah callback sukses, redirect ke `/dashboard`

#### D. Edge Function: Tambah Mode "refresh"
- Tambah parameter `mode: 'refresh' | 'login'` di body
- Mode `refresh`: cek apakah user sudah ada Supabase session aktif, kalau iya jangan generate baru
- Cegah invalidasi refresh token Supabase yang masih valid

#### E. Better Error Handling & Logging
- Log step-by-step di console untuk debugging
- Tampilkan error spesifik di UI (mis. "Token ICCN expired", "Tidak ada akses", dll)
- Banner di `/auth` yang menampilkan status silent check ("Memeriksa sesi ICCN...")

---

### File yang Akan Diedit

| File | Perubahan |
|------|-----------|
| `src/lib/keycloak.ts` | Tambah `initKeycloakSilent()`, `setupTokenRefresh()`, perbaiki redirect_uri konsisten, hapus reset agresif |
| `src/context/SsoAuthContext.tsx` | Tambah silent check on mount, auto-exchange jika authenticated, setup token refresh interval |
| `src/pages/Auth.tsx` | Tampilkan status "Memeriksa sesi ICCN..." saat silent check berjalan |
| `supabase/functions/sso-login/index.ts` | Tambah mode `refresh` (opsional), better idempotency saat session sudah ada |
| `public/silent-check-sso.html` | Sudah ada — pastikan tidak di-cache PWA/SW |

### Yang Tidak Berubah
- Flow login email/password
- Flow Google OAuth
- Logika upsert user di edge function (verifikasi JWT, role artist, parent_label_id)
- Schema database

### Catatan Penting
- Silent SSO **butuh konfigurasi di Keycloak ICCN**: origin `https://dashboard.soundpub.xyz` dan `https://*.lovable.app` harus ada di Web Origins client `soundpub`. Jika belum, silent check akan diam-diam gagal (CORS iframe). Kita akan tambahkan log warning supaya jelas saat ini terjadi.

