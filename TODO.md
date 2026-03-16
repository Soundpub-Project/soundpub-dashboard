# TODO - SoundPub Distribution Dashboard

## ✅ Sudah Dikerjakan

### Authentication & Authorization
- [x] Login/Signup system
- [x] Role-based access control (superadmin, admin, label, artist, user, **copyright**, **whitelabel**)
- [x] Profile management (view & edit)
- [x] Protected routes berdasarkan role
- [x] Fix logout stuck bug di halaman admin (Users page)
- [x] **Password visibility toggle di login & signup form**
- [x] **Self-password change di Settings (semua role)**

### Dashboard & Layout
- [x] Dashboard layout dengan sidebar navigation
- [x] Responsive design
- [x] Real-time dashboard statistics

### Release Management
- [x] Daftar releases dengan filter & search
- [x] Add new release (form dialog)
- [x] Edit release
- [x] Release detail page
- [x] Track management dalam release
- [x] Delete releases
- [x] Archive/restore releases
- [x] Bulk actions (select multiple, bulk archive, bulk delete)
- [x] **Label info di release detail page** (menampilkan nama label pemilik release)
- [x] **Audio Player di release detail** (play/pause, progress bar, volume control, skip next/prev)
- [x] **Dropdown artist di form tambah release untuk Label** (pilih dari artist yang terdaftar di label)
- [x] **Drag and drop upload untuk audio files**
- [x] **Fix "Unknown Label" untuk artist view** - Artis bisa melihat nama label dari release mereka

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
- [x] **GCS resumable upload untuk file besar**

### User Management
- [x] Daftar users (admin view)
- [x] Add user (admin/label)
- [x] Edit user
- [x] Delete user
- [x] Change user role (admin only)
- [x] My Artists page (label view)
- [x] Fix RLS policy untuk label update status artist
- [x] **Delete user (Admin/Superadmin only)**
- [x] **Change user status (active/inactive/suspended)**
- [x] **Label dapat menghapus artist dari labelnya**
- [x] **Fix RLS policy untuk label menghapus artist (parent_label_id = null)**
- [x] **Admin change password untuk user lain**
- [x] **Filter users by role** (dropdown filter)
- [x] **Filter users by status** (dropdown filter)
- [x] **Search users by name/email**
- [x] **Kolom Label untuk Artist** - Menampilkan label parent di tabel users
- [x] **Pilih Label saat tambah Artist** - Admin/Superadmin bisa pilih label untuk artist baru
- [x] **Edit Composer Code** - Admin/Superadmin bisa edit composer code untuk user

### Royalty Management
- [x] Royalty Overview dengan charts
  - [x] Revenue trend chart
  - [x] Platform distribution chart
  - [x] Country distribution chart
- [x] Upload Royalty CSV dengan validasi
- [x] Balance update otomatis setelah upload
- [x] **Royalty Composer (Hak Cipta)** - Upload royalty untuk composer/pencipta lagu

### Royalty Summary (NEW)
- [x] **Tab Per Periode** - Ringkasan royalti per periode waktu
- [x] **Tab Per Platform** - Ringkasan royalti per platform streaming
- [x] **Tab Per Label** - Ringkasan royalti per label (admin/label only)
- [x] **Tab Per Artis** - Ringkasan royalti per artist (admin/label only)
- [x] **Tab Per Lagu** - Ringkasan royalti per lagu untuk semua role
- [x] **Role-based tab visibility** - Tab tertentu hanya muncul untuk role yang sesuai
- [x] **Export CSV Per Lagu** - Export data ringkasan per lagu ke file CSV

### Payout System
- [x] Daftar payout requests
- [x] Request payout form
- [x] Payout history dengan status badges
- [x] Admin Approve/Reject Payout
  - [x] Halaman khusus admin untuk melihat semua payout requests
  - [x] Tombol approve/reject dengan konfirmasi
  - [x] Mark as Paid functionality
  - [x] Update balance setelah payout approved (via trigger)
  - [x] Statistik payout (pending, approved, paid, rejected)
  - [x] Search & filter by status

### Analytics
- [x] Halaman analytics dedicated
- [x] Custom date ranges
- [x] Perbandingan periode (MoM, YoY)
- [x] Growth metrics & KPIs
- [x] Performance indicators (growth %)
- [x] Top performing releases/tracks/platforms/countries

### Export Functionality
- [x] CSV exports (sudah ada di royalties/reports)
- [x] PDF reports (browser print available)
- [x] **Database Export Feature** - Export full schema SQL untuk migrasi

