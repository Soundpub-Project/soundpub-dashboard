# TODO - SoundPub Distribution Dashboard

## ✅ Sudah Dikerjakan

### Authentication & Authorization
- [x] Login/Signup system (email & password)
- [x] **Google Login** via Lovable Cloud OAuth (`@lovable.dev/cloud-auth-js`)
- [x] **SSO ICCN Login** via Keycloak (edge function `sso-login`)
- [x] Role-based access control (superadmin, admin, label, artist, user, copyright, whitelabel)
- [x] **Auto-assign role `artist`** untuk semua user baru (manual & Google)
- [x] **Proteksi data profil saat login SSO** — tidak overwrite `parent_label_id` jika sudah ada
- [x] Profile management (view & edit)
- [x] Protected routes berdasarkan role
- [x] Fix logout stuck bug di halaman admin (Users page)
- [x] Password visibility toggle di login & signup form
- [x] Self-password change di Settings (semua role)

### Dashboard & Layout
- [x] Dashboard layout dengan sidebar navigation
- [x] Responsive design
- [x] Real-time dashboard statistics
- [x] Theme Toggle — Light/Dark mode
- [x] Settings Page 2-Column Layout

### Release Management
- [x] Daftar releases dengan filter & search
- [x] Add new release (form dialog)
- [x] Edit release
- [x] Release detail page
- [x] Track management dalam release
- [x] Delete releases
- [x] Archive/restore releases
- [x] Bulk actions (select multiple, bulk archive, bulk delete)
- [x] Label info di release detail page
- [x] Audio Player di release detail (play/pause, progress bar, volume control, skip next/prev)
- [x] Dropdown artist di form tambah release untuk Label
- [x] Drag and drop upload untuk audio files
- [x] Fix "Unknown Label" untuk artist view

### Release Metadata
- [x] Multiple artists (Main/Featured) per track
- [x] Complete genre list (25+ genres termasuk Indonesian genres)
- [x] Explicit lyrics flag per track
- [x] Composer & lyricist fields per track
- [x] Lyrics text area per track
- [x] Additional contributors (Composer, Lyricist, Producer, Arranger, dll)

### Media Upload
- [x] Full audio upload (WAV/FLAC, up to 500MB)
- [x] Music video upload (MP4, up to 2GB)
- [x] Audio clip upload (30-60s preview, up to 20MB)
- [x] Storage buckets dengan RLS policies
- [x] GCS resumable upload untuk file besar

### User Management
- [x] Daftar users (admin view)
- [x] Add user (admin/label)
- [x] Edit user & Delete user (Admin/Superadmin only)
- [x] Change user role (admin only)
- [x] Change user status (active/inactive/suspended)
- [x] My Artists page (label view)
- [x] Label dapat menghapus artist dari labelnya
- [x] Admin change password untuk user lain
- [x] Filter users by role & status (dropdown filter)
- [x] Search users by name/email
- [x] Kolom Label untuk Artist — Menampilkan label parent di tabel users
- [x] Pilih Label saat tambah Artist — Admin/Superadmin bisa pilih label
- [x] Edit Composer Code — Admin/Superadmin bisa edit composer code
- [x] Fix RLS policy untuk label update status artist & hapus artist

### Royalty Management
- [x] Royalty Overview dengan charts (Revenue trend, Platform distribution, Country distribution)
- [x] Upload Royalty CSV dengan validasi
- [x] Balance update otomatis setelah upload
- [x] Royalty Composer (Hak Cipta) — Upload royalty untuk composer/pencipta lagu

### Royalty Summary
- [x] Tab Per Periode — Ringkasan royalti per periode waktu
- [x] Tab Per Platform — Ringkasan royalti per platform streaming
- [x] Tab Per Label — Ringkasan royalti per label (admin/label only)
- [x] Tab Per Artis — Ringkasan royalti per artist (admin/label only)
- [x] Tab Per Lagu — Ringkasan royalti per lagu untuk semua role
- [x] Role-based tab visibility
- [x] Export CSV Per Lagu

### Payout System
- [x] Daftar payout requests & Request payout form
- [x] Payout history dengan status badges
- [x] Admin Approve/Reject Payout dengan konfirmasi
- [x] Mark as Paid functionality
- [x] Update balance setelah payout approved (via trigger)
- [x] Statistik payout (pending, approved, paid, rejected)
- [x] Search & filter by status

