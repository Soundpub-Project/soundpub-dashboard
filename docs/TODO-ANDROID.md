# TODO Pengerjaan Soundpub Android

Tanggal: 13 September 2026.  
Branch: `codex/android-app`.  
Referensi: [Rancangan Android](./rancangan-aplikasi-android.md).

Checklist hanya ditandai selesai setelah hasil diverifikasi. Urutan fase menunjukkan dependensi, bukan estimasi waktu. Lingkup awal: aplikasi pendamping artis/label, bukan streaming publik. Implementasi Android belum dimulai.

## 0. Perencanaan

- [x] Tinjau fitur dan navigasi dashboard sebagai dasar rancangan.
- [x] Susun rancangan layar, arsitektur Expo, dan tahapan implementasi.
- [x] Susun checklist pekerjaan Android.
- [ ] Tetapkan scope MVP: baca data dahulu, lalu rilis dan transaksi.
- [ ] Tetapkan fitur admin yang tetap web-only: impor royalti massal, export besar, infrastruktur.
- [ ] Finalisasi matriks capability seluruh role, termasuk `user`, `copyright`, dan whitelabel.
- [ ] Audit kontrak API, schema `Soundpub`, RLS, Storage, dan validasi server yang akan dipakai.
- [ ] Putuskan application ID Android, nama aplikasi, ikon, dan pemilik signing key.

## 1. Fondasi Expo

Dependensi: keputusan scope dan audit kontrak fase 0.

- [ ] Verifikasi versi Expo SDK, React Native, Node, dan kompatibilitas paket saat scaffold.
- [ ] Buat proyek terpisah di `apps/mobile`; pertahankan build Vite web.
- [ ] Tetapkan package manager dan lockfile tanpa konflik workspace saat ini.
- [ ] Setup TypeScript, alias import, lint, typecheck, dan test runner.
- [ ] Setup Expo Router, root layout, auth stack, dan lima tab utama.
- [ ] Tambahkan konfigurasi contoh tanpa secret dan dokumentasi menjalankan aplikasi.
- [ ] Terapkan tokens oranye Soundpub, font, spacing, tema terang/gelap/sistem.
- [ ] Buat komponen kartu metrik, kartu rilis, status chip, input, loading/error/empty state.
- [ ] Uji UI dasar lewat Expo Go pada perangkat Android.

Selesai jika: aplikasi membuka semua tab, tema bekerja, lint/typecheck lulus, build web tidak terdampak.

## 2. Auth dan Otorisasi

Dependensi: fase 1 dan audit akses backend.

- [ ] Konfigurasi client Supabase self-hosted, HTTPS, schema, dan key klien yang sesuai.
- [ ] Pilih storage sesi native aman; uji ukuran payload dan lifecycle refresh.
- [ ] Implementasikan login, logout, pemulihan sesi, dan refresh saat foreground.
- [ ] Implementasikan verifikasi email serta reset password dengan callback tervalidasi.
- [ ] Implementasikan completion gate profil bila diwajibkan aturan web.
- [ ] Terapkan capability/route guard; otorisasi tetap diperiksa server.
- [ ] Pisahkan cache berdasarkan akun dan bersihkan saat logout/pergantian akun.
- [ ] Uji session expired, callback invalid, role berubah, dan akses lintas akun.

Selesai jika: sesi pulih dengan benar dan akun tidak dapat membaca data akun lain.

## 3. MVP Baca Data

Dependensi: fase 2.

- [ ] Setup query keys, pagination, retry terbatas, dan invalidation.
- [ ] Bangun Beranda: saldo, statistik per role, aktivitas, dan CTA.
- [ ] Bangun daftar Rilis/Lagu: pencarian, filter, pagination, pull-to-refresh.
- [ ] Bangun detail rilis/lagu dengan metadata dan status backend aktual.
- [ ] Bangun analitik dan ringkasan royalti dengan filter periode serta ringkasan teks grafik.
- [ ] Bangun Keuangan: saldo tersedia, royalti, riwayat payout.
- [ ] Bangun profil dan preferensi tema.
- [ ] Gunakan label data contoh pada prototype; hapus mock dari jalur produksi.
- [ ] Terapkan state kosong, gagal, loading, offline, serta waktu pembaruan cache.

Selesai jika: angka dan katalog cocok dengan kontrak web untuk akun uji setiap role.

## 4. Payout dan Pembayaran

Dependensi: fase 3; pastikan kontrak saldo dan mutasi telah diaudit.

