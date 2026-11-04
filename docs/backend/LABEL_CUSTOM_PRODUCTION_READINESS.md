# Label Custom production readiness

Decision date: 2026-11-04, Asia/Bangkok.

## Decision

**READY FOR CONTROLLED PRODUCTION ROLLOUT, NOT AUTO-DEPLOYED.**

Application implementation, isolated dev deployment, security regression, integration coverage, frontend parity, and synthetic recovery rehearsal meet the authorized program scope. Production deployment remains a separate, explicit, human-approved operation.

## Scope delivered

- Label Custom PIC owns one unit and manages non-login artists with required contact data but no password or dashboard principal.
- Releases and tracks use canonical `artist_id` while preserving supported login-artist compatibility.
- Private media capabilities derive authorization from current PIC/unit/resource ownership.
- Royalties retain artist/release/track/platform/period attribution while financial ownership belongs to PIC.
- Balance and payout aggregate at PIC level; custom artists never become wallet or payout recipients.
- Destination verification, reconciliation approval, revocation, replacement, reservation, cancellation, settlement, and replay controls exist.
- Frontend supports managed artist, release, media, royalty reporting/import, payout readiness, and settings flows through backend APIs.
- Keycloak partner SSO remains separate; local auth remains primary for this dashboard implementation.

## Architecture controls

- Backend modular monolith: Fastify, PostgreSQL, Zod, worker, and provider adapters.
- PostgreSQL is system of record and server authorization is authoritative.
- Supabase has no new runtime authority for delivered Label Custom domains.
- Money uses exact integer minor units, transactional ledger events, audit evidence, and idempotency receipts.
- Ownership is derived server-side; client owner/role claims grant no authority.
- Media stays private; backend authorizes before issuing short-lived signed capabilities.
- Recovery importer accepts strict manifest-bound staging input and rejects credentials/session restoration.

## Security controls

- Role hierarchy prevents ordinary admin from creating or mutating protected `admin`/`superadmin` identities, including Label Custom owners.
- Superadmin management remains explicit and audited.
- Custom artists have no login credential, session, refresh token, password reset, wallet, or payout account.
- IDOR protections resolve unit, PIC, artist, release, track, media, report, and payout ownership from database state.
- Invalid idempotency input fails closed.
- Create/replay paths persist operation receipts and reject conflicting payload reuse.
- Balance/readiness use a consistent `REPEATABLE READ` snapshot.
- Old readiness approval replay after revocation cannot reopen eligibility; new approval requires a new operation key.
- Destination verification evidence and reconciliation approval are independent; revocation invalidates current readiness.
- Logs and API responses avoid credentials, bank details, tokens, and signed capability leakage.
- Independent final read-only audit found no P1/P2; focused replay, revocation, rollback, hierarchy, and typecheck checks passed.

## Test evidence

| Gate | Result |
| --- | --- |
| Backend typecheck/build/unit | 227 tests; 193 pass, 34 opt-in skip, 0 fail |
| Full disposable Docker integration | 274 tests; 268 pass, 6 skip, 0 fail |
| Recovery rehearsal | 12 pass, 0 skip, 0 fail |
| Frontend build | PASS; non-blocking bundle-size warning |
| Focused frontend Label Custom contracts | PASS |
| Browser route/session smoke | PASS; synthetic account removed |
| Final dev health/readiness | PASS |

Domain E2E covers managed artist creation, canonical release/track ownership, royalty attribution and totals, destination verification, reconciliation approval, payout reservation, replay, revocation, old-key retry, and revoked destination replacement.

## Migration state

Required additive migrations:

1. `0023_label_custom.sql`
2. `0024_label_custom_release_tracks.sql`
3. `0025_label_custom_finance.sql`
4. `0026_label_custom_payout_readiness.sql`
5. `0027_label_custom_royalty_reporting.sql`

The isolated dev migration job exits `0`; final rerun reports no pending migration. Production migration has not been executed.

