# TODO Pengembangan Hak Cipta / Publishing

Update: 2026-07-16
Status legend: `[ ]` belum, `[~]` berjalan, `[x]` selesai, `[!]` butuh keputusan.

## Working Memory Singkat

- Project: Soundpub Dashboard.
- Fokus baru: sistem registrasi dan pengelolaan Hak Cipta/Publishing.
- Acuan kontrak: `C:/Users/bimok/Downloads/DRAFT KONTRAK SOUNDPUB COMPLETE.docx`.
- Konsep akun: 1 user copyright = 1 komposer/pemilik hak cipta untuk fase awal.
- Matching royalti harus pakai `composer_code`; matching by name hanya fallback sementara.
- Royalti publishing berdasarkan kontrak:
  - Mechanical: 70% Komposer / 30% Publisher.
  - Sync: 70% Komposer / 30% Publisher.
  - Lainnya: 50% Komposer / 50% Publisher.
- Sistem saat ini sudah punya role `copyright`, `composer_royalties`, dan `profiles.composer_code`.
- Masalah existing: query copyright masih banyak filter client-side; perlu RPC/RLS berbasis `composer_code`.
- Dokumen rancangan utama: `docs/COPYRIGHT_FEATURE_PLAN.md`.

## Tahap 0 — Keputusan Produk

- [ ] Tentukan pendaftaran publik: wajib login dulu atau bisa dari public landing page.
- [ ] Tentukan apakah approval otomatis membuat role `copyright`.
- [ ] Tentukan format kontrak awal: HTML/PDF dulu atau langsung DOCX template.
- [ ] Tentukan tanda tangan: upload signed file atau e-signature di app.
- [ ] Tentukan apakah satu akun boleh punya banyak `composer_code`.
- [ ] Tentukan apakah payout Hak Cipta pakai balance yang sama atau wallet terpisah.

## Tahap 1 — Database dan Security

- [ ] Buat migration `copyright_registrations`.
- [ ] Buat migration `copyright_registration_works`.
- [ ] Buat migration `copyright_registration_files`.
- [ ] Buat migration `copyright_contracts`.
- [ ] Tambah/rapikan index `composer_code`.
- [ ] Buat RPC `get_my_composer_royalties()`.
- [ ] Update RLS `composer_royalties` agar berbasis `profiles.composer_code`.
- [ ] Buat RPC/admin action untuk review registration.
- [ ] Buat generator `composer_code` dan `contract_number`.
- [ ] Validasi migration di local/Supabase.

## Tahap 2 — Frontend Informasi dan Registrasi

- [ ] Buat halaman informasi layanan Hak Cipta.
- [ ] Buat CTA `Daftar Perlindungan Hak Cipta`.
- [ ] Buat route registrasi.
- [ ] Buat wizard step 1: Data Pemohon.
- [ ] Buat wizard step 2: Pajak dan Pembayaran.
- [ ] Buat wizard step 3: Data Karya/Lagu repeatable.
- [ ] Buat wizard step 4: Hak, Wilayah, Durasi.
- [ ] Buat wizard step 5: Royalti dan Pernyataan.
- [ ] Buat wizard step 6: Review dan Submit.
- [ ] Tambah upload file KTP/NPWP/bukti karya/audio.
- [ ] Tambah save draft dan submit.

## Tahap 3 — Admin Review

- [ ] Buat menu admin pendaftaran Hak Cipta.
- [ ] Buat list submissions dengan filter status.
- [ ] Buat halaman detail submission.
- [ ] Buat aksi request revision.
- [ ] Buat aksi approve/reject.
- [ ] Assign/generate `composer_code` saat approve.
- [ ] Generate nomor kontrak.
- [ ] Upload/generate kontrak final.
- [ ] Aktivasi role/akses `copyright`.

## Tahap 4 — Kontrak

- [ ] Mapping field kontrak dari form ke template.
- [ ] Generate preview kontrak.
- [ ] Generate PDF atau DOCX.
- [ ] Simpan file kontrak ke storage.
- [ ] Upload signed contract.
- [ ] Ubah status ke `contract_signed` atau `active`.
- [ ] Dokumentasikan versi template kontrak.

## Tahap 5 — Dashboard User Hak Cipta

- [ ] Refactor dashboard agar pakai RPC `get_my_composer_royalties()`.
- [ ] Tampilkan ringkasan royalti by period.
- [ ] Tampilkan daftar karya terdaftar.
- [ ] Tampilkan status kontrak.
- [ ] Tampilkan histori payout Hak Cipta.
- [ ] Pastikan data user lain tidak pernah bocor ke frontend.

## Tahap 6 — Upload Royalti Hak Cipta

- [ ] Standarkan CSV baru: `composer_code`, `composer_name`, `total_net_royalti`, `period`.
- [ ] Pertahankan alias lama `composer_id` sebagai `composer_code` sementara.
- [ ] Tambah validasi composer code harus dikenal.
- [ ] Tambah warning jika hanya match by name.
- [ ] Tambah upload batch aman.
- [ ] Tambah upload history/delete upload jika diperlukan.
- [ ] Update UI preview upload.

## Tahap 7 — Dokumentasi dan QA

- [ ] Update `docs/API-DOCS.md`.
- [ ] Update `docs/MIGRATION-GUIDE.md`.
- [ ] Update `docs/PROJECT_DEVELOPMENT_LOG.md`.
- [ ] Tambah skenario QA registrasi.
- [ ] Tambah skenario QA admin review.
- [ ] Tambah skenario QA copyright dashboard.
- [ ] Jalankan `npm run build`.
- [ ] Push perubahan ke GitHub setelah tahap stabil.

## Backlog Tambahan

- [ ] E-signature native.
- [ ] Multi-composer dalam satu akun.
- [ ] Co-writer approval flow.
- [ ] Public tracking status pendaftaran.
- [ ] Notifikasi email/WhatsApp untuk status review.
- [ ] Auto-generate invoice/statement royalti.
- [ ] Export statement PDF per periode.

## Tahap 0A — E-Meterai, PDF, dan Pembayaran Registrasi

- [ ] Putuskan biaya Rp100.000 sudah termasuk e-Meterai atau belum.
- [ ] Putuskan jumlah e-Meterai per kontrak: 1 atau 2 keping.
- [ ] Putuskan MVP e-Meterai: manual/semi-manual atau langsung API.
- [ ] Pilih shortlist provider e-Meterai untuk dicek: Mekari Sign, EZMeterai, PDS/Peruri, Privy.
- [ ] Buat halaman preview kontrak HTML sebelum submit.
- [ ] Buat fitur download draft kontrak PDF.
- [ ] Tambah status `awaiting_payment` dan `paid_pending_review`.
- [ ] Tambah pembayaran registrasi Rp100.000 sebelum final submit.
- [ ] Tambah tabel `copyright_registration_payments`.
- [ ] Tambah field e-Meterai/stamping di `copyright_contracts`.
- [ ] Buat fallback upload kontrak bermeterai manual oleh admin.
- [ ] Rancang abstraksi provider e-Meterai agar bisa upgrade ke API.
