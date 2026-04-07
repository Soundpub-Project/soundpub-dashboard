
# Plan: Integrasi SSO Keycloak ICCN ke SoundPub (Revisi v2)

## Ringkasan

User ICCN yang sudah login di ekosistem ICCN akan otomatis masuk ke SoundPub sebagai **Artist di bawah Label "ICCN Media"**. Tidak ada penyimpanan `sso_id` di database — sistem hanya sinkronisasi **email + nama** dari token Keycloak, lalu upsert ke profil Supabase.

Login email/password tetap tersedia untuk user non-ICCN.

## Arsitektur

```text
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│                                                         │
│  1. App mount → keycloak-js check-sso (iframe)          │
│     ├─ Session ICCN ada → access_token didapat          │
│     │  → Kirim ke Edge Function "sso-login"             │
│     │  → Edge function:                                 │
│     │     a. Verify JWT (JWKS RS256)                    │
│     │     b. Extract email + nama dari token            │
│     │     c. Cari/buat user di Supabase                 │
│     │     d. Set role = artist, parent_label_id = ICCN  │
│     │     e. Return Supabase session                    │
│     │  → Auto login ke dashboard                        │
│     └─ Session tidak ada → Auth page normal             │
│                                                         │
│  2. Setelah login SSO pertama kali:                     │
│     → Tampilkan form "Lengkapi Data Artis/Band"         │
│     → Bisa di-skip (lihat-lihat dulu)                   │
│     → WAJIB diisi sebelum buat Release                  │
└─────────────────────────────────────────────────────────┘
```

## Perubahan yang Diperlukan

### 1. Database — Tambah kolom `sso_provider` di profiles

```sql
-- Hanya menandai bahwa user ini masuk via SSO (tanpa menyimpan sso_id)
ALTER TABLE public.profiles ADD COLUMN sso_provider text DEFAULT null;
-- Menandai apakah user SSO sudah melengkapi data artis/band
ALTER TABLE public.profiles ADD COLUMN artist_profile_completed boolean DEFAULT false;
```

- `sso_provider = 'iccn'` → menandai user SSO dari ICCN
- `artist_profile_completed = false` → user SSO belum isi data artis/band
- **TIDAK** menyimpan `sso_id` di database

### 2. Database — Tabel baru `artist_profiles` (data diri artis/band)

```sql
CREATE TABLE public.artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  artist_type text NOT NULL DEFAULT 'solo', -- 'solo' | 'band' | 'group'
  bio text,
  genre text,
  social_links jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;

-- User bisa lihat dan edit data artis sendiri
CREATE POLICY "Users can view own artist profile"
  ON public.artist_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own artist profile"
  ON public.artist_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own artist profile"
  ON public.artist_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin bisa lihat semua
CREATE POLICY "Admins can manage all artist profiles"
  ON public.artist_profiles FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Label ICCN Media bisa lihat artis-artisnya
CREATE POLICY "Labels can view their artist profiles"
  ON public.artist_profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE parent_label_id = auth.uid()
    )
  );
```

### 3. Edge Function — `sso-login`

File: `supabase/functions/sso-login/index.ts`

Flow:
1. Terima `{ keycloak_token: string }` dari frontend
2. Fetch JWKS → verify JWT RS256 + issuer + expiry
3. Extract **email** dan **nama** dari token (field `email`, `name` atau `preferred_username`)
4. Cek `resource_access[soundpub].roles` — harus ada akses
5. Cari user di profiles by **email**:
   - **Ada**: Update `sso_provider = 'iccn'` jika belum, login via magic link
   - **Tidak ada**: Create user baru via `supabase.auth.admin.createUser()`:
     - `email` dari token
     - `full_name` dari token  
     - Random secure password (user tidak perlu tahu, login via SSO)
     - Set `sso_provider = 'iccn'`
     - Set `parent_label_id` = UUID label "ICCN Media"
     - Insert role `artist` ke `user_roles`
     - Insert ke tabel `artists` (nama = full_name, label_id = ICCN Media UUID)
     - Set `artist_profile_completed = false`
6. Generate Supabase session → return `{ access_token, refresh_token }`

**Secrets yang dibutuhkan:**
- `SSO_REALM_URL` = `https://sso.iccn.or.id/realms/playground` (staging)
- `SSO_CLIENT_ID` = `soundpub`
- `ICCN_MEDIA_LABEL_ID` = UUID dari user "ICCN Media" yang sudah didaftarkan sebagai Label

### 4. Frontend — `src/lib/keycloak.ts`

Wrapper keycloak-js:
- Config dari env vars (`VITE_SSO_BASE_URL`, `VITE_SSO_REALM`, `VITE_SSO_CLIENT_ID`)
- `initKeycloak()` — init dengan `check-sso` + silent iframe
- `keycloakLogin()` — redirect ke Keycloak login
- `keycloakLogout()` — redirect ke Keycloak logout URL
- `getToken()` — ambil access_token

### 5. Frontend — `public/silent-check-sso.html`

```html
<!DOCTYPE html>
<html><body>
  <script>parent.postMessage(location.href, location.origin);</script>
</body></html>
```

### 6. Frontend — `src/context/SsoAuthContext.tsx`

Provider yang:
- Init keycloak-js saat mount (`check-sso` mode)
- Jika ICCN session terdeteksi → kirim token ke `sso-login` → set Supabase session
- Expose: `ssoLoading`, `ssoAuthenticated`, `triggerSsoLogin()`, `triggerSsoLogout()`

