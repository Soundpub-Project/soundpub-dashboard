# Audit Supabase dan Kesiapan Migrasi Backend Mandiri

**Tanggal:** 23 Oktober 2026 (Asia/Bangkok). **Status:** Audit saja; tidak ada migrasi, perubahan layanan, atau uji mutatif. Bukti: source kerja, SQL/runbook, metadata PostgreSQL dan Docker lewat SSH read-only. Path file relatif root project; path `/data/...` berada di server. Tidak ada nilai secret, row pengguna, atau bytes file yang diambil.

## A. Executive Summary

**Ketergantungan Supabase sangat tinggi; kesiapan 38/100 (NOT READY).** Dashboard React/Vite langsung memakai PostgREST, GoTrue, Storage, RPC, Edge Functions, dan Realtime. Infrastruktur **sudah self-hosted Supabase**, bukan Supabase Cloud; migrasi dimaksud berarti mengganti komponennya. Stack Compose pada `/data/supabase/instances/supabase-01/config` menjalankan `db`, `auth`, `storage`, `rest`, `realtime`, `functions`, `api-gw`, dan layanan pendukung.

Metadata live: PostgreSQL 17.6; schema `soundpub` lowercase, 33 tabel, 56 function (51 `SECURITY DEFINER`), 78 policy, 0 view. Frontend default `Soundpub` berbeda casing (`src/integrations/supabase/client.ts:7`). Host bersama menampung 25 bucket/2.299 objek dan 211 auth users **lintas aplikasi**, bukan hitungan Soundpub. Tidak ada ledger `supabase_migrations.schema_migrations` live. Risiko terbesar: privileged API tanpa auth, policy/grant role, backup gagal, drift deploy/schema, dan media lintas tiga sumber.

## B. Supabase Dependency Inventory

| Komponen | Bukti implementasi | Tingkat |
|---|---|---|
| Client/PostgREST | `src/integrations/supabase/client.ts:12`; browser memakai `.from()` di banyak page | Kritis |
| GoTrue/Auth/SSO | `src/hooks/useAuth.tsx:78`, `:193`, `:206`; `src/pages/Auth.tsx:171`; `supabase/functions/sso-login/index.ts:360` | Kritis |
| RLS/RPC/roles | `src/components/auth/ProtectedRoute.tsx:46`, `src/hooks/useRoyaltyData.ts:10`, `supabase/migrations/20260907_harden_user_role_management.sql:22` | Kritis |
| Storage/TUS | `src/components/releases/MediaUploadSection.tsx:157`, `src/pages/MediaLibrary.tsx:61` | Kritis |
| Edge Functions | `supabase/functions/`; `src/pages/UploadRoyalty.tsx:681`, `src/lib/xendit.ts:26` | Kritis |
| Realtime | `src/components/layout/DashboardLayout.tsx:61`, `src/components/notifications/NotificationBell.tsx:41`; publication live tidak mencakup `soundpub` | Sedang; source ada, event tidak terbukti bekerja |
| Lovable auth adapter | `src/integrations/lovable/index.ts:3`; tidak ada caller ditemukan | Terpasang, belum terbukti dipakai |

File frontend terdampak: 83 file terverifikasi. Kelompok core: `src/context/SsoAuthContext.tsx`, `src/hooks/useAuth.tsx`, `src/hooks/useExportCsv.ts`, `src/hooks/useRoyaltyData.ts`, `src/integrations/lovable/index.ts`, `src/integrations/supabase/client.ts`, `src/lib/audioClipper.ts`, `src/lib/fetchAllRoyalties.ts`, `src/lib/sessionLimit.ts`, `src/lib/xendit.ts`. Kelompok UI: seluruh modul terkait release, royalty, settings, user management, copyright, payout, takedown, media, auth, dashboard, notifications, audit, export, invoices dan katalog yang tercantum pada Appendix 1.

Environment **hanya nama key:** `.env`/`.env.local`/untracked `.env copy` memuat `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DATABASE_SCHEMA`, koneksi DB, `VITE_SSO_*`, `XENDIT_*`. `.env.example:8` memakai `VITE_SUPABASE_ANON_KEY`, berbeda dari client (`src/integrations/supabase/client.ts:6`) dan Dockerfile (`Dockerfile:30`). Edge Functions memakai `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_SCHEMA` serta key provider server-side. `VITE_*` masuk browser; jangan pindah service key ke sana. `.env copy` belum di-ignore; nilai tidak dibaca.

