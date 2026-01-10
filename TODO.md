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
- [ ] **Export Royalty to Excel**
  - Download royalty data ke format Excel/CSV
  - Filter berdasarkan periode
  - Filter berdasarkan artist/release

- [ ] **Artist Profile Page**
  - Public profile page untuk artist
  - Statistik singkat
  - Daftar releases

---

## 📝 Notes
- Database menggunakan Lovable Cloud (Supabase)
- RLS policies sudah diimplementasi untuk keamanan data
- Edge functions untuk create-user dan process-royalty-upload
