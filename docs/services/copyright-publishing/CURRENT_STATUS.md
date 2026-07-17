# Ringkasan Progress Soundpub Copyright Publishing ? 2026-07-17

## Sudah Dikerjakan

### Database & Backend (Tahap 1)
- [x] Tabel: `copyright_registrations`, `copyright_registration_works`, `copyright_registration_files`, `copyright_contracts`, `copyright_registration_payments`
- [x] RPC `generate_copyright_contract_number()` untuk format `P00009/Soundpub/XII/PBLSR/2024`
- [x] RPC `admin_review_copyright_registration()` untuk review registrasi dan auto-generate kontrak
- [x] RPC `admin_update_copyright_contract()` untuk sinkron status kontrak dan registrasi
- [x] RLS policies untuk copyright tables
- [x] Trigger timestamp + index performa

### Frontend User Registration (Tahap 2)
- [x] Halaman info layanan `/dashboard/copyright-registration`
- [x] Wizard registrasi `/dashboard/copyright-registration/new`
- [x] Draft save/reload
- [x] Preview kontrak HTML dan download draft preview
- [x] File metadata persistence

### Frontend Admin Review (Tahap 3)
- [x] Halaman review admin `/dashboard/copyright-registration/review`
- [x] List submissions + filter + search
- [x] Detail panel registrasi, metadata kontrak, URL panel
- [x] Aksi review: in review, revision, approve, reject
- [x] Aksi kontrak: generate, stamping_pending, stamped, signed, active
- [x] Tombol buka/salin URL kontrak
- [x] Sidebar admin entry

### Integrasi & Sync
- [x] Auto-generate nomor surat saat approve
- [x] Auto-create contract draft saat approve
- [x] Sync status kontrak ? registrasi

### Backend PDF Service (Tahap 4A)
- [x] Backend khusus PDF generation dibuat di `I:/website-devops/soundpub-project/soundpub-pdf-service`
- [x] Stack: Express + mammoth + puppeteer + Supabase storage client
- [x] Template Word resmi sudah disiapkan di Supabase bucket `template`
- [x] Frontend admin review punya tombol download draft PDF dan upload PDF bermeterai
- [x] Validasi payment status sebelum download draft PDF

### Git & Docs
- [x] Branch `feature/copyright-admin-review` sudah push
- [x] Commit utama: `649bbf5`, `7e5b5a3`, `d55e384`, `29751fd`, `da70e1b`
- [x] Docs service, TODO, dan current status sudah diperbarui

## Belum Dikerjakan

### Tahap 4 ? Kontrak & PDF Manual
- [ ] Generate PDF final/preview yang benar-benar match template Word
- [ ] Update status kontrak saat upload PDF bermeterai
- [ ] Dokumentasikan alur manual upload final
- [ ] Archive: e-Meterai API integration untuk fase lanjutan

### Tahap 5 ? Dashboard User Hak Cipta
- [ ] Refactor dashboard pakai RPC `get_my_composer_royalties()`
- [ ] Ringkasan royalti by period
- [ ] Daftar karya terdaftar
- [ ] Status kontrak
- [ ] Histori payout

### Tahap 6 ? Upload Royalti Hak Cipta
- [ ] CSV baru: `composer_code`, `composer_name`, `total_net_royalti`, `period`
- [ ] Validasi composer code
- [ ] Warning match by name only
- [ ] Upload batch aman
- [ ] Upload history/delete

### Tahap 7 ? QA & Deployment
- [ ] QA registrasi
- [ ] QA admin review
- [ ] QA dashboard Hak Cipta
- [ ] Build final + smoke test
- [ ] Merge ke main

### Backlog
- [ ] E-signature native
- [ ] Multi-composer per akun
- [ ] Co-writer approval flow
- [ ] Public tracking status
- [ ] Email/WhatsApp notifikasi

## Working Memory Singkat

**Project**: Soundpub Copyright Publishing Service MVP

**Branch**: `feature/copyright-admin-review`

**Focus Terbaru**:
- E-Meterai API integration di-archive/defer.
- Fokus sekarang: manual upload workflow + PDF generation service.
- Payment Rp100.000 wajib sebelum proses kontrak dan sebelum download draft PDF.

**Key Files**:
- `supabase/migrations/20260717090000_copyright_publishing_registration.sql`
- `src/pages/CopyrightRegistrationReview.tsx`
- `src/pages/CopyrightRegistrationForm.tsx`
- `src/pages/CopyrightRegistrationInfo.tsx`
- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`
- `docs/services/copyright-publishing/TODO.md`
- `docs/services/copyright-publishing/CURRENT_STATUS.md`
- `I:/website-devops/soundpub-project/soundpub-pdf-service`

**Schema Rule**: ONLY modify `soundpub` schema.

**Build Status**: ? Lolos `npm run build`

**Next Priority**:
1. Sempurnakan endpoint PDF service dan template injection
2. Integrasi upload bermeterai manual dengan update status
3. Rapiin UX panel admin review untuk download/upload
4. Lanjut ke dashboard user Hak Cipta
