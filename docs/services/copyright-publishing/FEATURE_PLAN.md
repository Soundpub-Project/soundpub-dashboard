# Rancangan Fitur Hak Cipta / Publishing Soundpub

Update: 2026-07-16
Status: Draft rancangan awal sebelum implementasi

## Kontrak Kerja Ringkas

- Fokus fitur: pendaftaran, kontrak, pengelolaan, upload royalti, dan dashboard user Hak Cipta/Publishing.
- Acuan dokumen: `C:/Users/bimok/Downloads/DRAFT KONTRAK SOUNDPUB COMPLETE.docx`.
- Prinsip teknis: hemat token, dokumentasikan keputusan penting, dan update TODO setiap selesai tahap.
- Prinsip data: matching royalti harus distandarkan ke `composer_code`, bukan nama bebas.
- Prinsip keamanan: data royalti user Hak Cipta harus difilter di database/RPC/RLS, bukan hanya frontend.

## Kondisi Sistem Saat Ini

- Role `copyright` sudah ada di sistem auth/role.
- Route Hak Cipta yang sudah ada:
  - `/dashboard/copyright`
  - `/dashboard/copyright-analytics`
  - `/dashboard/copyright-royalty-summary`
  - `/dashboard/composer-royalties`
- Tabel utama yang sudah ada:
  - `composer_royalties`
  - `profiles.composer_code`
- Upload royalti composer saat ini memakai CSV dengan kolom:
  - `composer_id`
  - `composer_name`
  - `total_net_royalti`
  - `period`
- `composer_id` saat ini secara praktik dipakai sebagai composer code/text, bukan FK ke user Supabase.
- Dashboard copyright saat ini masih ada pola query semua data lalu filter client-side berdasarkan nama/code.
- RLS lama pernah memakai `composer_id = auth.uid()::text`, yang tidak selaras dengan `composer_code`.

## Target Sistem Baru

### 1. Halaman Informasi Layanan

Tujuan: user memahami layanan Perlindungan/Pengelolaan Hak Cipta sebelum mendaftar.

Konten utama:
- Penjelasan layanan Hak Cipta/Publishing Soundpub.
- Hak yang dikelola: hak ekonomi atas lagu, lirik, musik/komposisi.
- Sifat pengelolaan: eksklusif.
- Wilayah: seluruh dunia.
- Jangka waktu: 3 tahun, dapat diperpanjang otomatis.
- Ringkasan royalti publishing:
  - Mechanical Reproduction: 70% Komposer / 30% Publisher.
  - Synchronization: 70% Komposer / 30% Publisher.
  - Kategori lain: 50% Komposer / 50% Publisher.
- Syarat dokumen: KTP, kontak, alamat, data rekening, NPWP opsional, data karya, bukti karya opsional.
- CTA: `Mulai Pendaftaran`.

### 2. Registrasi Hak Cipta Bertahap

Tahap form:
1. Data Pemohon
2. Data Pajak dan Pembayaran
3. Data Karya/Lagu
4. Hak, Wilayah, dan Durasi
5. Royalti dan Pernyataan
6. Review dan Submit

Output:
- Submission masuk sebagai `draft` atau `submitted`.
- Admin bisa review, request revision, approve, atau reject.
- Setelah approve, sistem assign/generate `composer_code`.
- User mendapat role/akses `copyright` setelah approval.

### 3. Data Pemohon

Field minimum:
- Nama lengkap sesuai KTP.
- Nama panggung/alias, opsional.
- Email.
- Nomor WhatsApp/telepon.
- NIK/KTP.
- Upload KTP.
- Alamat lengkap.
- Bertindak sebagai:
  - pribadi
  - kuasa grup/band
  - perusahaan/label
- Jika kuasa: upload surat kuasa/persetujuan.

### 4. Data Pajak dan Pembayaran

Field minimum:
- NPWP, opsional/direkomendasikan.
- Upload NPWP, opsional.
- Nama bank.
- Nomor rekening.
- Nama pemilik rekening.
- Pernyataan rekening benar milik pemohon/kuasa.

### 5. Data Karya/Lagu

Repeatable per karya:
- Judul lagu.
- Alternatif judul, opsional.
- Composer/pencipta.
- Lyricist/penulis lirik.
- Persentase kepemilikan.
- Solo atau kolaborasi.
- Data co-writer jika kolaborasi.
- Status rilis.
- Tanggal rilis, opsional.
- ISRC/UPC, opsional.
- Link DSP/YouTube, opsional.
- Lirik.
- Upload audio demo/master, opsional.
- Upload bukti karya, opsional.

### 6. Kontrak dan Dokumen

