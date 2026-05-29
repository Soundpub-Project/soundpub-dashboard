# Plan: Integrasi SSO Keycloak ICCN ke SoundPub

## Ringkasan

Integrasi SSO Keycloak ICCN menggunakan `keycloak-js` di frontend untuk mendeteksi session aktif dari ekosistem ICCN. Jika user sudah login di portal ICCN lain, mereka otomatis login ke SoundPub tanpa perlu klik tombol. Login email/password tetap tersedia sebagai fallback.

## Arsitektur

```text
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│                                                         │
│  1. App mount → keycloak-js check-sso (iframe)          │
│     ├─ Session ada → access_token didapat               │
│     │  → Kirim ke Edge Function "sso-login"             │
│     │  → Dapat Supabase session → auto login            │
│     └─ Session tidak ada → tampilkan Auth page normal   │
│                                                         │
│  2. Auth page: Tab Login | Tab Daftar | Tombol SSO ICCN │
│     └─ Klik SSO → redirect ke Keycloak login page       │
│        → callback → verify → Supabase session           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Edge Function: sso-login                               │
│                                                         │
│  1. Terima access_token Keycloak                        │
│  2. Verify JWT via JWKS (RS256 signature + issuer)      │
│  3. Cek resource_access[soundpub].roles                 │
│  4. Upsert: cari profiles by sso_id → by email → baru  │
│  5. Generate Supabase session via admin.generateLink()  │
│     atau signInWithPassword (service role)               │
│  6. Return Supabase access_token + refresh_token        │
└─────────────────────────────────────────────────────────┘
```

## Perubahan yang Diperlukan

### 1. Database — Tambah kolom `sso_id` di profiles

```sql
ALTER TABLE public.profiles ADD COLUMN sso_id text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN sso_provider text DEFAULT null;
CREATE INDEX idx_profiles_sso_id ON public.profiles(sso_id) WHERE sso_id IS NOT NULL;
```

Kolom `sso_id` menyimpan field `sub` dari JWT Keycloak, digunakan untuk mapping user SSO ke user Supabase.

### 2. Database — Role baru (opsional)

SSO user dari ICCN akan di-assign role berdasarkan `resource_access[soundpub].roles` dari JWT Keycloak. Mapping:

| Keycloak Role | SoundPub Role | Keterangan                           |
| ------------- | ------------- | ------------------------------------ |
| `ADMIN`     | `admin`     | Full admin                           |
| `MEMBER`    | `user`      | User biasa                           |
| `VIEWER`    | `user`      | Read-only, treatment khusus via flag |

Jika diperlukan role khusus SSO, bisa tambah value `'sso_member'` ke enum `app_role`.

### 3. Edge Function — `sso-login`

File: `supabase/functions/sso-login/index.ts`

Fungsi utama:

- Terima `{ keycloak_token: string }` dari frontend
- Fetch JWKS dari `https://sso.iccn.or.id/realms/{realm}/protocol/openid-connect/certs`
- Verify signature RS256 + issuer + expiry
- Cek `resource_access[soundpub].roles` ada dan tidak kosong
- Cari user di DB: `SELECT * FROM profiles WHERE sso_id = {sub}` → fallback `WHERE email = {email}`
- Jika tidak ada: create user via `supabase.auth.admin.createUser()`, set `sso_id`, role
- Jika ada: update `sso_id` jika belum di-set (linking by email)
- Generate magic link atau sign in: `supabase.auth.admin.generateLink({ type: 'magiclink', email })`
- Return `{ access_token, refresh_token }` ke frontend

Secrets yang dibutuhkan:

- `SSO_BASE_URL` = `https://sso.iccn.or.id`
- `SSO_REALM` = `playground` (staging) / `PORTALICCN` (production)
- `SSO_CLIENT_ID` = `soundpub`

### 4. Frontend — `src/lib/keycloak.ts`

Wrapper untuk `keycloak-js`:

- Config dari env vars (`VITE_SSO_BASE_URL`, `VITE_SSO_REALM`, `VITE_SSO_CLIENT_ID`)
- `initKeycloak()` — init dengan `check-sso` + silent iframe
- `buildLoginUrl(redirectUri)` — generate login URL
- `buildLogoutUrl(postLogoutRedirectUri, idTokenHint)` — manual logout URL
- `exchangeRefreshToken()` — force refresh via `kc.updateToken(-1)`
- `hasClientAccess(token)` — decode JWT, cek resource_access roles

