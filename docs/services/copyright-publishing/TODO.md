# TODO Pengembangan Hak Cipta / Publishing

Update: 2026-07-17
Status legend: `[ ]` belum, `[x]` selesai.

## Working Memory Singkat

- Project: Soundpub Dashboard + PDF Contract Service.
- Fokus terbaru: manual upload workflow untuk e-Meterai, bukan API auto-stamp.
- Payment Rp100.000 wajib sebelum proses kontrak dan sebelum download draft PDF.
- Backend PDF service berdiri terpisah di `I:/website-devops/soundpub-project/soundpub-pdf-service`.
- Template Word resmi ada di Supabase bucket `template`.
- Semua placeholder template memakai format `{{key}}`.
- Backend/DB hanya boleh memakai schema `soundpub`.

## Tahap 0 ? Keputusan Produk

- [x] Pendaftaran publik wajib login dulu untuk MVP.
- [x] Approval otomatis memberi role `copyright`.
- [x] Format kontrak awal: HTML preview + PDF download.
- [x] Tanda tangan/e-Meterai manual oleh admin untuk MVP.
- [x] Satu akun awal = satu `composer_code`.
- [x] Payout Hak Cipta dipisah dari royalti DSP.

## Tahap 1 ? Database dan Security

- [x] Migration `copyright_registrations`.
- [x] Migration `copyright_registration_works`.
- [x] Migration `copyright_registration_files`.
- [x] Migration `copyright_contracts`.
- [x] Migration `copyright_registration_payments`.
- [x] RPC `get_my_composer_royalties()`.
- [x] RLS berbasis `profiles.composer_code`.
- [x] RPC/admin action untuk review registration.
- [x] Generator `composer_code` dan `contract_number`.
- [x] Validasi migration di local/Supabase.

## Tahap 2 ? Frontend Informasi dan Registrasi

- [x] Halaman info layanan Hak Cipta.
- [x] CTA `Daftar Perlindungan Hak Cipta`.
- [x] Route registrasi.
- [x] Wizard step 1: Data Pemohon.
- [x] Wizard step 2: Pajak dan Pembayaran.
- [x] Wizard step 3: Data Karya/Lagu repeatable.
- [x] Wizard step 4: Hak, Wilayah, Durasi.
- [x] Wizard step 5: Royalti dan Pernyataan.
- [x] Wizard step 6: Review dan Submit.
- [x] Upload file KTP/NPWP/bukti karya/audio.
- [x] Save draft dan submit.

## Tahap 3 ? Admin Review

- [x] Menu admin pendaftaran Hak Cipta.
- [x] List submissions dengan filter status.
- [x] Halaman detail submission.
- [x] Aksi request revision.
- [x] Aksi approve/reject.
- [x] Assign/generate `composer_code` saat approve.
- [x] Generate nomor kontrak.
- [x] Tampilkan metadata dan URL kontrak.
- [x] Aktivasi role/akses `copyright`.

## Tahap 4 ? Kontrak & PDF Manual

- [x] Mapping field kontrak dari form ke template.
- [x] Backend service PDF generation dibuat.
- [x] Template Word resmi di Supabase bucket `template`.
- [x] Tombol download draft PDF di admin panel.
- [x] Tombol upload PDF bermeterai manual di admin panel.
- [x] Validasi payment status sebelum download draft PDF.
- [ ] Generate PDF final/preview yang benar-benar match template Word.
- [ ] Update status kontrak saat upload PDF bermeterai.
- [ ] Dokumentasikan alur manual upload final.
- [ ] Archive: e-Meterai API integration untuk fase lanjutan.

## Tahap 5 ? Dashboard User Hak Cipta

- [ ] Refactor dashboard pakai RPC `get_my_composer_royalties()`.
- [ ] Tampil ringkasan royalti by period.
- [ ] Daftar karya terdaftar.
- [ ] Status kontrak.
- [ ] Histori payout.

## Tahap 6 ? Upload Royalti Hak Cipta

- [ ] CSV baru: `composer_code`, `composer_name`, `total_net_royalti`, `period`.
- [ ] Validasi composer code.
- [ ] Warning match by name only.
- [ ] Upload batch aman.
- [ ] Upload history/delete.

## Tahap 7 ? QA dan Deployment

- [ ] QA registrasi.
- [ ] QA admin review.
- [ ] QA dashboard Hak Cipta.
- [ ] Build final + smoke test.
- [ ] Merge ke main.

## Backlog

- [ ] E-signature native.
- [ ] Multi-composer per akun.
- [ ] Co-writer approval flow.
- [ ] Public tracking status.
- [ ] Email/WhatsApp notifikasi.
- [ ] Auto-generate invoice/statement royalti.
- [ ] Export statement PDF per periode.
