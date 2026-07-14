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
