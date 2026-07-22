"# Software Design Document (SDD) — SoundPub Dashboard

## 1. Arsitektur Sistem

SoundPub Dashboard dirancang dengan arsitektur **JAMstack** (JavaScript, API & Markup) modern dengan frontend berbasis React (Vite) dan backend-as-a-service (BaaS) menggunakan Supabase ditambah dengan IDP (Identity Provider) eksternal Keycloak ICCN.

```
+------------------------------------------------------------------------+
|                              User Browser                              |
+-------------------+------------------------------+---------------------+
                    |                              |
                    | (HTTPS / Port 8181)          | (Auth Redirect / OAuth2)
                    v                              v
+-----------------------------------+      +-----------------------------+
|        Nginx (Container)          |      |     Keycloak ICCN Server    |
|  - Menyajikan static assets       |      |     - sso.iccn.or.id        |
|  - Fallback index.html (SPA)      |      |     - Realm: playground     |
+-------------------+---------------+      +--------------+--------------+
                    |                                     ^
                    | (Kueri / Auth Token)                | (JWKS Validation / SDK)
                    v                                     |
+---------------------------------------------------------+--------------+
|                           Supabase Platform                            |
|  - Database: PostgreSQL (Skema & Data Pengguna)                        |
|  - Edge Functions: `/functions/v1/sso-login` (Verifikasi Token JWKS)  |
+------------------------------------------------------------------------+
```

### Komponen Arsitektur Utama:
1. **Frontend (Client SPA):** React 18, Vite, TypeScript, Tailwind CSS, dan komponen UI Shadcn.
2. **Reverse Proxy & Web Server:** Nginx Alpine (di dalam Docker Container) untuk melayani file-file build statis secara efisien dan menangani rute React Router SPA.
3. **Identity Provider (IDP):** Keycloak ICCN (OAuth2 + PKCE) untuk manajemen user terpusat di seluruh ekosistem ICCN.
4. **Database & Backend Services:** Supabase PostgreSQL untuk data relasional, Realtime API, Storage (untuk audio/cover art), dan Edge Functions (untuk pemrosesan backend seperti validasi JWKS).

---

## 2. Struktur Data & Database

Hubungan antar entitas data dalam database PostgreSQL Supabase difokuskan pada sinkronisasi data user dari Keycloak.

### Tabel `profiles`
Menyimpan informasi profil pengguna yang disinkronkan langsung dari JWT Keycloak saat login pertama kali atau saat update profil dilakukan.

| Kolom | Tipe | Deskripsi / Constraint |
|---|---|---|
| `id` | `uuid` | Primary Key, berelasi dengan `auth.users(id)` |
| `sso_id` | `text` | Unique, menyimpan ID `sub` dari Keycloak |
| `email` | `text` | Alamat email pengguna |
| `full_name` | `text` | Nama lengkap pengguna |
| `phone` | `text` | Nomor telepon (format 628xxx) |
| `city` | `text` | Kota tempat tinggal |
| `province` | `text` | Provinsi tempat tinggal |
| `avatar_url` | `text` | URL file avatar (dari bucket S3 / Supabase Storage) |
| `user_type` | `text` | Tipe peran: `korda`, `pengurus`, atau `member` |
| `created_at` | `timestamp` | Waktu data dibuat |
| `updated_at` | `timestamp` | Waktu data diperbarui |

---

## 3. Detail Integrasi SSO & Alur Token

Integrasi SSO menggunakan protokol standard **OAuth 2.0 dengan Authorization Code Flow + PKCE (Proof Key for Code Exchange)** demi keamanan tinggi di sisi client.

### 3.1 Alur Autentikasi Frontend

1. **Inisialisasi (`kc.init`):** 
   Saat aplikasi pertama kali dibuka, frontend menginisialisasi pustaka `keycloak-js` menggunakan parameter `onLoad: 'check-sso'` dan menyediakan URL `/silent-check-sso.html` pada iframe tersembunyi.