## C. Database Architecture

**Fakta live read-only:** 33 tabel, 56 function (51 `SECURITY DEFINER`), 78 policy `soundpub`, 0 view/materialized view. Ekstensi host: `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_trgm`, `pg_net`, `supabase_vault`, `pg_stat_statements`, `hypopg`, `index_advisor`; tidak semua otomatis dependency project. Inventaris tabel live lengkap:

| Domain | Tabel |
|---|---|
| Identity/konfigurasi | `profiles`, `user_roles`, `artist_profiles`, `artists`, `app_settings`, `auth_events`, `rate_limits`, `audit_logs`, `email_send_log`, `notifications` |
| Katalog/pembayaran | `releases`, `tracks`, `release_payments`, `payout_requests`, `payout_balance_reservations`, `balance_adjustments` |
| Royalti | `royalties`, `royalty_uploads`, `archived_royalties`, `composer_royalties` |
| Copyright | `copyright_registrations`, `copyright_registration_works`, `copyright_registration_files`, `copyright_registration_payments`, `copyright_contracts` |
| Takedown | `takedown_requests`, `takedown_request_items`, `takedown_request_targets`, `takedown_request_documents`, `takedown_status_history`, `artist_deletion_requests` |
| Backup | `storage_backup_runs`, `storage_backup_log` |

**Dependency/FK:** `auth.users.id` induk `profiles.id`, `artist_profiles.user_id` serta user registrasi/notifikasi/audit; `profiles` induk artist, label, release, royalty, upload dan payout; `releases` induk tracks/payment/takedown item; `royalty_uploads` induk royalties; copyright registrations induk works/files/payments/contracts; takedown requests induk items/targets/documents/history. UUID dan semantic FK delete wajib dipertahankan. Beberapa kolom bisnis belum punya FK pada baseline: `release_payments.user_id`, `composer_royalties.upload_id` (`docs/soundpub-local-migration/01-reset-and-recreate-soundpub.sql:462`, `:498`).

**Provenance schema:** baseline runbook `docs/soundpub-local-migration/01-reset-and-recreate-soundpub.sql:20` berisi 17 tabel; 30 file `supabase/migrations/` menambah/mengubah objek tetapi tidak merekonstruksi DB utuh. `auth_events`, `rate_limits`, dan lima tabel copyright live tidak memiliki CREATE kanonis di migration aktif. `public/exports/full-schema.sql:2` mengekspor schema `public` lama, sedangkan live `soundpub`; types `src/integrations/supabase/types.ts:15`, `:1071` menduplikasi `Soundpub`/`public`, ketinggalan dari DB. Prefix versi migration bertabrakan, misalnya tujuh file `20260909*`. Empat migration `20261023*` untracked; **status penerapan live belum dibuktikan**. Tidak ada ledger standar. Schema export di `public/` berpotensi tersedia sebagai aset web. Jangan replay baseline/runbook tanpa diff.

**Trigger, constraint, index dan function:** live mempunyai FK, index, trigger audit perubahan, timestamp, signup/role, artist/label, validasi release/track, payout/balance, dan takedown. Source: `supabase/migrations/20260907_comprehensive_audit_logging.sql:87`, `supabase/migrations/20260910_assign_artist_role_on_soundpub_signup.sql:74`, `supabase/migrations/20260904_payout_reserve_and_proof.sql:5`, `supabase/migrations/20260901_create_takedown_feature.sql:40`. Enum `app_role` dan enum takedown dipakai (`supabase/migrations/20260901_create_takedown_feature.sql:3`). RPC penting: `has_role`, `is_admin`, `is_superadmin`, `record_auth_audit`, `get_royalty_*`, `request_payout`, `update_payout_status`, `commit_royalty_upload`, `reverse_royalty_upload`, `rebuild_royalty_balances`, `delete_release_with_refund`, `admin_review_copyright_registration`, `scan_orphan_artist_links`. Dua definer live tanpa fixed `search_path`: `cleanup_expired_tokens`, `cleanup_rate_limits`; banyak definer callable `anon`. Detail validitas/duplikasi index belum diaudit per-index; perlu sanitized DDL live.

