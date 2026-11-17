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

#### Catalog-missing ISRC: local flow verified, historical parity pending

- Supabase `process-royalty-upload` still requires a syntactically valid ISRC in each CSV row. When no catalog track matches it, the function resolves one active label from explicit `label_user_id` or a unique normalized `label_name`, then resolves a unique artist name under that label. It creates a managed Auth/profile/artist-role identity with a synthetic `@managed.soundpub.local` email and an unissued random password, then commits the artist and label recipient IDs. It does not create a release or track for that row.
- Backend now matches a catalog-missing ISRC to one active label and an unambiguous artist name, then stages a nullable track/release snapshot. Approved commit can reuse or create a credentialless standard-label managed artist; artist and label shares follow their distinct owners. Label Custom requires a pre-existing active unit roster entry with contact email and phone; both shares accrue to PIC. Unknown or ambiguous ownership remains fail-closed rather than inventing a track, release, or PIC beneficiary.
- Unlike Supabase's synthetic Auth account, the standard-label managed artist has no credential or login session. Database guards deny local credentials, sessions, partner bindings, privileged roles, and account-kind demotion; password reset and impersonation are disabled. Audited claim/enrollment remains a separate future decision, not an automatic side effect of import.
- Local evidence: disposable PostgreSQL CSV and file-session tests cover staging, commit, immutable source snapshots, idempotent managed identity, owner-specific allocations, reversal/replacement, reconciliation, and PIC payout. The authenticated browser cases cover catalogless preview/import, reconciliation, and payout to settlement (checkpoints 50-56). This closes the local catalogless flow gate, not all Phase 4 historical parity: complete source exports and human-reviewed payout-time beneficiary mapping remain unavailable.

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
- Remaining Phase 3/6 scope: superadmin session takeover, repair approval workflow, and optional explicit approval revocation. Staged preview review, checksum-bound approval, and staged-row inspection are implemented in the backend-mode import UI. Scheduled global reconciliation is implemented as immutable read-only evidence with advisory locking, bounded findings, deterministic checksums, and admin history API. Import and replacement share private signed file sessions; inline replacement remains compatibility-only.

### Phase 7 - Reporting dan permission parity

- Summary, period, release, track, dan artist breakdown.
- Role-scoped royalty export.
- Superadmin allowlisted dataset export with secret redaction, formula neutralization, direct-export caps, and immutable audit evidence. (Implemented in dev.)
- Label Custom mendapat internal artist report dan PIC wallet.
- Admin mendapat global view.
- Frontend menangani loading, empty, forbidden, archived, dan retry states.

Gate: setiap role hanya melihat scope sah; total summary sama dengan detail pada filter sama.

### Phase 8 - Payout parity

- Eligibility dan minimum payout mengikuti default UI legacy IDR 50.000; nilai eksplisit 0 menonaktifkan threshold, bukan kewajiban nominal positif.
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

## 35. Secure backend impersonation checkpoint

- Impersonation hanya tersedia pada mode backend local auth. Endpoint start memerlukan cookie sesi superadmin aktif, CSRF, password saat ini, dan alasan wajib 10-500 karakter; alur legacy Supabase tetap terpisah dan tidak menjadi fallback backend.
- Start memuat ulang authority dari PostgreSQL, menolak self-target, target inactive/roleless, serta target `admin` atau `superadmin`. Parent session dicabut sebelum cookie child target diterbitkan. Child berlaku maksimum 15 menit dan middleware menolak seluruh mutasi selain stop/logout dengan `IMPERSONATION_READ_ONLY`.
- Stop mencabut child lalu membuat sesi superadmin baru enam jam dengan token dan CSRF baru. Parent lama tidak dipulihkan. Jika actor tidak lagi active/superadmin atau password berubah setelah start, child diinvalidasi dan cookie dihapus tanpa mengembalikan authority.
- Browser hanya menerima cookie HttpOnly dan metadata impersonation. Tidak ada privileged access token, refresh token, password, atau salinan parent session yang disimpan di `localStorage`/`sessionStorage`. UI meminta password dengan `autocomplete=current-password`, menampilkan mode read-only, dan memakai endpoint stop backend.
- Migration `0061_auth_impersonations.sql` menyimpan actor, target, parent/child session, reason, expiry, end reason, dan uniqueness untuk satu impersonation aktif per actor/target. Audit start/stop/invalidation tetap mengatribusikan actor superadmin dan target.
- Evidence final: frontend impersonation contract, post-`0062` focused disposable-PostgreSQL flow, backend typecheck, production build, non-Docker suite, and independent security review pass. Prior full Docker suite: 409 tests, 402 pass, 0 fail, 7 skipped. Migrations `0061` and `0062` are applied only to `dashboard-sounpub-dev`; frontend/API/worker/PostgreSQL/storage are healthy and `/auth` egress reports 285 requests with zero forbidden egress. Production `8181` was not changed.
- Recovery boundary: stop is fail-closed but not response-idempotent. If network loss occurs after child revocation and before the fresh cookie reaches browser, operator must log in again; no old privilege is restored. Add encrypted one-time recovery only if seamless retry becomes a product requirement.

## 36. Legacy release pricing compatibility checkpoint

