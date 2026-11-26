# TODO — Ringkasan Pekerjaan Audit & Migrasi Soundpub

Terakhir diperbarui: 2026-11-26
Bahasa: Bahasa Indonesia  
Status umum: **AUDIT SELESAI, BACKUP TERVERIFIKASI, MIGRASI BELUM SIAP**

---

## Ringkasan Singkat

Pekerjaan berfokus pada persiapan migrasi tanpa perubahan produksi. Pada 2026-11-26, setelah persetujuan terbatas, dump database `soundpub` dipulihkan ke PostgreSQL 15 lokal yang network-isolated dan memakai tmpfs; 33 tabel, 26.204 rows, dan 43 foreign keys tervalidasi. Dari `auth/users.csv.enc`, hanya `id`, `email`, `email_confirmed_at`, dan `created_at` diproyeksikan dalam memori; tidak ada credentials, sessions, MFA, atau Storage export yang disimpan/dikeluarkan. Dry-run menghasilkan 198 kandidat user inactive, tetapi 0/198 profile kandidat (semua diblokir oleh satu atau lebih mismatch/approval/data-retention/finance gates); 197 role kandidat tetap review-only. App settings 0/20 dan notifications 0/43 menghasilkan kandidat. Proyeksi lokal terpisah menghitung 291 releases/427 tracks: ditemukan field media/finance/lyrics/kontributor yang perlu migrasi atau review; 0 kandidat karena proyeksi ini sengaja tidak memuat Auth/profile rows dan track-order approval. Tidak ada row yang ditulis ke backend target. Residual 22 tabel kini diklasifikasikan: 17 memerlukan converter, 4 archive-only, dan `rate_limits` harus dimulai kosong; ini belum memproses atau mengarsipkan row. Audit-log dan auth-event dry-run kini memiliki converter fail-closed; auth-event metadata/IP/user-agent tetap memerlukan keputusan retensi. Backend suite lokal terakhir lulus 375/462 (87 skipped, 0 failed); 35 dry-run mapper tests lulus. Secret scan terakhir menemukan 0 temuan. Backup terenkripsi tetap lolos SHA-256 dan GCM 24/24. Semua pemeriksaan data dilakukan lokal dan privat; tidak ada akses produksi atau cutover.

Produksi tidak disentuh. Satu restore lokal terbatas hanya mencakup dump database `soundpub`; belum ada import ke backend target, pemrosesan Auth/Storage, migrasi produksi, deployment, atau cutover. Perubahan tooling sebelumnya sudah di-commit dan dipush ke `hammam-dev`; perubahan dry-run terbaru masih lokal.

---

## Tabel 1 — Pekerjaan yang Sudah Selesai

