# Checklist Testing: Fitur Hak Cipta/Publishing

## Pre-requisites

### [ ] 1. Database Migration
- **Action**: Jalankan migration `20260717090000_copyright_publishing_registration.sql` ke database remote
- **Verify**: 
  - Query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'soundpub' AND table_name LIKE 'copyright%';`
  - Ekspektasi: 5 tabel muncul:
    - `copyright_registrations`
    - `copyright_registration_works`
    - `copyright_registration_files`
    - `copyright_registration_payments`
    - `copyright_contracts`
- **Status**: ❌ Belum / ✅ Sudah

### [ ] 2. Template Word di Bucket
- **Action**: Upload file `FINAL - DRAFT KONTRAK SOUNDPUB COMPLETE.docx` ke bucket `template`
- **Path**: `template/FINAL - DRAFT KONTRAK SOUNDPUB COMPLETE.docx`
- **Verify**: Akses URL: `https://supabase.carubra.com/storage/v1/object/public/template/FINAL%20-%20DRAFT%20KONTRAK%20SOUNDPUB%20COMPLETE.docx`
- **Ekspektasi**: File bisa didownload (tidak 404)
- **Status**: ❌ Belum / ✅ Sudah

### [ ] 3. Bucket untuk PDF Hasil
- **Action**: Buat bucket baru (atau pakai existing) untuk hasil PDF kontrak
- **Nama bucket**: `contracts` (atau sesuai pilihan kamu)
- **Policy**: 
  - Service role bisa write
  - Public read optional (atau pakai signed URL)
- **Status**: ❌ Belum / ✅ Sudah

### [ ] 4. Backend PDF Service Setup
- **Action**: 
  1. `cd I:\website-devops\soundpub-project\soundpub-pdf-service`
  2. Copy `.env.example` ke `.env`
  3. Isi `.env`:
     ```
     PORT=3001
     SUPABASE_URL=https://supabase.carubra.com
     SUPABASE_KEY=<service_role_key>
     CONTRACT_BUCKET=contracts
     ```
  4. `npm install`
  5. `npm run dev`
- **Verify**: 
  - Akses: `http://localhost:3001/api/contracts/health`
  - Ekspektasi: Response `{"status":"ok"}`
- **Status**: ❌ Belum / ✅ Sudah

### [ ] 5. Frontend Environment
- **Action**: Pastikan frontend tahu URL PDF service
- **File**: `.env` atau `.env.local`
- **Isi**: `VITE_PDF_SERVICE_URL=http://localhost:3001` (atau IP server kalau beda mesin)
- **Status**: ❌ Belum / ✅ Sudah

---

## Test Case 1: User Registrasi Hak Cipta

### [ ] TC1.1 - Buka Halaman Info
- **Action**: Login sebagai user biasa, buka `/dashboard/copyright-registration`
- **Ekspektasi**: 
  - Halaman info muncul
  - Ada penjelasan layanan Hak Cipta
  - Ada keterangan biaya `Rp100.000` + 1 e-Meterai
  - Ada tombol `Mulai Pendaftaran`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC1.2 - Isi Form Registrasi (Step 1: Data Pemohon)
- **Action**: Klik `Mulai Pendaftaran`, isi form:
  - Nama lengkap: `John Doe Composer`
  - Email: `john@example.com`
  - NIK: `1234567890123456`
  - Alamat: `Jl. Test No. 123, Jakarta`
  - No. Telp: `081234567890`
- **Ekspektasi**: Bisa lanjut ke step berikutnya
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC1.3 - Isi Form Registrasi (Step 2: Pajak & Pembayaran)
- **Action**: Isi form:
  - NPWP: `12.345.678.9-012.000`
  - Nama bank: `BCA`
  - No. rekening: `1234567890`
  - Nama pemilik: `John Doe Composer`
- **Ekspektasi**: Bisa lanjut ke step berikutnya
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC1.4 - Isi Form Registrasi (Step 3: Data Karya)
- **Action**: Tambah karya:
  - Judul lagu: `Test Song One`
  - Nama pencipta: `John Doe`
  - Nama penulis lirik: `John Doe`
  - Solo/kolaborasi: `Solo`
  - Upload file dummy untuk:
    - KTP
    - Bukti karya
