# Supabase to Independent Backend Parity Master Plan

Snapshot: 2026-11-04, Asia/Bangkok.

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
- Expired pending/failed royalty objects now enter a leased CLEANING state, delete both staging and immutable object keys idempotently, retry transient storage failures, and preserve preview-ready/committed originals.
- Browser upload hashing now processes 4 MB slices through incremental SHA-256, and immutable batch detail is server-paginated with stable source-row ordering and bounded `limit`/`offset`. Backend, frontend contract, TypeScript, and production-build checks pass.
- Royalty reconciliation now records append-only server snapshots and diagnostics, requires a different active admin from the uploader, writes through a separate `soundpub_reconciler` database credential, binds every result to semantic audit/outbox evidence, rechecks current ledger integrity before UI/balance/payout use, derives `RECONCILED` without mutating batches, and gates ordinary plus Label Custom payout readiness. DB guards reject cross-entry allocation drift, late batch fill, forged approval evidence, and correction rows without exact earning plus adjustment finance proof.
- Remaining Phase 3/6 scope: staged preview review UI, superadmin session takeover, scheduled global reconciliation, and optional explicit approval revocation. Import and replacement share private signed file sessions; inline replacement remains compatibility-only.

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
