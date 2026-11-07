# Supabase to Independent Backend Parity Master Plan

Snapshot: 2026-11-07, Asia/Bangkok.

## 1. Tujuan

Menyempurnakan backend mandiri SoundPub sampai memberikan perilaku bisnis setara sistem Supabase production, tanpa menjadikan Supabase dependency runtime dan tanpa menyalin kelemahan keamanannya.

Supabase production menjadi behavioral reference untuk:

- model data, relasi, constraint, dan default;
- ownership dan historical ownership;
- trigger dan perubahan state otomatis;
- RPC dan Edge Function;
- validasi dan lifecycle upload;
- perhitungan royalti, ledger, saldo, dan payout;
- permission setiap role;
- kontrak data frontend.

Target akhir:

```text
Frontend SoundPub
  -> /api/v1 backend mandiri
  -> PostgreSQL mandiri
  -> private object storage
  -> worker/outbox
  -> provider eksternal melalui adapter
```

Frontend tidak lagi bergantung pada Supabase Auth, PostgREST, Storage API, RPC, atau Edge Functions.

## 2. Batas keselamatan

- Production Supabase hanya dibaca melalui audit yang disetujui.
- Jangan memperbaiki, deploy, restart, recreate, atau memigrasikan production selama pekerjaan parity.
- Jangan menyalin secret, token, signed URL, password/hash, session, refresh token, atau PII mentah.
- Implementasi dan pengujian memakai data sintetis serta Docker terisolasi `dashboard-sounpub-dev`.
- Direktori `backups/` tetap read-only dan bukan sumber data otomatis.
- Perubahan production memerlukan maintenance plan, backup, rollback, dan persetujuan terpisah.

## 3. Definisi parity

Parity bukan menyalin source Supabase baris per baris. Parity berarti input bisnis sama menghasilkan output, permission, dan perubahan state sama, kecuali perilaku lama tidak aman atau tidak konsisten.

| Status | Arti |
| --- | --- |
| `UNMAPPED` | Belum dipetakan dari Supabase |
| `MAPPED` | Source dan aturan lama sudah dipahami |
| `PARTIAL` | Backend memiliki sebagian perilaku |
| `IMPLEMENTED` | Backend memenuhi kontrak target |
| `VERIFIED` | Compatibility, authorization, dan reconciliation test lulus |
| `DEFERRED` | Ditunda dengan alasan dan dependency jelas |
| `REJECTED` | Tidak disalin karena tidak aman atau tidak relevan |

Status PASS pada dokumen Label Custom membuktikan kontrak lokal. Status tersebut belum otomatis membuktikan parity production sampai compatibility matrix lulus.

## 4. Prinsip desain

1. **Satu write authority.** Satu domain hanya memiliki satu penulis aktif.
2. **Authorization server-side.** Frontend bukan enforcement permission.
3. **Historical ownership immutable.** Perubahan parent tidak memindahkan royalti lama.
4. **Ledger immutable.** Saldo merupakan projection, bukan sumber kebenaran.
5. **Upload dua tahap.** File melewati parse, validate, preview, approve, commit, dan reconcile.
6. **Idempotency wajib.** Upload, ledger, webhook, invoice, payout, email, dan worker aman terhadap replay.
7. **Security-safe parity.** Business behavior disamakan, kelemahan lama ditolak.

Perilaku yang tidak disalin:

- anonymous privileged RPC;
- service-role endpoint tanpa autentikasi;
- master audio publik;
- role escalation;
- reset token plaintext;
- cross-tenant storage access;
- exception detail mentah;
- query grammar dari input caller.

## 5. Arsitektur target

| Modul | Tanggung jawab |
| --- | --- |
| `auth` | Identity, session, password, Keycloak partner, local auth utama |
| `users` | Lifecycle user, role, status, password administration |
| `labels` | Label dan whitelabel ownership |
| `label-custom` | PIC, unit, managed artist tanpa login, agregasi finansial PIC |
| `artists` | Artist identity, parent relationship, archive lifecycle |
| `releases` | Release metadata, workflow, ownership snapshot |
| `tracks` | Track metadata, ISRC, composer, audio relationship |
| `media` | Private object, upload intent, completion, capability, cleanup |
| `royalty-imports` | File, parser, validation, matching, approval, commit |
| `royalties` | Detail royalty, attribution, reporting, export |
| `finance` | Immutable ledger, balance projection, reconciliation |
| `payouts` | Eligibility, reservation, approval, settlement, failure |
| `payments` | Invoice, webhook, idempotency, provider reconciliation |
| `notifications` | Outbox-driven notification dan delivery status |
| `worker` | Parsing, posting, cleanup, email, provider retry |

```text
HTTP route
  -> contract validation
  -> authorization policy
  -> domain service
  -> repository/provider port
  -> PostgreSQL transaction
  -> outbox
  -> worker/provider adapter
```

## 6. Role dan permission

Role canonical: `superadmin`, `admin`, `whitelabel`, `label`, `label_custom`, `artist`.

- `superadmin`: seluruh administrasi, termasuk privileged role management.
- `admin`: operasi bisnis harian; tidak dapat mengelola superadmin.
- `whitelabel`: tenant owner dengan branding, label, dan artist dalam scope tenant.
- `label`: mengelola artist login di bawah labelnya.
- `label_custom`: PIC mengelola managed artist tanpa login; saldo dan payout milik PIC.
- `artist`: account individual, hanya resource sendiri.

| Kemampuan | Superadmin | Admin | Whitelabel | Label | Label Custom | Artist |
| --- | --- | --- | --- | --- | --- | --- |
| Kelola seluruh user | Ya | Terbatas | Tenant | Tidak | Tidak | Tidak |
| Kelola superadmin | Ya, dengan guard | Tidak | Tidak | Tidak | Tidak | Tidak |
| Buat artist login | Ya | Ya | Tenant | Label | Tidak | Tidak |
| Buat managed artist | Ya | Ya | Jika diizinkan | Tidak | Unit | Tidak |
| Edit artist | Semua sesuai guard | Non-privileged | Tenant | Label | Unit | Profil terbatas |
| Kelola release/track | Semua | Semua | Tenant | Label | Unit | Milik sendiri |
| Upload royalty file | Ya | Ya | Opsional | Tidak | Tidak | Tidak |
| Lihat royalty | Semua | Semua | Tenant | Label | Unit | Milik sendiri |
| Adjustment ledger | Ya | Approval terbatas | Tidak | Tidak | Tidak | Tidak |
| Request payout | Administratif | Review | Wallet tenant | Wallet label | Wallet PIC | Wallet artist |