- **Ekspektasi**: Karya tersimpan di list, bisa lanjut
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC1.5 - Simpan Draft
- **Action**: Klik `Simpan Draft`
- **Ekspektasi**:
  - Alert sukses muncul
  - Data tersimpan ke `soundpub.copyright_registrations` dengan status `draft`
- **Verify DB**:
  ```sql
  SELECT id, legal_name, status FROM soundpub.copyright_registrations 
  WHERE legal_name = 'John Doe Composer';
  ```
- **Ekspektasi**: 1 row, status = `draft`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC1.6 - Lanjut Submit Final
- **Action**: Klik `Lanjutkan Pembayaran`
- **Ekspektasi**:
  - Status berubah ke `awaiting_payment`
  - Data payment tersimpan ke `soundpub.copyright_registration_payments`
- **Verify DB**:
  ```sql
  SELECT registration_id, amount, currency, payment_status 
  FROM soundpub.copyright_registration_payments 
  WHERE registration_id = '<id dari TC1.5>';
  ```
- **Ekspektasi**: 1 row, amount = 100000, currency = `IDR`, status = `pending`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

---

## Test Case 2: Simulasi Pembayaran Sukses

### [ ] TC2.1 - Update Payment Status Manual
- **Action**: Update status payment di DB (simulasi):
  ```sql
  UPDATE soundpub.copyright_registration_payments
  SET payment_status = 'paid', paid_at = NOW()
  WHERE registration_id = '<id dari TC1.5>';
  ```
- **Verify**:
  ```sql
  SELECT payment_status, paid_at 
  FROM soundpub.copyright_registration_payments 
  WHERE registration_id = '<id dari TC1.5>';
  ```
- **Ekspektasi**: `payment_status = 'paid'`, `paid_at` terisi
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC2.2 - Update Registration Status
- **Action**: Update status registrasi:
  ```sql
  UPDATE soundpub.copyright_registrations
  SET status = 'paid_pending_review'
  WHERE id = '<id dari TC1.5>';
  ```
- **Verify**:
  ```sql
  SELECT status FROM soundpub.copyright_registrations 
  WHERE id = '<id dari TC1.5>';
  ```
- **Ekspektasi**: `status = 'paid_pending_review'`
- **Status**: ❌ Gagal / ✅ Berhasil

---

## Test Case 3: Admin Review & Approve

### [ ] TC3.1 - Buka Halaman Admin Review
- **Action**: Login sebagai admin, buka `/dashboard/copyright-registration/review`
- **Ekspektasi**:
  - Halaman admin review muncul
  - List registrasi tampil
  - Registrasi `John Doe Composer` ada dengan status `paid_pending_review`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC3.2 - Pilih Registrasi untuk Review
- **Action**: Klik registrasi `John Doe Composer`
- **Ekspektasi**:
  - Detail panel muncul di kanan
  - Data lengkap tampil:
    - Nama
    - NIK
    - NPWP
    - Bank
    - Karya
    - Payment status: `paid`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC3.3 - Set Status In Review
- **Action**: Klik tombol `In Review`
- **Ekspektasi**:
  - Status berubah ke `in_review`
  - Tombol approve/reject muncul
- **Verify DB**:
  ```sql
  SELECT status FROM soundpub.copyright_registrations 
  WHERE id = '<id dari TC1.5>';
  ```
- **Ekspektasi**: `status = 'in_review'`
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC3.4 - Approve Registrasi
- **Action**: Klik tombol `Approve`
- **Ekspektasi**:
  - Status berubah ke `approved`
  - Nomor surat kontrak auto-generate
  - `composer_code` auto-assign
  - Role user berubah dari `user` ke `copyright`
  - Entry di `copyright_contracts` terbuat
- **Verify DB**:
  ```sql
  SELECT r.status, r.composer_code, r.approved_at,
         c.contract_number, c.contract_sequence, c.contract_month_roman, 
         c.contract_code, c.contract_year, c.status as contract_status
  FROM soundpub.copyright_registrations r
  LEFT JOIN soundpub.copyright_contracts c ON c.registration_id = r.id
  WHERE r.id = '<id dari TC1.5>';
  ```