- Compared `supabase/functions/create-xendit-invoice/index.ts` with the backend price calculation. Supabase settings store prices as integer strings, and the latest tracked migration sets the Custom Label price to `75000`; backend had required decimal suffixes and defaulted Custom Label to `50000`.
- Backend now parses supported integer and two-decimal string settings using exact `bigint` minor units, keeps malformed values fail-closed, and uses `75000.00` as the Custom Label default/override when setting is absent.
- Added regression coverage for legacy integer settings, per-category EP allocation, Custom Label override, and malformed input. Phase 3E release/invoice integration plus payment tests pass on disposable PostgreSQL; focused pricing tests and backend typecheck pass.
- Validation: release-pricing regression tests, Phase 3E invoice/release integration, and full Docker suite (428 pass, 0 fail, 7 skipped) pass on disposable local PostgreSQL/RustFS. Backend typecheck, frontend contracts/build, and isolation scan pass; production was not contacted or modified.
- Remaining evidence: confirm effective production settings and compare historical invoice fixtures before any production rollout.

## 37. Xendit callback intake checkpoint

- Local parity source: `supabase/functions/xendit-webhook/index.ts`. Legacy input uses `x-callback-token` plus JSON fields `id`, `status`, `amount`, and `currency`; `PAID`/`SETTLED` map to paid, `EXPIRED` and `FAILED` remain distinct, and one handler dispatches release and copyright invoices.
- Backend foundation: `backend/src/payments/xendit-webhook.ts` performs constant-time token comparison, rejects malformed/oversized payloads and unsafe amounts, converts exact decimal values to minor units, and maps known statuses. `backend/src/payments/xendit-client.ts` now validates development-only API keys, performs bounded Xendit Invoice API calls, verifies provider response identity/amount/currency/checkout host, and attempts lookup-by-stable-external-ID recovery after ambiguous creation. Both modules have focused synthetic tests; backend typecheck passes.
- Migration `0069_xendit_invoice_provider.sql` now adds constrained Xendit invoice fields and `CREATING`/`EXPIRED` states while preserving the mock invoice shape; API config accepts only `xnd_development_` keys and a 32-character callback token. The new schema passed a disposable PostgreSQL migration/privilege test under Compose project `dashboard-sounpub-dev`; this did not modify persistent dev services.
- Release callback intake is now wired to `POST /api/v1/webhooks/xendit/invoices` using raw JSON bytes and `x-callback-token`. It verifies the configured token in constant time, strictly parses exact IDR minor units, and routes only Xendit invoice rows through provider-scoped webhook replay protection. Replayed callbacks are idempotent; paid callbacks update invoice/provider status, append receipt and audit evidence, and post the finance charge inside one transaction.
- Release reconciliation now distinguishes mock versus Xendit provider evidence and validates ledger ownership against immutable `financial_owner_id`, including Label Custom PIC wallet ownership. Frontend invoice contracts now admit Xendit and asynchronous/expired states.
- Disposable PostgreSQL verifies successful payment, duplicate replay, exact single ledger effect, schema constraints, restricted provider field updates, and invoice-create outbox lifecycle. Synthetic release and copyright providers persist validated checkout evidence; copyright retries after transactional audit failure and safely reuses stable external identity. Copyright callbacks verify token, mismatch receipt, replay idempotency, malformed/unsupported rejection, and terminal-transition protection.
- Latest validation (2026-11-14): backend typecheck and isolation/secret scan pass; focused release/copyright Xendit PostgreSQL suite passes 5/5; unit suite passes 324 with 74 PostgreSQL-only skips; full isolated Docker suite passes 448/455 with 7 skips; frontend contracts and build pass (existing >500 kB chunk warning). Compose config is valid. No production server/Docker, live provider credential, or backup data used.
- Copyright checkout now redirects back to registration status rather than release invoices. Status page polls pending payments even after the provider URL appears, stops at terminal state, and shows failed/expired guidance. Synthetic PostgreSQL covers both FAILED and EXPIRED, replay, audit/outbox, and rejection of late PAID after terminal state.
- Xendit callback recovery checks provider invoice ID and, when supplied, the stable external ID. If callback arrives while provider delivery still leaves payment in CREATING, the handler raises retryable 503 and rolls back webhook idempotency, so a retry after invoice persistence can apply once. Synthetic PostgreSQL exercises this race in both release and copyright flows, rejects mismatched IDs, and verifies unknown callbacks do not consume replay keys.
- Late Xendit PAID callbacks after FAILED/EXPIRED now leave release and copyright payment states terminal, persist provider status and callback receipt evidence, raise reconciliation flags, and emit admin audit evidence for copyright. Copyright manual-review rows have a partial index. Synthetic PostgreSQL regression coverage verifies no registration state promotion and replay safety.
- Still incomplete: manual local browser checkout/status verification, Xendit sandbox delivery and operational alerting, human reconciliation workflow for flagged payments, and remaining capability-matrix PARTIAL items. Do not use a live provider key.
- Next gate: verify sandbox retry behavior/alerts and late-payment reconciliation, then manually verify checkout/status UX. Production rollout remains separately gated and untouched.

## 38. Copyright payment reconciliation visibility