Setiap endpoint wajib memiliki test positif, forbidden, cross-tenant IDOR, archived resource, dan role escalation.

## 7. Historical ownership

Setiap royalty detail menyimpan snapshot:

- `track_id` dan `release_id` canonical;
- `artist_id` pada saat attribution;
- `label_id` atau unit owner pada saat attribution;
- `financial_owner_user_id`;
- `ownership_type`;
- source period dan ingestion batch;
- currency dan nilai original;
- calculation policy version.

Aturan:

1. Artist login mengikuti kontrak yang berlaku pada effective period.
2. Label dapat melihat laporan per artist; wallet mengikuti policy pembagian.
3. Label Custom memakai artist sebagai dimensi laporan; ledger dan payout menuju PIC.
4. Perubahan parent setelah import tidak mengubah snapshot lama.
5. Koreksi memakai reversal dan replacement event.
6. Row tanpa snapshot masuk reconciliation queue, tidak ditebak otomatis.

## 8. Sistem pembagian royalti

Semua uang disimpan sebagai integer minor unit. Nilai sumber tetap disimpan agar perhitungan dapat direkonstruksi.

Komponen canonical:

```text
source_gross
source_tax_or_withholding
source_fee
net_distributable
platform_share
label_share
artist_share
composer_share
adjustment
rounding_delta
```

Formula memakai calculation policy berversi:

- effective date range;
- role/contract scope;
- percentage atau fixed rule;
- rounding dan currency rule;
- minimum threshold;
- approval metadata.

Royalty detail menyimpan policy dan hasil tiap komponen. Policy baru tidak mengubah periode lama tanpa recalculation workflow resmi.

Rounding rules:

- integer minor unit;
- titik pembulatan ditentukan policy;
- selisih dicatat sebagai `rounding_delta`;
- jumlah komponen harus sama dengan distributable total;
- reconciliation gagal bila delta melewati batas.

## 9. Royalty upload pipeline

State machine:

```text
created -> uploaded -> parsing -> parsed -> validating
-> needs_mapping | ready_for_review | rejected
-> approved -> committing -> committed -> reconciled

Failure:
upload_failed, parse_failed, validation_failed, commit_failed,
reconciliation_failed, cancelled
```

Tahapan:

1. Admin membuat import session dan memilih provider/template.
2. Backend menerbitkan private upload intent dengan size, MIME, checksum, dan expiry.
3. Client upload ke object storage private.
4. Completion endpoint memverifikasi metadata dan checksum.
5. Worker membaca file secara streaming.
6. Parser menormalisasi header, period, currency, ISRC, UPC, territory, DSP, quantity, dan amount.
7. Validator membedakan fatal error, row error, warning, dan unmapped row.
8. Matcher mencari track/release canonical; ISRC/UPC hanya lookup key.
9. Ownership resolver menghasilkan artist dan financial owner snapshot.
10. Calculation engine menghitung split dengan policy berversi.
11. Preview menampilkan total, matched, unmatched, duplicate, invalid, dan delta.
12. Admin menyetujui batch dengan optimistic version.
13. Commit membuat royalty detail, ledger event, audit event, dan outbox dalam transaction boundary.
14. Reconciliation membandingkan source, accepted, rejected, ledger, dan balance delta.

Deduplikasi file memakai minimal `provider + report_type + period + source_file_checksum`.

CSV dan XLSX memakai adapter terpisah. Parser menghasilkan canonical row contract. Unknown header masuk diagnostics. File sumber private dan memiliki retention policy.

## 10. Data model target

| Entitas | Fungsi |
| --- | --- |
| `royalty_imports` | Batch, source, period, checksum, state |
| `royalty_import_files` | Private object metadata dan retention |
| `royalty_import_rows` | Canonical row, diagnostics, fingerprint |
| `royalty_import_matches` | Track/release/artist/owner resolution |
| `royalty_calculation_policies` | Formula berversi |
| `royalty_details` | Accepted result immutable |
| `royalty_corrections` | Reversal dan replacement relationship |
| `ledger_events` | Financial source of truth |
| `balance_projections` | Read model per financial owner |
| `payout_reservations` | Dana terkunci |
| `payout_allocations` | Ledger event yang dibayar |
| `reconciliation_runs` | Bukti konsistensi batch dan wallet |

Entitas existing diperluas; jangan membuat model paralel tanpa kebutuhan.

## 11. API target

### 11.1 Import administrasi

```text
POST   /api/v1/admin/royalty-imports
POST   /api/v1/admin/royalty-imports/:id/upload-intent
POST   /api/v1/admin/royalty-imports/:id/complete-upload
GET    /api/v1/admin/royalty-imports/:id
GET    /api/v1/admin/royalty-imports/:id/rows
GET    /api/v1/admin/royalty-imports/:id/preview
POST   /api/v1/admin/royalty-imports/:id/reprocess
POST   /api/v1/admin/royalty-imports/:id/approve
POST   /api/v1/admin/royalty-imports/:id/commit
POST   /api/v1/admin/royalty-imports/:id/cancel
GET    /api/v1/admin/royalty-imports/:id/reconciliation
```

### 11.2 Pelaporan

```text
GET /api/v1/royalties/summary
GET /api/v1/royalties/breakdown
GET /api/v1/royalties/releases/:releaseId
GET /api/v1/royalties/tracks/:trackId
GET /api/v1/royalties/periods
GET /api/v1/royalties/export
```

Scope diturunkan dari principal. Query `artist_id`, `label_id`, atau owner ID tidak memberi akses di luar scope actor.