### Artist Simplified Release Form
- [x] Form sederhana khusus untuk role Artist (BETA)
- [x] Upload cover art langsung
- [x] UPC/ISRC dikosongkan (diisi oleh label)

### Audit Logs
- [x] **Halaman Audit Logs (Admin only)**
- [x] **Log password_change (admin ubah password user)**
- [x] **Log self_password_change (user ubah password sendiri)**
- [x] **Log role_change**
- [x] **Log status_change**
- [x] **Log user_created**
- [x] **Log user_deleted**
- [x] **Log artist_removed (label hapus artist dari label)**
- [x] **Search & filter audit logs**

### Edge Functions
- [x] `create-user` - Membuat user baru (admin/label)
- [x] `process-royalty-upload` - Proses upload CSV royalty (auto-match artist_user_id)
- [x] `delete-user` - Hapus user (admin/superadmin)
- [x] `update-user-status` - Update status user
- [x] `update-user-password` - Admin ubah password user lain
- [x] `change-own-password` - User ubah password sendiri
- [x] `remove-artist-from-label` - Label hapus artist dengan audit log
- [x] `gcs-upload` - Upload file ke Google Cloud Storage
- [x] `gcs-manage` - Manage file di GCS (delete, list, dll)
- [x] `test-gcs` - Test koneksi GCS
- [x] `create-whitelabel-artist` - Buat artist tanpa password (whitelabel)
- [x] `set-artist-password` - Set password untuk artist whitelabel
- [x] `get-ga4-config` - Ambil konfigurasi GA4
- [x] `update-app-settings` - Update app settings
- [x] `send-royalty-notification` - Kirim notifikasi royalty
- [x] `get-catalog-tracks` - API publik untuk katalog (releases + tracks + label info)

### Super Admin Features
- [x] **Google Cloud Storage Integration** - GCS sebagai primary storage (toggle on/off)
- [x] **Google Analytics 4 Integration** - GA4 tracking dengan Measurement ID
- [x] **Dashboard Logo Upload** - Upload logo untuk sidebar/header
- [x] **Label Logo Upload** - Setiap label bisa upload logo masing-masing
- [x] **Logo Light/Dark Theme** - Upload logo terpisah untuk tema terang dan gelap
- [x] **Favicon Upload** - Upload favicon khusus untuk dashboard
- [x] **Storage Provider Switch** - Pilih antara Supabase Storage atau GCS
- [x] **Test API untuk GCS** - Verifikasi koneksi GCS

### Role Baru
- [x] **Copyright Role** - Akses ke royalty composer (perlindungan hak cipta)
- [x] **White Label Role** - Seperti label tapi artist tidak bisa login sampai upgrade

### White Label Features
- [x] **ProtectedRoute support untuk role whitelabel dan copyright**
- [x] **StorageSettings terintegrasi ke SuperAdminSettings**
- [x] **Dashboard khusus untuk role Whitelabel** - Manage artists dan subscription status
- [x] **Dashboard khusus untuk role Copyright** - Lihat royalty composer
- [x] **Set password untuk artist whitelabel** (setelah upgrade subscription)

### RLS & Security Improvements
- [x] **SECURITY DEFINER functions** - Mencegah infinite recursion di RLS policies
- [x] `get_user_parent_label_id()` - Function untuk ambil parent label ID tanpa trigger RLS
- [x] `get_user_release_label_ids()` - Function untuk ambil label IDs dari releases
- [x] **Artist RLS policies** - Artis bisa lihat profile parent label mereka

### ID-Based Matching (Migrasi dari Name-Based) ✅
- [x] **Kolom `artist_user_id`** ditambahkan ke tabel `releases`, `tracks`, `royalties`
- [x] **Hybrid RLS policies** - Primary: ID-based, Fallback: name-based
- [x] **Data migration** - Existing data di-migrasi berdasarkan name matching
- [x] **Function `get_artist_user_id_by_name()`** - Helper untuk mencari artist ID
- [x] **Frontend updated** - ReleaseFormDialog & ArtistSelector menyimpan `artist_user_id`
- [x] **process-royalty-upload** auto-match `artist_user_id` dari nama saat import

### Halaman Tracks ✅
- [x] **Halaman `/tracks`** - Daftar semua tracks (superadmin/admin)
- [x] **Filter by artist & genre**
- [x] **Search by title, artist, ISRC**
- [x] **Pagination** dengan pilihan page size (10/20/50/100/All)
- [x] **Label info per track** (via release → profiles join)