- `0072_copyright_payment_audit_reads.sql` grants auditor only payment/receipt columns required by read-only finance checks; no runtime payment write permission is widened. Unresolved copyright callbacks and flagged/terminal-conflicting payments now fail the global finance reconciliation run, contribute to snapshot counts/checksum, and trigger the existing changed-state alert outbox.
- Admin-only registration list accepts `payment_review=required`; backend applies the filter before its 100-row cap and review UI offers a dedicated filter. Individual review still shows terminal payment status plus manual-review warning, never a paid status from late callback.
- Disposable PostgreSQL verifies FAILED/EXPIRED late callbacks, admin-only filtered list, auditor's column-scoped access, deterministic finance evidence, and replay safety. Human resolution still requires independently verified provider/bank evidence; no automatic financial credit or reconciliation dismissal is offered.
- Validation (2026-11-14): backend typecheck/security scan/Compose config and frontend contracts/build pass; unit suite 324 pass with 74 skipped; full disposable Docker suite 448 pass, 0 fail, 7 skipped; after aligning filter predicate with the global monitor, focused copyright Xendit PostgreSQL tests pass 2/2, including status-only `RECONCILIATION_REQUIRED`. The dev-only migration `0072` is applied; the `dashboard-sounpub-dev` backend, worker, and frontend are healthy. No live provider or production dependencies were used.
- Admin copyright review now uses keyset pagination ordered by `(updated_at,id)` with a cursor bound to the current admin and all active filters. PostgreSQL tests verify distinct pages, filter-scope rejection, and filtered reconciliation results; the frontend exposes `Muat lebih banyak` without raising the server page cap. Revalidation after this change: full isolated backend suite 448 pass, 0 fail, 7 skipped; backend typecheck, security scan, Compose config, frontend contracts, and production frontend build pass.
- No provider credentials, live Xendit requests, production Docker/server, or backup data are used for this checkpoint.
- Pagination follow-up: migration `0073_copyright_registration_review_pagination.sql` indexes review page order. Disposable PostgreSQL test including the index assertion passes 2/2. After applying `0073` only to `dashboard-sounpub-dev`, the full isolated backend suite passes 448/455 with 7 skipped, 0 failed; backend and frontend health return HTTP 200.
- UI pagination discards stale list/detail responses when filters or route change during a request; frontend contract and production build pass, and the dev-only frontend was recreated. Manual browser review and sandbox checkout remain open gates.

## 39. Royalty report pagination

- `GET /api/v1/royalties/report` supports scope-bound keyset cursor pagination in sort order `period DESC, source_row_number NULLS LAST, id`; cursor scope binds verified role, actor, and active filters. Existing offset queries remain compatible.
- Migration `0074_royalty_report_keyset.sql` adds the matching page-order index. UI previous/next navigation and CSV export follow cursor pages. Browser CSV export stops at 100,000 rows with guidance to narrow filters; formula-leading cell values are neutralized.
- Disposable PostgreSQL verifies page ordering across legacy rows with NULL source-row numbers, end cursor, offset compatibility, actor/filter scope rejection, and index installation. Backend typecheck, isolation scan, Compose config, frontend contracts and production build pass; full isolated backend suite passes 448/455 with 7 skips and 0 failures.
- Migration `0074` applied only to `dashboard-sounpub-dev`. Backend, worker, frontend are healthy; backend and frontend return HTTP 200. Manual browser navigation/export and scale/long-running export tests remain open; each cursor page still recalculates full-scope report totals.

## 40. Upload parity audit checkpoint

- Local legacy frontend evidence: master audio uses Supabase TUS resumable upload with 6 MiB chunks, retry/resume, WAV/FLAC/AIFF/MP3, and a requested one-year signed URL. Backend media currently uses one private presigned PUT, equivalent four master formats, 500 MiB limit, bound track readiness, and short-lived private playback capabilities.
- Local legacy clip flow uses audio-clips, accepts MP3/M4A/OGG/WAV up to 20 MiB, and assigns a public URL. At audit time backend lacked clip DTO/upload; section 42 records the subsequent private implementation. Effective production bucket visibility and overwrite policies remain unverified from tracked migrations.
- Do not copy the public-URL behavior without an explicit playback entitlement decision. Next implementation slice: model clip media binding and track DTO lifecycle, restore supported client workflows, choose privacy from verified policy/evidence, and add resumable upload with isolated RustFS/PostgreSQL coverage. No production Storage access or mutation performed.

## 41. Upload memory-safety checkpoint

- Backend media upload intent still uses one private presigned PUT (up to 500 MiB); production legacy master upload uses resumable TUS. This remains a known availability and user-experience gap; it is not marked parity.
- Frontend master/media checksum now uses the existing `sha256File` helper, hashing 4 MiB chunks rather than calling `file.arrayBuffer()` on the full file. The hash helper test compares a >9 MiB file against Node SHA-256 and asserts chunk boundaries; upload lifecycle contract asserts checksum helper invocation.
- Validation (2026-11-14): chunked checksum test, phase3d media lifecycle/static scan, all frontend contracts, and production build pass. Production build retains existing >500 kB bundle warning. No backend behavior, database, Docker, Supabase production, or backup data changed.
- Next: implement authenticated resumable multipart lifecycle (init/part/complete/abort/expiry/cleanup). Keep catalog clip/master URLs null until entitlement is explicitly designed and tested. Verify media workflows in the browser and isolated RustFS/PostgreSQL; do not infer effective production bucket policy.

## 42. Private audio clip checkpoint