### 11.3 Finance dan payout

```text
GET  /api/v1/balance
GET  /api/v1/ledger
GET  /api/v1/payouts/eligibility
POST /api/v1/payouts
GET  /api/v1/payouts
GET  /api/v1/payouts/:id
POST /api/v1/payouts/:id/cancel

POST /api/v1/admin/payouts/:id/approve
POST /api/v1/admin/payouts/:id/reject
POST /api/v1/admin/payouts/:id/mark-processing
POST /api/v1/admin/payouts/:id/settle
POST /api/v1/admin/payouts/:id/fail
```

## 12. Payout invariants

- Available balance = posted credits - posted debits - active reservations.
- Request payout dan reservation dibuat atomik.
- Label Custom payout selalu dimiliki PIC; request tidak menerima artist recipient.
- Settlement membuat allocation terhadap ledger event yang dibayar.
- Failure dan cancellation melepaskan reservation secara idempotent.
- State tidak dapat dilompati tanpa transition resmi.
- Provider callback tidak boleh menyelesaikan payout dua kali.
- Manual adjustment memerlukan reason, actor, approval, dan audit event.

## 13. Audit dan observability

Setiap operasi sensitif mencatat actor, effective actor, role, tenant scope, resource, action, state tersanitasi, idempotency key, correlation ID, timestamp, dan result.

Jangan mencatat password, reset token, authorization header, signed URL, raw payment payload, atau isi penuh file royalty.

Metrics minimum:

- import duration dan row throughput;
- unmatched, invalid, dan duplicate count;
- reconciliation delta;
- ledger posting failures;
- worker retry dan dead-letter count;
- payout reservation age;
- provider webhook replay;
- authorization denials.

## 14. Rencana pengembangan bertahap

### Phase 0 - Freeze dan inventory parity

Deliverable:

- inventory tabel, view, trigger, RPC, Edge Function, bucket, dan frontend call;
- compatibility matrix Supabase -> backend;
- sample kontrak yang telah disanitasi;
- daftar perilaku `REJECTED` karena tidak aman;
- dependency graph domain.

Gate: seluruh capability production memiliki owner module dan disposition; seluruh route frontend terpetakan.

### Phase 1 - Identity, role, dan ownership parity

- Finalisasi principal dan role hierarchy.
- Pisahkan artist login dan managed artist.
- Kunci parent label/unit.
- Tambahkan historical ownership snapshot.
- Terapkan last-superadmin dan privileged target guard.
- Lengkapi cross-tenant authorization tests.

Gate: permission matrix lulus untuk semua role; tidak ada IDOR user, artist, label, release, track, atau media.

### Phase 2 - Release, track, dan media parity

- Samakan field, default, validation, dan workflow state.
- Kunci canonical ownership.
- Lengkapi private audio/artwork upload.
- Lengkapi replacement, archive, cleanup, dan signed capability.
- Pertahankan compatibility DTO frontend.

Gate: create, edit, archive, dan read sama secara fungsional; master asset tidak tersedia dari public catalog.

### Phase 3 - Royalty source contract dan parser framework

- Kumpulkan seluruh template upload yang sah.
- Buat canonical row schema.
- Buat adapter CSV/XLSX per provider.
- Terapkan streaming parser dan diagnostics.
- Terapkan checksum, row fingerprint, dan duplicate detection.

Gate: golden fixture setiap template lulus; malformed, oversized, MIME spoof, duplicate, dan partial row test lulus.

### Phase 4 - Matching dan historical attribution

- Matching ISRC/UPC ke ID canonical.
- Ambiguity queue.
- Owner snapshot resolver.
- Aturan artist pindah label.
- Aturan Label Custom PIC ownership.
- Orphan/unmatched workflow.

Gate: dataset historis sintetis dapat direkonsiliasi; parent change tidak memindahkan royalti lama.

### Phase 5 - Calculation dan split engine

- Dokumentasikan formula production.
- Tambahkan calculation policy versioning.
- Gunakan integer minor units dan rounding eksplisit.
- Hitung fee, tax, label, artist, composer, dan adjustment.
- Tambahkan reversal/recalculation workflow.

Gate: golden calculation fixtures lulus sampai minor unit; jumlah komponen sama dengan distributable total.

### Phase 6 - Commit, ledger, dan reconciliation

- Atomic import commit.
- Immutable royalty detail.
- Ledger posting dan balance projection.
- Outbox event.
- Batch reconciliation.
- Repair command menghasilkan plan sebelum apply.

Gate: source total, accepted/rejected total, ledger posting, dan wallet balance konsisten; replay tidak mengubah hasil.

### Implemented checkpoint - 2026-11-04

