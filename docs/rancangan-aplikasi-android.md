# Rancangan Android — Soundpub

Status: rancangan produk dan teknis. Target awal: Android phone.  
Stack: Expo + Expo Router + TypeScript + `@supabase/supabase-js`.

## 1. Arah Produk

Soundpub Android menjadi aplikasi kerja pendamping artis, label, whitelabel, admin, dan pengelola hak cipta. Fokus utama:

- memantau katalog, royalti, saldo, dan status rilis;
- membuat rilis dan mengunggah aset dari perangkat;
- mengelola artis, payout, takedown, dan registrasi hak cipta;
- menerima notifikasi perubahan status dan tindakan yang dibutuhkan.

MVP bukan aplikasi streaming publik. Katalog publik tetap memakai web sampai kebutuhan playback resmi ditetapkan.

## 2. Role dan Navigasi

| Role | Fokus |
| --- | --- |
| Artis | Rilis sendiri, lagu, analitik, royalti, payout |
| Label / Whitelabel | Katalog lintas artis, saldo gabungan, payout, tim |
| Admin / Superadmin | Operasional, royalti, payout, pengguna |
| Copyright | Registrasi dan analitik hak cipta |

Gunakan bottom tab maksimal lima item:

| Tab | Isi |
| --- | --- |
| Beranda | Ringkasan, tindakan cepat, aktivitas |
| Katalog | Rilis, lagu, pencarian, filter |
| Buat | Rilis baru atau registrasi hak cipta |
| Keuangan | Royalti, saldo, payout |
| Akun | Profil, artis/tim, notifikasi, setelan |

Menu berubah sesuai role. Menu admin yang jarang dipakai berada di `Akun > Admin`, bukan bottom tab. Stack per tab menjaga tombol Back Android konsisten.

```text
app/
  _layout.tsx
  (auth)/
    sign-in.tsx
    forgot-password.tsx
    reset-password.tsx
    verify-email.tsx
  (app)/
    _layout.tsx
    (tabs)/
      _layout.tsx
      index.tsx
      catalog.tsx
      create.tsx
      finance.tsx
      account.tsx
    releases/[id].tsx
    releases/[id]/edit.tsx
    releases/new.tsx
    tracks/[id].tsx
    payouts/new.tsx
    copyright/register.tsx
    analytics/index.tsx
    takedowns/index.tsx
    notifications.tsx
```

## 3. Layar Inti

### Beranda

- Header: sapaan, avatar, tombol notifikasi.
- Kartu saldo dominan dengan CTA `Lihat Keuangan`.
- Metrik: total rilis, lagu aktif, royalti periode berjalan, tren.
- CTA utama `Buat Rilis`.
- Status kerja: draft, menunggu verifikasi, aktif, perlu tindakan.
- Grafik royalti enam bulan dan aktivitas terakhir.
- Label melihat artis atau rilis yang perlu ditinjau.

### Katalog

Segmented control `Rilis | Lagu`, search selalu terlihat, serta filter bottom sheet untuk status, artis, genre, tanggal, dan explicit. Kartu rilis memuat cover 64dp, judul, artis, tanggal, status, jumlah lagu, dan overflow menu. Detail memuat metadata distribusi, daftar lagu, status kanal, serta aksi `Edit`, `Aktifkan`, atau `Ajukan Takedown` sesuai role dan status.

### Buat Rilis

Gunakan wizard, bukan formulir panjang:

1. **Dasar** — jenis, judul, artis utama, tanggal, genre, explicit.
2. **Cover dan lagu** — picker berkas, progres unggah, tambah/hapus/reorder.
3. **Kredit** — composer, lyricist, contributor, metadata distribusi.
4. **Tinjau** — validasi, biaya, persetujuan, kirim.

Draft tersimpan di SQLite. File kandidat tetap berupa URI lokal hingga unggah selesai. Tampilkan peringatan jika aplikasi ditutup saat unggahan berjalan.

### Keuangan

Bagian atas menampilkan saldo dan tombol `Tarik Dana`. Tab internal: `Royalti`, `Ringkasan`, `Payout`. Form payout memuat bank/e-wallet, nomor rekening, nama pemilik, nominal, validasi saldo, dan konfirmasi. Batas minimum memakai `app_settings.min_payout_amount`; pengajuan memakai RPC `request_payout`.

Pembayaran Xendit dibuka melalui `expo-web-browser`, bukan `window.open`.

### Hak Cipta