| Area | Yang Sudah Dilakukan | Status / Bukti | Catatan |
|---|---|---|---|
| Branch & repo | Bekerja di branch `hammam-dev`, upstream `origin/hammam-dev`, commit terakhir yang dipush `d79dcf7` | Terjaga | Perubahan dry-run terbaru belum di-commit |
| Audit dokumentasi | Membuat/memperbarui `docs/audit/01` sampai `18` | Selesai | Termasuk ringkasan eksekutif, backup, testing, roadmap, rotasi rahasia, key handoff, static diff, metadata, diff definisi, dan crosswalk data |
| Penilaian audit | Menetapkan status audit `38/100 — NOT READY` dan backend docs `52/100` | Tercatat | Status cutover masih tidak disetujui |
| Dependensi | Menjalankan `npm ci` di root dan `backend` | Selesai | Lockfile tidak berubah |
| Lint root | Memperbaiki ignore `dist` agar `backend/dist` tidak ikut di-lint | Lolos | `0 error`, `57 warning` bawaan |
| Contract tests | Menjalankan `npm run test:contracts` | Lolos | Semua kontrak frontend/API yang tersedia lolos |
| Build frontend | Menjalankan `npm run build` | Lolos | Tidak ada perubahan produksi |
| Backend typecheck | Menjalankan `npm run typecheck` di `backend` | Lolos | Tidak ada error tipe |
| Backend unit test | Menjalankan unit test backend | Lolos | `47 tests`, `46 pass`, `0 fail`, `1 skipped` |
| Backend full test sebelumnya | Menjalankan seluruh test backend tanpa semua Docker opt-in | Lolos | `426 tests`, `340 pass`, `0 fail`, `86 skipped` |
| Backend full suite terbaru | Menjalankan `npm test` di backend tanpa Docker opt-in | Lolos | `462 tests`, `375 pass`, `0 fail`, `87 skipped`; termasuk 35 dry-run converter tests |
| Backend Docker-enabled suite | Menjalankan `npm run test:docker` dengan `RUN_DOCKER_TESTS=1` | Lolos | `484 tests`, `475 pass`, `0 fail`, `9 skipped`; satu recovery rehearsal dijalankan terpisah |
| Egress test | Menjalankan pengujian batas akses jaringan/API | Lolos | Tidak ada akses produksi baru |
| Secret scan | Menambahkan `scripts/scan-secrets.mjs` dan menjalankannya | Lolos | Pemeriksaan terbaru: `1389 non-ignored files`, `0 findings` |
| Secret scan cakupan | Scanner diubah untuk memeriksa file terlacak dan file baru yang tidak di-ignore | Selesai | Tidak hanya `git ls-files` |
| Diff whitespace | Menjalankan `git diff --check` | Bersih | Tidak ada whitespace error |
| CI | Menambahkan `.github/workflows/ci.yml` dengan env dummy | Parsing YAML lolos | CI remote dan branch protection belum diverifikasi |
| Sanitasi rahasia | Mengganti Xendit webhook token di 8 file terlacak dengan placeholder | Selesai | Nilai asli tidak dicatat di docs/chat |
| Risiko git history | Token lama masih ada di history commit lama | Terdokumentasi | Perlu rotasi dulu, lalu persetujuan eksplisit untuk cleanup |
| Checklist rotasi | Membuat `docs/audit/13-secret-rotation-checklist.md` | Selesai | Tidak mengandung nilai rahasia |
| Backup source | Backup asli di `C:\soundpub\soundpub-20.20.20.173-20261030-212240` tidak diubah | Terjaga | Source tetap utuh |
| Backup copy | Menyalin backup terenkripsi ke `backend\backups\soundpub-20.20.20.173-20261030-212240` | Selesai | Folder di-ignore git lewat `/backend/backups/` |
| Backup inventory | `25 files`, `24 artefak terenkripsi`, `10.047.171.204 bytes` | Tercatat | Termasuk `SHA256SUMS.txt` |
| Backup SHA-256 | Semua checksum cocok | Lolos | Tidak ada modifikasi artefak |
| Backup verifier | Menjalankan `verify.cjs` dengan kunci yang diberikan | Lolos | `24 OK`, `Verified 24 files`, exit code `0` |
| Cross-check kunci | Kunci di OneDrive dan kunci di folder backup source sama-sama diverifikasi | Lolos | Keduanya 32 bytes dan 24/24 OK |
| Kunci backup | Kunci tidak pernah ditulis ke repo, docs, atau chat | Terjaga | Isi kunci tidak dicatat |
| Decrypt helper | Membuat `scripts/backup-decrypt-safe.mjs` | Selesai | Hanya helper ini yang boleh dipakai |
| Uji decrypt helper | Synthetic test untuk decrypt benar, wrong-key, output berbahaya, dan overwrite | Lolos | Tidak memakai backup asli saat uji |
| Decrypt schema | Mendekripsi `soundpub-schema.dump.enc`; dump database kemudian dipulihkan hanya di container lokal network-isolated dan tmpfs | Selesai | Schema output di luar repo/OneDrive; container dan plaintext dump dihapus setelah validasi |
| Ukuran schema dump | Hash dan ukuran schema dump tercatat | Tercatat | `2.177.592 bytes`, SHA-256 `9ff5c67218247440d6238f099f974bb1afe4cb252b524beaf899f41392eb9daa` |
| Parser schema | Membuat `scripts/inspect-pg-custom-dump.mjs` | Selesai | Membaca custom dump PostgreSQL tanpa server/Docker |
| Metadata backup | Membuat `docs/audit/16-backup-schema-metadata.md` | Selesai | Berisi count dan batasan perbandingan |
| Static schema diff | Membuat `scripts/static-schema-diff.mjs` dan `docs/audit/14-static-schema-diff.md` | Selesai | Ditandai `NON-AUTHORITATIVE`, bukan bukti applied state |
| Backup/canonical/backend diff | Membuat `scripts/schema-snapshot-diff.mjs` dan memperluas `docs/audit/17-definition-schema-diff.md` | Parsial selesai | 82 backend migrations lulus di DB disposable; diff statis mencatat perbedaan schema yang luas, bukan bukti semantic parity atau applied state |
| Rekonsiliasi auth/role, finansial, RLS, grants | Membuat crosswalk source-level untuk model legacy dan backend | Parsial | Role labels cocok, tetapi identity/tenant dan finance data conversion belum dipetakan; model RLS berbeda |
| Grant sequence least-privilege | Menambahkan migrasi `backend/migrations/0082_restrict_app_sequence_privileges.sql` | Lolos di DB disposable | Hak sequence dan default grant `soundpub_app` dicabut; insert identity tetap berhasil |
| NPM script | Menambahkan `test:schema-diff`, `test:schema-snapshot-diff`, `schema:snapshot-diff`, dan `backup:decrypt` | Selesai | Dipakai untuk audit lokal |
| Tes database sintetis | Menjalankan enam tes terpilih untuk managed artist, royalty report/import, dan staged commit | Lolos | Backend migrations direplay per tes ke PostgreSQL 17 disposable; semua fixture sintetis |
| Tes rekonsiliasi terpilih | Menjalankan tes grants, finance reconciliation, managed artist, dan payout | Lolos | `7 tests`, `7 pass`, `0 fail`, `0 skipped`; migrasi juga diuji dengan `soundpub_owner` |
| Tes Storage/media sintetis | Menjalankan `media-live`, `phase3d-media-security`, `storage-s3`, dan `storage` | Lolos | `22 tests`, `22 pass`, `0 fail`, `0 skipped`; PostgreSQL/RustFS disposable, data sintetis, port loopback |
| Synthetic recovery rehearsal | Menjalankan `label-custom-recovery-rehearsal.test.ts` dengan `RUN_RECOVERY_REHEARSAL=1` | Lolos | `5 tests`, `5 pass`; dua PostgreSQL 17 disposable, 10 record sintetis, replay identik, rollback terverifikasi, input orphan/credential ditolak |
| Isolated source restore | Memulihkan dump database `soundpub` setelah persetujuan terbatas | Lolos untuk inventory lokal | 33 tabel/26.204 rows dan 43 FK tervalidasi dalam PostgreSQL 15 `--network none` dengan data di tmpfs; Auth hanya dipakai untuk 4 field identitas di memori; tidak ada target writes |
| Source-to-backend mapping | Membuat `docs/audit/18-source-to-backend-data-mapping.md` dan dry-run identity/profile/role/artist/audit-log/auth-event/release/track/notification/deletion-request/app-settings mapper | Fixture sintetis + validasi backup terbatas pada domain yang disetujui | 35 tes mapper; 198 identity kandidat inactive, 0 profile kandidat (198 blocked), 197 role review-only, 0/20 app settings, 0/43 notifications; 291 releases/427 tracks diproyeksikan secara terbatas, 0 kandidat karena identity/ordering gates; 22 tabel residual diklasifikasikan (17 perlu converter, 4 archive-only, 1 rebuild-empty), belum ada raw rows yang disimpan atau diarsipkan |
| Docker | Menjalankan container test-only | Lolos | Fixture terikat loopback, data di tmpfs, container milik tes dibersihkan; tidak menjalankan stack development atau mengakses produksi |
| Produksi | Tidak ada SSH, akses Supabase produksi, restore/migrasi produksi, deployment, atau cutover | Sesuai batasan | Production untouched; restore lokal terbatas saja |