- [ ] Ambil minimum payout dari `app_settings`, bukan konstanta lokal.
- [ ] Gunakan saldo per role yang benar termasuk `get_dashboard_role_stats`.
- [ ] Buat form rekening, nominal, validasi, dan halaman konfirmasi.
- [ ] Integrasikan `request_payout`; refresh saldo/riwayat setelah sukses.
- [ ] Verifikasi idempotensi server; tangani tap ganda dan timeout tanpa pengajuan ganda.
- [ ] Nonaktifkan pengajuan offline dan jangan antrekan transaksi keuangan lokal.
- [ ] Pisahkan flow pembayaran biaya rilis dari flow penarikan royalti.
- [ ] Buka invoice melalui browser dan validasi callback; status final harus dari server.
- [ ] Uji saldo kurang, minimum berubah, sesi habis, invoice batal, dan respons terlambat.

Selesai jika: transaksi tidak dinyatakan berhasil sebelum konfirmasi server dan retry aman.

## 5. Wizard Rilis dan Aset

Dependensi: fase 3; pembayaran biaya rilis memerlukan fase 4 bila berlaku.

- [ ] Petakan field wajib, enum status, biaya, dan izin edit dari flow web aktual.
- [ ] Bangun langkah dasar, cover/lagu, kredit/distribusi, dan tinjauan.
- [ ] Integrasikan picker Android dan salin aset ke direktori privat aplikasi.
- [ ] Validasi format, ukuran, dimensi cover, dan audio sesuai aturan backend.
- [ ] Implementasikan progres unggah per file, retry, pembatalan, dan cleanup aset gagal.
- [ ] Verifikasi dukungan resumable sebelum menjanjikan unggahan lanjut otomatis.
- [ ] Simpan draft lokal terikat akun; tangani konflik saat sinkronisasi.
- [ ] Uji proses mati/background, URI hilang, jaringan putus, dan storage perangkat penuh.
- [ ] Integrasikan simpan draft, kirim, edit, dan aktivasi sesuai state server.

Selesai jika: draft dapat dipulihkan dan rilis valid terkirim tanpa duplikasi atau aset yatim.

## 6. Fitur Lanjutan

Dependensi: MVP stabil; prioritas dikunci berdasarkan kebutuhan produk.

- [ ] Notification center: unread count, mark-as-read, deep link sesuai izin akun.
- [ ] Putuskan provider push; buat registrasi/pencabutan token dan pengiriman server.
- [ ] Uji push pada development build/perangkat nyata sesuai dukungan SDK.
- [ ] Manajemen artis/tim dengan pembatasan relasi label.
- [ ] Registrasi, dokumen, status, dan analitik hak cipta.
- [ ] Takedown beserta konfirmasi dan role guard sesuai web.
- [ ] Tinjauan admin hanya untuk aksi yang disepakati masuk mobile.

## 7. QA, Keamanan, dan Distribusi

- [ ] Tambahkan unit test formatter, validasi, capability, dan query key.
- [ ] Tambahkan integration test auth, katalog, payout, dan wizard.
- [ ] Uji akses lintas artis/label dan ID objek melalui deep link.
- [ ] Uji TalkBack, font besar, target sentuh 48dp, kontras, dan reduced motion.
- [ ] Uji safe area, keyboard, tombol Back, rotasi, dan layar kecil/besar.
- [ ] Uji koneksi lambat/offline, sesi habis, retry, dan pergantian akun.
- [ ] Audit bundle/log agar tidak memuat secret, token, atau data rekening lengkap.
- [ ] Tambahkan crash reporting dengan redaksi data sensitif.
- [ ] Setup CI mobile serta verifikasi regresi build web.
- [ ] Siapkan development/preview build dan uji APK internal.
- [ ] Siapkan signing, AAB, metadata store, privacy policy, dan deklarasi data sesuai fitur final.
- [ ] Lakukan internal testing, perbaiki blocker, dan tetapkan checklist rilis/rollback.

## Aturan Backend dan Git

- Jangan commit perubahan lokal yang tidak terkait Android.
- Jangan simpan credential SSH, service-role key, atau Spotify secret dalam source mobile.
- Jangan mengubah produksi hanya untuk prototype; gunakan data/akun uji terisolasi.
- Bila Edge Function berubah: inspeksi volume Compose lewat SSH, unggah source terkait via scp, reload dari direktori Docker proyek, lalu verifikasi endpoint/log. Jangan gunakan deploy Supabase Cloud.
- Catat hasil pengujian dan keterbatasan sebelum mencentang pekerjaan selesai.
