"# Product Requirement Document (PRD) — SoundPub Dashboard

## 1. Pendahuluan & Visi Produk

### 1.1 Visi Produk
**SoundPub Dashboard** adalah platform pusat (central dashboard) bagi para kreator, seniman, dan komunitas kreatif di ekosistem **ICCN (Ikatan Cipta Creative Network)** untuk mengelola karya musik, performa distribusi, interaksi pendengar, serta integrasi monetisasi/pembayaran secara seamless. Platform ini dirancang untuk menjadi bagian dari Super App ICCN dan berjalan di dalam ekosistem SSO (Single Sign-On) yang terintegrasi penuh.

### 1.2 Masalah yang Diselesaikan
- **Silo Data Pengguna:** Kreator harus login berulang kali di berbagai sub-platform ICCN.
- **Manajemen Karya Terfragmentasi:** Kurangnya platform terpusat bagi musisi komunitas lokal untuk mengukur performa distribusi lagu mereka.
- **Kesulitan Monetisasi:** Kreator lokal kesulitan dalam mengakses sistem pembayaran mandiri yang terintegrasi (Payment Gateway).

### 1.3 Target Pengguna (User Persona)
1. **Kreator/Musisi Komunitas (Member):** Pengguna yang ingin mengunggah karya musik, melihat analitik lagu, dan mengelola pendapatan dari hasil karya.
2. **Korda / Pengurus Wilayah (Korda/Admin):** Pengguna yang mengawasi aktivitas kreator di daerah masing-masing dan memverifikasi integrasi.
3. **Viewer / Pendengar Umum:** Pengguna yang menikmati katalog, membeli merchandise, atau memberikan dukungan finansial (tipping/pembelian lagu).

---

## 2. Alur Pengguna (User Flow) Utama

### 2.1 Autentikasi Seamless (SSO ICCN)
1. User mengunjungi `https://dashboard.soundpub.xyz`.
2. Sistem melakukan *silent check* via Iframe ke Keycloak ICCN.
   - **Skenario A (Session Aktif):** User langsung diarahkan ke Dashboard tanpa perlu login manual.
   - **Skenario B (Session Mati/Browser Memblokir Cookie Pihak Ketiga):** User diarahkan ke halaman `/auth` dengan tombol \"Login via SSO ICCN\".
3. Setelah klik \"Login via SSO\", user diarahkan ke halaman login Keycloak (`sso.iccn.or.id`).
4. Setelah berhasil login, user dikembalikan ke SoundPub, token divalidasi, profil disinkronkan, dan user masuk ke Dashboard.

### 2.2 Integrasi Iframe ICCN (Super App)
1. SoundPub di-embed di dalam aplikasi Super App ICCN (`/iccn/iframe`).
2. Cookie ICCN dibaca sebagai pihak pertama (1st party cookie), mengizinkan auto-login instan tanpa terhalang privasi browser modern.

---

## 3. Matriks Kebutuhan Fitur (Functional Requirements)

| ID Fitur | Modul / Fitur | Deskripsi | Prioritas |
|---|---|---|---|
| **F-01** | **Single Sign-On (SSO)** | Autentikasi OAuth2 PKCE via Keycloak ICCN dengan sinkronisasi otomatis user profile ke database Supabase. | P0 (Kritis) |
| **F-02** | **Silent SSO Check** | Deteksi login otomatis menggunakan hidden iframe untuk session sharing antar subdomain ICCN. | P1 (Tinggi) |
| **F-03** | **Responsive Dashboard** | Dashboard statistik interaktif menggunakan *Recharts* untuk melihat grafik analitik performa musik (streams, pendengar, pendapatan). | P0 (Kritis) |
| **F-04** | **Iframe Integration** | Route khusus `/iccn/iframe` yang dioptimalkan untuk di-embed ke dalam portal pusat ICCN. | P1 (Tinggi) |
| **F-05** | **Update Profil Terintegrasi** | Form pengeditan profil dan unggah foto profil (avatar) yang langsung menyinkronkan data kembali ke Keycloak via API Multipart FormData. | P1 (Tinggi) |
| **F-06** | **Payment Gateway Integration** | Sistem pembayaran (Payment Gateway) untuk pembelian trek musik, lisensi, tipping, atau membership kreator. | P2 (Menengah) |
| **F-07** | **Manajemen Audio & Karya** | Upload audio trek, cover art, dan pengisian metadata lagu. | P0 (Kritis) |

---

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)

### 4.1 Keamanan (Security)
- **Otorisasi Token:** Penggunaan JWT RS256 dengan masa aktif access token maksimal 5 menit dan refresh token 4 jam.
- **Validasi Signature:** Setiap request API divalidasi tanda tangannya via JWKS (JSON Web Key Set) dari server Keycloak ICCN.
- **Proteksi PKCE:** Proses pertukaran auth-code wajib menggunakan mekanisme PKCE (Proof Key for Code Exchange) untuk mencegah interception attack.

### 4.2 Performa & Skalabilitas (Performance & Scalability)
- **Waktu Muat (Page Load):** Aplikasi frontend berupa SPA statis harus dimuat kurang dari 1.5 detik (First Contentful Paint) menggunakan jaringan CDN.
- **Optimasi Image Docker:** Image Nginx production harus berbasis Alpine dengan ukuran total di bawah 100MB untuk efisiensi deploy.
- **Caching Token:** Caching JWKS public key selama 24 jam di sisi server/edge function untuk menghemat latensi handshake ke Keycloak.

### 4.3 Kompatibilitas Browser
- Aplikasi harus kompatibel dengan browser modern (Chrome, Safari, Firefox, Edge) baik di desktop maupun perangkat mobile.
- Penanganan khusus untuk kebijakan *third-party cookie* yang ketat pada Safari dan Chrome terbaru dengan menyediakan fallback login eksplisit.

---

## 5. Rencana Rilis & Milestone

### Fase 1: Fondasi & Autentikasi (Selesai)
- Integrasi SDK `keycloak-js`.
- Sinkronisasi token dengan Supabase Client.
- Halaman login, error boundary, dan silent check iframe.

### Fase 2: Dashboard Kreator & Integrasi ICCN (Sedang Berjalan)
- Desain komponen UI menggunakan Tailwind & Radix UI (ShadCN).
- Implementasi grafik visualisasi data dengan Recharts.
- Route khusus `/iccn/iframe` untuk integrasi Super App.
- Dockerization proyek menggunakan Docker Compose + Nginx proxy untuk kesiapan deployment staging & production.

### Fase 3: Payment Gateway & Distribusi Komersial (Fase Mendatang)
- Integrasi Midtrans / Xendit sebagai gerbang pembayaran.
- Penjualan hak lisensi musik digital kreator secara langsung.
- Fitur Royalti split-sharing antar kolaborator.
"