2. **Silent SSO Check:**
   Iframe memuat halaman Keycloak secara diam-diam untuk memeriksa session cookie. Jika pengguna telah login ke portal ICCN lainnya:
   - Iframe mengirimkan `postMessage` ke parent window berisi token.
   - Frontend mendeteksi pesan tersebut dan menandai user sebagai terautentikasi.
3. **Fallback Explicit Login:**
   Jika silent check gagal karena browser melarang third-party cookies (misalnya Safari), user harus mengklik tombol \"Login via SSO\" yang akan mengalihkan halaman utama browser secara penuh ke `sso.iccn.or.id`.

### 3.2 Alur Verifikasi Token Backend (Edge Function / Supabase)

Ketika frontend mengirimkan token ke Edge Function Supabase (`/sso-login`): 
1. **Decode & Header Check:** Server mendecode JWT untuk membaca properti `kid` (Key ID) pada header token.
2. **Fetch JWKS:** Server mengunduh JWKS (JSON Web Key Set) dari `{SSO_BASE_URL}/realms/{SSO_REALM}/protocol/openid-connect/certs`.
3. **Signature Verification:** Server menggunakan public key dari JWKS yang cocok dengan `kid` untuk memverifikasi keaslian tanda tangan token RS256.
4. **Claim Checks:** Memvalidasi parameter `iss` (Issuer), `azp`/`aud` (Client ID), dan memastikan `exp` (waktu kadaluarsa) belum terlewati.
5. **Otorisasi Role:** Memastikan user memiliki role yang sah di dalam objek `resource_access[soundpub].roles` sebelum mengizinkan pembuatan session Supabase.
6. **Sinkronisasi DB (Upsert):** Melakukan penyimpanan data profil terbaru ke tabel `profiles`.

---

## 4. Konfigurasi Deployment & Dockerization

Proyek ini menggunakan strategi kontainerisasi dengan Docker untuk mempermudah portabilitas dan standardisasi lingkungan deployment.

### 4.1 Konstruksi Multi-stage Dockerfile

- **Stage 1 (Build Node):**
  - Image dasar: `node:20-alpine` (untuk meminimalkan ukuran).
  - Menerima argumen build (seperti `VITE_SUPABASE_URL`) dan menetapkannya sebagai ENV sistem agar bisa di-compile ke dalam static bundle Vite.
  - Menjalankan `npm install` untuk mengunduh semua dependency proyek.
  - Menjalankan `npm run build` yang menghasilkan bundle HTML/JS/CSS statis di dalam direktori `/app/dist`.
- **Stage 2 (Production Nginx):**
  - Image dasar: `nginx:stable-alpine`.
  - Menyalin file statis dari stage build ke direktori kerja default Nginx (`/usr/share/nginx/html`).
  - Memasukkan konfigurasi kustom `nginx.conf` ke `/etc/nginx/conf.d/default.conf` untuk mendukung penanganan rute virtual SPA (Single Page Application).

### 4.2 Web Server Nginx SPA Support

Konfigurasi Nginx krusial untuk mencegah error 404 ketika user merefresh halaman di dalam aplikasi React:
```nginx
try_files $uri $uri/ /index.html;
```
Instruksi ini memerintahkan Nginx untuk memeriksa keberadaan file yang diminta secara fisik di server, jika tidak ditemukan, Nginx akan mengalihkan request secara internal ke `index.html` dan membiarkan `react-router-dom` memproses pencarian rute secara client-side.

### 4.3 Orkestrasi dengan Docker Compose

File `docker-compose.yml` melakukan orkestrasi terhadap service web tunggal dengan parameter:
- `ports: - "8181:80"`: Meneruskan request dari port eksternal `8181` komputer host ke port internal kontainer `80` (Nginx).
- `restart: always`: Menginstruksikan Docker daemon untuk menyalakan kembali kontainer secara otomatis jika terjadi crash atau ketika server host direstart.
- Meneruskan variabel lingkungan lokal dari file `.env` di host langsung ke build context Docker Compose agar disisipkan ke dalam aset kompilasi frontend.
"