- Migration `0075_track_clip_media.sql` adds a track-bound `clip_media_id`, private download-reference constraint, least-column app grant, and FK lookup index. Upload contract accepts `TRACK_CLIP` only on tracks, caps at 20 MiB, allows MP3/M4A/OGG/WAV, and verifies supported container signatures on server finalize.
- Media lifecycle reuses existing ownership authorization, short-lived private download capability, replacement ordering, deletion, cleanup reference checks, and audit path. Track DTO and backend release form now read/upload/replace/remove clips. Clip remains optional for submission; catalog always returns null for master and clip URLs. No unauthenticated/public playback is enabled.
- Disposable PostgreSQL media lifecycle test applies the new migration and verifies upload binding, authorized download, replacement revocation, release lock, deletion, and URL/ID clearing. Contract tests verify format/size/signature restrictions. Frontend typecheck, contracts, and production build pass.
- Validation (2026-11-14): full isolated backend Docker suite 448 pass, 0 fail, 7 skipped; backend typecheck/security scan, frontend typecheck/contracts/build, and Compose config pass. Disposable PostgreSQL/RustFS media tests use synthetic files only. Migration `0075` applied only to `dashboard-sounpub-dev`; backend/worker/frontend healthy; `/ready` and `/auth` return HTTP 200.
- Known gaps: single-request PUT still replaces legacy resumable TUS; no effective production bucket policy/entitlement proof; browser upload/playback E2E not manually reviewed. User must verify clip upload/playback at `http://127.0.0.1:8281` in the dev dashboard. Production Docker/server and Supabase were not accessed or changed.
## 43. Resumable master upload checkpoint

- Migration `0076_media_multipart_uploads.sql` records private multipart upload ID and constrains it to pending master audio above 24 MiB. Authenticated intent, status and part signing recheck current media ownership; direct PUT requests above threshold are rejected. Parts use 6 MiB signed capabilities with bounded retries and browser-session resume; finalize validates exact part sizes, private object bytes, MIME and SHA-256 before publishing existing media binding.
- Pending multipart uploads can be explicitly aborted and expired sessions are cleaned by dev worker. Client retains session ID across page reloads in same browser; this is not byte-level TUS protocol compatibility or cross-browser resume. Older checkpoint descriptions above record their historical state, not current upload path.
- Validation (2026-11-14): backend typecheck, isolated RustFS/PostgreSQL live CORS/resume/finalize/abort/cleanup test, backend isolation scan, frontend contract suite and production build pass. Full backend Docker suite: 448 passed, 0 failed, 7 skipped. Frontend `tsc --noEmit -p tsconfig.app.json` fails on legacy Supabase-generated types and call sites; Vite build succeeds. This blocks a full frontend typecheck gate. Local `/auth` browser egress check passes (288 requests, 0 forbidden egress); authenticated upload/playback E2E remains unverified.
- Built backend, worker, migrate and frontend images with Compose project `dashboard-sounpub-dev`; migration `0076` applied only there. Backend, worker and frontend are healthy; `/ready` and `/auth` return HTTP 200. Production server/Docker, Supabase production, and backups were not touched. Storage bucket behavior and authorization in production remain unverified; no public audio URLs or year-long signed playback capability were added.
## 44. Royalty reconciliation notification checkpoint

- The tracked legacy `send-royalty-notification` Edge Function emails admins and affected labels, but repository search found no frontend invocation; actual production timing/delivery remains unverified. Backend now delivers in-app notifications from the durable `royalty.changed` outbox only for a matched, intact reconciliation whose referenced outbox ID and snapshot checksum match. Notices target active allocated owners and active verified admins; owners see only their own allocated amount, while admin notices omit owner amount. Corrected batches do not produce delayed owner notices.
- Worker `once` guard and notification writes share one PostgreSQL transaction, so event retries do not duplicate notifications. Disposable PostgreSQL test verifies 70/21 split visibility, recipients, forged-event rejection, no writes before valid evidence, and replay idempotency. Real SMTP/email delivery remains mock-only and this does not establish the absent legacy function caller.
- Disposable PostgreSQL also verifies Label Custom reconciliation credits the PIC (IDR 910.00 from IDR 1000.00) and notifies that PIC plus admins, never the managed artist without login (`backend/test/royalty-label-custom-notification.test.ts`). Backend typecheck and focused test pass; email delivery remains unverified.
- Validation (2026-11-15): backend typecheck, focused royalty CSV/reconciliation PostgreSQL test, backend isolation scan, and full backend Docker suite pass (449 passed, 0 failed, 7 skipped). No migration required; notifications use existing schema. Worker image rebuilt and restarted only under `dashboard-sounpub-dev`; production Supabase/server and Docker remain untouched.


## 45. Release onboarding contract checkpoint

- Legacy release creation passed an unsupported onSuccess prop to ArtistOnboardingDialog, which exposes onComplete; corrected the call to preserve profile refresh and close behavior. Release backend-mode contract now distinguishes true backend implementations (activate/reject) from intentionally unavailable legacy workflows, and this test runs from `npm run test:contracts`.
- Validation (2026-11-15): release backend-mode test, all frontend contracts, and production Vite build pass. Full frontend TypeScript check remains failing with 145 errors, mainly legacy Supabase-generated type gaps and unrelated UI/type issues; no broad typecheck pass claimed.

## 46. Filename-period royalty replacement checkpoint