Acuan kontrak:
- Publisher: PT UTERO KREATIF INDONESIA (SOUNDPUB).
- Komposer: data pemohon dari form.
- Nomor kontrak: generate otomatis.
- Isi pokok mengacu ke draft kontrak DOCX.
- Lampiran memuat data kontak komposer dan daftar karya.

Opsi implementasi:
- Fase awal: generate preview HTML/PDF ringkasan kontrak.
- Fase lanjut: generate DOCX/PDF dari template.
- Fase lanjut: e-signature atau upload kontrak bertanda tangan.

### 7. Admin Review

Fitur admin:
- List pendaftaran Hak Cipta.
- Filter status.
- Detail submission.
- Review data pemohon, karya, dan dokumen.
- Request revision dengan catatan.
- Approve/reject.
- Generate/assign `composer_code`.
- Generate nomor kontrak.
- Upload/generate kontrak final.

Status workflow:
- `draft`
- `submitted`
- `in_review`
- `revision_requested`
- `approved`
- `rejected`
- `contract_generated`
- `contract_signed`
- `active`

### 8. User Dashboard Hak Cipta

Setelah aktif:
- User bisa melihat ringkasan royalti Hak Cipta.
- User bisa melihat periode royalti.
- User bisa melihat daftar karya terdaftar.
- User bisa request payout jika saldo tersedia.
- Data harus dibatasi ke `composer_code` milik user.

### 9. Upload Royalti Hak Cipta

Target format CSV baru/standar:
- `composer_code`
- `composer_name`
- `work_title` opsional
- `royalty_type` opsional
- `gross_amount` opsional
- `composer_share_amount` atau `total_net_royalti`
- `period`
- `source` opsional
- `notes` opsional

Keputusan awal:
- Untuk kompatibilitas, kolom lama `composer_id` bisa diterima sebagai alias `composer_code`.
- Matching utama wajib `composer_code`.
- Matching by name hanya fallback sementara dan sebaiknya diberi warning.

### 10. Database Rancangan

Tabel baru yang disarankan:

#### `copyright_registrations`
- `id`
- `user_id`
- `status`
- `legal_name`
- `stage_name`
- `nik`
- `address_json`
- `phone`
- `email`
- `npwp`
- `bank_name`
- `bank_account_number`
- `bank_account_name`
- `applicant_type`
- `composer_code`
- `contract_number`
- `submitted_at`
- `reviewed_at`
- `approved_at`
- `created_at`
- `updated_at`

#### `copyright_registration_works`
- `id`
- `registration_id`
- `title`
- `alternate_title`
- `composer_name`
- `lyricist_name`
- `ownership_percentage`
- `is_collaboration`
- `cowriters_json`
- `release_status`
- `release_date`
- `isrc`
- `upc`
- `links_json`
- `lyrics`
- `notes`
- `created_at`

#### `copyright_registration_files`
- `id`
- `registration_id`
- `work_id`
- `file_type`
- `file_url`
- `uploaded_at`

#### `copyright_contracts`
- `id`
- `registration_id`
- `contract_number`
- `template_version`
- `generated_doc_url`
- `generated_pdf_url`
- `signed_doc_url`
- `status`
- `created_at`
- `updated_at`

### 11. RPC/RLS yang Disarankan

RPC:
- `get_my_composer_royalties()`
- `get_copyright_registration_detail(registration_id)`
- `admin_review_copyright_registration(...)`
- `generate_composer_code(...)`

RLS prinsip:
- User hanya melihat registration miliknya.
- Admin/superadmin bisa manage semua registration.
- Copyright user hanya melihat royalti yang `composer_code` cocok dengan `profiles.composer_code` miliknya.
- Upload/manage royalti hanya admin/superadmin.

### 12. Dokumentasi yang Perlu Diupdate

- `docs/API-DOCS.md`
- `docs/PROJECT_DEVELOPMENT_LOG.md`
- `docs/MIGRATION-GUIDE.md`
- Dokumen baru ini: `docs/services/copyright-publishing/FEATURE_PLAN.md`

## Pertanyaan Produk yang Masih Terbuka

- Pendaftaran publik dibuka untuk semua user atau hanya user login?
- Apakah user baru otomatis dibuat saat submit pendaftaran, atau harus signup dulu?
- Apakah kontrak wajib ditandatangani digital di app, atau cukup upload file signed?
- Apakah daftar karya bisa ditambah setelah kontrak aktif?
- Apakah satu akun copyright boleh punya banyak composer_code?
- Apakah royalti Hak Cipta akan punya payout terpisah dari balance musik DSP?

## Addendum — E-Meterai, Preview Kontrak, dan Biaya Registrasi

Update: 2026-07-16

### Tujuan