### Catalog API ✅
- [x] **`get-catalog-tracks`** - Public API untuk website eksternal
- [x] **Includes label info** (profiles join di response)
- [x] **Pagination, search, genre filter**
- [x] **Optimized CORS & pinned version** (@2.49.1)

### UI/UX Improvements
- [x] **Settings Page 2-Column Layout** - Layout desktop lebih optimal dengan 2 kolom
- [x] **Theme Toggle** - Light/Dark mode toggle

### Bug Fixes & Improvements (Maret 2026)
- [x] **AllRoyalties White Screen Fix** - ErrorBoundary, null safety, SelectItem filter untuk mencegah crash
- [x] **RoyaltySummary migrasi ke RPC hooks** - Tidak lagi menggunakan fetchAllRoyalties() yang lambat
- [x] **Analytics migrasi ke RPC hooks** - KPI dan chart menggunakan RPC functions
- [x] **Remove-artist-from-label: validasi releases** - Cek releases aktif/pending sebelum hapus artis
- [x] **Remove-artist-from-label: hapus dari tabel artists** - Artis yang dihapus tidak lagi muncul di form releases

### Edge Function Standards ✅
- [x] **Pin version `@supabase/supabase-js@2.49.1`** - Mencegah bundle timeout
- [x] **Full CORS headers** termasuk `Access-Control-Allow-Methods`
- [x] **Inline CORS** (tidak import dari shared file)

---

## ❌ Belum Dikerjakan

### Medium Priority
- [ ] **Samakan fitur releases untuk role artis** - Artis menggunakan ReleaseFormDialog lengkap (bukan ArtistReleaseFormDialog beta), dengan auto-set label_id dan artist_name, serta RLS policy INSERT/UPDATE

### Low Priority
- [ ] **Artist Profile Page**
  - Public profile page untuk artist
  - Statistik singkat
  - Daftar releases

### White Label Features
- [ ] **Subscription management UI untuk whitelabel** (admin side)

---

## 🔮 Future Implementation (Deferred)

### Authentication & Security
- [ ] Forgot Password / Reset Password via email
- [ ] Email notification saat password diubah
- [ ] Two-Factor Authentication (2FA)

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
- [ ] In-app notifications

### User Management
- [ ] Bulk actions untuk users (bulk delete, bulk status change)
- [ ] Export data users

---

## 🚀 Big Role Future (Custom Role System)

### Overview
Sistem custom role yang memungkinkan admin membuat role dinamis dengan permission per-fitur, seperti dashboard CMS advance.

### Database Changes Required
- [ ] **permissions** table - Daftar semua permission yang tersedia
- [ ] **custom_roles** table - Role yang dibuat admin
- [ ] **role_permissions** table - Mapping role ke permissions
- [ ] **user_custom_roles** table - Assign custom role ke user

### Core Features
- [ ] **Permission Management UI (Superadmin)**
- [ ] **Custom Role Builder UI**
- [ ] **Role Assignment**
- [ ] **Dynamic Menu/Sidebar**
- [ ] **Permission Check Hooks**

### Implementation Priority
1. Database schema design
2. Backend permission check functions
3. Permission management UI
4. Role builder UI
5. Dynamic sidebar integration
6. Route/component protection

---

## 📝 Notes
- Database menggunakan Lovable Cloud (Supabase)
- RLS policies sudah diimplementasi untuk keamanan data
- Edge functions untuk operasi yang memerlukan service role
- Storage buckets: release-covers, track-audio, track-video, audio-clips, label-logos, klikus-biolink
- Beberapa fitur metadata (composer, lyricist, lyrics) sudah ada di level track
- Audit logs mencatat semua aktivitas penting admin dan label
- Audio player mendukung: play/pause individual track, volume control, progress seek, next/prev navigation
- Role baru: `copyright` untuk pemilik hak cipta, `whitelabel` untuk label dengan artist tanpa akses login
- GCS upload menggunakan Signed URL V4 untuk upload langsung dari browser
- Storage provider bisa di-switch antara Supabase dan GCS melalui superadmin settings
- Copyright royalty matching: support by name (case insensitive) OR composer_code
- SECURITY DEFINER functions digunakan untuk mencegah infinite recursion di RLS policies
- Artist bisa melihat nama label dari release mereka (fix "Unknown Label" bug)
- Role artist memiliki tab "Per Lagu" khusus di Royalty Summary
- **ID-based matching** via `artist_user_id` — hybrid approach dengan name fallback
- **Edge function standards**: pin @2.49.1, inline CORS, full headers
- **`get-catalog-tracks`** API menyertakan label info untuk website eksternal
