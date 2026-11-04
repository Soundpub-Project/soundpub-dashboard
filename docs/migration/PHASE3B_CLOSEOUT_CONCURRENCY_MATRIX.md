# Phase 3B closeout concurrency matrix

Agent E evidence, 2026-10-28. Scope: current Artist/Label ownership transactions and role authority. Synthetic data only.

## Execution and isolation

From `backend`:

```powershell
node --import tsx --test test/phase3b-concurrency.test.ts
```

Requires installed backend dependencies and local Docker Desktop's `desktop-linux` context, with a named-pipe endpoint. The suite refuses a remote Docker endpoint and ignores database environment URLs. It creates a uniquely named PostgreSQL 17 Alpine container, random loopback-only port, fresh `soundpub_test_concurrency` database, isolated roles, migrations and synthetic fixtures. No host directories are mounted. Runtime transactions authenticate as restricted `soundpub_app`; fixture setup, role revocation and physical-delete probes use the disposable owner connection. Cleanup closes pools and removes only this run's container and anonymous volumes, including after test failures. Another agent's database/container is never reused or reset.

All existing backend migrations apply to the blank database; repeat migration is checked. No required test has an environment-dependent skip. Missing Docker or migration failure fails the suite.

## Deterministic barrier

Two dedicated PostgreSQL clients begin transactions. The first executes its mutation and holds locks without committing. The second starts the competing operation. An independent observer must see `wait_event_type = 'Lock'` and the first PID in `pg_blocking_pids(second_pid)` before the first transaction commits or rolls back. Poll intervals only observe the barrier; elapsed time never selects the winner. Barrier failure fails the test. Statement, lock and barrier deadlines bound failed runs.

The tests call actual `labelsInTransaction` operations on restricted connections; they do not mock repository queries or backend responses. Tests assert domain `ApiError.statusCode`/`code`, not HTTP transport. Physical deletion deliberately probes the database FK boundary because permanent Artist deletion has no Phase 3B service endpoint.

## Matrix

| Race; first transaction holds barrier | Expected second outcome | Persisted evidence |
| --- | --- | --- |
| Transfer A→B vs transfer A→C | 409 `CONFLICT` | Parent B, exactly one membership, original membership ID preserved, one success audit with old A/new B |
| Aborted transfer A→B vs transfer A→C | Second succeeds after first rolls back | Parent C, one membership, only second success audit |
| Transfer A→B vs admin detach expecting A | 409 `CONFLICT` | Parent B and membership B; no failed detach success audit |
| Detach A vs transfer A→B | 409 `CONFLICT` | Independent parent, zero memberships, only detach audit |
| Transfer A→B vs physical backend-user DELETE | SQLSTATE `23503` | User/profile and artist metadata retained, parent/membership B, transfer audit only |
| Transfer A→B vs membership removal by former label A | 403 `FORBIDDEN` | Former label cannot remove B's membership; transfer audit only |
| Actor admin role DELETE vs transfer using cached admin principal | 403 `FORBIDDEN` | Original parent/membership A, no transfer success audit |
| Transfer vs actor admin role DELETE | DELETE waits, then succeeds | Transfer committed while authority existed; role absent afterward; one transfer audit |
| Destination label role DELETE vs transfer | 400 `BAD_REQUEST` | Original parent/membership A, no transfer success audit |
| Independent membership assign to A vs valid removal expecting A | Both succeed in serial order | Independent parent, zero memberships; both success audits |
| Source label role DELETE vs its roster removal using cached label principal | 403 `FORBIDDEN` | Original parent/membership A, no roster mutation success audit |
| Transfer A→B vs artist deactivation using Users repository locks | Deactivation waits, then succeeds | Artist inactive, parent/membership B consistent, transfer audit retained |

Every case checks current parent, exact membership cardinality/label, retained artist metadata and exact success-audit request IDs. Transfer checks previous/new parent audit metadata. Failed operations roll back; the aborted-winner case proves that an uncommitted success audit disappears with its relationship change.

## Locking findings and limits

`usersRepository.lock` acquires ordered `backend_users` row locks, then sorted, deduplicated transaction advisory locks keyed by principal UUID, then re-reads verified global roles. Transfer includes actor, artist, expected source and destination. Profile UPDATE locks and expected-parent checks serialize current relationship changes. Deferred composite FK and unique artist binding prevent duplicate or mismatched current memberships for these service operations.

Migration `0005_role_authority_lock.sql` makes role DML acquire the same advisory authority lock. Revocation committed first therefore wins over cached principal claims. Transfer locked first can finish before revocation; the revocation cannot commit ahead of that transfer. Both orderings are exercised and no stale-authority transfer succeeds after revocation commits.

Role DELETE probes use deliberate owner DML to exercise the trigger and stale-principal boundary, bypassing Users service dependency checks. In particular, source-label role deletion can leave a synthetic label with dependents; this test proves subsequent denial, not that such a revocation is allowed by the public Users contract. Deactivation uses Users repository locking/status update, not a full API request. No claim covers arbitrary owner DML bypassing all service invariants, every possible lock interleaving, deadlock freedom, browser acceptance, or historical-domain FK protection; populated historical evidence belongs to Agent D.

## Results

Final focused execution: **PASS — 13 tests (12 race cases plus parent), 0 failed, 0 skipped**, duration 6.98 seconds. Strict TypeScript validation of both new test/support files and imported source: PASS. Container cleanup independently checked: zero containers with `soundpub.test=phase3b-concurrency` remain. Focused whitespace check: PASS.

Files added: `backend/test/phase3b-concurrency.test.ts`, `backend/test/support/concurrency-postgres.ts`, and this matrix. No shared source changes required. Production/shared hosts accessed: NO. Production credentials/data used: NO. Production traffic changed: NO.