**RLS live:** 32/33 tabel RLS aktif; `rate_limits` **tidak**. Katalog grant menunjukkan `anon` boleh SELECT dan `authenticated` boleh SELECT/INSERT/UPDATE/DELETE pada `soundpub.rate_limits`. Tiga tabel `archived_royalties`, `balance_adjustments`, `payout_balance_reservations` RLS aktif tanpa client policy; privileged role yang bypass RLS tetap dapat akses. 78 policy meliputi profile/role, ownership label/artis, royalti, pembayaran, copyright, dan takedown. Policy role `FOR ALL` source `supabase/migrations/20260907_harden_user_role_management.sql:22` bercabang `WITH CHECK` tanpa mewajibkan actor admin untuk role non-superadmin; **uji kondisi grant/predicate live sebelum mengklaim exploitability**. `record_auth_audit` menerima action/target client (`supabase/migrations/20260907_comprehensive_audit_logging.sql:101`). `scan_orphan_artist_links()` live adalah definer callable anon dan mengembalikan metadata bisnis. Storage mempunyai delapan policy `storage.objects`, dirinci di E.

**Financial/DDL drift:** `request_payout` mengurangi saldo pada reservasi (`supabase/migrations/20260904_payout_reserve_and_proof.sql:47`); implementasi historis `complete_payout` berpotensi mengurangi lagi (`supabase/migrations/20260904_label_aggregate_payouts.sql:49`), revoke/hardening baru di migration untracked (`supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql:224`). Verifikasi body/grant live dan saldo sebelum copy. `releases.label_id NOT NULL` baseline bertentangan dengan migrasi FK `ON DELETE SET NULL` (`supabase/migrations/20260901_set_null_release_profile_refs_on_user_delete.sql:19`). Koreksi produksi khusus di `supabase/migrations/20260907_reconcile_kaditrudit_payout_balance.sql:8` tidak aman direplay generik. SQL assertion di `scripts/` sebagian mutatif tanpa outer rollback; tidak dijalankan.

## D. Authentication & Authorization

| Jalur | Bukti dan dampak migrasi |
|---|---|
| Password/signup | `src/hooks/useAuth.tsx:193`, `:206` GoTrue; trigger `supabase/migrations/20260910_assign_artist_role_on_soundpub_signup.sql:15` memberi profil/role. `source_app` berasal dari metadata user yang dapat diedit; jangan dipakai sebagai authz. |
| Google OAuth | `src/pages/Auth.tsx:171`; live `auth.identities` mencakup email/Google lintas host. Harus memetakan provider, UUID, verified email hanya untuk user Soundpub. |
| ICCN/Keycloak | `src/lib/keycloak.ts:88`, `supabase/functions/sso-login/index.ts:323`, `:380`, `:463`; Keycloak token diubah menjadi Supabase session lewat lookup email/magic link. Validasi `aud`, `azp`, `email_verified`, `(issuer,subject)` dan konflik linking wajib dirancang. |
| Session | `src/integrations/supabase/client.ts:14` persist `localStorage`/auto-refresh; `src/hooks/useAuth.tsx:78` subscribe auth; batas enam jam di `src/lib/sessionLimit.ts:3` client-only. Butuh revoke dan refresh server-side. |
| Route/role | `src/components/auth/ProtectedRoute.tsx:82` hanya menolak role bila `userRole` truthy; bila gagal load, UI berpotensi fail-open, **bukan bukti RLS DB lolos**. API baru wajib default-deny server-side. |
| Recovery | UI native (`src/pages/ForgotPassword.tsx:38`, `src/pages/ResetPassword.tsx:80`, `src/pages/VerifyEmailRequired.tsx:49`); lima function custom reset/verifikasi di repo tidak ada caller frontend aktif. |
| User admin | `create-user`, `delete-user`, `update-user-role`, `update-user-status`, `update-user-password`, impersonation memakai Supabase Admin API. `supabase/functions/create-user/index.ts:85`, `:140` membolehkan admin biasa membuat superadmin; `src/pages/Users.tsx:230` menyimpan refresh token superadmin di `sessionStorage`. |