- Supabase replacement compatibility requires one exact original filename across all active batches in the selected period. Backend inline and private-file replacement now reverse every such batch as immutable ledger offsets and create one replacement batch. Different active filenames reject the operation.
- File sessions snapshot affected batch IDs at request time. The backend rechecks the complete set inside the commit transaction; the database deferred guard binds relationship provenance to the session snapshot and new batch validation. UI displays each affected ID, enforces exact filename, and surfaces the multi-batch result.
- Disposable PostgreSQL covers same-filename multi-source replacement, mixed-filename conflict, session scope drift/rollback, replay, and deferred DB guard. Validation (2026-11-15): backend typecheck, backend Docker suite (449 passed, 0 failed, 7 skipped), frontend contracts, production Vite build, backend isolation scan, and `git diff --check` pass. Frontend `tsc` remains at 145 existing legacy Supabase-generated type errors; no errors point to the changed royalty files.
- Not production-verified: missing-ISRC name attribution/managed identity, historical balance recovery, effective storage policies and browser upload E2E, provider email delivery. Production Supabase/server/Docker and `backups/` remain untouched; no dev service migration/rebuild was run in this checkpoint.

## 47. Legacy balance preflight planner

- Added a pure, write-free finance planner for staged aggregate snapshots of profile balances, artist/label royalty totals, signed legacy adjustments, payout states, and reservation splits. It calculates expected IDR available balance per profile, separates outstanding from paid payouts, validates payout reservation totals and adjustment source uniqueness, and reports missing owners, negative balances, or source drift. Strict schemas reject unapproved PII/credential fields.
- Synthetic unit tests cover exact minor-unit math, opening/refund-style signed adjustments, pending/paid/rejected reservations, empty zero-balance accounts, duplicate references, missing owners, reservation mismatches, profile drift, and sensitive extra fields. Validation (2026-11-15): backend typecheck, seven focused tests, backend isolation scan, and full disposable Docker suite (456 passed, 0 failed, 7 skipped) pass. No dev deployment or migration was run in this checkpoint.
- This planner does not read Supabase/backup data, verify export completeness or historical label-parent authority, create backend events, or prove wallet cutover. It is preflight logic only. Next gate: define checksummed allowlisted extraction schema and owner mapping; populate only from a separately approved read-only export; compare every owner and payout on two fresh isolated PostgreSQL targets before designing any ledger apply step.


## 48. Managed artist identity boundary checkpoint

- Added additive migration 0078_managed_artist_login_boundary.sql, separating standard-label MANAGED_ARTIST backend identities from Label Custom roster identities. Runtime credential, session, and partner-identity writes are rejected for managed accounts; non-artist roles and account-kind demotion are also rejected at the database boundary. Existing admin password reset and impersonation return a clear conflict, and user-list UI labels the account as non-login and disables password reset/impersonation.
- Disposable PostgreSQL tests verify credential-less user/profile/artist ownership, blocked local password, session, partner binding, role escalation, role removal while active, admin reset, and managed conversion of existing credentialed/privileged users. Full ISRC import matching, managed identity creation at commit, artist claim/enrollment, release/track-null finance rows, and report parity remain incomplete; no royalty allocation changes occur in this checkpoint.
- Production, persistent dev stack, Supabase, and backups were not changed. Migration has only been tested in per-test disposable PostgreSQL.

## 49. Catalogless royalty identity and report groundwork

- Additive migration 0079 permits null release/track references only as a pair on royalty entries, with required immutable ISRC, artist identity, source artist/label snapshot, and verified active artist/label ownership. Existing catalog-linked attribution and allocation guards stay active; unmanaged names, cross-label owners and other mismatches fail at the database boundary. This does not create releases or tracks.
- Royalty reports and analytics now use optional catalog joins and source snapshot fallback. Export includes source title/artist/label. A disposable PostgreSQL test proves catalogless ARTIST/LABEL/SOUNDPUB allocations, forbidden owner/name/label swaps, and visible admin/label reports and track analytics.
- Validation (2026-11-15): targeted Docker test passed; Docker-free backend suite 331 passed, 0 failed, 78 skipped; backend typecheck, isolation/secret scan and `git diff --check` passed. Production, persistent dev services, Supabase and backups untouched.
- Historical checkpoint: CSV/file matching still emitted UNMATCHED_ISRC at this point; section 50 records later importer work. Browser E2E and migration readiness remain separate gates.

## 50. Catalogless staged-file import checkpoint

- Fixed missing closing parenthesis in staged catalog-staleness SQL; the staged PostgreSQL integration test now parses and passes.
- Added disposable PostgreSQL end-to-end coverage for private CSV upload, worker preview, two catalogless ISRC rows, write-free preview, approval, transactional managed artist creation reused across rows, immutable source snapshots, 70/21/9 allocations, ledger posting, report visibility, replay idempotency, stale label detection, injected outbox rollback, catalogless batch replacement, correction reversals, and replacement replay.
- Catalogless reports now allow nullable release/track DTO fields and label entries without a release explicitly in the frontend.
- Validation (2026-11-15): backend Docker suite 469 tests (462 passed, 0 failed, 7 skipped), focused catalogless file tests, backend typecheck, frontend contracts/build, isolation scan, and `git diff --check` pass. Frontend project TypeScript check reports 145 diagnostics across existing generated legacy Supabase types; one pre-existing `replaceAll`/ES2020 target diagnostic appears in `BackendRoyalties.tsx`, with none on the changed nullable DTO or catalogless rendering. Production, Supabase production/server, persistent dev services, and backups remain untouched.
- Remaining gates: confirm managed-artist enrollment/payout policy against the read-only production behavioral map, complete frontend browser E2E on isolated dev, and separately reconcile historical balances before any cutover. No deployment is approved by this checkpoint.

