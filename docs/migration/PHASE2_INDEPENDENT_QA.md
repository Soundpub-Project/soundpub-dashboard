# Phase 2 Independent QA

**Final: PASS — previous concurrent admin/role-change blocker CLOSED.** Local-only closeout, 2026-10-28 09:34–09:36 Asia/Bangkok. Supersedes previous FAIL for this blocker; earlier unrelated gate evidence remains historical, not freshly repeated. No deployment/cutover authorization implied.

Reviewed `backend/migrations/0005_role_authority_lock.sql`, `backend/src/main.ts`, prior report and current backend tests. Base HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; implementation remains uncommitted.

## Shared-lock finding

API transaction locks actor/target user rows, acquires transaction advisory locks keyed by `hashtextextended(id::text, 0)` in UUID order, then rereads verified global roles before mutation. Migration 0005 adds a BEFORE INSERT/UPDATE/DELETE trigger taking the same lock; user reassignment locks both old/new IDs in UUID order. Locks persist until transaction completion. No role-write grant added to runtime.

Independent assertions used current source API, actual restricted `soundpub_app`, local PostgreSQL 17, synthetic identities and disposable `soundpub_test_closeout_*` databases. Scheduling was confirmed through `pg_locks`, not timing alone.

| Regression | Observed result |
| --- | --- |
| Admin wins ordering | QA-only target UPDATE trigger pauses API after authority read. Owner DELETE of actor admin role waits on shared advisory lock. Releasing pause yields HTTP 200, suspended target and exactly one audit/outbox row; DELETE completes only afterward. Previous failure no longer reproduces. |
| Revocation wins ordering | Owner DELETE remains uncommitted; authenticated API waits on authority lock. DELETE commits; API returns 403 after reread, target stays active, no additional audit/outbox rows. |
| Target promotion wins ordering | Owner inserts target superadmin role in open transaction; API waits. After commit, API returns 403, target stays active, no additional effects. Row/FK locking can precede advisory acquisition in this ordering. |
| Trigger coverage | Held matching advisory lock makes INSERT, verification UPDATE, user reassignment (old and new ID separately), and DELETE each fail with bounded lock timeout SQLSTATE 55P03; transactions rolled back. |
| Runtime least privilege | Direct role DELETE through `soundpub_app` still denied with SQLSTATE 42501. |

## Fresh validation

- Entire backend suite (`tsx --test test/*.test.ts`), with explicit isolated `DB_TEST_URL`: **33 passed, 0 failed, 0 skipped**. Includes migration/checksum/rollback, authorization, API, storage, webhook, worker and logging coverage. Typecheck and isolation/secret scan pass.
- Fresh migrations **0001–0005** apply successfully; immediate replay returns empty applied list. Suite also verifies concurrent migration application and failed migration rollback.
- Current-source isolated API: `/health` 200, `/ready` 200 against local DB/storage. Existing local `soundpub-foundation-v2` PostgreSQL, object storage, backend and worker all healthy; container API `/health` and `/ready` both 200. No shared service restarted.
- Source SHA-256: `main.ts` = `e054613e4845bf74c117e382ace1091e1130186dc638929d4fe4b7fcbade249c`; migration 0005 = `05d21c63f9edf4d0e5b35847b8bb2faa553dac2536b18e8b668c40c0fc575ec9`.
- First promotion probe incorrectly required an advisory wait, causing harness timeout/connection reset during teardown. Corrected to observe database lock waiting; complete rerun passed. Both disposable databases removed; catalog confirms zero `soundpub_test_closeout_*` databases remain. QA API stopped; triggers/fixtures removed with databases.

## Scope and limits

Prior report recorded passing ordinary gates and real storage/async slices; those broad runtime flows were not rerun here. No fresh image build/parity proof, outage/recovery, backup/restore, exhaustive catalog comparison, bulk cross-user role-write deadlock stress or live-provider rehearsal. Current source was exercised directly; Docker health alone does not establish image/source parity. Scope establishes this admin suspension transaction's role-authority serialization, not universal authorization freshness across other routes.

Only this QA report changed in project. Harness lived outside repository. Local development credentials handled in memory, never printed or written into report/source. No SSH, production endpoint/data, external provider or offensive-security activity. **Final PASS for authorized Phase 2 QA closeout; reproduced blocker resolved.**
