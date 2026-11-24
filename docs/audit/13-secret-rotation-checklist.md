# 13 — Secret Rotation Checklist

Status: **ACTION REQUIRED BEFORE ANY PRODUCTION USE**

Temuan: token webhook Xendit ditemukan di 8 file tracked (`docs/integrations/xendit/` dan `scripts/xendit/`). Nilai di working tree sudah diganti placeholder. Git history masih memuat nilai lama pada commit `7060e48`, `49486bc`, `c387f15`, dan `7c1792e`; penanganan history memerlukan rotasi + persetujuan.

Kredensial yang baru dibagikan harus dianggap compromised.
 Jangan salin nilai aslinya ke repository, `.env.example`, source code, audit docs, chat, atau frontend `VITE_*` variable. Checklist ini hanya mencatat tindakan; tidak menyimpan secret.

| # | Tindakan | Owner | Tanggal | Bukti |
|---:|---|---|---|---|
| 1 | Rotate Xendit secret key dan webhook token di dashboard Xendit. Simpan hanya di backend/Edge Function secret store. |  |  |  |
| 2 | Hapus/nonaktifkan Xendit key lama setelah key baru terpasang. Uji webhook dengan signature verification dan replay protection. |  |  |  |
| 3 | Rotate password PostgreSQL. Hindari akun `postgres` superuser untuk aplikasi; gunakan role least-privilege terpisah. |  |  |  |
| 4 | Update DB secret hanya di server/Compose environment. Jangan pernah menaruh `DATABASE_URL` atau `DB_PASSWORD` sebagai `VITE_*`. |  |  |  |
| 5 | Rotate password super admin `me@maskhar.com`, lalu paksa logout/re-login dan revoked session lama. |  |  |  |
| 6 | Rotate/reissue Supabase publishable key bila kebijakan tim mengharuskan. Pastikan tidak ada `service_role` atau secret key di frontend. |  |  |  |
| 7 | Rotate SSO client secret bila ada. Simpan hanya di backend/Edge Function environment. |  |  |  |
| 8 | Jalankan `npm run test:secrets` untuk memindai working tree, lalu periksa git history. Jangan rewrite history tanpa persetujuan; rotasi tetap wajib. |  |  |  |
| 9 | Ganti `.env` lokal dengan placeholder dari `.env.example` dan `.env.example` backend. Pastikan file `.env` tetap di-`gitignore`. |  |  |  |
| 10 | Jalankan `npm run build` dan `npm run test:secrets`; pastikan bundle tidak mengandung pola secret, koneksi DB, atau token pembayaran. |  |  |  |
| 11 | Catat hasil rotasi di tabel ini tanpa menulis nilai secret. Minta mentor menandai bukti sebelum cutover dibahas. |  |  |  |

CI follow-up: `.github/workflows/ci.yml` sudah menjalankan `npm run test:secrets`, lint, contract test, build, browser egress, backend typecheck/build/test dengan dummy env. Workflow belum dijalankan di GitHub dan belum dijadikan required check/branch protection.

Catatan: checklist ini tidak mengubah status readiness. Migration readiness tetap **38/100 — NOT READY** sampai rotasi, backup verification, schema diff, verifikasi CI, dan approval cutover selesai.