### Payment Gateway (Xendit)
- [x] **Integrasi Xendit Payment Gateway**
- [x] **`create-xendit-invoice`** edge function — buat invoice pembayaran
- [x] **`xendit-webhook`** edge function — callback dari Xendit
- [x] **Halaman Invoices** (`/dashboard/invoices`) — daftar & status pembayaran
- [x] **Payment Callback page** (`/payment/callback`)
- [x] **Payment Settings page** (`/dashboard/payment-settings`)
- [x] **Pricing Settings** — per track / per kategori release
- [x] **Konfirmasi dialog** sebelum pembayaran
- [x] **Reuse invoice pending** yang masih valid
- [x] **Email notifikasi** setelah pembayaran berhasil (via Resend)
- [x] **Release locking** setelah pembayaran (status `pending_paid`)
- [x] **Tabel `release_payments`** untuk tracking pembayaran

### Analytics
- [x] Halaman analytics dedicated
- [x] Custom date ranges & Perbandingan periode (MoM, YoY)
- [x] Growth metrics & KPIs
- [x] Top performing releases/tracks/platforms/countries

### Export Functionality
- [x] CSV exports (royalties/reports)
- [x] PDF reports (browser print)
- [x] Database Export Feature — Export full schema SQL untuk migrasi

### Artist Onboarding & Profile
- [x] **`artist_profiles` table** — profil artis/band detail (nama, tipe, genre, bio, social links)
- [x] **Artist Onboarding Dialog** — wajib diisi sebelum buat release
- [x] **Artist Profile page** (`/dashboard/artist-profile`)
- [x] **Admin view profil artis** (`/dashboard/artist-profile/:userId`)
- [x] **Kolom `artist_profile_completed`** di profiles
- [x] Artist Simplified Release Form (BETA)

### ICCN Integration
- [x] **`info-soundpub` edge function** — API publik detail layanan ICCN
- [x] **Admin panel ICCN Integration Settings** — deskripsi & galeri foto
- [x] **Storage bucket `iccn-gallery`** untuk foto layanan
- [x] **App settings keys**: `iccn_service_desc`, `iccn_service_photos`

### Notification System
- [x] **Notification Bell** component (real-time)
- [x] **Announcement Dialog** — admin kirim pengumuman global
- [x] **Notification Management page** (`/dashboard/notifications`)

### Media Library
- [x] **Media Library page** (`/dashboard/media-library`)

### Audit Logs
- [x] Halaman Audit Logs (Admin only)
- [x] Log: password_change, self_password_change, role_change, status_change, user_created, user_deleted, artist_removed
- [x] Search & filter audit logs

### Edge Functions
- [x] `create-user` — Membuat user baru
- [x] `process-royalty-upload` — Proses upload CSV royalty (auto-match artist_user_id)
- [x] `delete-user` — Hapus user
- [x] `update-user-status` — Update status user
- [x] `update-user-password` — Admin ubah password user lain
- [x] `change-own-password` — User ubah password sendiri
- [x] `remove-artist-from-label` — Label hapus artist dengan audit log
- [x] `gcs-upload` / `gcs-manage` / `test-gcs` — Google Cloud Storage
- [x] `create-whitelabel-artist` — Buat artist tanpa password (whitelabel)
- [x] `set-artist-password` — Set password untuk artist whitelabel
- [x] `get-ga4-config` — Ambil konfigurasi GA4
- [x] `update-app-settings` — Update app settings
- [x] `send-royalty-notification` — Kirim notifikasi royalty
- [x] `get-catalog-tracks` — API publik katalog (releases + tracks + label info)
- [x] `create-xendit-invoice` — Buat invoice Xendit
- [x] `xendit-webhook` — Callback webhook Xendit
- [x] `sso-login` — SSO login via Keycloak
- [x] `info-soundpub` — API detail layanan ICCN

### Super Admin Features
- [x] Google Cloud Storage Integration (toggle on/off)
- [x] Google Analytics 4 Integration
- [x] Dashboard Logo Upload (light/dark theme)
- [x] Label Logo Upload per label
- [x] Favicon Upload
- [x] Storage Provider Switch (Supabase / GCS)
- [x] Test API untuk GCS