- Phase 3 inline CSV parser, strict production ISRC shape, authoritative ISRC/UPC matcher, preview checksum, and API routes are verified.
- Phase 4 snapshots stable artist, release label, ISRC, UPC, policy, and statement dimensions; historical artist drift fails closed while release-label ownership survives artist transfer.
- Phase 5 production 70/21/9 row split writes immutable ARTIST, LABEL, and SOUNDPUB allocations. Label Custom artist+label components aggregate to PIC; SoundPub never enters user wallet.
- Phase 6 inline CSV commit is atomic across batch, entries, allocations, ledger, audit, and outbox. Replay, stale preview, active source-period conflict, exact correction reversal, reporting, and readiness all use allocations.
- Phase 9 royalty upload cutover is complete for backend mode: raw CSV preview, server diagnostics, checksum-bound commit, history, and allocation detail no longer write through Supabase. API errors preserve backend code, message, and request ID.
- Private royalty upload records now use signed RustFS PUT, verified UTF-8/checksum promotion, durable status/progress/lease fields, admin history/detail, and short-lived download capabilities.
- Worker claims import sessions with expiring leases, rechecks requester authority, stores server preview diagnostics, retries transient failures, and session commit rereads the private file before checksum-bound atomic financial commit. Backend-mode frontend now uses this file-session flow.
- Private-file preview now reads object bytes as an async stream, parses quoted CSV across UTF-8/chunk boundaries, matches and stages immutable catalog/owner/split snapshots in 1.000-row transactions, heartbeats the lease per chunk, caps retained issues, and records exact progress through 100.000 rows.
- Private-file commit now locks the session and global import domain, revalidates staged counts/totals/policy, bulk-inserts entries and component allocations with set-based SQL, posts ledger/audit/outbox effects, and finalizes ordinary imports or replacements in the same transaction. A 1.200-row disposable-PostgreSQL test proves the path exceeds the old 1.000-row limit and rolls back fully on outbox failure.
- Staged rows are frozen outside an active parse/cleanup lease and bound to the preview through per-row plus aggregate checksums. Commit revalidates active catalog/payee ownership, isolates requester recovery, and uses one deferred batch-level allocation invariant with closed-batch append guards. The final 100.000-row gate writes 100.000 entries and 300.000 allocations in 110,5 seconds on disposable PostgreSQL.
- Role-scoped royalty report and period APIs now enforce admin-global, label/Whitelabel roster, artist-owner, and Label Custom PIC boundaries. Backend Royalti UI uses these APIs for filtering, pagination, totals, and CSV export without Supabase fallback.
- Whitelabel backend mode owns dashboard metrics, managed artist creation without credentials, subscription-gated first login activation, and roster access state. Ownership is revalidated from current database state and case-insensitive email uniqueness is enforced in PostgreSQL.
- Maintenance mode now has a global backend gate with explicit health, authentication, public catalog/settings/media, CORS preflight, and signed webhook exceptions. Active admin/superadmin accounts retain recovery access; other protected requests receive a stable 503 contract and the frontend preserves the current session.
- Expired pending/failed royalty objects now enter a leased CLEANING state, delete both staging and immutable object keys idempotently, retry transient storage failures, and preserve preview-ready/committed originals.
- Browser upload hashing now processes 4 MB slices through incremental SHA-256, and immutable batch detail is server-paginated with stable source-row ordering and bounded `limit`/`offset`. Backend, frontend contract, TypeScript, and production-build checks pass.
- Royalty reconciliation now records append-only server snapshots and diagnostics, requires a different active admin from the uploader, writes through a separate `soundpub_reconciler` database credential, binds every result to semantic audit/outbox evidence, rechecks current ledger integrity before UI/balance/payout use, derives `RECONCILED` without mutating batches, and gates ordinary plus Label Custom payout readiness. DB guards reject cross-entry allocation drift, late batch fill, forged approval evidence, and correction rows without exact earning plus adjustment finance proof.
- Remaining Phase 3/6 scope: staged preview review UI, superadmin session takeover, repair approval workflow, and optional explicit approval revocation. Scheduled global reconciliation is implemented as immutable read-only evidence with advisory locking, bounded findings, deterministic checksums, and admin history API. Import and replacement share private signed file sessions; inline replacement remains compatibility-only.

### Phase 7 - Reporting dan permission parity

- Summary, period, release, track, dan artist breakdown.
- Role-scoped export.
- Label Custom mendapat internal artist report dan PIC wallet.
- Admin mendapat global view.
- Frontend menangani loading, empty, forbidden, archived, dan retry states.

Gate: setiap role hanya melihat scope sah; total summary sama dengan detail pada filter sama.

### Phase 8 - Payout parity

- Eligibility dan minimum payout.
- Destination verification.
- Reservation atomik.
- Approval state machine.
- Settlement, failure, dan cancellation.
- Allocation dan payout reconciliation.

Gate: concurrent payout tidak menyebabkan double spend; failure/cancel melepaskan reservation tepat sekali.

### Phase 9 - Frontend cutover per domain

Urutan:

1. read-only settings/catalog;
2. user/artist/label;
3. release/track/media;
4. royalty reporting;
5. royalty import admin;
6. balance/payout;
7. notification/payment integration.

Setiap cutover memerlukan feature flag, rollback route, telemetry, dan satu write authority.

### Phase 10 - Full verification

- Unit, integration, authorization, concurrency, worker, storage, dan E2E.
- Migration rehearsal pada data sintetis.
- Backup/restore rehearsal dev.
- Frontend build dan browser workflow.
- Performance test file besar.
- Security regression.

Gate:

- `npm run typecheck` lulus;
- backend full test lulus;
- frontend build lulus;
- E2E role matrix lulus;
- reconciliation tidak memiliki unexplained delta;
- tidak ada direct frontend Supabase call pada domain yang selesai cutover.

### Phase 11 - Production rollout design

Belum mengeksekusi deployment. Deliverable hanya data migration order, identity mapping, dry-run report, downtime/read-only window, rollback boundary, verification queries, incident contacts, dan stop conditions.

## 15. Strategi test

### 15.1 Compatibility tests

Gunakan fixture input sama untuk membandingkan reference behavior tersanitasi dengan backend mandiri. Bandingkan state transition, normalized DTO, calculation, ownership resolution, error class, dan side effect database.

### 15.2 Authorization tests

Untuk setiap route uji unauthenticated, role tidak cukup, resource sendiri, tenant lain, archived actor, target privileged, guessed UUID, dan impersonation context bila berlaku.

### 15.3 Financial tests

- Exact minor-unit arithmetic.
- Concurrent import commit.
- Duplicate file dan duplicate row.
- Replay worker dan webhook.
- Adjustment reversal.
- Concurrent payout.
- Reconciliation after failure injection.

### 15.4 Performance targets awal

- File 100 ribu row diproses streaming.
- Memory tidak bertambah linear tanpa batas.
- Progress dapat dipantau.
- Worker dapat resume setelah crash.
- Query reporting memiliki index plan stabil.

## 16. Urutan migration data masa depan

Rancangan urutan, belum untuk dijalankan:

1. role dan identity map;
2. profiles, labels, units, artists;
3. releases dan tracks;
4. media metadata tanpa menyalin signed URL;
5. calculation policies;
6. royalty import history dan details;
7. ledger events dan balance reconstruction;
8. payout dan allocation;
9. audit metadata yang aman;
10. reconciliation dan exception queue.