## 51. Label Custom catalogless PIC ownership checkpoint

- Catalogless CSV matching now includes verified `label_custom` owners only when an existing active managed artist roster matches the name and unit. A missing Label Custom artist is rejected during preview with `ARTIST_ROSTER_REQUIRED`; import never invents a managed identity that lacks the required contact email, phone, and unit binding.
- Commit revalidates label role, roster, active unit, and the PIC financial owner against the frozen staging snapshot. An archived unit fails with `ROYALTY_PREVIEW_STALE`; standard-label identity creation fails closed if the owner has gained the Label Custom role after preview.
- Disposable PostgreSQL tests cover direct CSV and file-session imports: distinct ARTIST and LABEL allocations both accrue to PIC, ledger posts once to PIC, reconciliation gates payout, and approved payout reserves from PIC only. The managed artist never receives a backend login or wallet.
- Production, Supabase production/server, Docker production, persistent dev services, and backups remain untouched. Validation (2026-11-15): full disposable Docker suite 472 tests (465 passed, 0 failed, 7 skipped); Docker-free suite 415 tests (334 passed, 0 failed, 81 skipped), backend typecheck, frontend contracts, isolation scan, and diff check passed. Browser E2E and historical balance migration are not yet verified; standard managed-artist and Label Custom enrollment boundaries now have source and disposable-test evidence.

## 52. Catalogless parity and evidence refresh

- Refreshed the capability matrix to reflect verified catalogless ISRC matching: standard labels can reuse or create a credentialless managed artist at approved commit; Label Custom requires a previously registered artist with contact details and active unit, and both royalty shares accrue to the PIC. Source behavior was cross-checked against `supabase/functions/process-royalty-upload/index.ts` without connecting to production.
- Marked filename/period replacement as verified safer behavior rather than treating immutable reversal as a missing delete implementation. This is an intentional semantic improvement over destructive history deletion and must remain visible to product/finance reviewers.
- Re-ran focused disposable PostgreSQL integration tests on 2026-11-15: standard-label catalogless import and Label Custom file import/payout both passed (2/2); backend typecheck and isolation/secret scan passed. No production, persistent dev Docker, Supabase server, or backup files were touched.
- Historical balance cutover is still blocked on a new, complete, reviewed source snapshot and owner mapping. Existing historical snapshot is inherited, incomplete for current source denominators and proof of settlement, and cannot authorize ledger writes. Browser E2E against isolated dev remains open. No cutover or deployment is approved.

## 53. Historical payout requester guard

- The write-free legacy balance preflight now requires `requester_id` for every payout, mapped explicitly from source `soundpub.payout_requests.user_id`. A missing requester profile blocks reconciliation even when monetary sums happen to match.
- Source status `paid` is not settlement evidence. The preflight labels it `paid_status_payouts` and emits `PAID_PAYOUT_SETTLEMENT_UNVERIFIED` until independently reviewed proof is part of an approved evidence schema.
- Reservations belonging to an owner other than the payout requester now raise `CROSS_OWNER_PAYOUT_RESERVATION_REQUIRES_REVIEW`. Legacy label-aggregate payouts can legitimately reserve from child artist profiles; current parent relationships alone cannot prove payout-time entitlement. Treat each flagged edge as an unresolved historical mapping, not as automatic fraud or an authorization to reassign a wallet.
- Synthetic tests cover a financially balanced cross-owner payout that previously passed arithmetic checks, missing requester profiles, and rejection of snapshots without requester identity. No persistent account balances, databases, Supabase data, or dev/production Docker services were modified; tests used disposable PostgreSQL containers.
- Historical ledger apply remains blocked until a fresh, complete source export and human-reviewed payout-time beneficiary mapping can reconcile every owner and reservation in two isolated restores. This check deliberately fails closed and provides no override for cross-owner relationships yet.
- Validation (2026-11-15): focused finance preflight 10/10 tests passed; full backend disposable Docker suite 468 passed, 0 failed, 8 skipped; backend typecheck, isolation/secret scan, frontend contracts/build, and `git diff --check` passed. Local `/auth` browser smoke observed 288 requests with zero forbidden Supabase egress. Existing opt-in skips remain; no authenticated royalty-import or completed payout-transaction browser E2E was run (only payout readiness gating was covered).

## 54. Label Custom browser lifecycle checkpoint

- Opt-in browser E2E signs in a synthetic Label Custom PIC through the local dev frontend while routing API calls to an ephemeral Fastify instance and disposable PostgreSQL. It creates a unit, creates a contact-only managed artist without credentials, edits the artist, archives the artist, and verifies persisted ownership/contact data plus absence of an artist login account. It also verifies PIC payout eligibility fails closed before readiness, permits saving an unverified PIC destination, and keeps payout request disabled pending independent destination verification and reconciliation.
- Browser interception records API routes and blocks requests outside the local frontend origin. The test asserts expected backend routes, no Supabase REST egress, and no browser runtime exceptions. It runs only with both `RUN_DOCKER_TESTS=1` and `RUN_BROWSER_TESTS=1`; normal backend suite skips it.
- Validation (2026-11-15): isolated browser E2E 1/1 passed; full disposable backend suite (before the additional payout browser assertions) 468 passed, 0 failed, 8 skipped. The existing dev frontend at `127.0.0.1:8281` is used only as a static frontend; auth and API state live in the ephemeral server/database. No persistent dev database, production service, Supabase server, Docker production, or backup data was modified.
- Subsequent checkpoint 55 covers authenticated browser CSV preview/import and PIC ledger attribution using synthetic storage. Still open: browser paid settlement and production storage/provider evidence, fresh complete historical balance snapshot, and reviewed payout-time beneficiary map. Historical ledger apply and production cutover remain blocked.

