# SoundPub Dashboard Development Log

Dokumentasi ini merangkum pengembangan yang sudah diterapkan di branch ini supaya mudah ditinjau, di-deploy, dan di-audit.

## Fokus Utama

- Migrasi dan penyesuaian ke schema `soundpub`.
- Stabilitas upload royalty, rebuild balance, dan managed artist.
- Perbaikan dashboard role revenue agar tidak kena limit REST.
- Artist profile UI dan summary royalti yang lebih lengkap.
- Media library, orphan scan, dan repair aman untuk data relasi.
- Alur pindah label artist dengan histori royalty tetap di label lama.

## Fitur Yang Sudah Ditambahkan

### Royalty Upload

- Upload royalty sudah mendukung replace mode aman.
- Default replace menggunakan `originalFilename + period`.
- Manual replace by `period` tersedia untuk revisi file.
- Managed artist dummy dibuat otomatis jika artist belum ditemukan.
- Balance profile di-rebuild setelah upload agar tidak double count.

### Dashboard dan Royalty Summary

- Dashboard role stats memakai RPC agar tidak kena batas hasil REST.
- Ringkasan royalti per role sudah disesuaikan dengan data `soundpub.royalties`.

### Artist Profile

- Artist profile menampilkan ringkasan royalti, saldo, top track, dan rilis terbaru.
- UI menampilkan data label dan artist secara lebih jelas.
- RLS dan kolom tambahan sudah disiapkan untuk profile image dan data pendukung.

### Users dan Audit

- Halaman `/dashboard/users/orphan-audit` menampilkan semua hasil audit orphan user.
- Hasil audit bisa di-copy sebagai Markdown atau JSON, atau di-export CSV.
- Repair aman tersedia untuk kasus tertentu tanpa memindahkan histori royalty lama.

### Label Transfer Aman

- Pindah label artist memakai edge function khusus.
- Histori royalty dan release lama tetap di label lama.
- Konfirmasi ketat memakai phrase `PINDAH LABEL`.
- Audit log mencatat perpindahan label.

### Media Library

- Listing storage dibuat recursive.
- Signed URL error ditangani lebih aman.
- Orphan file scan tetap bisa dipakai untuk bucket media.

## File SQL Penting

- `docs/soundpub-local-migration/28-dashboard-role-stats-rpc.sql`
- `docs/soundpub-local-migration/31-artist-profile-summary-rpc.sql`
- `docs/soundpub-local-migration/32-scan-orphan-artist-links-rpc.sql`
- `docs/soundpub-local-migration/34-artist-label-transfer-policy.sql`
- `docs/soundpub-local-migration/35-artist-deletion-requests-table.sql`
- `docs/soundpub-local-migration/36-repair-orphan-artist-links-rpc.sql`

## Edge Function Penting

- `supabase/functions/process-royalty-upload/index.ts`
- `supabase/functions/delete-royalty-upload/index.ts`
- `supabase/functions/transfer-artist-label/index.ts`
- `supabase/functions/remove-artist-from-label/index.ts`

## Catatan Operasional

- Histori royalty lama tidak dipindahkan saat artist pindah label.
- Repair orphan user hanya untuk relasi yang aman dan jelas.
- Aksi sensitif sebaiknya tetap diberi konfirmasi berlapis sebelum dipercepat ke model 2FA.

## Update 2026-07-16 — Royalty Split dan Release Create Wizard

### Royalty Split 70/21/9

- Sistem share royalti distandarisasi menjadi `70% Artist Share`, `21% Label Share`, dan `9% Admin/Platform Share`.
- Edge function `process-royalty-upload` sudah memakai split flat untuk semua label, termasuk Soundpub.
- UI `/dashboard/royalty-summary` sudah disamakan keterangannya pada tab Per Label, Per Artis, dan Per Lagu.
- Badge lama `70/30` pada ringkasan per lagu sudah dihapus agar tidak misleading.
- Dokumentasi API royalty upload sudah mencantumkan migration summary RPC `20260316171710_376bc60b-ff6e-4231-9c84-54e889b1a4f8.sql`.

### Tambah Release Page Flow

