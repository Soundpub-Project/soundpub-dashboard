

## Plan: Update TODO.md — Release Notes & TODO List Lengkap

Memperbarui file `TODO.md` dengan semua fitur yang sudah diimplementasikan sejak awal project hingga April 2026, termasuk fitur-fitur terbaru yang belum tercatat.

### Fitur Baru yang Perlu Ditambahkan ke "Sudah Dikerjakan"

#### Authentication & Authorization (Update)
- Google Login via Lovable Cloud OAuth
- SSO ICCN Login via Keycloak (edge function `sso-login`)
- Auto-assign role `artist` untuk semua user baru (manual & Google)
- Proteksi data profil saat login SSO (tidak overwrite `parent_label_id` jika sudah ada)

#### Payment Gateway (Baru - April 2026)
- Integrasi Xendit Payment Gateway
- `create-xendit-invoice` edge function
- `xendit-webhook` edge function untuk callback
- Halaman Invoice Pembayaran (`/dashboard/invoices`)
- Payment Callback page (`/payment/callback`)
- Payment Settings page (`/dashboard/payment-settings`)
- Pricing Settings (per track / per kategori)
- Konfirmasi dialog sebelum pembayaran
- Reuse invoice pending yang masih valid
- Refund otomatis saat release berbayar dihapus admin
- Email notifikasi setelah pembayaran berhasil
- Release locking setelah pembayaran (status `pending_paid`)
- Tabel `release_payments` untuk tracking pembayaran

#### ICCN Integration (Baru - April 2026)
- `info-soundpub` edge function — API Detail Layanan ICCN
- Admin panel ICCN Integration Settings (deskripsi & galeri foto)
- Storage bucket `iccn-gallery` untuk foto layanan
- App settings keys: `iccn_service_desc`, `iccn_service_photos`

#### Artist Onboarding & Profile (Baru - April 2026)
- `artist_profiles` table untuk profil artis/band detail
- Artist Onboarding Dialog wajib sebelum buat release
- Artist Profile page (`/dashboard/artist-profile`)
- Admin bisa lihat profil artis user lain (`/dashboard/artist-profile/:userId`)
- Kolom `artist_profile_completed` di profiles

#### Notification & Media
- Notification Management page (`/dashboard/notifications`)
- Announcement Dialog
- Notification Bell component
- Media Library page (`/dashboard/media-library`)

#### Halaman Baru
- Copyright Dashboard (`/dashboard/copyright`)
- Copyright Analytics (`/dashboard/copyright-analytics`)
- Copyright Royalty Summary (`/dashboard/copyright-royalty-summary`)
- Whitelabel Dashboard (`/dashboard/whitelabel`)

### TODO List Update
- Pindahkan "Google Login" dari future ke done
- Tambah item baru di "Future": set password untuk user Google, account linking Google
- Update notes section

### File yang Diedit

| File | Aksi |
|------|------|
| `TODO.md` | Full rewrite — update semua section |

