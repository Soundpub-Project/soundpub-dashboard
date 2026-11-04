# Phase 3E closeout skipped tests

Date: 2026-10-29. Agent F. Required skipped tests: **0 in the completed closeout runner execution**. Default `npm --prefix backend test` still conditionally skips four suites when their explicit URLs are absent; use the acceptance runner below. No skip was deleted, relabeled optional, or counted as a pass.

| Test path | Original skip reason / dependency | Required? | Resolution | Observed status |
| --- | --- | --- | --- | --- |
| `backend/test/db.test.ts` | Missing `DB_TEST_URL`; destructive migration/checksum/rollback fixture | Yes, Phase 2 foundation | Fresh `soundpub_test` database | PASS, executed |
| `backend/test/api-users.test.ts` | Missing `USERS_DB_TEST_URL`; user API/runtime/migration fixture | Yes, Phase 3A authority | Fresh `soundpub_test_users` database | PASS, executed |
| `backend/test/api-artists-labels-db.test.ts` | Missing `ARTISTS_DB_TEST_URL`; requires `ARTISTS_DB_RUNTIME_URL` too | Yes, Phase 3B ownership | Fresh `soundpub_test_artists`, separate `soundpub_app` login | PASS, executed |
| `backend/test/release-track-db.test.ts` | Missing `RELEASE_TRACK_DB_TEST_URL`; requires `RELEASE_TRACK_DB_RUNTIME_URL` too | Yes, Phase 3C integrity | Fresh `soundpub_test_release_tracks`, separate `soundpub_app` login | PASS, executed |

Inventory command: `rg -n 'skip:|\.skip\(' backend/test scripts/tests`. Exactly four environment skip sites found. No outside-scope skips claimed as financial acceptance.

Acceptance command from repository root: `node scripts/phase3e-closeout-regression.cjs`.

Runner verifies local Docker Desktop named-pipe context, starts its own PostgreSQL 17 Alpine container bound to loopback on a random port, creates four independent databases and owner/runtime roles, and supplies generated URLs only to the child test process. It removes inherited database/provider credential variables and removes its own container/volumes in `finally`. Existing Docker-dependent suites create their own isolated fixtures. No shared Supabase, SSH, real provider or production financial data required.

Prerequisites: Node 22–24, installed root/backend dependencies, running local Docker Desktop Linux engine, and cached `postgres:17-alpine` (or image retrieval access). Missing infrastructure fails acceptance; it does not silently skip. Runner limits backend file concurrency to two to reduce Docker contention and rejects nonzero exit status or nonzero skip count. The runner does not make bare `npm test` environment-independent.