Daftar registrasi, status, CTA `Registrasi Baru`, metrik karya, royalti composer, dan dokumen. Gunakan `expo-document-picker` untuk dokumen serta progres unggah dan retry.

### Akun

Profil, role badge, tema `Sistem | Terang | Gelap`, artis/tim, preferensi notifikasi, bantuan, dan logout. Notification center mendukung unread count, mark-as-read, dan deep link ke objek terkait.

## 4. Wireframe Beranda

```text
+------------------------------------+
| Soundpub               Notifikasi  |
| Halo, Nama Artis                   |
|                                    |
| SALDO TERSEDIA                     |
| Rp --                              |
| [Lihat Keuangan]                   |
|                                    |
| Total Rilis       Lagu Aktif       |
| --                --               |
|                                    |
| [ + Buat Rilis Baru               ]|
|                                    |
| Perlu Tindakan                     |
| [Cover] Judul rilis                |
|         Metadata belum lengkap    |
|                                    |
| Royalti             [Periode]     |
| Grafik + ringkasan dalam teks      |
|                                    |
| Beranda Katalog Buat Keuangan Akun |
+------------------------------------+
```

Angka diisi data server; placeholder bukan klaim saldo. Scroll content diberi inset agar tidak tertutup tab bar atau gesture area Android.

## 5. Bahasa Visual

Pertahankan aksen oranye Soundpub dari `src/index.css`; tidak mengganti identitas menjadi aplikasi streaming hijau.

| Token | Rancangan |
| --- | --- |
| Brand | HSL `20 90% 48%`, dipertahankan sebagai aksen |
| Tombol utama | Oranye lebih gelap `#C2410C`, teks putih; verifikasi kontras saat implementasi |
| Latar terang | `#FAFAFA`, kartu putih, teks `#18181B` |
| Latar gelap | `#121214`, kartu `#202024`, teks `#FAFAFA` |
| Tipografi | DM Sans; system font sebagai fallback |
| Spacing | Grid 4dp, gutter 16dp, antarbagian 24dp |
| Radius | 12dp kartu, 20dp bottom sheet |
| Target sentuh | Minimum 48dp |

Gunakan ikon konsisten, bukan emoji. Status memuat teks, bukan warna saja. Body 16sp, font scaling, TalkBack, reduced motion, dan tema sistem masuk acceptance test. Grafik selalu dilengkapi ringkasan teks; jangan membuat nominal kecil sulit dibaca.

## 6. Arsitektur dan Batas Integrasi

Semua pilihan berikut merupakan usulan, belum kode Android yang berjalan. Versi SDK dan kecocokan paket harus diverifikasi saat scaffold; jangan menyalin versi web secara langsung.

| Area | Usulan |
| --- | --- |
| Workspace | `apps/mobile` terpisah dari Vite; tidak merombak dashboard |
| UI | React Native dengan Expo Router; komponen di luar direktori route |
| Data | TanStack Query, pagination, cache per akun, invalidation setelah mutasi |
| Form | React Hook Form dan Zod; aturan bisnis diselaraskan dengan server |
| Sesi | Storage sesi native yang aman; evaluasi SecureStore dan batas ukuran payload sebelum memilih adapter |
| Draft | SQLite untuk metadata; salin berkas ke direktori privat aplikasi agar URI tidak hilang |
| Media | DocumentPicker, ImagePicker, FileSystem; preview audio opsional dengan expo-audio |
| Pembayaran | Browser sistem, callback tervalidasi, refetch status invoice dari server |
| Push | Fase lanjutan; perlu registrasi perangkat dan pengiriman server, bukan fitur yang diasumsikan sudah tersedia |

Komponen web Radix/shadcn, CSS, `window`, dan `localStorage` tidak dipindahkan langsung. Yang berpotensi dibagi: tipe, formatter, schema validasi, dan util murni setelah audit dependensi DOM.

Pemetaan yang sudah terlihat di source:

- Rilis/lagu/profil memakai `tracks`, `profiles`, `user_roles`, dan kontrak rilis yang ada.
- Payout memakai `payout_requests`, `request_payout`, serta `get_dashboard_role_stats` untuk saldo label/whitelabel.
- Batas penarikan berasal dari `app_settings`, bukan angka tetap di aplikasi.
- Katalog publik tersedia melalui `get-catalog-tracks`; bukan prioritas MVP.
- Tipe database memiliki schema `Soundpub`; konfigurasi schema API harus mengikuti client web yang diverifikasi, bukan mengasumsikan `public`.