- Flow `Tambah Release` tidak lagi membuka popup untuk create release.
- Tombol `Tambah Release` sekarang menuju page baru `/dashboard/releases/new`.
- Page create release memakai layout wizard dua tahap:
  1. `Detail & Sampul`
  2. `Daftar Lagu`
- Layout page memakai dua kolom desktop:
  - kiri: `Langkah Rilis`
  - kanan: form input aktif
- Role rules existing tetap dipertahankan:
  - Admin bisa pilih label.
  - Label/whitelabel memakai artist milik label.
  - Artist wajib onboarding/profile lengkap dulu.
- Step 2 sudah memiliki summary card release, header daftar lagu, row track bergaya tabel, badge status audio/clip, dan collapse/expand detail track.
- Edit release existing masih memakai dialog lama untuk menjaga stabilitas; perubahan ini fokus ke create flow.

### Catatan Error dan Keputusan Sementara

- Field `Bahasa` sempat ditambahkan ke form, tetapi tidak dikirim ke Supabase karena production schema cache belum mengenali kolom `releases.language`.
- Untuk sementara field `language` tidak dipersist agar save release tidak gagal dengan error `PGRST204`.
- Jika field Bahasa ingin disimpan permanen, perlu migration production untuk `releases.language` dan refresh/restart PostgREST schema cache.

### Status Terakhir

- Build terakhir `npm run build` berhasil.
- Warning Vite terkait bundle size masih muncul, tetapi bukan blocker.
- Fokus berikutnya adalah audit dan perbaikan responsive UI/UX semua device.

## Rencana Lanjut — Responsive UI/UX Audit

### Prioritas 1: Layout Global

- Audit dan perbaiki `DashboardLayout` untuk mobile.
- Pastikan sidebar mobile nyaman, tidak membuat konten sempit, dan trigger mudah disentuh.
- Perbaiki header mobile agar action penting tetap terlihat tanpa memenuhi layar.

### Prioritas 2: Tabel dan Data Pages

- Audit halaman dengan tabel lebar seperti releases, royalties, payouts, users, dan analytics.
- Tambahkan pola mobile-friendly:
  - table horizontal scroll yang jelas, atau
  - card list mobile untuk data penting.

### Prioritas 3: Form dan Dialog Besar

- Audit release form, artist form, payout form, composer royalty upload, dan audio cutter.
- Pastikan spacing, tombol, dan scroll area aman di layar HP.
- Target touch area minimal 44px dan label tetap terlihat.

### Prioritas 4: Konsistensi Visual

- Samakan spacing section, card density, heading hierarchy, dan empty state lintas halaman.
- Hindari text terlalu kecil, tombol ikon tanpa label di mobile, dan horizontal overflow yang tidak disengaja.

## Update 2026-07-16 — Rancangan Hak Cipta / Publishing

- Rancangan fitur Hak Cipta/Publishing dibuat di `docs/services/copyright-publishing/FEATURE_PLAN.md`.
- TODO pengembangan bertahap dibuat di `docs/services/copyright-publishing/TODO.md`.
- Acuan dokumen kontrak: `C:/Users/bimok/Downloads/DRAFT KONTRAK SOUNDPUB COMPLETE.docx`.
- Keputusan awal: matching royalti harus distandarkan ke `composer_code`, bukan nama bebas.
- Tahap berikutnya sebelum implementasi: finalisasi keputusan produk pada Tahap 0 di TODO.

## Update 2026-07-16 — Addendum E-Meterai dan Biaya Registrasi Hak Cipta

- Rancangan e-Meterai, preview/download PDF kontrak, dan biaya registrasi Rp100.000 ditambahkan ke `docs/services/copyright-publishing/FEATURE_PLAN.md`.
- TODO baru `Tahap 0A — E-Meterai, PDF, dan Pembayaran Registrasi` ditambahkan ke `docs/services/copyright-publishing/TODO.md`.
- Rekomendasi MVP: generate preview/PDF kontrak lebih dulu, gunakan e-Meterai manual/semi-manual, lalu siapkan abstraksi database agar mudah upgrade ke API.

## Update 2026-07-17 — Keputusan MVP Hak Cipta