Session dan refresh token lama tidak dimigrasikan. Pengguna melakukan autentikasi ulang.

## 17. Definition of done

Backend parity selesai hanya jika:

- seluruh capability berstatus `VERIFIED`, `DEFERRED`, atau `REJECTED` dengan alasan;
- frontend tidak membutuhkan Supabase untuk domain yang dicutover;
- seluruh role dan tenant scope memiliki evidence test;
- royalti dapat ditelusuri dari source row sampai payout allocation;
- setiap angka summary dapat direkonsiliasi ke detail dan ledger;
- replay tidak membuat duplicate financial effect;
- Label Custom memiliki managed artist tanpa login, laporan per artist, dan wallet PIC-only;
- restore dev dan migration rehearsal berhasil;
- tidak ada unexplained financial delta;
- production rollout memiliki rollback yang telah diuji secara terisolasi.

## 18. Prioritas implementasi langsung

1. Buat parity inventory dan capability matrix.
2. Audit khusus royalty production: parser, formula, ownership, permission, dan upload lifecycle.
3. Kunci golden fixtures dan calculation examples.
4. Perbaiki model import dan historical attribution backend.
5. Implementasikan calculation policy versioning.
6. Hubungkan import commit ke ledger dan reconciliation atomik.
7. Lengkapi reporting per role.
8. Uji payout terhadap ledger hasil import.
9. Jalankan full dev E2E pada `dashboard-sounpub-dev`.
10. Susun migration dan production rollout plan terpisah.

## 19. Copyright royalty checkpoint

- Admin dan superadmin dapat mengirim batch komposer ke `POST /api/v1/copyright/royalties/preview`.
- Backend memvalidasi kontrak ketat, kode komposer unik, period IDR, aritmetika exact minor-unit, dan beneficiary mapping versioned tanpa write finansial.
- Frontend backend-mode membaca CSV terstruktur, menolak format ambigu, dan menampilkan hasil normalisasi serta total tanpa Supabase fallback.
- Preview selalu read-only dan `UNRECONCILED`; `posting_allowed=true` hanya ketika seluruh kode komposer memiliki mapping beneficiary aktif untuk period batch.
- Posting memakai policy `LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1`: nilai final legacy dialokasikan 100% ke beneficiary hasil mapping tanpa mengarang work split yang tidak ada di production.
- Import source/batch/period idempotent, payload berbeda konflik, batch dan entry immutable, ledger exact minor-unit, dan audit/outbox berada dalam transaksi yang sama.
- Koreksi membalik penuh semua beneficiary secara append-only. Rekonsiliasi membutuhkan admin independen dari uploader dan mengikat snapshot checksum, issue list, audit, serta outbox.
- Frontend backend-mode menyediakan preview/posting, history/detail, status corrected/reconciled, mapping administration, own-role royalty history, koreksi, dan rekonsiliasi tanpa fallback Supabase.

## 20. Takedown checkpoint

- Backend memiliki schema request, item release/track, DSP target, history, dokumen privat, immutable ownership/snapshot, request code, TOR checksum, dan active-scope uniqueness.
- Submission memakai idempotency key dan satu transaksi untuk request, item, expanded DSP targets, initial history, audit, serta outbox. Actor, label, snapshot, timestamp, dan priority ditentukan server.
- `partial` wajib memilih track valid dalam release. `Semua DSP` hanya input convenience dan selalu diperluas server menjadi registry DSP konkret.
- Reviewer memakai transition matrix dan optimistic version. `COMPLETED`, `REJECTED`, dan `CANCELLED` terminal. Requester hanya dapat meminta pembatalan; admin menyetujui menjadi `CANCELLED`.
- Target DSP memakai transition matrix sendiri. Status aggregate request dihitung server dari seluruh target, bukan dikirim browser.
- Dokumen memakai media pipeline private yang sama: PDF/image allowlist, batas 10 MiB, checksum dan signature validation, attachment metadata atomik saat completion, serta signed download berotorisasi.
- Frontend backend-mode memiliki list, submission, partial-track selection, contact snapshot, multi-DSP progress, reviewer actions, cancellation, document upload/download, dan timeline tanpa Supabase fallback.
- PostgreSQL disposable integration membuktikan scope label/artist/admin, IDOR denial, exact replay, changed-payload conflict, duplicate active scope, transition sequence, DSP aggregation, cancellation, document attachment, audit, dan outbox.

## 21. Copyright registration checkpoint

- Backend memiliki aggregate pemohon, karya, pembayaran, status history, kontrak, dan dokumen private dengan optimistic version serta satu registrasi per owner.
- Draft replacement atomik. Submit memvalidasi identitas, bank, minimal satu karya, bukti identitas, bukti karya, dan terms version/checksum sebelum membuat payment intent.
- Invoice hanya dapat dibuat owner saat `AWAITING_PAYMENT`; amount/currency ditentukan server. Mock provider hanya aktif di development/test dan callback memakai exact raw-body HMAC, freshness window, event replay guard, audit, outbox, dan receipt append-only.
- Review admin tidak dapat melewati payment gate. Transisi review dan kontrak memakai state machine eksplisit, version check, catatan wajib untuk revisi/reject/void, serta artifact type yang terikat ke registrasi.
- Nomor kontrak memakai advisory lock bulanan. Generated, stamped, dan signed memakai private media artifact terverifikasi; activation menambahkan role copyright secara idempotent.
- Frontend backend-mode memiliki onboarding, draft, private upload, submit, invoice request, status, admin list/detail, review, artifact download/upload, dan contract lifecycle tanpa Supabase/PDF service fallback.
- Migration `0052`-`0054` hanya diterapkan pada `dashboard-sounpub-dev`. Full Docker suite: 379 tests, 373 pass, 0 fail, 6 skipped. Production payment dan stamping provider tetap deferred.

## 22. Release review, Label Custom submission, auth lifecycle, dan copyright dashboard checkpoint