## Dev deployment evidence

Approved Compose project: `dashboard-sounpub-dev` only.

| Component | Local endpoint/state |
| --- | --- |
| Frontend | `127.0.0.1:8281`, healthy |
| API | `127.0.0.1:3300`, healthy |
| PostgreSQL | `127.0.0.1:55433`, healthy |
| Object storage | `127.0.0.1:9100`, healthy |
| Worker | healthy |
| Migration/seed jobs | exited `0` |

Health returned `{"status":"ok"}`, readiness returned `{"status":"ready"}`, `/auth` returned HTTP `200`, and no disposable test container remained.

## Recovery evidence

Synthetic staging rehearsal restored ten records into each of two independent disposable PostgreSQL targets. Target hashes matched, source hashes stayed unchanged, session/refresh material was rejected, unresolved owner mapping was reported, dirty apply was blocked, and rollback/replay were idempotent.

This is not proof of real backup recoverability. No file under `backups/` was opened and no production-domain restore was performed.

## Controlled rollout prerequisites

Before production work, named human owners must approve all items:

1. Freeze release revision and archive current migration checksums/build artifacts.
2. Confirm current production topology, configuration, secrets source, database capacity, storage CORS, callback URLs, and monitoring without exposing secret values.
3. Produce and verify a current production backup plus a separately authorized restore rehearsal for real domain data.
4. Run migration dry review against a disposable clone and record timing, locks, row counts, constraints, and reconciliation.
5. Define maintenance window, user communication, deploy operator, database operator, security reviewer, finance verifier, and rollback decision owner.
6. Disable legacy writes for migrated domains before enabling backend writes; never operate dual write authorities.
7. Run post-deploy health/readiness, migration status, auth, role, managed artist, release, media, royalty, balance, payout, worker, audit, and reconciliation checks.
8. Observe error rate, latency, queue depth, database locks/connections, storage failures, payout invariants, and authorization denials through the agreed soak window.

## Rollback plan

Rollback trigger examples: migration error, authorization bypass, ledger/reconciliation mismatch, payout overdraw/replay defect, material media access failure, worker backlog growth, or sustained health/readiness failure.

1. Stop new write traffic for affected migrated domains.
2. Preserve database, audit, outbox, worker, and application evidence; do not erase failed state.
3. Cancel/revoke outstanding capabilities and pause payout execution when finance integrity is uncertain.
4. Roll application containers back to the approved prior image only if schema remains backward compatible.
5. Prefer forward-fix for additive migrations. Use database restore only through the approved recovery procedure and rollback owner.
6. Reconcile ledger, payout reservations, royalty imports, outbox events, and storage objects before reopening writes.
7. Re-run security and domain acceptance gates; document incident and decision.

Never switch migrated domains back to uncontrolled Supabase writes as an emergency shortcut.

## Residual risks

- Full real production-domain recovery rehearsal remains outstanding and is a rollout prerequisite.
- Main frontend JavaScript bundle is about 2.3 MB; route/vendor splitting is recommended after correctness rollout.
- Signed media URLs cannot be recalled at provider level after issue and remain usable until their short expiry.
- Browser smoke proves primary route/render/session health, while exhaustive visual/accessibility matrix across every browser/device remains future hardening.
- Production data volume, lock duration, provider rate limits, and operational monitoring can only be confirmed in an approved production-like rehearsal.
- Simultaneous approval/revocation and role-revocation-versus-payout collisions remain recommended production-like stress tests.
- Frontend readiness operation keys survive retries while component stays mounted; browser reload requires deliberate user retry with a fresh operation key.

## Go/no-go authority

This document is technical readiness evidence, not deployment authorization. Production remains **NO-GO** until controlled rollout prerequisites have named owners and explicit approval. Once approved, execute from a dedicated cutover runbook; never reuse local dev commands or project `dashboard-sounpub-dev` as production instructions.