`inactive` tetap boleh login (`src/components/users/ChangeStatusDialog.tsx:45`); `suspended` menyalakan ban GoTrue (`supabase/functions/update-user-status/index.ts:127`): jangan ubah semantik tanpa keputusan produk. `send-app-email` dan `backup-storage-to-drive` tidak cek caller meski memakai service role (`supabase/functions/send-app-email/index.ts:224`, `supabase/functions/backup-storage-to-drive/index.ts:121`). Reset custom menyimpan token yang perlu audit hashing, atomic consume, revoke (`supabase/functions/send-password-reset/index.ts:104`, `supabase/functions/reset-password/index.ts:70`). JWT TTL/rotation, provider settings, Keycloak claim mapping, MFA, SMTP, allowlist OAuth, session revocation belum diverifikasi.

## E. Storage Architecture

| Bucket | Kondisi live/bukti | Dampak migrasi |
|---|---|---|
| `release-covers` | Private; 246 objek cocok referensi. Upload `src/components/releases/ReleaseFormPage.tsx:744`; form lama memakai public URL walau private `src/components/releases/ArtistReleaseFormDialog.tsx:270` | 291 DB refs: 246 lokal, 45 Supabase Cloud lama |
| `track-audio` | Private; 297 objek. TUS `src/components/releases/MediaUploadSection.tsx:157`; signed URL 1 tahun `:210` | 426 refs: 297 lokal, 111 GCS, 18 Cloud lama |
| `audio-clips` | Public; 8 objek; `src/lib/audioClipper.ts:11` | 230 refs: 8 lokal, 167 GCS, 55 Cloud lama |
| `avatars`, `label-logos`, `iccn-gallery` | Public; flow `src/pages/Settings.tsx:129`, `src/components/settings/LabelLogoSettings.tsx:27`, `src/components/settings/IccnIntegrationSettings.tsx:68` | Sebagian ref eksternal/Cloud; bucket host dapat berisi data aplikasi lain |
| `payout-proofs`, `release-invoices`, `takedown-documents` | Private; `src/pages/AdminPayouts.tsx:146`, `supabase/functions/download-release-invoice/index.ts:83`, `src/pages/Takedown.tsx:147` | Tidak ada policy bucket eksplisit live untuk payout/invoice; invoice memakai service role |
| `contracts` | **Public**, tanpa limit MIME/size; stamped contract + public URL `src/pages/CopyrightRegistrationReview.tsx:358`, `:371` | Dokumen legal wajib private-default; nilai `VITE_CONTRACT_BUCKET` tidak dibaca |
| `track-video` | Private, 0 objek; hanya schema/backup reference | Jangan migrasi sebagai aktif tanpa manifest |

Delapan policy `storage.objects` live: enam generik Soundpub, dua takedown. Insert/update/delete bucket utama membatasi folder owner/admin, tetapi authenticated dapat membaca semua objek pada bucket private media generik. SQL `docs/soundpub-local-migration/09-storage-buckets-and-policies.sql:42` lebih longgar daripada live; **jangan replay**. Validasi MIME/size client saja pada beberapa flow; `accept` browser bukan kontrol keamanan.

DB menyimpan URL penuh/signed URL, bukan `{bucket,path}`. Path baru dibentuk `src/lib/storagePaths.ts:27`. Remove media/avatar/logo sering hanya menghapus referensi (`src/components/releases/MediaUploadSection.tsx:309`, `src/pages/Settings.tsx:174`); upload dan DB update tidak atomik. Terdapat **396 referensi eksternal** ke Supabase Cloud lama/GCS (bukan 396 objek unik); bytes/checksum belum diverifikasi. Metadata 1.033 objek pada sepuluh bucket terkait sekitar 10,04 GB, tetapi bucket bersama dapat mencakup aplikasi lain; bukan ukuran final Soundpub.

`supabase/functions/backup-storage-to-drive/index.ts:20` tidak mencakup seluruh bucket bisnis, punya batas 200 MB, memakai service role tanpa auth (`:121`) dan Lovable/Google Drive connector. Live: dua run backup gagal, nol log objek sukses. Storage bytes berada di mount `/data/supabase/instances/supabase-01/config/volumes/storage`; metadata di PostgreSQL. Backup harus mencakup keduanya plus restore drill.

## F. Frontend & Backend Integration

**Direct Data API:** frontend langsung bergantung pada sekitar 28 tabel domain; client terpusat bukan repository abstraction. Hampir semua page/hook bisnis perlu adapter API baru. `src/hooks/useRoyaltyData.ts:10` memakai analytics RPC, `src/hooks/useExportCsv.ts:54` ekspor data, `src/components/releases/DeleteReleaseDialog.tsx:31` RPC transaksi delete/refund.