---

## Tabel 2 — Hasil Verifikasi Backup & Schema

| Pemeriksaan | Hasil | Arti Singkat |
|---|---|---|
| GCM authentication | `24/24 OK`, exit code `0` | Semua artefak terenkripsi asli dan tidak rusak |
| Artefak diproses | Schema, database dump, dan empat kolom Auth identitas yang disetujui | Auth credentials/sessions/MFA dan Storage export tidak diproses; dump dipulihkan lokal lalu dihapus |
| Archive version | `1.14-0` | Format custom dump PostgreSQL |
| Remote database | PostgreSQL `15.8` | Sesuai environment backup |
| Dump version | `pg_dump 15.8` | Dump dibuat oleh pg_dump 15.8 |
| TOC entries | `544` | Jumlah entri arsip auf PostgreSQL |
| Tables | `33/33 PASS` | Sama dengan manifest terinspect |
| Functions | `56/56 PASS` | Sama dengan manifest terinspect |
| Policies | `78/78 PASS` | Sama dengan manifest terinspect |
| Non-internal triggers | `47/47 PASS` | Sama dengan manifest terinspect |
| Foreign keys | `43/43 PASS` | Sama dengan manifest terinspect |
| Enums | `4/4 PASS` | Sama dengan manifest terinspect |
| ROW SECURITY entries | `32/32` count-only | Identitas tabel berbeda: backup tidak menunjukkan RLS pada `rate_limits`; canonical mengaktifkannya |
| Explicit INDEX TOC | `55`, tidak langsung dibandingkan | Manifest menghitung index inline/constraint-backed |
| Constraint TOC | `88`, tidak langsung dibandingkan | Manifest menghitung 109 constraint termasuk inline |