Menambahkan rancangan alur legalisasi kontrak dan pembayaran registrasi untuk fitur Hak Cipta/Publishing.

### Alur Baru Registrasi

1. User membuka halaman informasi layanan Hak Cipta/Publishing.
2. User mengisi form registrasi bertahap.
3. User bisa `Simpan Draft` kapan saja sebelum submit.
4. Jika user memilih lanjut/submit final, sistem menampilkan ringkasan data dan kontrak preview.
5. User wajib membayar biaya registrasi sebesar `Rp100.000`.
6. Setelah pembayaran berhasil, status berubah menjadi `submitted` atau `paid_pending_review`.
7. Admin melakukan review.
8. Setelah approve, sistem generate kontrak final.
9. Kontrak bisa dibubuhi e-Meterai dan/atau ditandatangani sesuai integrasi yang dipilih.
10. Setelah kontrak signed, user diaktifkan sebagai role `copyright` dan mendapat `composer_code`.

### Model Biaya Registrasi

Biaya yang dibebankan ke user:
- Biaya registrasi: `Rp100.000`.
- Biaya ini dapat dipakai untuk menutup operasional review, generate dokumen, dan/atau sebagian biaya e-Meterai.

Catatan biaya eksternal:
- Harga e-Meterai resmi umumnya berada di sekitar `Rp10.000` per keping melalui platform seperti Mekari Sign.
- Beberapa penyedia/API reseller menampilkan harga sekitar `Rp12.000` per e-Meterai.
- Jika memakai payment gateway, perlu memperhitungkan fee gateway di luar Rp100.000 atau dimasukkan ke margin.

Rekomendasi awal:
- User tetap membayar flat `Rp100.000`.
- Internal cost dicatat terpisah:
  - e-Meterai: estimasi Rp10.000–Rp12.000.
  - payment gateway fee: sesuai provider.
  - biaya dokumen/review: margin operasional.

### Preview dan Download Kontrak

Fitur yang disarankan:
- Setelah form lengkap, sistem membuat preview kontrak berbasis HTML.
- Preview memuat data dari form:
  - data komposer
  - alamat
  - kontak
  - rekening/NPWP
  - daftar karya/lampiran
  - skema royalti
  - jangka waktu
- User bisa download `Draft Kontrak PDF` sebelum pembayaran atau sebelum tanda tangan.
- Watermark/status PDF:
  - `DRAFT - BELUM DITANDATANGANI`
  - `MENUNGGU REVIEW`
  - `FINAL/SIGNED`

Implementasi teknis awal:
- Generate HTML contract preview di frontend/backend.
- Generate PDF via server-side function/edge function agar hasil konsisten.
- Simpan PDF ke storage dan catat di `copyright_contracts.generated_pdf_url`.

### Rancangan E-Meterai

#### Opsi 1 — Manual/Semi Manual Fase Awal

Flow:
- Sistem generate PDF kontrak.
- Admin download PDF.
- Admin bubuhkan e-Meterai via portal resmi/provider.
- Admin upload kembali kontrak bermeterai/signed.

Kelebihan:
- Paling cepat dikembangkan.
- Tidak perlu kontrak API di awal.
- Cocok untuk volume pendaftaran kecil.

Kekurangan:
- Tidak full otomatis.
- Admin perlu kerja manual.
- Tracking stamping tidak realtime.

Rekomendasi: gunakan sebagai MVP.

#### Opsi 2 — Integrasi API E-Meterai

Flow:
- Sistem generate PDF final.
- Sistem mengirim PDF ke provider e-Meterai API.
- Provider membubuhkan e-Meterai di koordinat tertentu.
- Sistem menerima PDF bermeterai.
- Sistem menyimpan stamp transaction id dan final PDF.

Data yang perlu disimpan:
- `provider`
- `stamp_transaction_id`
- `stamp_status`
- `stamp_cost`
- `meterai_serial_number` jika tersedia
- `stamped_pdf_url`
- `stamped_at`

Kelebihan:
- Otomatis dan scalable.
- Audit trail lebih rapi.

Kekurangan:
- Biasanya perlu PKS/onboarding provider.
- Tidak selalu ada pricing API publik.
- Perlu handling error/stok meterai.

### Rekomendasi Provider

#### Mekari Sign

Keterangan:
- Menyediakan e-Meterai dan Open API untuk integrasi tanda tangan/e-Meterai.
- Halaman harga menampilkan kuota e-Meterai `Rp10.000 / keping`.
- Help center menyebut minimal pembelian 3 e-Meterai.

Rekomendasi:
- Pilihan paling aman untuk bisnis karena brand kuat dan dokumentasi produk cukup jelas.
- Cocok jika nanti butuh e-signature + e-Meterai dalam satu ekosistem.
- Perlu cek langsung biaya Open API dan minimum plan saat onboarding.