**RPC frontend:** `get_dashboard_role_stats`, `delete_release_with_refund`, `is_soundpub_artist_for_release`, `record_auth_audit`, seluruh `get_royalty_*`, `request_payout`, `update_payout_status`, `get_my_composer_royalties`, `admin_review_copyright_registration`, `admin_update_copyright_contract`, `scan_orphan_artist_links`, `repair_orphan_artist_link`, `import_composer_royalties`, `validate_royalty_csv_row`, `delete_royalty_upload`, `get_royalty_upload_history`. Empat terakhir dipanggil halaman Copyright tetapi **tidak ditemukan di katalog function live schema manapun**; flow tidak dapat dianggap sehat. Internal Edge RPC: `is_admin`, `commit_royalty_upload`, `reverse_royalty_upload`, `check_rate_limit`.

**34 direktori Edge Function repo:**

- User/auth: `create-user`, `create-whitelabel-artist`, `delete-user`, `remove-artist-from-label`, `transfer-artist-label`, `update-user-role`, `update-user-status`, `update-user-password`, `set-artist-password`, `start-user-impersonation`, `sso-login`, `change-own-password`, `send-password-reset`, `reset-password`, `verify-password-reset-token`, `send-verification-email`, `verify-email`.
- Payment/royalty/email: `create-xendit-invoice`, `create-copyright-invoice`, `xendit-webhook`, `download-release-invoice`, `process-royalty-upload`, `delete-royalty-upload`, `send-royalty-notification`, `send-app-email`.
- Content/ops: `gcs-manage`, `gcs-upload`, `test-gcs`, `backup-storage-to-drive`, `spotify-fetch-artist`, `get-catalog-tracks`, `get-ga4-config`, `info-soundpub`, `update-app-settings`.

UI aktif memanggil manajemen user, payment, royalty, settings, Spotify, katalog, email (`src/components/users/AddUserDialog.tsx:217`, `src/lib/xendit.ts:26`, `src/pages/UploadRoyalty.tsx:681`, `src/components/settings/StorageSettings.tsx:141`). `sso-login` memakai `fetch` langsung (`src/context/SsoAuthContext.tsx:47`). `xendit-webhook` callback provider; scheduler backup belum ditemukan. Custom reset/verifikasi dan `send-royalty-notification` tidak punya caller frontend aktif. `gcs-manage`/`gcs-upload` masih dipanggil UI tetapi handler mengembalikan 503. Referensi `info-Soundpub` salah casing (`src/components/settings/IccnIntegrationSettings.tsx:22`); runtime lowercase 200, mixed-case 500.

**Deployment drift:** volume remote functions ter-mount ke `/home/deno/functions`. Hash SHA-256 menemukan 14 `index.ts` berbeda dari repo: `create-copyright-invoice`, `create-user`, `create-xendit-invoice`, `delete-user`, `download-release-invoice`, `send-app-email`, `send-password-reset`, `send-royalty-notification`, `start-user-impersonation`, `update-app-settings`, `update-user-role`, `verify-email`, `verify-password-reset-token`, `xendit-webhook`. Remote-only: `main`, `auth-email-hook`, `hello`, `_shared/cors.ts`; lima fungsi lokal mengimpor shared CORS yang tidak ada di repo (`supabase/functions/create-user/index.ts:2`). Router remote memakai `VERIFY_JWT=false`; banyak `supabase/config.toml` entry juga `verify_jwt=false`. Source repo bukan source-of-truth deploy.

**Realtime:** publication live ada tetapi tanpa tabel `soundpub`. `DashboardLayout` subscribe `soundpub.profiles`; `NotificationBell` memakai schema `public` walau tabel live `soundpub`; `NotificationCenter` schema benar tetapi tidak tampak dirender. Target harus menetapkan baseline perilaku aktual: polling/refresh atau realtime yang diperbaiki.

**Integrasi luar:** Keycloak, Xendit, SMTP/auth email hook remote-only, Lovable connector email/backup, Spotify, GA4, PDF, GCS lama. Webhook Xendit menandai paid sebelum update lanjutan dan retry berhenti pada status paid (`supabase/functions/xendit-webhook/index.ts:117`, `:130`); butuh transaksi/outbox dan reconciliation. `public/exports/`, `public/test-oauth.html`, `public/cors-test.html` dapat menjadi aset web; review/hapus dari build produksi.