- Admin release activation memakai satu transaksi untuk mengunci release, memverifikasi status `processing`, optimistic release/track version, exact complete track set, UPC/ISRC normalization, domain-wide uniqueness, track updates, release activation, dan audit evidence.
- Backend activation dan rejection modal tidak lagi bergantung pada Supabase. Rejection menyimpan alasan wajib; activation mengirim UPC dan seluruh ISRC melalui endpoint admin khusus.
- Label Custom PIC dapat mengirim release milik managed artist tanpa akun login. Canonical artist, current custom unit authority, PIC status, dan cross-unit denial divalidasi ulang di transaksi; ordinary artist-login behavior tidak berubah.
- Email verification dan password recovery memakai token digest-only pada tabel auth, TTL purpose-bound, one-time row lock, atomic audit/outbox, password reset yang mencabut seluruh session, serta response request generik.
- Token delivery tidak disimpan plaintext pada outbox. AES-256-GCM envelope dibuka hanya oleh worker, lalu ciphertext, IV, dan tag dihapus dalam transaksi delivery sukses. `AUTH_DELIVERY_SECRET` diwajibkan pada konfigurasi dev.
- Copyright Dashboard backend memuat registration, contract capability, seluruh halaman royalty, dan bereaksi terhadap pergantian identity. Legacy Supabase dashboard dipisahkan menjadi lazy chunk dan tidak dimuat pada backend branch.
- Migration `0055` dan `0056` hanya diterapkan pada project Docker `dashboard-sounpub-dev`. API `3300`, frontend `8281`, PostgreSQL `55433`, object storage `9100`, backend, frontend, dan worker sehat. Production port `8181` tidak disentuh.
- Full Docker suite setelah checkpoint: 385 tests, 379 pass, 0 fail, 6 skipped. Frontend contracts, TypeScript, build, backend typecheck, security isolation, dan Docker config lulus.
- Remaining P2: runtime frontend egress test, browser role E2E, dan real email/provider integration. Copyright dashboard server-side summary, PostgreSQL shared limiter, dan auth delivery key-ring sudah tersedia.

## 23. Payment ownership checkpoint

- Invoice release menyimpan `payer_owner_id`, `financial_owner_id`, `artist_id`, dan `ownership_policy` dari canonical identity server. Artist login memakai pemilik akun artist; managed artist Label Custom memakai PIC unit, tanpa membuat akun login artist.
- Snapshot ownership tidak dapat diubah setelah insert, termasuk melalui owner SQL biasa. Constraint menyamakan payer dan financial owner untuk kedua policy yang didukung. Browser tidak dapat mengirim owner, amount, currency, atau status.
- Creation, status, callback, dan refund menggunakan urutan lock owner/authority, release, lalu invoice. Callback membandingkan empat field snapshot dan mencatat mismatch untuk manual reconciliation tanpa memindahkan charge.
- Exact invoice replay memvalidasi snapshot; callback/refund ledger selalu memakai financial owner snapshot. Cross-unit access ditolak server, bukan hanya disembunyikan UI.
- Frontend backend-mode membuka invoice backend melalui `Kelola pembayaran`; tidak memanggil Xendit/Supabase legacy pada jalur tersebut. Provider tetap mock dan belum siap pembayaran uang nyata.
- Migration `0057` hanya membackfill invoice login artist dengan canonical owner yang sama dengan legacy release owner dan seluruh historical payment ledger evidence. Data ambigu menghentikan seluruh migration transaction; tidak ada inferensi owner atau penghapusan invoice.
- Sebelum upgrade, jalankan read-only `backend/scripts/payment-owner-preflight.sql` dengan `psql -X -v ON_ERROR_STOP=1` pada database dev terisolasi. `blocked_count` harus nol. Jika tidak, hentikan deployment dan susun pemetaan berbukti; jangan bypass guard atau drop invoice.
- Preflight dev pada 2026-11-06: 0 invoice, 0 blocked. Populated upgrade test sintetis membuktikan canonical backfill dan rollback untuk unresolved release serta charge/refund historical owner mismatch; hasil database kosong sendiri tidak membuktikan populated upgrade.

## 24. Auth delivery evidence checkpoint

- Worker memakai handler auth yang dapat diuji langsung; perilaku delivery tetap sama. Hanya adapter email menerima plaintext token; ciphertext, IV, dan tag tidak diteruskan ke adapter.
- PostgreSQL test membuktikan provider failure mempertahankan envelope terenkripsi dan me-rollback effect guard; error tersimpan tetap generik. Delivery sukses menghapus envelope dalam transaksi status processed. Replay event tidak mengirim email ulang atau membuka token yang telah dihapus.
- Email provider masih mock. Keberhasilan test ini bukan bukti email telah terkirim ke inbox nyata.

## 25. Copyright dashboard summary checkpoint

- `GET /api/v1/copyright/royalties/summary` menghitung total dan count per beneficiary serta period di PostgreSQL memakai minor-unit exact, tanpa menarik seluruh halaman history ke browser.
- Scope dan verified role mengikuti list royalti copyright; tidak menerima owner override dari query string. Authz, HTTP/OpenAPI, fixture PostgreSQL termasuk corrected history, dan frontend contract diverifikasi.
- Dashboard backend meminta satu summary server dan tetap memisahkan legacy Supabase module menjadi lazy chunk; runtime browser egress dan role-matrix E2E masih belum dibuktikan.
- Final Docker-enabled backend suite checkpoint: 395 tests, 389 pass, 0 fail, 6 skipped. Enam skip adalah suites yang memiliki gate lingkungan/rehearsal terpisah, bukan failure tersembunyi.

## 26. Shared rate limiter checkpoint

- Migration `0058` menyimpan counter window satu menit di PostgreSQL dev, keyed SHA-256 dari route dan alamat klien, tanpa menyimpan IP mentah. Semua instance backend memakai atomic UPSERT, dan window kedaluwarsa dibersihkan berkala.
- Auth login, verification, dan recovery tetap memiliki batas 10 request per route per address per menit; webhooks, admin, storage, dan API lain mempertahankan policy sebelumnya. Kegagalan database fail closed, bukan mengizinkan bypass.
- Test dua instance paralel membuktikan hanya 10 dari 12 request auth diterima, isolation lintas route/address, reset window, cleanup, dan database unavailable. Docker-enabled suite: 398 tests, 392 pass, 0 fail, 6 skipped.
- Sebelum exposure publik, definisikan trusted-proxy chain; `request.ip` sekarang memakai peer address default Fastify sehingga header `X-Forwarded-For` tidak dipercaya otomatis.

