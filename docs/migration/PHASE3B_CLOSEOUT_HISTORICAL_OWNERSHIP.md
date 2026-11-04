# Phase 3B Closeout Historical Ownership

Date: 2026-10-28

Agent D result: **PASS for synthetic historical ownership evidence**. Overall Phase 3B gate remains coordinator/independent-QA responsibility.

## Contract and scope

Reviewed the original Phase 3B final report, authorization matrix, transfer contract, historical ownership report, parity matrix, frontend regression, security report, test report, independent QA, database model, migration 0007, and current Artist/Label services.

`profiles.parent_label_id` and UUID-bound `artists` membership express current management. Historical release owner and royalty attribution retain their original UUID context. Current transfer uses `keep_old_label`. Historical ownership grants no current management access. Deletion approval records review only; it does not delete or deactivate an account.

Only new focused test/support files and this report were added. No production migration, Release/Track/Royalty implementation, shared file modification, SSH, provider connection, or shared/production host access was performed.

## Isolation and populated fixtures

- `backend/test/support/historical-ownership.ts` creates its own uniquely named `soundpub-historical-<UUID>` container using local Docker Desktop, PostgreSQL 17, an ephemeral loopback-only port, and a blank `soundpub_test_historical` database.
- Docker context endpoint must be a local Windows named pipe. No application `.env`, existing database URL, or concurrency-agent database is used. The owned container/database is removed in teardown, including setup failure. Missing Docker/readiness fails the test; no required test is skipped.
- The complete backend migration chain is applied and repeat application must return no pending migrations. Real services execute through restricted `soundpub_app`; fixture setup and independent persisted-row queries use the disposable owner connection.
- A separate private `historical_fixture` schema exists only inside this test database. It represents legacy release `artist_user_id`/`label_id`, royalty `artist_user_id`/`label_user_id`, recipient UUIDs, amount, provenance, and completed timestamps. Restrictive FKs bind history to durable profiles, never to removable current roster membership.
- Each of five scenarios gets separate admin, Label A, Label B, and artist UUIDs, two completed historical release rows, and two completed royalty rows. One royalty recipient is Label A and one is the artist. All scenarios deliberately reuse the same display name; identity remains UUID-based. Total populated evidence: 10 release and 10 royalty rows.
- Runtime has no access to the historical fixture schema. Snapshot checks compare every populated field, row count, amount, provenance, and timestamp after committed service operations. Snapshot reads use the independent owner connection.

## Executable proofs

| Proof | Persisted assertions | Result |
| --- | --- | --- |
| Transfer A to B | Current parent and roster become B; membership UUID remains stable; every historical field stays unchanged; A loses Artist read authority despite retained historical ownership; B gains current read authority; one transfer audit records old/new parent and `keep_old_label` | PASS |
| Label service detach | Current parent becomes null; membership disappears; artist/profile remains; all historical rows unchanged; joins resolve release, artist, historical label, and royalty recipient with two surviving attributions | PASS |
| Artist service detach | Same persisted independence and historical-reference checks through the second public service path | PASS |
| Delete/review safety | Request and approval succeed without deleting artist or changing current relation/history; runtime profile deletion denied with PostgreSQL `42501`; owner deletion of artist and historical label rejected by existing restrictive dependencies with `23503` | PASS |
| Stale transfer | Controlled 409; current relation and all historical fields unchanged; no success audit for failed request; runtime historical-schema access denied with `42501` | PASS |

Deletion evidence follows the current review-only contract. Existing Artist/Label and fixture dependencies both exist during owner-delete checks; the proof does not attribute rejection exclusively to historical FKs. No new hard-delete or deactivation capability was added.

## Reproduction and results

From `backend`, with local Docker Desktop running and existing project dependencies installed:

```powershell
npx tsx --test test/historical-ownership.test.ts
npx tsx --test test/artists.test.ts test/labels.test.ts
npx tsc --noEmit --target ES2022 --module NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck test/historical-ownership.test.ts
docker ps -a --filter name=soundpub-historical- --format '{{.Names}}'
```

- Historical PostgreSQL run: **6 passed, 0 failed, 0 skipped** (five child proofs plus parent test).
- Focused Artist/Label regression: **19 passed, 0 failed, 0 skipped**.
- Strict typecheck explicitly including new test/support: **PASS**. Default backend typecheck excludes tests, so explicit inclusion matters.
- Teardown verification: no historical proof container remains.
- Initial setup found the migration chain requires `soundpub_owner`; fixture bootstrap now creates that disposable role before migration. Final fresh-container run passes.

## Evidence limits and handoff

This closes the populated synthetic cross-domain ownership gap authorized for Phase 3B. Historical fixture definitions are illustrative test contracts, not the final Release/Royalty schema or a production dependency inventory. Future domain extraction must retain original UUIDs/provenance, enforce durable reference constraints, and rerun these guarantees against its own schema before relaxing deletion rules.

Browser acceptance, orphan repair, deterministic concurrency, full regression, and independent QA are owned by other closeout agents. This focused result does not declare Phase 3B DECOUPLED.

Production Artist/Label data imported: NO. Production credentials used: NO. Production traffic switched: NO. Shared Supabase accessed or mutated: NO.