## 55. Catalogless royalty browser-to-payout checkpoint

- A second opt-in browser E2E signs in a synthetic admin on the existing dev frontend, selects a CSV file, uploads bytes to an ephemeral loopback synthetic object store, waits for a disposable PostgreSQL worker to preview, approves the staged checksum through UI, and commits through UI. The ISRC has no catalog release/track; the Label Custom managed artist has contact details but no backend login account.
- Disposable DB assertions verify source ISRC and artist attribution, null catalog IDs, ARTIST and LABEL shares (70.00 + 21.00 of net 100.00) both owned by PIC, and a 9100-minor-unit earning event. A distinct synthetic admin logs into the browser, reviews batch detail and independently reconciles it through UI; the same admin verifies the PIC destination and approves the financial snapshot through the admin UI.
- PIC logs in separately and requests IDR 60.00 through the browser. Assertions verify the payout and reservation are PIC-only. PIC cancels through UI; the database retains the original payout allocation and records both 6000-minor-unit reservation and release events. Auth/browser request interception verifies intended API paths and no Supabase egress or uncaught browser runtime exceptions.
- Validation (2026-11-15): opt-in catalogless import/reconciliation/PIC request-and-cancel browser case passed (1/1); backend full disposable suite before its extension 477 tests, 468 passed, 0 failed, 9 skipped; backend typecheck, isolation scan, and diff check passed. Test identities, CSV, storage, payout and DB are synthetic. Existing dev frontend is read as static files, but its persistent database is never modified; production Docker, Supabase servers, and backup files are untouched.
- Still unverified: browser paid settlement with genuine private proof upload, effective production object-storage policy/provider delivery, historical balance cutover from a fresh complete source snapshot, and reviewed payout-time beneficiary mapping. Synthetic storage does not prove RustFS/S3 or production behavior. Historical ledger apply and production cutover remain blocked.

## 56. Browser payout settlement and session-clock checkpoint

- Extended the isolated catalogless browser case: after PIC cancels an initial IDR 60.00 request, PIC creates another request; a separate admin approves it, uploads a PDF proof through private media intent/PUT/finalize, then marks the payout paid through the UI. Database assertions require an ACTIVE PAYOUT_PROOF bound to that payout, the admin as uploader, and exactly one PIC-only reservation and settlement ledger event. This uses a synthetic HTTP object store, not RustFS/S3 or a real bank transfer.
- A disposable PostgreSQL clock-skew regression covers session authentication and CSRF rotation when `created_at`/`last_seen_at` are ahead of database `now()`. Session touch now preserves the later timestamp, avoiding the `auth_sessions_check2` constraint error observed during browser tests. The browser harness dispatches file input events explicitly and scopes transfer-note input to the payout table.
- Validation (2026-11-15): full disposable backend suite with both opt-in browser cases and clock-skew regression: 478 tests, 471 passed, 0 failed, 7 skipped. Backend typecheck/security scan and diff check, frontend contracts/build, and unauthenticated browser egress smoke (288 requests, zero forbidden Supabase egress) passed. Seven opt-in integrations need separate environments; no claim of production verification.
- Historical ledger apply and production cutover remain blocked until a fresh, complete source export and human-reviewed payout-time beneficiary mapping can reconcile in two isolated restores. Production Docker, Supabase servers, and backups remain untouched.

## 57. RustFS payout-proof storage checkpoint

- Added an isolated PostgreSQL + RustFS live integration from approved payout to PDF proof upload, checksum/signature-verified finalize, settlement, private short-lived download, tampered/expired URL rejection, and stranger denial. It checks the PIC receives the one settlement ledger event while only admin uploads proof. This fixture uses a standard label as the payout owner; Label Custom UI and ownership are covered by browser checkpoint 56 using synthetic storage.
- The live integration exposed a real adapter defect: `createMediaObjectStore` omitted `application/pdf` from its allowed MIME list although `PAYOUT_PROOF` contract permits PDFs. Added PDF to the local media allowlist; per-category contract checks and server-side signature verification remain enforced.
- Validation (2026-11-15): focused RustFS/PostgreSQL payout proof test passes. Full disposable backend suite: 479 tests, 472 passed, 0 failed, 7 skipped. Backend typecheck, isolation/secret scan, frontend contracts and build, and `git diff --check` pass. Seven opt-in tests remain skipped; this is not evidence of production bucket configuration or provider behavior.
- Historical ledger apply and production cutover remain blocked pending complete source snapshot and reviewed payout-time beneficiary mapping. Production Docker, Supabase servers, and backups remain untouched.

## 58. Previously skipped PostgreSQL and recovery integration checkpoint

