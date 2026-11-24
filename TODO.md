# TODO — Ringkasan Pekerjaan Audit & Migrasi Soundpub

Terakhir diperbarui: 2026-11-24  
Bahasa: Bahasa Indonesia  
Status umum: **AUDIT SELESAI, BACKUP TERVERIFIKASI, MIGRASI BELUM SIAP**

---

## Ringkasan Singkat

Pekerjaan yang sudah dilakukan sejak awal percakapan berfokus pada menyiapkan bukti audit, memverifikasi backup terenkripsi, dan memastikan tidak ada perubahan ke produksi. Kunci backup sudah diberikan dan diverifikasi. Backup lolos SHA-256 dan GCM authentication 24/24. Hanya artefak schema yang didekripsi, Itu pun ke lokasi di luar repo dan OneDrive. Tidak ada data pengguna, session, refresh token, Storage, atau data finansial yang didekripsi.

Produksi tidak disentuh. Tidak ada restore, migration replay, container Docker, commit, push, atau cutover yang dilakukan.

---

## Tabel 1 — Pekerjaan yang Sudah Selesai

| Area | Yang Sudah Dilakukan | Status / Bukti | Catatan |
|---|---|---|---|
| Branch & repo | Bekerja di branch `hammam-dev`, upstream `origin/codex/backend-snapshot-20261117`, HEAD `338f6dd` | Terjaga | Tidak ada switch branch, reset, rebase, force-push, commit, atau push |
| Audit dokumentasi | Membuat/memperbarui `docs/audit/01` sampai `16` | Selesai | Termasuk ringkasan eksekutif, backup, testing, roadmap, rotasi rahasia, key handoff, static diff, metadata backup |
| Penilaian audit | Menetapkan status audit `38/100 — NOT READY` dan backend docs `52/100` | Tercatat | Status cutover masih tidak disetujui |
| Dependensi | Menjalankan `npm ci` di root dan `backend` | Selesai | Lockfile tidak berubah |
| Lint root | Memperbaiki ignore `dist` agar `backend/dist` tidak ikut di-lint | Lolos | `0 error`, `57 warning` bawaan |
| Contract tests | Menjalankan `npm run test:contracts` | Lolos | Semua kontrak frontend/API yang tersedia lolos |
| Build frontend | Menjalankan `npm run build` | Lolos | Tidak ada perubahan produksi |
| Backend typecheck | Menjalankan `npm run typecheck` di `backend` | Lolos | Tidak ada error tipe |
| Backend unit test | Menjalankan unit test backend | Lolos | `47 tests`, `46 pass`, `0 fail`, `1 skipped` |
| Backend full test | Menjalankan seluruh test backend | Lolos | `426 tests`, `340 pass`, `0 fail`, `86 skipped` |
| Egress test | Menjalankan pengujian batas akses jaringan/API | Lolos | Tidak ada akses produksi baru |
| Secret scan | Menambahkan `scripts/scan-secrets.mjs` dan menjalankannya | Lolos | `1380 non-ignored files`, `0 findings` |
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
| Decrypt schema | Mendekripsi hanya `soundpub-schema.dump.enc` | Selesai | Output di `D:\Temp\opencode\soundpub-recovery`, di luar repo dan OneDrive |
| Ukuran schema dump | Hash dan ukuran schema dump tercatat | Tercatat | `2.177.592 bytes`, SHA-256 `9ff5c67218247440d6238f099f974bb1afe4cb252b524beaf899f41392eb9daa` |
| Parser schema | Membuat `scripts/inspect-pg-custom-dump.mjs` | Selesai | Membaca custom dump PostgreSQL tanpa server/Docker |
| Metadata backup | Membuat `docs/audit/16-backup-schema-metadata.md` | Selesai | Berisi count dan batasan perbandingan |
| Static schema diff | Membuat `scripts/static-schema-diff.mjs` dan `docs/audit/14-static-schema-diff.md` | Selesai | Ditandai `NON-AUTHORITATIVE`, bukan bukti applied state |
| NPM script | Menambahkan `test:schema-diff` dan `backup:decrypt` | Selesai | Dipakai untuk audit lokal |
| Docker | Tidak menjalankan Docker atau container apa pun | Sesuai batasan | Docker daemon sedang tidak tersedia di mesin ini |
| Produksi | Tidak ada SSH, Supabase produksi, migrasi, restore, atau cutover | Sesuai batasan | Production untouched |

---

## Tabel 2 — Hasil Verifikasi Backup & Schema

