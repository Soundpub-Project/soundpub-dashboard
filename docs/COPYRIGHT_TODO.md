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

- [x] Tentukan pendaftaran publik: wajib login dulu untuk MVP.
- [x] Tentukan apakah approval otomatis membuat role `copyright`: ya, setelah approved/active.
- [x] Tentukan format kontrak awal: HTML preview + PDF download dulu.
- [x] Tentukan tanda tangan: MVP upload signed/bermeterai manual oleh admin.
- [x] Tentukan apakah satu akun boleh punya banyak `composer_code`: fase awal 1 akun = 1 composer_code.
- [x] Tentukan payout Hak Cipta: dipisah secara logical dari royalti DSP.

## Tahap 1 — Database dan Security

- [x] Buat migration `copyright_registrations`.
- [x] Buat migration `copyright_registration_works`.
- [x] Buat migration `copyright_registration_files`.
- [x] Buat migration `copyright_contracts`.
- [x] Tambah/rapikan index `composer_code`.
- [x] Buat RPC `get_my_composer_royalties()`.
- [x] Update RLS `composer_royalties` agar berbasis `profiles.composer_code`.
- [x] Buat RPC/admin action untuk review registration.
- [x] Buat generator `composer_code` dan `contract_number`.
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

- [x] Putuskan biaya Rp100.000: sudah termasuk 1 e-Meterai untuk MVP.
- [x] Putuskan jumlah e-Meterai per kontrak: 1 keping untuk MVP.
- [x] Putuskan MVP e-Meterai: manual/semi-manual dulu, API disiapkan sebagai fase lanjut.
- [ ] Pilih shortlist provider e-Meterai untuk dicek: Mekari Sign, EZMeterai, PDS/Peruri, Privy.
- [ ] Buat halaman preview kontrak HTML sebelum submit.
- [ ] Buat fitur download draft kontrak PDF dengan watermark sebelum bayar.
- [ ] Tambah status `awaiting_payment` dan `paid_pending_review`.
- [ ] Tambah pembayaran registrasi Rp100.000 sebelum final submit.
- [x] Tambah tabel `copyright_registration_payments`.
- [x] Tambah field e-Meterai/stamping di `copyright_contracts`.
- [ ] Buat fallback upload kontrak bermeterai manual oleh admin.
- [x] Rancang abstraksi provider e-Meterai agar bisa upgrade ke API.



## Kontrak Kerja Schema — 2026-07-17

- Jangan mengubah schema selain `soundpub`.
- Semua tabel, RPC, RLS, trigger, index, dan perubahan database baru untuk fitur Soundpub harus berada di schema `soundpub`.
- Schema lain seperti `public`, `finance`, `extensions`, `auth`, dan schema non-Soundpub tidak boleh disentuh kecuali user memberi instruksi eksplisit.
- Jika lint remote menampilkan error dari schema lain, catat saja sebagai issue existing dan jangan diperbaiki dalam task Soundpub.

## Catatan Schema Untuk Tahap 1

- Migration Hak Cipta harus memakai schema `soundpub`.
- Jangan deploy versi migration yang membuat objek di `public`.
- Referensi `auth.users` boleh untuk FK, tetapi tidak boleh mengubah schema `auth`.