## 27. Auth delivery key-ring checkpoint

- Envelope baru memuat `token_key_id`; worker memakai hanya secret dengan ID yang tepat. Envelope lama tanpa ID memakai key `legacy`, tanpa brute-force semua key. Handler menghapus ciphertext, IV, tag, dan key ID setelah delivery sukses.
- `AUTH_DELIVERY_SECRET` tetap active secret. `AUTH_DELIVERY_KEY_ID` opsional, default `legacy`; `AUTH_DELIVERY_PREVIOUS_KEYS_JSON` opsional untuk secret lama yang masih diperlukan oleh pending outbox, tidak pernah di-commit atau dicetak.
- Untuk rotasi kelak: simpan active secret lama sebagai key `legacy` (atau ID active sebelumnya) di previous keys, set active key ID baru dan secret baru secara serentak pada backend+worker, deploy project dev terisolasi, verifikasi pending outbox terkirim; hapus previous key hanya setelah seluruh pending/dead-letter terkait diputuskan secara eksplisit. Jangan mengubah file backup atau production.
- Config menolak key ID invalid dan collision active/previous. Unit serta PostgreSQL lifecycle tests memverifikasi kompatibilitas envelope lama/baru. Full Docker-enabled suite: 399 tests, 393 pass, 0 fail, 6 skipped. Dev tidak merotasi secret aktual.

## 28. Frontend backend-auth egress checkpoint

- Browser dev `/auth` pada `127.0.0.1:8281` setelah rebuild hanya Compose service `frontend` (`dashboard-sounpub-dev`): 282 requests, form login render, nol runtime exception, nol Supabase/SSO egress. `npm run test:egress` memakai Chrome headless tanpa kredensial; tes ini mengeklik tombol Google dan partner SSO dalam mode backend tanpa egress; belum mencakup sesi login bercredential atau dashboard role.
- Backend-auth session restore tidak lagi memakai fallback Supabase pada kegagalan backend; frontend tidak melakukan silent SSO check. Tombol partner SSO dan Google saat backend auth aktif memberi pesan belum tersedia, tidak membuat login Supabase. Legacy mode di luar backend-auth tetap terpisah.
- Frontend contracts, `npx tsc --noEmit`, dan `npm run build` lulus. Build memberi peringatan chunk besar; image frontend Docker `dashboard-sounpub-dev` selesai dibangun. Partner Keycloak frontend cutover, browser role-matrix, dan provider nyata masih gap; tidak ada perubahan production.

## 29. Frontend dependency and Zod 4 checkpoint

- `npm audit --omit=dev` pada frontend dev: 0 advisories setelah `postcss-selector-parser` 6.1.5, `source-map-js` 1.2.2, `brace-expansion` 1.1.21/5.0.12, Vite 8.3.6, dan Zod 4.6.7. Resolver formulir ditingkatkan ke `@hookform/resolvers` 5.9.2; halaman auth, lupa sandi, dan reset sandi membaca `ZodError.issues` (bukan `errors`).
- Frontend contracts termasuk resolver Zod 4 valid/invalid, `npx tsc --noEmit`, production build, dan browser dev `/auth` dengan tombol login kosong divalidasi lulus; 283 requests tanpa egress Supabase/SSO, tanpa runtime exception. Hanya service frontend Compose `dashboard-sounpub-dev` yang dibangun ulang.
- Full dev-dependency audit masih melaporkan 7 advisories moderate pada `typescript-eslint`/`minimatch`; jangan gunakan `npm audit fix --force` tanpa evaluasi kompatibilitas lint. `npm run lint` seluruh repo belum lulus: 526 temuan existing, termasuk generated `backend/dist` dan Supabase reference; targeted lint file yang disentuh lulus. Bukti ini tidak menggantikan E2E role, partner SSO, provider nyata, atau audit produksi.

## 30. Keycloak partner token contract checkpoint

- Legacy `supabase/functions/sso-login/index.ts` bukan hanya login label: ia memvalidasi Keycloak client role, lalu mengikat atau membuat akun `artist` di bawah ICCN Media. Backend tidak boleh menganggap token Keycloak sebagai role aplikasi atau otomatis mengikat akun lewat email yang belum diverifikasi; konfigurasi label ICCN dan identitas subject harus dibuktikan sebelum provisioning.
- OIDC bearer adapter kini opsional menegakkan `OIDC_CLIENT_ID`: `azp` harus sama, `resource_access[clientId].roles` harus array nonkosong berisi string valid. Tes signature/JWKS/issuer/audience, salah client/role dan rotasi key lulus. Akun lokal tetap login utama; belum ada endpoint pertukaran code PKCE menjadi sesi lokal, safe subject binding/onboarding ICCN, atau frontend partner cutover.
- `npm run typecheck` backend dan tes OIDC terfokus lulus. `npm test` tanpa Docker: 353 tests, 291 pass, 0 fail, 62 skipped (integrasi/rehearsal belum dijalankan untuk slice ini). Tidak menghubungi realm Keycloak atau server production.

## 31. Partner SSO local-session checkpoint

