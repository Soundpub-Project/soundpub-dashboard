# Phase 3B Independent QA

Date: 2026-10-28  
Scope: final current working tree; backend migration/services/API and frontend Artist/Label security/parity.  
Verdict: **BLOCKED / NOT DECOUPLED**.

No production or shared Supabase access occurred. No SSH, deployment, production credential, production data, production traffic, or remote server mutation occurred. Independent QA used an owned disposable local PostgreSQL instance and removed it after execution. No product source was edited; this report is the only file updated by this QA pass.

## Priority findings

### P1 - Full live browser mutation and error matrix remains unproven

A real browser harness now exists at `docs/migration/phase3b-browser-acceptance.mjs`. Its saved results in `docs/migration/phase3b-browser/results.json` prove the roster page at 390x844, 768x1024, and 1440x900, with no horizontal overflow, bearer-token backend requests, and no observed direct `/rest/v1` or `/functions/v1` Artist/Label request. This closes the prior claim that no browser harness or viewport evidence existed.

The harness explicitly uses mocked API responses and covers list/transport only. It does not prove create, edit, transfer, detach, persisted reload, validation, empty/loading states, 401, 403, 409 stale-parent/stale-privilege handling, 5xx recovery, or transaction rollback through browser -> real API -> disposable PostgreSQL.

Gate: **BLOCKED** until the complete live browser mutation/error matrix passes against the final backend and disposable PostgreSQL at all required viewports.

### P1 - Orphan audit and repair remains absent

Backend mode fails closed instead of using the legacy orphan RPC, which is the safe current behavior. However, no backend orphan inventory/repair workflow or executable repair test exists. Current relationship constraints prevent newly inconsistent membership/parent pairs, but they do not demonstrate detection and controlled repair of pre-existing orphan states.

Gate: **BLOCKED** for Orphan Prevention / Repair until a backend-owned scan, reviewed repair contract, authorization rules, audit behavior, rollback behavior, and disposable-DB tests exist.

### P2 - Historical-domain integration and concurrency breadth remains incomplete

Current transfer and detach code changes only current `profiles.parent_label_id` and current `soundpub.artists` membership, preserves stable membership identity on transfer, writes audit in the same transaction, and contains no Release/Track/Royalty mutation. This is correct non-rewrite behavior for the extracted Phase 3B model.

The disposable integration fixture does not contain populated historical Release/Track/Royalty ownership references. Therefore it cannot prove cross-domain references survive transfer/detach or enforce future deletion eligibility against realistic historical rows. Existing tests also do not cover the full requested real-PostgreSQL race set, including competing transfers, role/status change during transfer, and detach/delete versus transfer barriers.

Gate: **BLOCKED** until populated historical-domain integration fixtures and broader deterministic PostgreSQL concurrency tests pass. Full Releases/Tracks or Royalties implementation remains outside Phase 3B scope.

## Closed findings from prior QA

- **Mixed-mode routing: CLOSED.** `src/services/labels.ts` treats any `users`, `artists`, or `labels` selection as a fail-closed Artist/Label boundary, but `requireArtistLabelApi()` permits API work only when all three domains are enabled. `scripts/phase3b-frontend.test.cjs` proves `users`-only mode makes zero Artist/Label API calls and zero legacy calls; the complete domain set routes to API.
- **Roster removal: CLOSED.** Removal guards are optional, matching detach of current membership only. `backend/test/api-artists-labels-db.test.ts` now expects HTTP 200 from the assembled API, verifies `parent_label_id` becomes null, and checks audit persistence. Unit coverage verifies membership deletion, profile preservation, history non-rewrite, authorization denial, guard denial rollback, and atomic audit.
- **`profile_image_url` writes: CLOSED.** `backend/src/artists/contracts.ts` excludes `profile_image_url` from create/patch fields while retaining it only in output DTOs. Strict-object tests reject direct write attempts as mass assignment.
- **Three-viewport roster browser evidence: CLOSED for listed scope.** Mobile, tablet, and desktop mocked roster acceptance passes with no overflow. This is positive list/render/transport evidence, not full browser acceptance.

## Independent evidence

- Backend full suite on owned disposable PostgreSQL 17: **73 passed, 0 failed, 0 skipped**.
- Runtime DB login: restricted `soundpub_app`; DDL denial verified.
- Migration `0007_artists_labels.sql`: apply and repeat migration checks passed.
- Real disposable-DB API chain: managed Artist creation, roster read, authorization denial, transfer, stale-parent conflict, successful detach, current-parent clearing, and audit persistence passed.
- Backend typecheck: PASS.
- Frontend Users adapter check: PASS.
- Phase 3 API client check: PASS.
- Phase 3B routing/media boundary check: PASS.
- Frontend production build: PASS; existing large-chunk warning only.
- Phase 3B scoped frontend TypeScript diagnostics: 0. Whole-project 95-diagnostic legacy baseline remains outside this scope.
- Reviewed source remained stable during disposable-DB execution.

## Security assessment

PASS for exercised backend controls: strict DTO/UUID validation, unknown-field rejection, mass-assignment rejection, current role/status re-read, owner/admin checks, reference-only authority denial, expected-parent conflict, protected-target denial, deterministic locking order, bound SQL, least-privilege runtime login, and same-transaction audit/rollback.

No credential, provider, media-upload, permanent deletion, production identity, or production data path was exercised. Browser stale-authorization and HTTP error behavior remain part of the blocked live browser matrix. Historical dependency and race guarantees remain limited to the evidence described above.

## Gate decision

| Gate | Result |
| --- | --- |
| Artist backend APIs | PASS for implemented Phase 3B operations |
| Label backend APIs | PASS for implemented Phase 3B operations |
| Roster / membership | PASS in unit and disposable-DB API tests |
| Ownership transfer | PARTIAL - functional path passes; historical-domain and concurrency breadth blocked |
| Historical ownership protection | BLOCKED - no populated historical-domain integration fixture |
| Orphan prevention / repair | BLOCKED - constraints exist; backend scan/repair workflow absent |
| Authorization | PASS for exercised backend cases; live browser error/stale-privilege matrix blocked |
| Frontend adapter / routing | PASS for source checks and routing probes |
| Backend-mode Supabase Artist/Label business calls | PASS for inspected routing and mocked roster evidence; full live workflow proof blocked |
| Parity | PARTIAL - roster/removal/routing fixed; full live mutation/error and orphan-repair parity blocked |
| Browser roster at 3 viewports | PASS with mocked API |
| Full browser acceptance | BLOCKED |
| Disposable PostgreSQL | PASS - 73/73 backend tests |
| Regression | PASS for executed backend, adapter, client, typecheck, and build checks |
| Production isolation | PASS for this QA session |
| Independent QA | BLOCKED pending remaining gates |

## Final decision

Phase 3B remains **BLOCKED / NOT DECOUPLED** only on:

1. Full live browser mutation/error-state matrix against real API and disposable PostgreSQL.
2. Backend orphan audit/repair workflow with authorization, audit, rollback, and integration tests.
3. Populated historical-domain integration plus broader real-PostgreSQL concurrency coverage.

Routing activation, roster removal, `profile_image_url` write rejection, and three-viewport roster evidence are no longer blockers.