- **Ekspektasi**:
  - `r.status = 'approved'`
  - `r.composer_code` terisi (misal: `COMP00001`)
  - `r.approved_at` terisi
  - `c.contract_number` terisi (misal: `P00001/Soundpub/VII/PBLSR/2026`)
  - `c.status = 'approved'`
- **Verify Role**:
  ```sql
  SELECT role FROM soundpub.user_roles 
  WHERE user_id = '<user_id dari registrasi>';
  ```
- **Ekspektasi**: `role = 'copyright'`
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

---

## Test Case 4: Generate PDF Draft

### [ ] TC4.1 - Verifikasi Tombol Download Aktif
- **Action**: Di panel admin, cek tombol `Download Draft PDF`
- **Ekspektasi**:
  - Tombol aktif (tidak disabled)
  - Ada keterangan payment status: `paid`
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC4.2 - Klik Download Draft PDF
- **Action**: Klik tombol `Download Draft PDF`
- **Ekspektasi**:
  - Browser download file PDF
  - Nama file: `contract-<registration_id>-<timestamp>.pdf`
  - PDF bisa dibuka
  - Isi PDF:
    - Nomor surat terisi
    - Nama pemohon terisi
    - Alamat terisi
    - NIK terisi
    - NPWP terisi
    - Bank terisi
    - Watermark "DRAFT" muncul
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC4.3 - Verify Storage & Database
- **Action**: Cek bucket `contracts/generated/`
- **Ekspektasi**: File PDF tersimpan dengan nama yang sesuai
- **Verify DB**:
  ```sql
  SELECT draft_pdf_url, generated_pdf_url, status 
  FROM soundpub.copyright_contracts 
  WHERE registration_id = '<id dari TC1.5>';
  ```
- **Ekspektasi**:
  - `draft_pdf_url` terisi URL storage
  - `generated_pdf_url` terisi URL storage
  - `status = 'generated'`
- **Status**: ❌ Gagal / ✅ Berhasil

---

## Test Case 5: Upload PDF Bermeterai Manual

### [ ] TC5.1 - Simulasi Apply e-Meterai Manual
- **Action**: (Di luar sistem)
  1. Download PDF dari TC4.2
  2. Print atau save
  3. Gunakan aplikasi e-Meterai desktop/online
  4. Stamp PDF
  5. Save sebagai file baru (misal: `contract-stamped.pdf`)
- **Status**: ❌ Belum / ✅ Sudah

### [ ] TC5.2 - Upload PDF Bermeterai
- **Action**: Di panel admin, klik tombol `Upload PDF Bermeterai`
- **Ekspektasi**:
  - File picker muncul
  - Pilih `contract-stamped.pdf`
  - Upload sukses
  - Alert sukses muncul
- **Status**: ❌ Gagal / ✅ Berhasil
- **Error (jika ada)**: _______________________

### [ ] TC5.3 - Verify Status Kontrak
- **Action**: Refresh panel detail
- **Ekspektasi**:
  - Status kontrak berubah ke `stamped`
  - `stamped_pdf_url` terisi
  - `stamped_at` terisi
- **Verify DB**:
  ```sql
  SELECT stamped_pdf_url, stamped_at, status 
  FROM soundpub.copyright_contracts 
  WHERE registration_id = '<id dari TC1.5>';
  ```
- **Ekspektasi**:
  - `stamped_pdf_url` terisi
  - `stamped_at` terisi timestamp
  - `status = 'stamped'`
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC5.4 - Update Status ke Signed/Active
- **Action**: Klik tombol `Mark as Signed` atau `Activate Contract`
- **Ekspektasi**:
  - Status kontrak berubah ke `signed` atau `active`
  - `signed_at` terisi
- **Verify DB**:
  ```sql
  SELECT signed_at, status 
  FROM soundpub.copyright_contracts 
  WHERE registration_id = '<id dari TC1.5>';
  
  SELECT status FROM soundpub.copyright_registrations 
  WHERE id = '<id dari TC1.5>';
  ```
- **Ekspektasi**:
  - Contract: `status = 'active'`, `signed_at` terisi
  - Registration: `status = 'contract_signed'` atau `active`
- **Status**: ❌ Gagal / ✅ Berhasil

---

## Test Case 6: User Dashboard Hak Cipta (Belum Implementasi)

