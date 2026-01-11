# TODO - SoundPub Distribution Dashboard

## ✅ Sudah Dikerjakan

### Authentication & Authorization
- [x] Login/Signup system
- [x] Role-based access control (superadmin, admin, label, artist, user)
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

### Royalty Management
- [x] Royalty Overview dengan charts
  - [x] Revenue trend chart
  - [x] Platform distribution chart
  - [x] Country distribution chart
- [x] Upload Royalty CSV dengan validasi
- [x] Balance update otomatis setelah upload

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
- [x] `process-royalty-upload` - Proses upload CSV royalty
- [x] `delete-user` - Hapus user (admin/superadmin)
- [x] `update-user-status` - Update status user
- [x] `update-user-password` - Admin ubah password user lain
- [x] `change-own-password` - User ubah password sendiri
- [x] `remove-artist-from-label` - Label hapus artist dengan audit log

---

## ❌ Belum Dikerjakan

### Low Priority
- [ ] **Artist Profile Page**
  - Public profile page untuk artist
  - Statistik singkat
  - Daftar releases

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

### Super Admin Features
- [x] **Google Cloud Storage Integration** - GCS sebagai primary storage (toggle on/off)
- [x] **Google Analytics 4 Integration** - GA4 tracking dengan Measurement ID
- [x] **Dashboard Logo Upload** - Upload logo untuk sidebar/header
- [x] **Label Logo Upload** - Setiap label bisa upload logo masing-masing

---

## 📝 Notes
- Database menggunakan Lovable Cloud (Supabase)
- RLS policies sudah diimplementasi untuk keamanan data
- Edge functions untuk operasi yang memerlukan service role
- Storage buckets: release-covers, track-audio, track-video, audio-clips
- Beberapa fitur metadata (composer, lyricist, lyrics) sudah ada di level track
- Audit logs mencatat semua aktivitas penting admin dan label
- Audio player mendukung: play/pause individual track, volume control, progress seek, next/prev navigation