- Enabled the six URL-gated disposable PostgreSQL tests with isolated databases under the exact `dashboard-sounpub-dev` Compose project, then enabled the opt-in two-target Label Custom recovery rehearsal. Synthetic-only fixtures; the recovery source is generated in temporary storage and the rehearsal uses separate ephemeral PostgreSQL targets.
- The newly exercised release/track DB test exposed an obsolete fixture that moved `profiles.parent_label_id` outside a transaction while the database correctly enforced the deferred `artists_current_parent_fkey`. Updated the fixture to move profile parent and artist membership atomically, matching the application transfer invariant; retained historical release ownership assertions.
- Validation (2026-11-15): all seven previously skipped integration cases were exercised across the selected DB/recovery files: 27 tests, 27 passed, 0 failed, 0 skipped. Focused release/track PostgreSQL test: 1/1 passed. The baseline full backend suite remains 479 tests, 472 passed, 0 failed, 7 skipped; the supplemental run supplies evidence for those opt-ins but is intentionally reported separately. No persistent dev database, production service, Supabase server, or backup was used.
- Historical ledger cutover and production storage/provider validation remain unverified; require fresh complete source export, reviewed payout-time beneficiary mapping, and separately approved production evidence.
## 59. Repeated ISRC recipient parity checkpoint

- Supabase `process-royalty-upload` selects a single active label and an artist recipient; multiple track/release matches for that same recipient do not require an arbitrary track choice. Backend matcher now narrows by UPC when supplied, then accepts multiple catalog candidates only when artist ID, financial owner, and label owner agree. It stores a recipient-only royalty snapshot with null track/release IDs; candidates with differing recipients remain quarantined.
- Added migration `0081` to remove backend-wide track ISRC uniqueness while retaining the normalized lookup index. Release activation now permits duplicate ISRC only when canonical artist and label ownership match; conflicting recipients remain denied. Staged commit rechecks all currently eligible catalog matches and rejects stale previews when candidate ownership changes.
- Local verification: 16 focused royalty matcher, preview, schema, and PostgreSQL staged-commit tests pass. The PostgreSQL case proves duplicate same-owner ISRC commits 70/21/9 allocations with no fabricated catalog link, rejects a newly introduced cross-artist candidate as `ROYALTY_PREVIEW_STALE`, then commits after that conflict is removed.
- Production-derived duplicate-ISRC fixtures remain unverified; the subsequent full suite is recorded in checkpoint 60. No production or backup data was used.
## 60. Database-clock-consistent impersonation sessions

- Impersonation expiry now comes from PostgreSQL `clock_timestamp()` and the returned database timestamp is reused for the child session, audit record, and response. This avoids Node/PostgreSQL clock skew making a fresh impersonation expire immediately and allowing a competing superadmin to take the same target.
- Added an integration regression that moves the Node clock back 20 minutes while starting impersonation; PostgreSQL accepts it and the concurrent-target guard remains effective.
- Validation (2026-11-15): backend typecheck and isolation/secret scan passed; full Docker suite 482 tests (473 passed, 0 failed, 9 skipped); focused impersonation PostgreSQL test passed; supplemental DB/recovery integration passed 26, failed 0, skipped 1; the separately enabled clock-skew regression passed 1/1. Two newly created, isolated `soundpub_test_*` databases were used then removed. Existing local user DB opt-in separately passed 16/16. Production Docker, persistent dev schema, Supabase servers, and backups untouched.

## 61. Browser payout settlement with isolated RustFS

- Extended the catalogless import-to-PIC-payout browser E2E to run settlement-proof uploads against an ephemeral RustFS service instead of the synthetic HTTP object store. Browser uses the real local signed PUT/CORS flow; backend verifies/finalizes bytes and settles the payout.
- Test verifies the persisted proof points at the isolated bucket, a short-lived signed download returns the exact uploaded PDF, and unsigned object access is denied. Royalty CSV staging remains an isolated synthetic test adapter.
- Validation (2026-11-15): both opt-in browser E2E cases passed 2/2 against the running local dev frontend (`127.0.0.1:8281`), ephemeral PostgreSQL and ephemeral RustFS. The history/detail browser selector is now scoped to the batch table; a file-session row had previously appeared first during loading. Full Docker backend suite: 482 tests, 473 passed, 0 failed, 9 opt-in skipped; backend typecheck, isolation/secret scan, and `git diff --check` pass. Test cleanup closed disposable containers. No production Docker, Supabase server, or backup used. Real provider callback delivery remains outside this evidence.

## 62. Explicit royalty calculation policy V1

- Legacy 70/21/9 calculation is represented by frozen policy metadata: code, version, percentages, half-up per-row rounding, and label remainder. A SHA-256 fingerprint enters in-memory and streaming preview checksums and persisted batch `validation_result`; staged commits reject policy metadata that differs from running code.
- Allocation arithmetic remains unchanged. Pre-existing uncommitted previews fail checksum validation and require a fresh preview. No effective period is inferred because Supabase reference has no authoritative effective-date contract.
- Validation (2026-11-15): backend typecheck, non-opt-in `npm test` (426 tests: 340 passed, 0 failed, 86 skipped), isolation/secret scan, and diff check pass. Focused preview/split/streaming tests pass 7/7. Four PostgreSQL royalty commit/staged/replacement integrations pass 4/4 using isolated `dashboard-sounpub-dev` disposable containers. Other opt-in tests remain skipped. No production Docker, Supabase server, persistent dev DB, or backup used.
- Next gate: database-backed immutable policy registry after effective-period semantics and compatibility rules for historical policy codes are approved. Current version remains fixed in code; no contract variant or cutoff date inferred.