### Role Khusus
- [x] **Copyright Role** — Akses ke royalty composer
- [x] **White Label Role** — Artist tanpa login sampai upgrade
- [x] **Copyright Dashboard** (`/dashboard/copyright`)
- [x] **Copyright Analytics** (`/dashboard/copyright-analytics`)
- [x] **Copyright Royalty Summary** (`/dashboard/copyright-royalty-summary`)
- [x] **Whitelabel Dashboard** (`/dashboard/whitelabel`)

### RLS & Security
- [x] SECURITY DEFINER functions — Mencegah infinite recursion
- [x] `get_user_parent_label_id()`, `get_user_release_label_ids()`
- [x] Artist RLS policies
- [x] Hybrid ID-based + name-based matching via `artist_user_id`

### Halaman Tracks & Catalog API
- [x] Halaman `/tracks` (superadmin/admin) — filter, search, pagination
- [x] `get-catalog-tracks` — Public API dengan label info, pagination, search

### Edge Function Standards
- [x] Pin version `@supabase/supabase-js@2.49.1`
- [x] Full CORS headers & inline CORS

---

## ❌ Belum Dikerjakan

### Low Priority
- [ ] Artist Public Profile Page (statistik singkat, daftar releases)
- [ ] Subscription management UI untuk whitelabel (admin side)

---

## 🔮 Future Implementation

### Authentication & Security
- [ ] **Set password untuk user Google** — User yang login via Google bisa tambah password
- [ ] **Account linking Google** — User manual bisa tautkan akun Google
- [ ] Forgot Password / Reset Password via email
- [ ] Email notification saat password diubah
- [ ] Two-Factor Authentication (2FA)

### Google OAuth untuk Self-Hosted
- [ ] **Dual-mode Google Login** — Lovable Cloud OAuth + fallback Supabase native OAuth
- [ ] Dokumentasi setup Google OAuth di Google Cloud Console untuk VPS

### Release Management
- [ ] Metadata versioning (track changes history)

### Export
- [ ] Excel exports (.xlsx format)
- [ ] Scheduled reports (email/auto-generate)

### Analytics
- [ ] Export analytics to PDF
- [ ] Scheduled analytics reports

### Notifications
- [ ] Email notification ketika payout diproses
- [ ] Push notifications

### User Management
- [ ] Bulk actions untuk users (bulk delete, bulk status change)
- [ ] Export data users

---

## 🚀 Big Role Future (Custom Role System)

### Overview
Sistem custom role dengan permission per-fitur, seperti dashboard CMS advance.

### Database Changes Required
- [ ] `permissions` table
- [ ] `custom_roles` table
- [ ] `role_permissions` table
- [ ] `user_custom_roles` table

### Core Features
- [ ] Permission Management UI (Superadmin)
- [ ] Custom Role Builder UI
- [ ] Role Assignment
- [ ] Dynamic Menu/Sidebar
- [ ] Permission Check Hooks

---

## 📝 Notes
- Database: Lovable Cloud (Supabase)
- RLS policies untuk keamanan data
- Edge functions untuk operasi service role
- Storage buckets: release-covers, track-audio, track-video, audio-clips, label-logos, klikus-biolink, iccn-gallery
- Audio player: play/pause, volume, progress seek, next/prev
- Role: `copyright` (hak cipta), `whitelabel` (artist tanpa login)
- GCS upload: Signed URL V4 dari browser
- Storage provider: switch Supabase ↔ GCS via superadmin
- Copyright royalty: matching by name (case insensitive) OR composer_code
- SECURITY DEFINER functions: mencegah infinite recursion RLS
- ID-based matching: `artist_user_id` hybrid + name fallback
- Edge function standards: pin @2.49.1, inline CORS, full headers
- `get-catalog-tracks` API: label info untuk website eksternal
- Google Login: managed by Lovable Cloud OAuth, auto-assign role artist
- SSO ICCN: Keycloak JWT → Supabase magiclink session
- Payment Gateway: Xendit invoice + webhook, email via Resend
- Artist Onboarding: wajib isi profil sebelum buat release
- ICCN Integration: API publik + admin panel galeri foto