Role `user` tetap harus ditangani. Jangan memberi akses musik penuh otomatis: ikuti capability aktual dan kebutuhan penyelesaian profil. Role `copyright` tidak otomatis mendapat payout musik. Whitelabel tidak diberi takedown bila aturan web masih melarang. Buat matriks capability final dari route guard, aturan bisnis, dan RLS sebelum coding.

## 7. Keamanan dan Self-Hosted

Backend tetap Supabase self-hosted. Rancangan ini tidak mengubah database, policy, atau layanan server.

- Jangan simpan service-role key, Spotify client secret, SSH password, atau private key di aplikasi maupun repo. Konfigurasi klien hanya boleh berisi URL API dan publishable/anon key yang sesuai.
- Semua operasi sensitif harus diperiksa server-side. Penyembunyian menu bukan otorisasi.
- Gunakan HTTPS, RLS, pemeriksaan kepemilikan, dan URL media privat berumur terbatas. Audit policy sebelum membuka akses mobile.
- Bersihkan cache per akun ketika logout atau berpindah akun. Jangan log token, rekening lengkap, atau isi dokumen privat.
- Payout tidak diantrekan offline. Saat respons timeout, periksa riwayat server sebelum menawarkan kirim ulang; idempotensi server perlu diverifikasi.
- Pembayaran selesai hanya setelah status server terkonfirmasi, bukan berdasarkan deep link dari browser.
- Bila Edge Function berubah, ikuti prosedur repo: inspeksi Compose lewat SSH, unggah hanya source terkait via scp, reload dari direktori Docker, lalu verifikasi. Jangan deploy lewat Supabase Cloud.

## 8. State dan Perilaku

| Kondisi | Perilaku |
| --- | --- |
| Loading awal | Skeleton dengan struktur sama seperti konten |
| Tidak ada rilis | Penjelasan singkat dan CTA buat rilis jika berhak |
| Offline | Banner, data cache bertanggal, transaksi dinonaktifkan |
| Session habis | Login kembali; draft tidak hilang dan tetap terikat akun |
| Upload gagal | Error per berkas, retry; jangan mengklaim sukses sebelum server mengonfirmasi |
| App ke background | Simpan draft; unggahan background/resumable belum dijanjikan sampai terbukti didukung |
| Server gagal | Pesan aman dan tombol coba lagi; tidak menampilkan detail rahasia |

## 9. Tahap Pengerjaan

1. **Fondasi dan prototype:** scaffold Expo, theme tokens, lima tab, data contoh berlabel, dan uji Expo Go untuk UI dasar.
2. **MVP baca:** login, verifikasi email, profil, katalog/detail, royalti, saldo, dan role-aware navigation.
3. **Transaksi:** payout dengan konfirmasi, wizard rilis, validasi aset, draft, pembayaran dan callback.
4. **Fitur lanjutan:** hak cipta, takedown, tim/artis, push dan kebutuhan admin. Push/native integration diuji dengan development build bila diperlukan.
5. **QA Android:** perangkat kecil/besar, font besar, TalkBack, back navigation, koneksi lambat, token refresh, isolasi akun, APK internal lalu AAB distribusi.

Impor royalti massal, export besar, pengaturan secret, dan administrasi infrastruktur tetap di web untuk MVP. Tidak ada estimasi durasi sebelum scope serta kontrak backend dikunci.

## 10. Acceptance Criteria

- Semua layar memiliki loading, empty, error, dan akses ditolak yang jelas.
- Data artis A tidak bisa diakses artis B, termasuk melalui ID URL/deep link.
- Label hanya melihat artis dan katalog yang berhak diakses.
- Payout memakai saldo dan minimum server; tap ganda/timeout tidak membuat pengajuan tak sengaja.
- Form mempertahankan draft, menunjukkan error per field, dan memakai aturan file backend yang diverifikasi.
- Tidak ada secret backend di bundle aplikasi.
- UI terbaca pada font besar dan kedua tema, tanpa kontrol tertutup keyboard/system bar.

## 11. Dasar Pemeriksaan Repo

Rancangan bersumber dari `src/App.tsx`, `src/components/layout/AppSidebar.tsx`, `src/pages/Payouts.tsx`, `src/components/releases/ReleaseFormPage.tsx`, `src/hooks/useAuth.tsx`, `src/index.css`, dan `package.json`. Daftar fitur di dokumen merupakan adaptasi dan usulan mobile, bukan pernyataan bahwa semua fitur sudah tersedia di Android.