## G. Recommended Self-Hosted Architecture

**Rekomendasi, bukan kondisi terpasang:**

| Lapisan | Pilihan minimum | Alasan |
|---|---|---|
| Database | PostgreSQL 17 dedicated database/cluster Soundpub + migration versioned/checksum | Pertahankan FK/transaksi, pisahkan tenant, buat baseline dari live terlebih dahulu |
| API | TypeScript modular monolith (Fastify atau HTTP framework internal yang disepakati), REST versioned + DB pool + worker | Menyatukan authorization/validasi, mengganti direct PostgREST/Edge tanpa microservices |
| Identity | Keycloak yang sudah dipakai ICCN **jika** seluruh tipe akun dapat dimigrasikan; jika tidak, provider auth matang yang mendukung migrasi hash/OAuth dan masa transisi | Jangan bangun password/JWT/refresh sendiri; pertahankan UUID, subject mapping, Google, recovery |
| File | S3-compatible MinIO dedicated atau filesystem privat + API bila skala kecil; signed URL singkat | Private-default, path stabil, multipart/resumable upload, object ACL per owner |
| Otorisasi | Backend default-deny, role/owner server-side, minimum DB grants; RLS sebagai defense-in-depth | UI guard tidak bisa menggantikan backend ACL |
| Jobs/ops | PostgreSQL outbox + worker, SMTP server-side, webhook dedup, PostgreSQL PITR + file versioning/backup, TLS reverse proxy | Lindungi transaksi payment/email, restore dan rollback |

**Alternatif biaya terendah:** bila sasaran hanya operasional mandiri, pertahankan Supabase self-hosted yang sudah berjalan, isolasi Soundpub, amankan privileges dan backup. Namun alternatif ini **tidak memenuhi** syarat tanpa Supabase jika target itu mutlak. Stack baru sebaiknya diputuskan setelah feasibility migrasi password hash/identitas, bukan berdasarkan dependency saja.

## H. Migration Risk Assessment

| Severity | Risiko terverifikasi / bersyarat | Mitigasi |
|---|---|---|
| **CRITICAL** | `send-app-email` dan `backup-storage-to-drive` memakai service role tanpa auth (`supabase/functions/send-app-email/index.ts:224`, `supabase/functions/backup-storage-to-drive/index.ts:121`); runtime JWT global off | Auth+authorization di sumber dan target, endpoint private, queue/rate limit |
| **CRITICAL** | Admin dapat membuat superadmin (`supabase/functions/create-user/index.ts:85`, `:140`); policy `user_roles` memungkinkan eskalasi **jika** INSERT live dapat dilakukan (`supabase/migrations/20260907_harden_user_role_management.sql:22`) | Periksa predicate/grant live, role hierarchy server-side, deny-matrix tests |
| **CRITICAL** | `rate_limits` live tanpa RLS tapi punya SELECT anon dan DML authenticated; `contracts` bucket public walau flow legal docs | Cabut grant/aktifkan kontrol, private-default, audit akses dan konsekuensi bisnis |
| **CRITICAL** | Live 33 tabel vs baseline 17 + migration additions 8; tanpa migration ledger, 14 Edge Function deployed berbeda | Canonical baseline DDL, checksum, reproduce restore dan deployed function |
| **HIGH** | 396 URL referensi media eksternal, backup Storage dua kali gagal, host 25 bucket bersama | Allowlist owner/path, pindah bytes + hash, restore drill tanpa tenant lain |
| **HIGH** | 51 definer dan anon execute luas; `scan_orphan_artist_links` anon mengembalikan metadata bisnis | Audit body/ACL tiap function, revoke PUBLIC, fixed search_path |
| **HIGH** | SSO link berdasar email, UI role fail-open, refresh token superadmin di browser (`supabase/functions/sso-login/index.ts:380`, `src/components/auth/ProtectedRoute.tsx:82`, `src/pages/Users.tsx:230`) | `(issuer,sub)` linking, authorization backend, impersonation scoped/revocable |
| **HIGH** | Xendit callback tidak atomik, invoice eksternal mungkin duplikat saat request paralel (`supabase/functions/xendit-webhook/index.ts:117`) | Unique idempotency key, transaksi, outbox, provider reconciliation |
| **MEDIUM** | Source Realtime ada tetapi publication soundpub kosong; empat RPC frontend hilang live | Contract test sesuai perilaku aktual, tetapkan fitur yang diperbaiki vs dipertahankan |
| **MEDIUM** | `.env.example` beda key, untracked `.env copy`, debug/schema export berada di `public/` | Secret hygiene dan build allowlist tanpa membuka nilai secret |
| **LOW** | Lovable auth adapter terpasang tanpa caller | Hapus setelah verifikasi bundle/traffic |

