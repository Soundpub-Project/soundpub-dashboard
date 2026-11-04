# Label Custom execution and evidence status

Snapshot: 2026-11-04, Asia/Bangkok.

Scope selesai: Phase 0 sampai Phase 10 sesuai `LABEL_CUSTOM_MASTER_PLAN.md`, dengan production deployment tetap di luar scope. Implementasi dan validasi dilakukan hanya pada repository lokal dan stack Docker terisolasi `dashboard-sounpub-dev`.

## Safety result

- Production Docker dan port `8181` tidak disentuh.
- Remote server dan production data tidak diakses.
- `.env` tidak dibaca atau dicetak.
- Direktori `backups/` tidak dibaca, diubah, dipindah, didekripsi, atau dihapus.
- Supabase hanya menjadi referensi migrasi; tidak ada dependency runtime Supabase baru.
- Dev stack memakai frontend `8281`, API `3300`, PostgreSQL `55433`, dan object storage `9100`.

## Phase status

| Phase | Status | Evidence utama |
| --- | --- | --- |
| 0 - Freeze baseline dan contracts | PASS | Invariant identity, ownership, role, API, finance, media, dan recovery dikunci dalam master plan dan tests. |
| 1 - Fondasi Label Custom | PASS | PIC/unit, managed artist tanpa login, authorization hierarchy, archive lifecycle, audit, dan regression tests. |
| 2 - Release dan track ownership | PASS | Canonical `artist_id`, compatibility login artist, unit ownership, CRUD/authorization, migrations dan E2E. |
| 3 - Private media | PASS | PIC/unit ownership, signed capability singkat, CORS dev, revocation, replacement, cleanup, dan negative tests. |
| 4 - Royalty attribution dan ingestion | PASS | Artist attribution, PIC financial owner, immutable ledger, dedupe, reconciliation, reporting, dan CSV export berotorisasi. |
| 5 - Balance dan payout PIC-only | PASS | Balance snapshot konsisten, destination verification, readiness approval/revocation, reservation, replay safety, dan PIC-only payout. |
| 6 - Frontend parity | PASS | Artist, release, royalty, payout, settings, upload, error states, API adapters, build, dan browser route smoke. |
| 7 - Integration, security, dan QA | PASS | Full backend Docker suite, domain E2E, role hierarchy, IDOR/mass-assignment boundaries, idempotency, rollback, dan audit review. |
| 8 - Recovery/import rehearsal | PASS WITH LIMIT | Dua disposable target synthetic menghasilkan hash identik, source tetap, sessions ditolak, unresolved owner dilaporkan, rollback/replay lulus. Full production-domain restore belum dijalankan. |
| 9 - Dev rollout isolated | PASS | `dashboard-sounpub-dev` healthy; migration clean; health, readiness, frontend, PostgreSQL, worker, dan storage sehat. |
| 10 - Production readiness tanpa deployment | PASS WITH CONDITIONS | Paket readiness, rollback, residual risks, dan controlled-rollout decision tersedia. Production belum dan tidak otomatis dideploy. |

## Database migrations

| Migration | Domain |
| --- | --- |
| `0023_label_custom.sql` | PIC unit, managed artist, role foundation |
| `0024_label_custom_release_tracks.sql` | Canonical release dan track ownership |
| `0025_label_custom_finance.sql` | Royalty attribution, ledger, balance, payout foundation |
| `0026_label_custom_payout_readiness.sql` | Destination verification, reconciliation approval, revocation |
| `0027_label_custom_royalty_reporting.sql` | Authorized royalty reporting dan projections |

Final migration container exited `0`. Latest run reported `{"applied":[]}`, proving the rebuilt dev stack was already fully migrated.

## Test evidence

### Backend Docker-free

Commands from `backend/`:

```powershell
npm run typecheck
npm run build
npm test
```

Result: **227 tests, 193 pass, 34 skip, 0 fail**. Skips are explicit integration opt-ins.

### Backend Docker integration