---

## Tabel 3 — Risiko & Blocker yang Masih Terbuka

| Risiko / Blocker | Status | Tindakan yang Dibutuhkan |
|---|---|---|
| Kredensial live pernah dibagikan di chat | Kritis | Rotasi password DB, Xendit secret key, dan Xendit webhook token |
| Token lama masih di git history | Kritis | Rotasi dulu; setelah itu minta persetujuan untuk history cleanup |
| Salinan kunci di OneDrive | Perlu ditangani | Pindahkan atau hapus; pakai salinan di folder backup source yang bukan OneDrive |
| Definition-level diff belum selesai | Blocking | Sequence grant backend sudah ditutup pada migrasi 0082; rekonsiliasi ACL/grantee legacy, owner, tiga function body yang belum terjelaskan, dan semantic parity masih perlu |
| Schema parity | Blocking | Perbandingan statis menunjukkan perbedaan luas yang perlu direkonsiliasi |
| CI remote belum diverifikasi | Minor | Cek GitHub Actions run dan branch protection setelah diizinkan |
| Restore dan target parity | Blocking | Restore lokal hanya mencakup dump `soundpub`; Auth/Storage lintas komponen dan parity backend target belum diuji |
| Cutover belum disetujui | Blocking | Butuh persetujuan eksplisit sebelum apa pun ke produksi |

---

## Tabel 4 — TODO Berikutnya

