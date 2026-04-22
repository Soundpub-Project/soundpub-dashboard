# Dokumentasi Integrasi SSO — SoundPub Dashboard

## 1. Arsitektur

```
┌──────────┐     ┌───────────┐     ┌──────────────────┐     ┌──────────────┐
│  Browser  │────▶│ Keycloak  │────▶│ Edge Function    │────▶│ Supabase Auth│
│ (Frontend)│◀───│ (ICCN SSO)│     │ (sso-login)      │     │ + Database   │
└──────────┘     └───────────┘     └──────────────────┘     └──────────────┘
```

### Alur Login SSO

1. User klik "Login SSO" di halaman `/auth`
2. Frontend menginisialisasi Keycloak dan mengarahkan user ke halaman login ICCN
3. Setelah autentikasi berhasil, Keycloak mengembalikan JWT (access token)
4. Frontend mengirim JWT ke Edge Function `sso-login`
5. Edge Function:
   - Memverifikasi JWT (signature, issuer, expiry)
   - Mengecek `resource_access` untuk memastikan user punya akses
   - Membuat atau meng-update user di Supabase
   - Menyinkronkan profil (nama, email, avatar, parent label, role)
   - Mengembalikan session tokens (access_token + refresh_token)
6. Frontend menyimpan session via `supabase.auth.setSession()`

---

## 2. Data yang Disinkronkan dari JWT

| Field JWT | Kolom di `profiles` | Keterangan |
|---|---|---|
| `email` | `email` | Digunakan sebagai identifier utama |
| `fullname` / `name` / `preferred_username` | `full_name` | Prioritas: `fullname` > `name` > `preferred_username` |
| `avatar` | `avatar_url` | URL foto profil dari Keycloak (hanya jika user belum punya avatar) |
| `phone` | `phone` | Nomor HP (hanya jika kolom masih kosong) |
| `city` | `city` | Kota domisili (hanya jika kosong) |
| `province` | `province` | Provinsi (hanya jika kosong) |
| `type` | `sso_user_type` | Tipe user ICCN: `korda` / `pengurus` / null |
| `sub` | `sso_user_id` | ID stabil dari Keycloak (untuk tracking jika email berubah) |
| `azp` | — (validasi) | Harus sama dengan `SSO_CLIENT_ID`, jika tidak token ditolak |
| - | `sso_provider` | Diset ke `'iccn'` untuk semua user SSO ICCN |
| - | `parent_label_id` | Diset ke ID label ICCN Media |
| - | `artist_profile_completed` | `false` untuk user baru |
| - | `password_set` | `false` untuk user baru via SSO |

### Data Tambahan yang Dibuat

- **Tabel `user_roles`**: Role diset ke `artist`
- **Tabel `artists`**: Entry dibuat di bawah label ICCN Media

### Aturan Sinkronisasi

- **User pertama login**: Semua field SSO yang tersedia langsung diisi.
- **User existing login ulang**: Hanya kolom yang masih `NULL` yang diisi — data yang sudah diedit user TIDAK ditimpa.
- **Validasi `azp`**: Token dengan `azp` yang tidak sesuai `SSO_CLIENT_ID` akan ditolak (HTTP 401).

---

## 3. Kolom `sso_provider` — Identifikasi Metode Login

Kolom `sso_provider` di tabel `profiles` menyimpan informasi metode login user:

| Nilai | Metode Login | Keterangan |
|---|---|---|
| `NULL` | Email/Password | User mendaftar langsung via form signup |
| `'iccn'` | SSO ICCN | User login via Keycloak ICCN |
| `'google'` | Google OAuth | User login via Google (akan datang) |

### Cara Admin Melihat Metode Login

Di halaman **Users** (`/dashboard/users`), admin dapat:
- Melihat kolom **"Login"** yang menampilkan badge metode login
- Memfilter user berdasarkan metode login (Email / SSO ICCN / Google)

---

## 4. Flow Onboarding Artis untuk User SSO

1. User SSO login pertama kali → Edge Function membuat akun dengan `artist_profile_completed = false`
2. User masuk ke Dashboard → Dialog "Lengkapi Profil Artis" muncul otomatis
3. User dapat skip dialog, tetapi banner pengingat tetap tampil di dashboard
4. User **wajib** melengkapi profil artis sebelum bisa menambahkan release baru
5. Setelah profil dilengkapi → `artist_profile_completed = true`, banner hilang

### Data Profil Artis (tabel `artist_profiles`)

- `artist_name` — Nama artis/band
- `artist_type` — solo / band / group
- `genre` — Genre musik
- `bio` — Biografi singkat
- `social_links` — Link media sosial (JSON)

---

## 5. Secrets yang Diperlukan

| Secret | Keterangan |
|---|---|
| `SSO_REALM_URL` | URL lengkap realm Keycloak (issuer) |
| `SSO_CLIENT_ID` | Client ID di Keycloak (e.g., `soundpub`) |
| `ICCN_MEDIA_LABEL_ID` | UUID label ICCN Media di tabel `profiles` |

### Realm Staging vs Production

| Environment | `SSO_REALM_URL` | `VITE_SSO_REALM` (frontend) |
|---|---|---|
| Staging | `https://sso.iccn.or.id/realms/playground` | `playground` |
| Production | `https://sso.iccn.or.id/realms/PORTALICCN` | `PORTALICCN` |

Untuk pindah ke production, cukup update kedua nilai di Cloud Secrets dan Vite env — tidak perlu code change.

---

## 8. Integrasi Iframe ICCN Super App

SoundPub bisa di-embed sebagai iframe di ICCN Super App via URL:

```
https://dashboard.soundpub.xyz/iccn/iframe
```

### Alur

1. Halaman cek session Supabase lokal — jika ada, langsung redirect ke `/dashboard`.
2. Jika tidak ada, jalankan **silent SSO check** (cek apakah user sudah login di Keycloak ICCN tanpa redirect).
3. Jika user sudah login di ICCN → exchange token → buat session Supabase → redirect ke `/dashboard`.
4. Jika silent check gagal → redirect manual ke halaman login ICCN.

### Catatan

- Pastikan `https://dashboard.soundpub.xyz` (dan domain Super App ICCN) ada di **Web Origins** client `soundpub` di Keycloak agar silent check bisa berjalan.
- Cookie session Supabase otomatis pakai `SameSite=None; Secure` di HTTPS, jadi cross-domain iframe bisa jalan.

## 6. Cara Menambahkan Provider Login Baru

Untuk menambahkan provider baru (misal Google):

1. **Di Edge Function / Auth config**: Tambahkan konfigurasi OAuth provider
2. **Di tabel `profiles`**: Set `sso_provider` ke nama provider (e.g., `'google'`)
3. **Di halaman Users**: Badge dan filter sudah mendukung value `'google'`
4. **Di halaman Auth**: Tambahkan tombol login untuk provider baru

### Catatan Penting

- Setiap provider login menggunakan kolom `sso_provider` yang sama
- Tidak perlu role terpisah — semua user SSO menggunakan role `artist` yang sudah ada
- User SSO dibedakan dari user biasa melalui kolom `sso_provider`, bukan role

---

## 7. Keamanan

- JWT diverifikasi menggunakan public key dari JWKS endpoint Keycloak
- Edge Function menggunakan `SUPABASE_SERVICE_ROLE_KEY` untuk operasi admin
- Setiap update profil divalidasi — jika gagal, function mengembalikan error
- User SSO tidak bisa mengubah password di SoundPub (form disembunyikan)
- Session dibuat via magic link + OTP verification (bukan password langsung)