- `POST /api/v1/auth/partner` menerima hanya JWT-shaped access token, memverifikasi melalui configured OIDC provider, lalu membuat cookie sesi lokal HttpOnly/Strict. Endpoint rate-limited dan maintenance-exempt seperti login; token tidak disimpan ke database dan tidak menjadi source role aplikasi.
- Login hanya berhasil untuk external identity `provider=iccn` yang sudah verified, user aktif dengan tepat role `artist`, artist profile+roster konsisten, parent label cocok `PARTNER_LABEL_ID`, serta label/whitelabel owner aktif dan verified. Unknown subject, unverified binding, wrong label, missing roster, suspended label/user, role escalation, wrong client, dan bad signature fail closed. Endpoint tidak otomatis mengikat email atau membuat akun.
- Disposable PostgreSQL+RS256 E2E dan full Docker suite lulus: 401 tests, 395 pass, 0 fail, 6 skipped. Backend typecheck/build dan isolated Compose config lulus. Dev Compose tetap tidak mengaktifkan partner endpoint karena `PARTNER_LABEL_ID` kosong; tidak ada request ke realm atau server production.
- Sisa parity: admin onboarding/binding ICCN yang eksplisit, frontend PKCE handoff ke endpoint ini, refresh/logout semantics dengan realm nyata, browser E2E, dan keputusan aman untuk legacy auto-provisioning dari email.

## 32. Partner SSO backend PKCE checkpoint

- `POST /api/v1/auth/partner/start` membuat state dan PKCE verifier di backend, memvalidasi redirect `/auth` terhadap exact origin allowlist, lalu menyimpan transaksi AES-256-GCM dalam cookie HttpOnly `SameSite=Lax` selama maksimum 10 menit. Browser hanya menerima authorization URL; verifier tidak berada di JavaScript atau session storage backend-mode.
- Callback `POST /api/v1/auth/partner` menerima hanya code dan state. Backend membuka transaksi cookie, membandingkan state constant-time, menolak expiry/tamper/replay, menukar code pada token endpoint dengan redirect+verifier terikat, membatasi body JSON OIDC 64 KiB, memverifikasi JWT, lalu membuat sesi lokal untuk binding ICCN yang sudah ada. Cookie transaksi selalu dihapus; respons auth memakai `no-store`.
- React StrictMode tidak lagi mengonsumsi verifier dua kali. Callback URL dibersihkan sebelum exchange; disabled feature flag membersihkan callback tanpa realm egress. Logout backend gagal secara fail-closed dan tidak menghapus state UI atau mengalihkan ke Keycloak jika cookie lokal belum berhasil dicabut.
- Evidence: backend focused tests 9/9; disposable partner PostgreSQL 1/1; full Docker suite 403 tests, 397 pass, 0 fail, 6 skipped; frontend contracts, TypeScript dan production build lulus; dev Compose backend/frontend sehat pada `3300`/`8281`; browser `/auth` 283 requests, zero forbidden Supabase/SSO egress. Production Docker/port `8181` tidak disentuh.
- Gap pada checkpoint ini kemudian ditutup oleh checkpoint 33 untuk onboarding/binding eksplisit. Konfigurasi realm/client nyata tetap belum diuji, replay cache masih per-process, dan auto-provision email legacy tetap ditolak.

## 33. Explicit ICCN artist onboarding checkpoint

- Endpoint admin identity tersedia pada `/api/v1/admin/users/:id/iccn-identity` untuk inspect, bind, dan exact-subject unbind. Mutasi dibatasi ke superadmin dan authority dimuat ulang dari database di dalam transaksi; ordinary admin tidak dapat menetapkan login identity.
- Target harus aktif, memiliki tepat satu role `artist` yang verified, berada dalam roster verified `PARTNER_LABEL_ID`, parent label cocok, owner label/whitelabel aktif+verified, dan tidak memiliki local credential. Backend tidak auto-bind email, tidak auto-provision user, dan issuer selalu berasal dari provider configuration canonical.
- Binding lama dengan `verified_at=NULL` tampil sebagai belum verified dan dapat direverify secara eksplisit. Binding issuer lama tetap terlihat dan dapat dilepas tanpa silent issuer rewrite. Unbind mencabut seluruh sesi target, membersihkan `profiles.sso_provider`, dan audit hanya menyimpan SHA-256 subject.
- Migration `0059_iccn_identity_bindings.sql` memberi partial unique one-ICCN-binding-per-user dan column-level runtime grants. Migration fail-fast dengan diagnostic jika data legacy memiliki multiple ICCN binding per user; production wajib read-only preflight sebelum deploy.
- Test mencakup subject uniqueness, idempotent bind, concurrent duplicate bind, legacy nullable reverify, old-issuer removal, verified-role requirement, foreign roster, ordinary-admin denial, login activation, session revocation, OpenAPI dan malformed input. Full Docker suite: 405 tests, 399 pass, 0 fail, 6 skipped. Frontend contracts, TypeScript, production build, dev migration, health dan browser `/auth` egress lulus.
- Dev tetap `VITE_PARTNER_SSO_ENABLED=false` dan `PARTNER_LABEL_ID` kosong. Gap tersisa: realm/client sandbox nyata, realm logout semantics, production duplicate preflight, dan controlled activation plan.

## 34. Shared partner OAuth replay checkpoint

- Migration `0060_partner_oauth_replays.sql` mengganti replay map per-process dengan claim PostgreSQL. Tabel hanya menyimpan SHA-256 state, expiry, dan timestamp; raw state, code, verifier, token, issuer, subject dan redirect tidak disimpan.
- Claim dijalankan melalui `SECURITY DEFINER` function dengan search path tetap. Runtime hanya mendapat `EXECUTE`, tanpa `SELECT/INSERT/UPDATE/DELETE` langsung. Cleanup expiry memakai function terpisah dan best-effort sehingga kegagalan cleanup tidak melewati atau memblokir claim utama.
- Dua service instance yang menerima callback sama secara concurrent menghasilkan tepat satu claim dan satu provider exchange. Startup menolak aktivasi partner SSO jika migration replay belum tersedia.
- Full Docker suite: 406 tests, 400 pass, 0 fail, 6 skipped. Migration `0060` diterapkan hanya ke `dashboard-sounpub-dev`; backend/frontend/worker/PostgreSQL/storage sehat pada port dev dan browser `/auth` tetap 284 requests dengan zero forbidden egress.
- Sisa aktivasi partner: realm/client sandbox nyata, callback+logout browser E2E, production ICCN duplicate preflight, secret/config rollout, dan rollback/stop conditions. Production Docker/port `8181` belum disentuh.
