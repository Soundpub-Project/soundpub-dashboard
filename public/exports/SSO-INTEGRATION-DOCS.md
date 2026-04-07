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
| `name` / `preferred_username` | `full_name` | Nama lengkap user |
| `avatar` | `avatar_url` | URL foto profil dari Keycloak (hanya jika user belum punya avatar) |
| - | `sso_provider` | Diset ke `'iccn'` untuk semua user SSO ICCN |
| - | `parent_label_id` | Diset ke ID label ICCN Media |
| - | `artist_profile_completed` | `false` untuk user baru |
| - | `password_set` | `false` untuk user baru via SSO |

### Data Tambahan yang Dibuat

- **Tabel `user_roles`**: Role diset ke `artist`
- **Tabel `artists`**: Entry dibuat di bawah label ICCN Media

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

---

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