### 7. Frontend — Form "Lengkapi Data Artis/Band" (BARU)

File: `src/components/onboarding/ArtistOnboardingDialog.tsx`

- Muncul otomatis setelah login SSO pertama kali (`artist_profile_completed = false`)
- Field:
  - Nama Artis/Band (wajib)
  - Tipe: Solo / Band / Group (wajib)
  - Bio (opsional)
  - Genre (opsional)
  - Link sosial media (opsional)
- Tombol **"Simpan"** → insert ke `artist_profiles`, update `profiles.artist_profile_completed = true`
- Tombol **"Nanti Saja / Skip"** → tutup dialog, tapi flag tetap `false`

### 8. Frontend — Enforce data artis sebelum buat Release

Di `ReleaseFormDialog.tsx` atau page Releases:
- Sebelum buka form tambah release, cek `profile.artist_profile_completed`
- Jika `false` → tampilkan dialog `ArtistOnboardingDialog` dengan pesan "Anda harus melengkapi data artis terlebih dahulu"
- Tidak bisa di-skip dalam konteks ini

### 9. Frontend — Update `useAuth.tsx`

Tambah:
- `isSsoUser: boolean` → cek `profile?.sso_provider != null`
- `isArtistProfileCompleted: boolean` → cek `profile?.artist_profile_completed`

### 10. Frontend — Update `Auth.tsx`

- Tambah tombol **"Login via ICCN"** di halaman login
- SSO auto-detect: jika `check-sso` menemukan session → langsung login tanpa klik
- Loading state selama proses SSO

### 11. Frontend — Update `Settings.tsx`

- Jika `isSsoUser`:
  - Sembunyikan form "Ubah Password" (password managed by Keycloak)
  - Tampilkan info "Login via ICCN SSO"
  - Tampilkan/edit data artis/band dari `artist_profiles`

### 12. Frontend — Update `AppSidebar.tsx`

- Jika `isSsoUser`: logout → clear Supabase session + redirect Keycloak logout

### 13. Frontend — Update `App.tsx`

- Wrap dengan `SsoAuthProvider`

## Perlakuan Khusus User SSO ICCN

| Aspek | User Email/Password | User SSO ICCN |
|---|---|---|
| Login | Form email + password | Auto-detect / tombol "Login via ICCN" |
| Role | Sesuai assignment admin | Otomatis `artist` di bawah ICCN Media |
| Password | Bisa ubah | Tidak ada (managed Keycloak) |
| Data artis | Tidak wajib | Wajib diisi sebelum buat release |
| Onboarding | Tidak ada | Dialog lengkapi data artis/band |
| Label | Sesuai assignment | Otomatis "ICCN Media" |
| Logout | Clear Supabase | Clear Supabase + Keycloak logout |
| Signup | Tersedia | Tidak ada (harus dari ekosistem ICCN) |

## File yang Akan Dibuat/Diubah

| File | Aksi |
|---|---|
| `supabase/functions/sso-login/index.ts` | **Baru** — Verify Keycloak JWT + upsert user |
| `src/lib/keycloak.ts` | **Baru** — Keycloak wrapper |
| `src/context/SsoAuthContext.tsx` | **Baru** — SSO context provider |
| `src/components/onboarding/ArtistOnboardingDialog.tsx` | **Baru** — Form data artis/band |
| `public/silent-check-sso.html` | **Baru** — Silent check iframe |
| Migration SQL | **Baru** — `sso_provider`, `artist_profile_completed`, tabel `artist_profiles` |
| `src/hooks/useAuth.tsx` | **Update** — `isSsoUser`, `isArtistProfileCompleted` |
| `src/pages/Auth.tsx` | **Update** — Tombol SSO + auto-detect |
| `src/App.tsx` | **Update** — Wrap `SsoAuthProvider` |
| `src/pages/Settings.tsx` | **Update** — Hide password, tampil data artis |
| `src/components/layout/AppSidebar.tsx` | **Update** — SSO logout |
| `src/components/releases/ReleaseFormDialog.tsx` | **Update** — Cek artist_profile_completed |

## Dependensi Baru

- `keycloak-js` — Official Keycloak JavaScript adapter

## Urutan Implementasi

1. Database migration (`sso_provider`, `artist_profile_completed`, `artist_profiles`)
2. Add secrets (`SSO_REALM_URL`, `SSO_CLIENT_ID`, `ICCN_MEDIA_LABEL_ID`)
3. Install `keycloak-js`
4. Edge function `sso-login`
5. Frontend: `keycloak.ts` + `silent-check-sso.html`
6. Frontend: `SsoAuthContext.tsx`
7. Frontend: `ArtistOnboardingDialog.tsx`
8. Update: `useAuth`, `Auth.tsx`, `Settings.tsx`, `AppSidebar.tsx`, `App.tsx`
9. Update: `ReleaseFormDialog.tsx` (enforce artist profile)
10. Testing end-to-end

## Catatan Penting

- **Label "ICCN Media"** harus sudah ada di database sebagai user dengan role `label`. UUID-nya disimpan sebagai secret `ICCN_MEDIA_LABEL_ID`.
- **Tidak ada `sso_id`** — identifikasi user SSO hanya via email. Jika email SSO sama dengan user yang sudah ada, akun akan di-link otomatis.
- **Data dari SSO**: Hanya **email** dan **nama** yang diambil dari token Keycloak.
- **Tabel `artist_profiles`** terpisah dari `profiles` — menyimpan informasi spesifik artis/band yang diisi user sendiri.