```powershell
$env:RUN_DOCKER_TESTS = '1'
npm run test:docker
Remove-Item Env:RUN_DOCKER_TESTS
```

Result: **274 tests, 268 pass, 6 skip, 0 fail**. Disposable fixtures used only approved project-scoped Docker commands and synthetic data.

### Recovery rehearsal

```powershell
$env:RUN_RECOVERY_REHEARSAL = '1'
npx tsx --test --test-concurrency=1 test/label-custom-recovery.test.ts test/label-custom-recovery-rehearsal.test.ts
Remove-Item Env:RUN_RECOVERY_REHEARSAL
```

Result: **12 pass, 0 skip, 0 fail** across two independent disposable PostgreSQL targets.

### Frontend

Commands from repository root:

```powershell
npm run build
node src/components/releases/label-custom.test.cjs
node src/components/finance/label-custom-finance.test.cjs
node src/services/label-custom.test.cjs
```

Result: build and all focused suites pass. Vite reports a non-blocking main bundle chunk warning around 2.3 MB.

### Browser acceptance

Synthetic superadmin smoke passed for login and routes `/dashboard`, `/dashboard/users`, `/dashboard/releases`, `/dashboard/all-royalties`, `/dashboard/admin-payouts`, dan `/dashboard/settings`. Session/profile returned `200`, without post-login console errors or unexpected network failures. Synthetic account was deleted after testing.

## Security closure

- Ordinary admin cannot mutate a protected Label Custom owner carrying `admin` or `superadmin` role.
- Superadmin hierarchy remains explicit through `canManageUser`; frontend role checks never grant server authority.
- Balance and payout readiness read under a consistent `REPEATABLE READ` transaction snapshot.
- Invalid artist `Idempotency-Key` returns `400 BAD_REQUEST`; it is not silently replaced.
- Identical payout destination creation is replay-safe; revoked destination can be replaced by a new pending version.
- Destination verify/revoke operations are replay-safe and do not duplicate records.
- Readiness approval uses a durable operation receipt. Retrying an old approval key after revocation returns the old result but cannot reopen readiness.
- A new approval after revocation requires a new operation key and current valid evidence.
- Private media authorization occurs before capability issuance; signed URL lifetime remains deliberately short.
- Independent final re-audit found no P1/P2; 30 focused tests, seven additional replay/rollback scenarios, and typecheck passed.

## Dev deployment evidence

Final isolated stack status on 2026-11-04:

- `dashboard-sounpub-dev-backend-1`: healthy, `127.0.0.1:3300`.
- `dashboard-sounpub-dev-frontend-1`: healthy, `127.0.0.1:8281`.
- `dashboard-sounpub-dev-postgres-1`: healthy, `127.0.0.1:55433`.
- `dashboard-sounpub-dev-object-storage-1`: healthy, `127.0.0.1:9100`.
- `dashboard-sounpub-dev-worker-1`: healthy.
- Migration and seed jobs exited `0`.
- `GET /health` returned `{"status":"ok"}`.
- `GET /ready` returned `{"status":"ready"}`.
- Frontend `/auth` returned HTTP `200`.
- No leftover `dashboard-sounpub-dev-test-*` containers remained.

## Remaining limits

- Full restore of real production-domain data was not run because production and `backups/` are prohibited. Synthetic recovery proves importer mechanics, deterministic replay, rejection, and rollback only.
- Frontend bundle size should be reduced with route/vendor splitting, but does not block correctness rollout.
- Already-issued signed media URLs remain usable until their short expiry; revocation blocks new capability issuance and backend mutations.
- Production cutover still requires an explicit human-approved window, current backup/recovery validation, configuration review, monitoring owner, and rollback authority.

## Decision

**READY FOR CONTROLLED PRODUCTION ROLLOUT, NOT AUTO-DEPLOYED.**

No production operation was executed. See `LABEL_CUSTOM_PRODUCTION_READINESS.md` for gate conditions and rollback plan.