| Pemeriksaan | Hasil | Arti Singkat |
|---|---|---|
| GCM authentication | `24/24 OK`, exit code `0` | Semua artefak terenkripsi asli dan tidak rusak |
| Artefak didekripsi | Hanya schema | Data sensitif lain tidak dibuka |
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
| ROW SECURITY entries | `32/32 PASS` | Sama dengan manifest terinspect |
| Explicit INDEX TOC | `55`, tidak langsung dibandingkan | Manifest menghitung index inline/constraint-backed |
| Constraint TOC | `88`, tidak langsung dibandingkan | Manifest menghitung 109 constraint termasuk inline |

---

## Tabel 3 — Risiko & Blocker yang Masih Terbuka

| Risiko / Blocker | Status | Tindakan yang Dibutuhkan |
|---|---|---|
| Kredensial live pernah dibagikan di chat | Kritis | Rotasi password DB, Xendit secret key, dan Xendit webhook token |
| Token lama masih di git history | Kritis | Rotasi dulu; setelah itu minta persetujuan untuk history cleanup |
| Salinan kunci di OneDrive | Perlu ditangani | Pindahkan atau hapus; pakai salinan di folder backup source yang bukan OneDrive |
| Definition-level diff belum selesai | Blocking | Bandingkan definisi kolom, default, check, grant, function body, RLS expression, trigger definition |
| Docker daemon tidak tersedia | Blocking sementara | Nyalakan Docker lalu bangun DB dummy dengan project `dashboard-sounpub-dev` |
| CI remote belum diverifikasi | Minor | Cek GitHub Actions run dan branch protection setelah diizinkan |
| Restore drill belum dilakukan | Blocking | Gunakan data sintetis, jangan produksi |
| Cutover belum disetujui | Blocking | Butuh persetujuan eksplisit sebelum apa pun ke produksi |

---

## Tabel 4 — TODO Berikutnya

| Prioritas | Tugas | Detail | Status |
|---|---|---|---|
| Tinggi | Rotasi kredensial | Rotasi DB password, Xendit secret key, Xendit webhook token | Belum |
| Tinggi | Amankan kunci | Pindahkan/hapus salinan kunci di OneDrive; jangan pernah taruh kunci di repo | Belum |
| Tinggi | Definition-level schema diff | Bandingkan backup schema SQL dengan `CANONICAL_SCHEMA.sql`, `supabase/migrations`, dan `backend/migrations` | Belum |
| Tinggi | Bangun DB dummy | Saat Docker tersedia, replay migrasi ke database lokal terisolasi dengan data sintetis | Belum |
| Tinggi | Uji parity auth/role | Uji login, session, refresh token, RLS, dan role superadmin/artist/label | Belum |
| Tinggi | Uji finansial | Uji composer code, payout, withdraw, adjustment, dan Xendit callback secara lokal | Belum |
| Menengah | Uji Storage | Uji bucket policy, upload/download, dan cleanup dengan data dummy | Belum |
| Menengah | Restore rehearsal | Latih restore dari backup terverifikasi ke lingkungan lokal; jangan produksi | Belum |
| Menengah | Verifikasi CI remote | Cek workflow run dan branch protection bila diizinkan | Belum |
| Menengah | History cleanup | Setelah rotasi, minta persetujuan rewrite git history | Belum |
| Kritis | Cutover produksi | Jangan lakukan tanpa persetujuan eksplisit dan checklist lengkap | Belum |

---

## Aturan Aman yang Dipakai

| Aturan | Status |
|---|---|
| Tidak menyimpan kunci, password, atau token di repo/docs/chat | Dipatuhi |
| Tidak menghubungi produksi, SSH, Supabase Cloud, atau server | Dipatuhi |
| Tidak menjalankan migrasi/restore/cutover | Dipatuhi |
| Tidak commit/push/rewrite history | Dipatuhi |
| Tidak mengubah lockfile | Dipatuhi |
| Semua output plaintext backup berada di luar repo dan OneDrive | Dipatuhi |
| Backup asli tidak diubah | Dipatuhi |

---

## Kesimpulan Singkat

Backup sudah terbukti valid secara kriptografi dan metadata schemanya cocok dengan manifest untuk objek yang bisa dibandingkan langsung. Namun migrasi masih **belum siap** karena definisi objek, perilaku auth/RLS, finansial, Storage, dan restore drill belum diuji secara eksplisit. Sebelum pekerjaan lanjut, kredensial yang pernah terekspos harus dirotasi dan salinan kunci di OneDrive harus dipindahkan atau dihapus.