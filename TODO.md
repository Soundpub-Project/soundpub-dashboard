# TODO - SoundPub Distribution Dashboard

## ✅ Sudah Dikerjakan

### Authentication & Authorization
- [x] Login/Signup system
- [x] Role-based access control (superadmin, admin, label, artist, user)
- [x] Profile management (view & edit)
- [x] Protected routes berdasarkan role
- [x] Fix logout stuck bug di halaman admin (Users page)

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
  - [x] Update balance setelah payout approved (via trigger)
  - [x] Statistik payout (pending, approved, paid, rejected)

---

## ❌ Belum Dikerjakan

### Medium Priority
- [ ] **Artist Simplified Release Form**
  - Form yang lebih sederhana untuk artist
  - Upload cover art langsung
  - Auto-generate UPC/ISRC (optional)

### Medium Priority
- [ ] **Artist Simplified Release Form**
  - Form yang lebih sederhana untuk artist
  - Upload cover art langsung
  - Auto-generate UPC/ISRC (optional)

### Low Priority
- [ ] **Artist Profile Page**
  - Public profile page untuk artist
  - Statistik singkat
  - Daftar releases

---

## 🔮 Future Implementation (Deferred)

### Release Management
- [ ] Metadata versioning (track changes history)

---

## 📊 Export Functionality

### ✅ Completed
- [x] CSV exports (sudah ada di royalties/reports)
- [x] PDF reports (browser print available)

### ❌ Future
- [ ] Excel exports (.xlsx format)
- [ ] Scheduled reports (email/auto-generate)

---

## 📈 Advanced Analytics

### ✅ Completed
- [x] Halaman analytics dedicated
- [x] Custom date ranges
- [x] Perbandingan periode (MoM, YoY)
- [x] Growth metrics & KPIs
- [x] Performance indicators (growth %)
- [x] Top performing releases/tracks/platforms/countries

### ❌ Future
- [ ] Export analytics to PDF
- [ ] Scheduled analytics reports

---

## 📝 Notes
- Database menggunakan Lovable Cloud (Supabase)
- RLS policies sudah diimplementasi untuk keamanan data
- Edge functions untuk create-user dan process-royalty-upload
- Storage buckets: release-covers, track-audio, track-video, audio-clips
- Beberapa fitur metadata (composer, lyricist, lyrics) sudah ada di level track