#### Privy

Keterangan:
- Menyediakan e-Meterai, tanda tangan digital, bulk sign, dan enterprise/API suite.
- Pricing publik lebih menonjolkan subscription; detail biaya API/e-Meterai enterprise perlu konfirmasi sales.

Rekomendasi:
- Bagus jika ingin ekosistem identitas digital dan tanda tangan tersertifikasi.
- Kemungkinan biaya dan onboarding lebih enterprise dibanding kebutuhan MVP.

#### Peruri / PDS / Distributor Resmi

Keterangan:
- Peruri/PDS adalah jalur resmi ekosistem e-Meterai.
- Peruri menekankan penggunaan distributor resmi.
- PDS menampilkan e-Meterai dengan integrasi realtime/API untuk bisnis.

Rekomendasi:
- Cocok untuk integrasi resmi jangka panjang.
- Perlu kontak sales/kemitraan; biasanya tidak secepat implementasi MVP.

#### EZMeterai / Provider API Reseller

Keterangan:
- Menawarkan API e-Meterai dan menyebut harga sekitar `Rp12.000` per e-Meterai.
- Mengklaim sebagai mitra resmi Peruri Digital Security.

Rekomendasi:
- Menarik untuk opsi API murah/cepat jika dokumen legal dan SLA cocok.
- Wajib verifikasi legalitas, SLA, dokumentasi API, dan contoh kontrak kerja sama sebelum dipakai production.

### Rekomendasi Final Fase Awal

- MVP: pakai manual/semi-manual e-Meterai dulu.
- Tetap desain database/provider abstraction supaya mudah upgrade ke API.
- Integrasi API dipilih setelah volume pendaftaran stabil.
- Prioritas API murah untuk dicek pertama: Mekari Sign dan EZMeterai.
- Prioritas API enterprise/resmi jangka panjang: PDS/Peruri dan Privy.

### Database Tambahan yang Disarankan

#### `copyright_registration_payments`
- `id`
- `registration_id`
- `user_id`
- `amount` default `100000`
- `currency` default `IDR`
- `payment_provider`
- `payment_reference`
- `payment_status`
- `paid_at`
- `created_at`
- `updated_at`

#### Tambahan kolom `copyright_contracts`
- `draft_pdf_url`
- `preview_html_url` opsional
- `stamped_pdf_url`
- `stamp_provider`
- `stamp_transaction_id`
- `stamp_status`
- `stamp_cost`
- `stamped_at`

### Status Baru yang Disarankan

Tambahan status workflow:
- `draft`
- `awaiting_payment`
- `paid_pending_review`
- `in_review`
- `revision_requested`
- `approved`
- `contract_generated`
- `stamping_pending`
- `stamped`
- `contract_signed`
- `active`
- `rejected`

### Pertanyaan Keputusan

- Apakah biaya Rp100.000 sudah termasuk e-Meterai, atau e-Meterai bisa dibebankan terpisah jika dibutuhkan lebih dari 1 keping?
- Apakah user boleh download draft PDF sebelum membayar?
- Apakah kontrak perlu e-Meterai sebelum user tanda tangan, atau setelah admin approve?
- Apakah satu kontrak butuh 1 e-Meterai atau 2 e-Meterai untuk kedua pihak?
- Apakah payment gateway yang dipakai akan sama dengan sistem pembayaran existing?

## Keputusan Produk Terkunci — 2026-07-17

- Pendaftaran Hak Cipta MVP wajib login dulu.
- User bisa menyimpan pendaftaran sebagai draft.
- Draft kontrak PDF boleh didownload sebelum pembayaran dengan watermark `DRAFT - BELUM DIBAYAR / BELUM DITANDATANGANI`.
- Submit final membutuhkan pembayaran registrasi `Rp100.000`.
- Biaya `Rp100.000` sudah termasuk `1 e-Meterai` untuk MVP.
- MVP e-Meterai memakai proses manual/semi-manual oleh admin; integrasi API tetap disiapkan melalui abstraksi database/provider.
- Setelah pembayaran berhasil, status menjadi `paid_pending_review`.
- Setelah admin approve dan kontrak aktif, user mendapat role `copyright` dan `composer_code`.
- Fase awal memakai model `1 akun = 1 composer_code`.
- Payout Hak Cipta dipisah secara logical dari payout royalti DSP.


## Update 2026-07-17 — Nomor Surat Kontrak

- Struktur nomor surat kontrak sekarang disimpan per komponen dan utuh.
- Format target: `P00009/Soundpub/XII/PBLSR/2024`.
- Nomor urut reset setiap bulan.
