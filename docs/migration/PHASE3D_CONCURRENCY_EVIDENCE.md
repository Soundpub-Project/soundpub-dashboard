# Phase 3D concurrency evidence

Executed locally 2026-10-29. Scope: `backend/test/phase3d-concurrency.test.ts` and this document only. Existing dirty tree preserved; no source or existing test edits, SSH, deployment, shared database, or production access.

## Actual results

From `backend`:

```powershell
npx tsx --test test/phase3d-concurrency.test.ts
```

Final execution: exit 0; 6 tests passed, 0 failed, 0 skipped, 0 cancelled; duration 38058.6156 ms. Two preceding executions also passed 6/6 (before final ES2022 compatibility edit).

```powershell
npm run typecheck
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck test/phase3d-concurrency.test.ts
```

Both passed, exit 0. Project typecheck includes source only; separate command checks new test and imported source. Initial direct test typecheck failed with two TS2550 errors for `Promise.withResolvers`; fixed using Promise constructors and reran direct check successfully. No runtime test failures observed. No full-suite run or instrumented line/branch coverage claimed.

## Deterministic race coverage

| Race | Forced interleaving | Asserted outcome |
| --- | --- | --- |
| Two avatar replacements | Newer request pauses inside store verification while older completion demonstrably waits on its transaction | Newer ACTIVE and bound; older CONFLICT and remains PENDING without verification; previous avatar REPLACED; exactly one ACTIVE avatar |
| Cover replacement vs release state | Owner transaction changes release to pending without committing; replacement waits on release row; state transaction commits | MEDIA_RESOURCE_LOCKED before provider verification; previous ACTIVE cover and binding preserved; replacement PENDING |
| Audio replacement vs submission | Replacement pauses in verification; real submission service waits on transaction | Replacement activates and changes release version; stale submission CONFLICT; fresh-version submission succeeds to pending with real media readiness adapter; subsequent audio completion locked |
| Delete vs download | Download pauses inside mock signing; delete waits on transaction | In-flight download allowed; delete then commits; binding cleared and status DELETED; later download NOT_FOUND with no additional signing; bytes retained for capability grace |
| Completion vs authority removal | Owner transaction locks actor and removes verified role; completion waits; revocation commits | Unchanged stale principal receives FORBIDDEN before verification, both in-flight and retry; PENDING object stays unattached |
| Cleanup vs finalize | (1) Valid pending object due for cleanup pauses in verification; cleanup runs while media row locked. (2) Expired pending object pauses inside cleanup removal; finalize waits | (1) SKIP LOCKED deletes zero, finalize succeeds. (2) Cleanup deletes exactly expired object, finalize gets MEDIA_UPLOAD_EXPIRED; ACTIVE avatar and bytes remain bound/intact |

Each fixture calls existing `concurrencyPostgres`: verified local Docker Desktop named-pipe context, random disposable PostgreSQL 17 container, loopback-only published port, migrations applied and checked for idempotence, restricted `soundpub_app` service connections. Two single-connection runtime pools provide stable PIDs; `waitForBlock` proves actual PostgreSQL blocking through `pg_stat_activity` and `pg_blocking_pids`, rather than elapsed-time guesses. Owner connection only seeds data and performs competing state/authority mutations. Pools close and container is removed through fixture cleanup.

Mock object store tracks synthetic byte presence, verification, signing and removals. Explicit barriers pause verification/signing/removal; each barrier wait has an eight-second failure bound. Competing promises install rejection handlers immediately; barrier releases run in finally blocks and fixture cleanup. Cleanup-first case observes a real row-lock wait; finalize-first case awaits cleanup completion while verification remains paused, proving locked pending row was skipped.

## Limits

Coverage is six requested race categories, not every possible scheduling permutation. Avatar case forces newer completion first; cover case forces state change first; audio case forces replacement first; download case forces signing first; authority case forces role removal first. Cleanup covers both winner orders. No claim of exhaustive interleaving, suspension/deletion/transfer variants, live object-store semantics, signed URL expiry, HTTP/browser behavior, or full regression coverage. Payment/provider submission dependencies are synthetic success adapters; media readiness and service transactions are real. Valid but cleanup-due pending metadata in cleanup case is deliberate fixture state to isolate locking from expiry rejection.
