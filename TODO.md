# TODO - SoundPub Distribution Dashboard

## ✅ Sudah Dikerjakan

### Authentication & Authorization
- [x] Login/Signup system
- [x] Role-based access control (superadmin, admin, label, artist, user)
- [x] Profile management (view & edit)
- [x] Protected routes berdasarkan role

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

### User Management
- [x] Daftar users (admin view)
- [x] Add user (admin/label)
- [x] Edit user
- [x] Delete user
- [x] Change user role (admin only)
- [x] My Artists page (label view)

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

---

## ❌ Belum Dikerjakan

### High Priority
- [ ] **Admin Approve/Reject Payout**
  - Halaman khusus admin untuk melihat semua payout requests
  - Tombol approve/reject dengan konfirmasi
  - Update balance setelah payout approved
  - Notifikasi ke user

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

### Media Upload
- [ ] Full audio upload (WAV/FLAC, 120s+)
- [ ] Music video upload (MP4, 120s+)
- [ ] Audio clip upload (30-60s)

### Release Metadata
- [ ] Multiple artists (Main/Featured)
- [ ] Complete genre list
- [ ] Explicit lyrics flag
- [ ] Composer & lyricist fields *(sudah ada di tracks)*
- [ ] Lyrics text area *(sudah ada di tracks)*
- [ ] Additional contributors
- [ ] Metadata versioning

### Release Management
- [ ] Edit metadata *(sudah bisa edit release)*
- [ ] Delete/archive releases
- [ ] Bulk actions

---

## 📊 Export Functionality

### ✅ Completed
- [x] CSV exports (sudah ada di royalties/reports)
- [x] PDF reports (browser print available)

### ❌ Future
- [ ] Excel exports (.xlsx format)
- [ ] Scheduled reports (email/auto-generate)

---

## 📈 Advanced Analytics (Future)

- [ ] Halaman analytics dedicated
- [ ] Perbandingan periode (YoY, MoM)
- [ ] Growth metrics & KPIs
- [ ] Performance indicators
- [ ] Custom date ranges
- [ ] Top performing releases/tracks
- [ ] Geographic insights

---

## 📝 Notes
- Database menggunakan Lovable Cloud (Supabase)
- RLS policies sudah diimplementasi untuk keamanan data
- Edge functions untuk create-user dan process-royalty-upload
- Beberapa fitur metadata (composer, lyricist, lyrics) sudah ada di level track