**Kehilangan data/downtime:** penyalinan awal saja tidak cukup. Payment webhook, user/session, file upload, dan royalty bisa berubah sewaktu copy. Balik DNS setelah target menerima write **tidak aman** tanpa replay journal; pilih write freeze/queue inbound dan rollback teruji. RTO/RPO belum ditetapkan.

## I. Migration Readiness Score

| Kriteria | Bobot | Nilai | Dasar |
|---|---:|---:|---|
| Source/schema reproducibility | 20 | 4 | Baseline parsial; tanpa ledger; deployment drift |
| Database/RLS/privileged SQL | 20 | 8 | DB terbaca; 33 tabel/78 policy; grant/RLS/function rawan |
| Auth & privileged API | 25 | 7 | Flow terpetakan; endpoint privileged tanpa auth dan eskalasi |
| Storage & isolasi | 15 | 6 | Bucket/media terpetakan sebagian; backup gagal dan sumber campur |
| Deployment/observability | 10 | 8 | Compose sehat dan mount diketahui; backup/source belum kanonis |
| Cutover/rollback | 10 | 5 | SQL test tersedia untuk sebagian financial; restore/cutover belum dry-run |
| **Total** | **100** | **38** | **NOT READY**; gate usulan >=75, nol CRITICAL, restore/reconciliation lulus |

## J. Proposed Migration Roadmap

**Satu phase terkoordinasi dengan checkpoint; belum dieksekusi dalam audit ini.** Tetapkan owner, RTO/RPO, freeze window dan go/no-go terlebih dahulu.

1. **Freeze inventory:** hasilkan schema-only baseline live (auth linkage, `soundpub`, storage terkait), function/policy/grant/index/trigger, remote deployed source, allowlist user/bucket/path, manifest file dengan size/checksum. Pisahkan tenant lain dan hash artefak.
2. **Gate keamanan sumber:** tutup endpoint privileged tanpa auth, privilege escalation, `rate_limits` dan kontrak public; review perubahan terhadap DDL live; jangan jalankan SQL runbook mentah.
3. **Bangun target paralel:** database dedicated, auth pilihan, API/worker, private object store, secret handling, metrics, PITR dan restore drill. Tidak ada trafik produksi diarahkan sebelum gate.
4. **Compatibility matrix:** petakan setiap query/RPC/Edge Function, auth flow, URL/TUS, Realtime, Xendit, email ke API target; caller pasif ditandai, jangan dibangun ulang tanpa alasan.
5. **Dry-run non-prod:** migrasi UUID, user/identity/role/password secara feasible, FK/sequence, rows, file dari self-hosted/Cloud/GCS; cek row count exact per tabel, FK/orphan, saldo/royalti/period, hash bytes, private access, matriks role, OAuth/reset/logout, payment webhook replay dan concurrency; restore test.
6. **Pre-cutover gate:** nol CRITICAL terbuka, manifest lengkap, backup DB+file berhasil dipulihkan, RPO/RTO dan queue provider disepakati; siapkan DNS TTL, audit in-flight uploads/payments/session. STOP bila satu gate gagal.
7. **Cutover:** freeze writes atau antrekan inbound webhook, ambil delta final DB+Storage dan WAL checkpoint, replay idempotent, cek checksum/finansial, ganti URL/API/provider callback; smoke test auth, dokumen privat, upload, payout, invoice, email dan role deny; monitor error/latency.
8. **Rollback:** sumber tetap immutable/read-only saat window rollback. Bila target belum menerima write, pulihkan routing setelah cek delta. Bila target sudah menerima write, hentikan target writes, replay journal/outbox tervalidasi ke sumber, rekonsiliasi file dan pembayaran, **baru** buka sumber. Jika replay belum terbukti, pertahankan target read-only dan rekonsiliasi manual; jangan balik DNS saja.
9. **Finalisasi:** setelah reconciliation/monitoring lulus dan window ditutup, rotate/revoke key lama, arsip backup/source aman, tulis runbook operasi dan incident response.