### 5. Frontend — `public/silent-check-sso.html`

File wajib untuk iframe silent check:

```html
<!DOCTYPE html>
<html><body>
  <script>parent.postMessage(location.href, location.origin);</script>
</body></html>
```

### 6. Frontend — `src/context/SsoAuthContext.tsx`

Context provider yang:

- Init keycloak-js saat app mount (`check-sso`)
- Jika authenticated → kirim token ke Edge Function `sso-login` → set Supabase session
- Expose state: `ssoAuthenticated`, `ssoLoading`, `ssoLogin()`, `ssoLogout()`

### 7. Frontend — Update `useAuth.tsx`

- Tambah `isSsoUser: boolean` (cek `profile?.sso_id !== null`)
- Tambah `ssoLogout()` yang clear session Keycloak + Supabase
- Update `signOut()` untuk handle SSO logout jika user adalah SSO user

### 8. Frontend — Update `Auth.tsx`

- Tambah tombol "Login via SSO ICCN" di halaman login
- Jika `check-sso` mendeteksi session aktif → auto-redirect ke dashboard (tanpa perlu klik)
- Tampilkan loading state saat proses SSO check berlangsung

### 9. Frontend — Update `AppSidebar.tsx`

- Update logout handler: jika SSO user → redirect ke Keycloak logout URL

### 10. Konfigurasi untuk Kedua Environment

**Lovable Cloud (dev/staging):**

- Env vars via `.env`: `VITE_SSO_*`
- Edge function secrets via Cloud Secrets
- `allowed-origins` di Keycloak harus include `*.lovable.app`

**Self-hosted (production VPS):**

- Env vars di `.env` file server
- Edge function secrets di Supabase self-hosted config
- `allowed-origins` di Keycloak: domain production

## Perlakuan Khusus User SSO

| Aspek         | User Email/Password    | User SSO ICCN                             |
| ------------- | ---------------------- | ----------------------------------------- |
| Login         | Form email + password  | Auto-detect atau tombol SSO               |
| Password      | Bisa ubah              | Tidak ada password (managed Keycloak)     |
| Profile edit  | Semua field            | Nama, avatar, dll sync dari Keycloak JWT  |
| Logout        | Clear Supabase session | Clear Supabase + redirect Keycloak logout |
| Settings page | Tampil form password   | Sembunyikan form password                 |
| Signup        | Tersedia               | Tidak tersedia (harus dari ICCN)          |

## File yang Akan Dibuat/Diubah

| File                                      | Aksi                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| `supabase/functions/sso-login/index.ts` | **Baru** — Edge function verify + upsert       |
| `src/lib/keycloak.ts`                   | **Baru** — Keycloak wrapper                    |
| `src/context/SsoAuthContext.tsx`        | **Baru** — SSO context provider                |
| `public/silent-check-sso.html`          | **Baru** — Silent check iframe                 |
| `src/hooks/useAuth.tsx`                 | **Update** — Tambah `isSsoUser`, SSO logout  |
| `src/pages/Auth.tsx`                    | **Update** — Tombol SSO + auto-detect          |
| `src/App.tsx`                           | **Update** — Wrap `SsoAuthProvider`          |
| `src/pages/Settings.tsx`                | **Update** — Hide password form untuk SSO user |
| `src/components/layout/AppSidebar.tsx`  | **Update** — SSO logout handler                |
| Migration SQL                             | **Baru** — Tambah `sso_id` column            |

## Dependensi Baru

- `keycloak-js` — Official Keycloak JavaScript adapter

## Urutan Implementasi

1. Database migration (tambah `sso_id`)
2. Add secrets (`SSO_BASE_URL`, `SSO_REALM`, `SSO_CLIENT_ID`)
3. Edge function `sso-login`
4. Frontend keycloak wrapper + silent-check-sso.html
5. SSO context provider
6. Update Auth page + useAuth + Settings + Sidebar
7. Testing end-to-end