- Tahap 0 dan sebagian Tahap 0A dikunci untuk MVP.
- Registrasi wajib login, bisa simpan draft, dan draft PDF boleh didownload sebelum bayar dengan watermark.
- Biaya registrasi `Rp100.000` sudah termasuk 1 e-Meterai untuk MVP.
- E-Meterai MVP memakai proses manual/semi-manual oleh admin; API disiapkan untuk fase lanjut.

## Update 2026-07-17 — Tahap 1 Database Hak Cipta

- Migration database Hak Cipta dibuat di `supabase/migrations/20260717090000_copyright_publishing_registration.sql`.
- Tabel baru mencakup registration, works, files, contracts, dan payments.
- RLS dasar ditambahkan untuk user/admin.
- RPC `get_my_composer_royalties()` dibuat agar data royalti copyright dibatasi melalui `profiles.composer_code`.
- RPC admin review, generator `composer_code`, dan generator nomor kontrak dibuat.
- Validasi `supabase db lint --local` belum bisa berjalan karena Postgres Supabase lokal di `127.0.0.1:54322` belum aktif.

### Catatan Koneksi Supabase Self-Hosted

- Dari docker compose/env self-hosted, port host `5432` dipetakan ke `supabase-pooler`, bukan direct container `db`.
- Format koneksi yang berhasil untuk lint: user pooler `postgres.<POOLER_TENANT_ID>` ke `20.20.20.173:5432/postgres`.
- `supabase db lint --db-url ...` berhasil terhubung ke remote database melalui Supavisor.
- Hasil lint remote masih menemukan issue existing yang tidak berasal dari migration Hak Cipta baru:
  - `extensions.index_advisor` warning cast type.
  - `finance.update_overdue_daily` error kolom `status` tidak ada.
  - `public.get_royalty_*_breakdown` error unqualified `is_admin(uuid)` tidak ditemukan di lint context.
- Migration Hak Cipta baru belum diaplikasikan ke remote; validasi syntax penuh perlu dry-run/apply di environment DB yang siap rollback atau deploy terkontrol.

## Update 2026-07-17 — Kontrak Kerja Schema

- User menegaskan bahwa project menggunakan schema `soundpub`.
- Jangan mengubah schema selain `soundpub`.
- Migration Hak Cipta harus disesuaikan agar memakai schema `soundpub`, bukan `public`.
- Issue lint dari schema lain hanya dicatat, tidak diperbaiki dalam task ini.

### Penyesuaian Migration Hak Cipta

- Migration `20260717090000_copyright_publishing_registration.sql` sudah disesuaikan agar seluruh objek aplikasi dibuat di schema `soundpub`.
- Referensi ke `auth.users` tetap dipakai hanya sebagai FK auth, bukan perubahan schema auth.
- Tidak ada objek baru Hak Cipta yang dibuat di schema `public`.

### Validasi Schema `soundpub` — 2026-07-17

- `supabase db lint --schema soundpub` berhasil terhubung ke remote DB melalui Supavisor dengan user pooler.
- Lint schema `soundpub` hanya melaporkan issue existing pada fungsi `soundpub.repair_orphan_artist_link`:
  - `function min(uuid) does not exist`
  - Penyebab: query memakai `min(p.id)` pada kolom UUID.
- Issue tersebut tidak berasal dari migration Hak Cipta baru dan belum diperbaiki dalam tahap ini.
- Definisi existing `soundpub.composer_royalties` sudah cocok dengan RPC Hak Cipta baru: `composer_id`, `composer_name`, `total_net_royalti`, `period`, `upload_id`, `created_at`.


## Update 2026-07-17 — Folder Service Hak Cipta

- Semua dokumentasi dan catatan implementasi service Hak Cipta/Publishing dipusatkan di `docs/services/copyright-publishing/`.
- File utama service:
  - `docs/services/copyright-publishing/README.md`
  - `docs/services/copyright-publishing/FEATURE_PLAN.md`
  - `docs/services/copyright-publishing/TODO.md`
  - `docs/services/copyright-publishing/deployment-notes.md`
- Update berikutnya terkait service ini harus disimpan di folder tersebut.