## K. Final Recommendations

**Jangan cutover produksi sekarang.** Prioritas: tutup privileged API dan eskalasi role/RLS, cocokkan live schema serta source Edge Functions, inventaris/backup Soundpub saja dari host bersama termasuk URL lama, buktikan migrasi auth, Xendit idempotency, restore, rollback. Backend baru wajib mengotorisasi setiap operasi; UI guard bukan security boundary.

**Belum terverifikasi, data tambahan diperlukan:** full sanitized schema-only dump/DDL live per objek (tanpa row sensitif), predicate/grants/default privileges lengkap, function bodies/ACL, exact row counts dan FK/orphan checks, status empat migration untracked, ownership user host, bytes/checksum GCS/Cloud lama, non-secret GoTrue/Keycloak settings, konfigurasi callback provider, backup off-host dan restore, exposure firewall/CSP, RTO/RPO. Akses DB metadata read-only tersedia; batasnya kelengkapan DDL dan atribusi data, bukan tidak adanya akses. Tidak ada secret disertakan.

**State kerja:** lima file modified dan sepuluh untracked sudah ada sebelum audit, termasuk `.env copy`, empat migration dan SQL tests; semuanya tetap utuh. Audit membedakan fakta source, fakta live, inferensi risiko. Tidak ada migration, endpoint mutatif, test SQL atau perubahan server.

## Appendix 1 — Inventory file UI (pelengkap B)

| Area | File yang memakai client/API Supabase |
|---|---|
| Pages copyright | `src/pages/CopyrightAnalytics.tsx`, `src/pages/CopyrightDashboard.tsx`, `src/pages/CopyrightOnboarding.tsx`, `src/pages/CopyrightRegistrationForm.tsx`, `src/pages/CopyrightRegistrationReview.tsx`, `src/pages/CopyrightRegistrationStatus.tsx`, `src/pages/CopyrightRoyaltySummary.tsx`, `src/pages/CopyrightRoyaltyUpload.tsx`, `src/pages/CopyrightRoyaltyUploadHistory.tsx` |
| Pages auth | `src/pages/Auth.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/IccnIframeAuth.tsx`, `src/pages/ImpersonationCallback.tsx`, `src/pages/ResetPassword.tsx`, `src/pages/VerifyEmail.tsx`, `src/pages/VerifyEmailRequired.tsx` |
| Pages bisnis A–M | `src/pages/AdminPayouts.tsx`, `src/pages/ArtistDeletionRequests.tsx`, `src/pages/ArtistProfile.tsx`, `src/pages/AuditLogs.tsx`, `src/pages/ComposerRoyalties.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Export.tsx`, `src/pages/Invoices.tsx`, `src/pages/LandingPage.tsx`, `src/pages/MediaLibrary.tsx`, `src/pages/MyArtists.tsx` |
| Pages bisnis N–Z | `src/pages/NotificationManagement.tsx`, `src/pages/Payouts.tsx`, `src/pages/ReleaseDetail.tsx`, `src/pages/ReleaseEdit.tsx`, `src/pages/Releases.tsx`, `src/pages/Royalties.tsx`, `src/pages/Settings.tsx`, `src/pages/Takedown.tsx`, `src/pages/TakedownDetail.tsx`, `src/pages/Tracks.tsx`, `src/pages/UploadRoyalty.tsx`, `src/pages/UserOrphanAudit.tsx`, `src/pages/Users.tsx`, `src/pages/WhitelabelDashboard.tsx` |
| Komponen release/user/settings | Seluruh file bernama pada daftar B; `src/components/notifications/AnnouncementDialog.tsx`, `src/components/notifications/NotificationBell.tsx`, `src/components/notifications/NotificationCenter.tsx`, `src/components/analytics/GA4Provider.tsx`, `src/components/onboarding/ArtistOnboardingDialog.tsx`, `src/components/auth/AuthEnvironmentNotice.tsx`, `src/components/layout/AppSidebar.tsx`, `src/components/layout/DashboardLayout.tsx`, `src/components/royalty/ComposerRoyaltyUpload.tsx` |