| Prioritas | Tugas | Detail | Status |
|---|---|---|---|
| Tinggi | Rotasi kredensial | Rotasi DB password, Xendit secret key, Xendit webhook token | Belum |
| Tinggi | Amankan kunci | Pindahkan/hapus salinan kunci di OneDrive; jangan pernah taruh kunci di repo | Belum |
| Tinggi | Definition-level schema diff | Tinjau `docs/audit/17-definition-schema-diff.md`; rekonsiliasi grant legacy `ALL` ke `dashboard_user`, `buzzerhood_app`, owner strategy, provenance tiga function body, dan behavioral parity | Parsial |
| Tinggi | Source-to-backend data mapping | Dry-run di `backend/src/recovery/soundpub-dry-run.ts` merencanakan bundel release/track dengan status `inactive` dan crosswalk posisi eksplisit; data finance/media/kontributor yang belum diverifikasi diblokir. Converter audit-log dan auth-event fail-closed sudah ditambahkan, tetapi metadata/IP/user-agent auth tetap menunggu keputusan retensi. Notifikasi, image/Spotify/verifikasi legacy, settings unsupported, dan konflik pending tetap diblokir. Dari 22 tabel residual, 17 perlu converter, 4 archive-only, dan 1 rebuild-empty. Belum ada row source yang diimpor; gate profile dan urutan track masih memerlukan bukti/keputusan | Parsial |
| Tinggi | Bangun DB dummy | 82 backend migrations dan second pass diverifikasi di PostgreSQL 17 disposable, termasuk migrasi sebagai `soundpub_owner`; final schema dibandingkan statis, semantic reconciliation dan restore rehearsal sintetis masih perlu | Parsial |
| Tinggi | Uji parity auth/role | Managed-artist guards dan role separation auditor/reconciler lolos; pemetaan Auth IDs, role/tenant matrix penuh, session dan refresh token belum diuji | Parsial |
| Tinggi | Uji finansial | Tes royalty report/import, finance reconciliation, dan payout terpilih lolos; konversi data finansial legacy, composer code, withdraw, adjustment, dan Xendit callback end-to-end masih perlu | Parsial |
| Menengah | Uji Storage | Upload/download, signed URL/CORS, multipart/abort, validasi MIME/checksum, authorization, delete/cleanup sudah diuji dengan fixture sintetis; migrasi policy/bucket dan kompatibilitas pemindahan objek legacy belum diuji | Parsial |
| Menengah | Restore rehearsal | Dump database nyata `soundpub` sudah dipulihkan di PostgreSQL 15 network-isolated; 33 tabel dan 43 FK tervalidasi. Auth credentials/session/MFA dan Storage belum diproses; snapshot lintas layanan tidak atomic; parity backend target belum dilakukan | Parsial |
| Menengah | Verifikasi CI remote | Cek workflow run dan branch protection bila diizinkan | Belum |
| Menengah | History cleanup | Setelah rotasi, minta persetujuan rewrite git history | Belum |
| Kritis | Cutover produksi | Jangan lakukan tanpa persetujuan eksplisit dan checklist lengkap | Belum |

---

## Aturan Aman yang Dipakai

| Aturan | Status |
|---|---|
| Tidak menyimpan kunci, password, atau token di repo/docs/chat | Dipatuhi |
| Tidak menghubungi produksi, SSH, Supabase Cloud, atau server | Dipatuhi |
| Tidak menjalankan restore ke produksi, migrasi produksi, atau cutover | Dipatuhi; hanya restore lokal terisolasi yang disetujui, tanpa penulisan ke backend target |
| Tidak commit/push/rewrite history | Dipatuhi |
| Tidak mengubah lockfile | Dipatuhi |
| Semua output plaintext backup berada di luar repo dan OneDrive | Dipatuhi |
| Backup asli tidak diubah | Dipatuhi |

---

## Kesimpulan Singkat

Backup sudah terbukti valid secara kriptografi; dump database `soundpub` berhasil dipulihkan secara lokal dan terisolasi, serta suite backend Docker-enabled (475 lulus), Storage/media (22 lulus), dan synthetic recovery rehearsal (5 lulus) juga berhasil. Migrasi masih **belum siap**: hanya empat field identitas Auth yang dipakai sementara; Auth credentials/sessions/MFA dan Storage belum dimigrasikan, snapshot lintas layanan tidak atomic, backend target belum menerima atau dibandingkan dengan data, dan perilaku auth/RLS penuh, finance, serta transfer media belum terbukti. Sebelum cutover, kredensial yang pernah terekspos harus dirotasi dan salinan kunci di OneDrive harus dipindahkan atau dihapus.