### [ ] TC6.1 - User Login dengan Role Copyright
- **Action**: Logout admin, login sebagai user `john@example.com`
- **Ekspektasi**:
  - Menu `Dashboard Hak Cipta` muncul di sidebar
  - Role user sekarang `copyright`
- **Status**: ❌ Gagal / ✅ Berhasil / ⏸️ Belum Implementasi

### [ ] TC6.2 - Buka Dashboard Hak Cipta
- **Action**: Klik menu `Dashboard Hak Cipta`
- **Ekspektasi**:
  - Halaman dashboard muncul
  - Data user copyright tampil:
    - Nama
    - Composer code
    - Status kontrak
    - Nomor surat
- **Status**: ❌ Gagal / ✅ Berhasil / ⏸️ Belum Implementasi

---

## Test Case 7: Upload Royalti Hak Cipta (Belum Implementasi)

### [ ] TC7.1 - Admin Upload Royalti CSV
- **Action**: Upload CSV dengan format:
  ```csv
  composer_id,composer_name,total_net_royalti,period
  COMP00001,John Doe Composer,1500000,2026-07
  ```
- **Ekspektasi**:
  - Data masuk ke `soundpub.composer_royalties`
  - Matching by `composer_id = composer_code`
- **Status**: ❌ Gagal / ✅ Berhasil / ⏸️ Belum Implementasi

### [ ] TC7.2 - User Lihat Royalti
- **Action**: User buka dashboard Hak Cipta
- **Ekspektasi**:
  - Royalti bulan `2026-07` muncul
  - Amount: `Rp1.500.000`
- **Status**: ❌ Gagal / ✅ Berhasil / ⏸️ Belum Implementasi

---

## Test Case 8: Edge Cases & Validasi

### [ ] TC8.1 - Registrasi Tanpa Payment Tidak Bisa Download
- **Action**: Buat registrasi baru, approve tanpa update payment ke `paid`
- **Ekspektasi**:
  - Tombol `Download Draft PDF` disabled
  - Tooltip: "Payment belum lunas"
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC8.2 - Admin Tidak Bisa Generate PDF Sebelum Approve
- **Action**: Pilih registrasi dengan status `paid_pending_review`
- **Ekspektasi**:
  - Tombol `Download Draft PDF` tidak muncul/disabled
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC8.3 - Nomor Surat Unique per Bulan
- **Action**: Approve 2 registrasi di bulan yang sama
- **Ekspektasi**:
  - Nomor surat sequence increment:
    - Pertama: `P00001/Soundpub/VII/PBLSR/2026`
    - Kedua: `P00002/Soundpub/VII/PBLSR/2026`
- **Verify DB**:
  ```sql
  SELECT contract_number, contract_sequence 
  FROM soundpub.copyright_contracts 
  WHERE contract_month_roman = 'VII' AND contract_year = '2026'
  ORDER BY contract_sequence;
  ```
- **Status**: ❌ Gagal / ✅ Berhasil

### [ ] TC8.4 - Sequence Reset Bulan Baru
- **Action**: Approve registrasi di bulan berikutnya
- **Ekspektasi**:
  - Sequence kembali ke `00001`
  - Nomor: `P00001/Soundpub/VIII/PBLSR/2026`
- **Status**: ❌ Gagal / ✅ Berhasil

---

## Catatan Error & Issue

### Issue 1:
- **Test Case**: _______________________
- **Error Message**: _______________________
- **Screenshot/Log**: _______________________
- **Status**: ❌ Unresolved / 🔧 In Progress / ✅ Fixed

### Issue 2:
- **Test Case**: _______________________
- **Error Message**: _______________________
- **Screenshot/Log**: _______________________
- **Status**: ❌ Unresolved / 🔧 In Progress / ✅ Fixed

### Issue 3:
- **Test Case**: _______________________
- **Error Message**: _______________________
- **Screenshot/Log**: _______________________
- **Status**: ❌ Unresolved / 🔧 In Progress / ✅ Fixed

---

## Summary

- **Total Test Cases**: 27
- **Passed**: _____ / 27
- **Failed**: _____ / 27
- **Belum Implementasi**: _____ / 27

**Testing Date**: _______________________
**Tester**: _______________________
**Environment**: Dev / Staging / Production

**Overall Status**: ❌ Not Ready / ⚠️ Partial / ✅ Ready for Production
