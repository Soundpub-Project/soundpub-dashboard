# Migration test strategy

Date: 2026-10-27 (Asia/Bangkok). Scope: Phase 1 planning for Phase 2 acceptance. This assignment writes documentation only. No test below was executed by this planner; no backend, production, provider, identity, or storage change is authorized by this document.

## Evidence and result semantics

Read the full Phase 1 attachment, root `AGENTS.md`, `.agents/skills/supabase/SKILL.md`, and `SUPABASE_MIGRATION_AUDIT.md`. Supporting evidence: `DATABASE_OBJECT_MANIFEST.md`, `CANONICAL_SCHEMA.sql`, `SCHEMA_DRIFT_REPORT.md`, `AUTH_MIGRATION_MATRIX.md`, `FINANCIAL_INTEGRITY_BASELINE.md`, and `STORAGE_MANIFEST.csv`, all in this directory. The later user request limits this assignment to three planning documents and supersedes the attachment's broader implementation work.

| Status | Meaning |
| --- | --- |
| UNVERIFIED | Defined but not run, evidence unavailable, or independent rerun missing; never counts as PASS |
| BLOCKED | Prerequisite or policy decision missing; never counts as PASS |
| FAIL | Executed assertion disagrees with intended contract, including unsafe legacy behavior |
| PASS | Named executor ran assertions on identified artifacts/environment, captured evidence, and independent QA reran mandatory checks |
| Reported observation | Another workstream's dated evidence; not this planner's behavioral PASS |

Reported observations: 33 tables, 56 functions, 51 definers, 78 policies, 47 triggers, 101 indexes and 43 FKs. Schema workstream reports isolated application-DDL round-trip success with minimal auth prerequisites; it explicitly blocks production-equivalent reproduction. Financial workstream reports zero arithmetic/reservation residuals at its snapshot, not historical settlement correctness. Auth manifest identifies 182 linked profiles among 211 shared-host users; linkage is not approved exclusive ownership. Storage manifest includes `NOT_COMPUTED` checksums and metadata-only existence. Neither bytes nor restore are proved by these entries. The original audit's 14 runtime checksum differences are historical findings; newline-only webhook differences in the financial report do not establish resident runtime equivalence. Re-inventory before acceptance.

All test IDs below start UNVERIFIED. Security, financial provenance, composer RPC compatibility, ownership, full restore and independent QA are blocking prerequisites. Missing companion reports, including security, runtime mapping, backup/restore and compatibility reports, must be obtained when available; their names or existence alone confer no PASS.

## Execution and evidence contract

Use an isolated disposable environment with synthetic fixtures, dedicated test identities, local provider stubs and outbound deny-by-default networking. Restore real backups only inside approved encrypted restricted infrastructure; use aggregate evidence in reports. Never run mutation-capable scripts against the shared production host. Local rollback of SQL cannot undo email, HTTP calls, workers or file writes, so isolation and egress controls are required even for transaction-wrapped tests.

Each run records test ID, fixture revision, source/target commit and schema checksum, runtime image/source digest, environment identifier, snapshot/cursor, timestamp, executor, command/request without secrets, expected and actual assertions, mismatch counts, artifact checksum, and independent QA identity/result. Store payloads, identity maps and row comparisons privately with access and retention controls. Do not publish tokens, signed URLs, bank details, financial values, raw webhook bodies or personal data. A 200, healthy container, zero exit from import, or empty result set alone is insufficient.

For every API/RPC contract in the compatibility matrix, record method/path or SQL signature, request validation, authorization, JSON keys/types/nullability, status/error mapping, pagination/order/filter behavior, transaction boundary and side effects. Run identical fixtures against isolated current behavior and future target. Unsafe legacy behavior is a failing regression target, never a compatibility requirement. Changes to intended business behavior require an explicit approved contract.

### Checkable local static checks (not run here)

With installed lockfile dependencies, these commands check separate concerns:

```powershell
npm exec -- tsc --noEmit -p tsconfig.app.json
npm exec -- tsc --noEmit -p tsconfig.node.json
npm run lint
npm run build
node --test scripts/process-royalty-upload.test.cjs
```

STATIC-01: require each exit code zero, archive sanitized diagnostics; distinguish pre-existing failures from changed-code failures but keep unresolved mandatory checks blocked. Root `tsconfig.json` has no source files, so a root-only typecheck is insufficient. There is no `npm test` script. Review the existing Node test and its external-call behavior before execution; no new test runner is required by this plan. Edge runtime checks must use the actual pinned Deno/runtime configuration, separately from Vite compilation.

STATIC-02: parse SQL by restoring the reviewed canonical baseline to a blank disposable PostgreSQL 17.6 instance with documented real auth contracts, roles and required extensions; run with `psql -X -v ON_ERROR_STOP=1`. Require normalized DDL equivalence including ACL/default privileges, RLS, function bodies/owners/search paths, auth signup trigger, enums, constraints, indexes and triggers. Test migration ordering, unique versions, checksum tamper rejection, failed-step history and stated rerun/idempotency policy. Minimal auth stubs only qualify an application-DDL test. Never replay destructive historical reset or balance-repair SQL as a generic migration.

STATIC-03: validate configuration names/casing (`soundpub`, not `Soundpub`), browser publishable-key usage, server-only provider/service secrets, lockfiles, runtime shared imports, callback allowlists and deployment hashes. Inspect generated bundle/assets for privileged credentials and exposed debug/schema exports without printing matches containing secrets. Require zero forbidden exposures. Do not run or render production Compose interpolation that prints secrets.

## Authorization matrix

Synthetic fixtures: unrelated owners A/B, artists A/B, labels A/B and a managed artist linked only to A; ordinary authenticated identity without a business role; admin; superadmin; inactive copies of each relevant role; suspended copies with both newly requested and pre-existing sessions. Seed two unrelated tenant datasets. Owner is a relationship, not a role. Execute each cell through direct HTTP/PostgREST/RPC and applicable storage routes, bypassing UI guards; also check UI denial without relying on it.

Legend: D = deny and no state change; O = own resource only; L = explicitly linked label resources only; P = allowed only under documented business policy; A = authorized scoped operation. Public approved assets are tested separately. Unresolved P cells are BLOCKED, not permission to allow.

| Actor | Private record read | Owned business write | Other owner's write | Role mutation | Privileged operations | Legal/private files |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous | D | D | D | D | D | D |
| Authenticated without role | D | D | D | D | D | D |
| Owner with eligible role | O | O | D | D | D | O |
| Other owner | D | D | D | D | D | D |
| Artist | O | O within artist contract | D | D | D | O |
| Label | L | L within label contract | D outside L | D | D | L where policy permits |
| Admin | P | P | P | P: never self-elevation or superadmin creation | P by endpoint | P: explicit legal access required |
| Superadmin | A within Soundpub | A | A within Soundpub | A with audit/last-admin safeguards | A by endpoint | P: explicit legal access required |
| Inactive user | Underlying role policy | Underlying role policy | Underlying role policy | Underlying role policy | Underlying role policy | Underlying role policy |
| Suspended user | D | D | D | D | D | D |

Inactive login is intentionally allowed in existing UI semantics; do not equate inactivity with suspension. Its operation-level permissions require product/security confirmation. Managed-only artists must not gain new login capability. Superadmin does not imply access to unrelated applications on the host. Suspension must block sensitive operations with existing access tokens, not merely prevent new login.

AUTHZ-01: for every matrix cell, snapshot affected rows/files/queued work, issue request, assert allowed response and exact intended delta or denied response with zero delta and zero private response content. SQL permission errors, HTTP 401/403, or contract-approved non-disclosing 404 are valid denials. RLS SELECT may return `[]`; UPDATE can return zero rows. For these, prove fixture exists via privileged isolated verifier and assert unchanged state; zero rows for an absent fixture is not coverage. Test owner-ID reassignment, query filters, guessed IDs, nested relations, batch operations, export, pagination and signed-link generation. Require zero cross-owner/tenant leaks.

## Security regression definitions

Every remediation requires authorized positive, anonymous negative, wrong-role negative, owner/other-owner tests where applicable, a reproducer of the old defect, and independent security/QA rerun. Run through deployed runtime and direct data routes, not source inspection alone.

| ID | Exercise | Required assertions |
| --- | --- | --- |
| SEC-01 | `send-app-email`, `backup-storage-to-drive`, `create-user`, `delete-user`, `update-user-role`, `update-user-status`, `update-user-password`, `start-user-impersonation`, `update-app-settings`, payment privileged operations | Execute AUTHZ-01; anonymous/artist/label calls create no users, messages, backups, invoices or settings changes; approved role succeeds once through stubbed providers |
| SEC-02 | Direct `user_roles` INSERT/UPDATE/DELETE/upsert and create-user requested role | Normal/artist/label cannot assign any roles; admin cannot create superadmin, elevate self or bypass via batch/upsert/metadata; superadmin authorized changes audited; missing role data fails closed |
| SEC-03 | `rate_limits` direct REST and SQL-role access plus `check_rate_limit` | Anonymous cannot inspect identifiers; ordinary users cannot reset/forge counters; authorized limiter still increments and denies at threshold; changing caller-supplied max/window cannot bypass policy |
| SEC-04 | Every definer signature from refreshed manifest; especially `scan_orphan_artist_links`, `record_auth_audit`, cleanup functions | Effective PUBLIC/anon/inherited grants match allowlist; safe fixed path excludes attacker-writable resolution; spoofed actor/target rejected; no unauthorized metadata or cleanup. Trigger-return functions evaluated via trigger, not ordinary RPC |
| SEC-05 | `release_payments` and copyright payments client INSERT/UPDATE/upsert | Forged paid/settled state, provider ID, currency, amount and another user's parent rejected; only trusted verified settlement can transition; ordinary pending creation allowed only if explicit contract permits |
| SEC-06 | Forged, expired, missing-exp, wrong issuer/audience/azp, missing-subject JWT; edited user_metadata/source_app; stale role claims | Deny without state change; authorization uses authoritative roles; demotion/logout/suspension enforced for existing tokens under documented revocation contract |
| SEC-07 | Password recovery/verification and SSO | Reset token hashed at rest, expires, atomic single use under two concurrent requests; no enumeration; wrong OAuth state/PKCE/redirect rejected; Keycloak requires valid signature, exp, issuer, audience/authorized client and approved verified-email linking; different issuer/sub with same email cannot take over account |
| SEC-08 | Impersonation start/use/end/expiry/revoke | Only approved superadmin starts; scope and audit enforced, no original privileged refresh token retained in browser storage; replay/end invalidates impersonated session without privilege escape |
| SEC-09 | Storage CRUD/upsert and signed URLs | Owner and non-owner paths enforce matrix for INSERT/SELECT/UPDATE/DELETE; spoofed owner paths, traversal, MIME/size bypass and expired/tampered links denied; no unauthenticated contracts download |

SEC-04 also checks new objects inherit safe default privileges, search-path shadowing attempts fail in an attacker-writable isolated schema, and required invoker views enforce ownership if any are introduced. Source currently reports no views. Service-role bypass tests cannot substitute for user JWT/RLS tests.

## Financial exactness and behavior

FIN-01: consistently capture source and restore at the same approved write boundary. Compare every financial row/column by primary key in both directions, including profiles' balance/revenue, royalties, composer royalties, uploads/archives, release/copyright payments, payout requests/reservations, adjustments, invoice/provider references, currencies, status and timestamps. Require zero missing/extra keys and zero column differences; counts/totals alone do not suffice. Use NUMERIC or decimal strings, no float sums, tolerance, rounding or coercion of unconstrained numeric fields. Preserve legacy null source-row keys, zero inserted_records counters, missing PDF metadata and opening adjustments as explicit provenance exceptions rather than silently repairing them.

Executable comparison pattern, only after protected source/target copies exist in isolated schemas `source_copy` and `target_copy` with identical approved structure:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH differences AS (
  SELECT s.id AS source_id, t.id AS target_id
  FROM source_copy.profiles s
  FULL OUTER JOIN target_copy.profiles t ON t.id = s.id
  WHERE s.id IS NULL OR t.id IS NULL
     OR to_jsonb(s) IS DISTINCT FROM to_jsonb(t)
)
SELECT count(*) AS mismatch_count FROM differences;
COMMIT;
```

Expected `mismatch_count = 0`; runner must fail on nonzero, SQL error, missing table or empty fixture unexpectedly. Repeat for every table in approved comparison manifest. Whole-row JSONB compares all columns in this same-structure pattern and retains PostgreSQL numeric equality; do not deserialize through JavaScript Number. For a changed target schema, first define reviewed one-to-one comparison projections including every source field and key. No invented mapping or omission qualifies as equality.

FIN-02: rerun the exact reconciliation SQL in `FINANCIAL_INTEGRITY_BASELINE.md` on both copies. Require zero unexplained residuals for `balance = artist allocation + label allocation + adjustments - reservations for pending/approved/paid payouts`, per-payout reservation equality, royalty net allocation, orphan links and provider invoice collisions. Compare baseline exceptions separately; empty composer data and no paid copyright rows require synthetic positive fixtures. Opening balances require private provider/bank reconciliation and finance approval; arithmetic cannot validate their provenance.

| ID | Synthetic action sequence | Exact acceptance oracle |
| --- | --- | --- |
| FIN-03 | Available 100.00; request 30.00; approve; pay with proof; retry pay | Available 70.00 after request and every later step; reservation sum exactly 30.00; no second debit, duplicate ledger effect or duplicate external payment |
| FIN-04 | Fresh available 100.00; request 30.00; reject; retry rejection | Balance returns exactly 100.00 once; reservation history preserved; forbidden paid-to-rejected transition denied without mutation |
| FIN-05 | Two concurrent 60.00 requests against 100.00; same-key replay; insufficient funds; 0, negative, sub-cent, huge and nonfinite amounts | No overdraw; at most one conflicting 60.00 succeeds; retry semantics documented and single effect; invalid inputs rejected atomically. Sub-cent policy explicit across request/reservation precision, never silent rounding |
| FIN-06 | Import, same-key retry, full-period replacement, failed partial replacement, reversal with paid obligations | Exact recipients/shares, one import effect, archives/provenance preserved; injected errors leave no partial rows/balance changes; reversal cannot create negative balance; one-cent error fails migration comparison despite legacy tolerance |
| FIN-07 | Refund deletion with single payment, duplicate retry, multiple paid candidates and unauthorized owner | Credit once with immutable adjustment/audit provenance; ambiguous multi-paid selection blocked pending finance rule; unauthorized action has no delta; retained references explain cascaded source deletion |
| FIN-08 | Composer validate/import/history/delete with nonempty synthetic dataset | All four reported missing RPCs have approved disposition and tested replacement/compatibility contract; correct exact allocations, history and reversal. Missing functions or unapproved feature removal block acceptance |

Review existing `scripts/royalty_financial_assertions.sql`, `royalty_financial_smoke.sql`, `royalty_import_safety_assertions.sql`, and `royalty_import_adversarial_assertions.sql` before adapting fixtures. They are mutation-capable and some lack an outer rollback; none is a production-safe verification command merely because its filename says assertions. Unit tests cover decimal boundaries, CSV validation, ownership predicates and transition rules; concurrency and transactional guarantees require integration tests with separate real DB connections.

## Provider-safe integration and behavior

INT-01: demonstrate egress isolation by attempting a blocked outbound test from each app/worker runtime; require no provider delivery. Route email/SMTP/auth hooks/Lovable backup connector, Xendit, Keycloak/Google, Spotify, GA4 and legacy storage calls to controlled local doubles or explicitly approved sandbox credentials. Production credentials are absent. Stop jobs/schedulers and isolate callbacks before restoring data. A fake invoice still must not reach a live provider. Record stub call counts and idempotency keys without secret headers.

INT-02: deliver synthetic Xendit events for missing/wrong callback token, unknown invoice, wrong/missing amount or currency, duplicate event, concurrent duplicate, late expired/failed, paid-after-cancelled/refunded, and conflicting cross-domain invoice reference. Require authentication, binding to invoice/owner/amount/currency, approved legal state transitions and at-most-once financial effect. Missing required fields fail closed under the approved target contract; legacy acceptance is a defect. Provider retries receive a response consistent with durable receipt, not a false 2xx before capture.

INT-03: inject failure after durable webhook receipt, after payment state commit, before parent update, before invoice/PDF creation and before notification; restart/retry. Require parent/payment convergence, exactly one ledger settlement, recoverable invoice generation, deduplicated notification delivery and no permanently skipped work when payment is already paid. Prove recovery using stored state/queue evidence, not response status alone. No real payment or external email is sent.

INT-04: run password signup/login/refresh/logout/reset/verification, Google and ICCN fixture flows, profile edit, linked artist/label catalog, release/track CRUD, royalty read/export, payout read/workflow, copyright, takedown, invoice/private file access and resumable upload interruption/retry. Assert matrix authorization, response shape/errors and exact DB/storage effects for each caller in the compatibility inventory. Test direct SSO fetch, function-name casing, pagination above default row limits and errors/timeouts. Missing active RPCs block affected flows. Realtime requires positive event delivery and cross-owner denial under the intended contract, or an explicitly accepted refresh/polling replacement; current empty publication is not a PASS baseline.

## Database, storage and privacy restore

RESTORE-01: restore checksum-verified database backup into a blank isolated instance with reviewed roles/extensions/auth linkage, including externally attached signup trigger. Require schema equivalence from STATIC-02, exact row/key comparison across approved Soundpub tables, zero unexplained FK/orphan/unique violations, all constraints validated, all indexes valid/ready, and correct ACL/RLS/trigger behavior. Check intentional missing FKs through anti-joins too. Confirm sequences/identity state if introduced; current manifest reports none. Backup file existence is insufficient.

RESTORE-02: build private ownership-resolved object manifest keyed by provider/bucket/object key/version with bytes, MIME, SHA-256, DB reference, owner and intended visibility. Deduplicate URL references by object identity; do not use URL count as object count or hash of path as byte checksum. Copy approved objects from self-hosted, legacy Cloud and GCS into isolated storage; compare exact unique count, total bytes and every content hash, then read every object and validate DB references. Include large audio beyond the historical backup's 200 MB limit, range/stream access, truncated/corrupt byte failure, resumed uploads, missing objects, duplicates and stale signed URLs. Unknown ownership objects stay excluded pending explicit disposition; unexplained required missing bytes fail restore. Orphans require a retention/disposition rule, never automatic deletion.

RESTORE-03: restore bucket config, MIME/size limits and object access policies, then run SEC-09 before permitting any application connection. Cover `release-covers`, `track-audio`, `audio-clips`, `avatars`, `label-logos`, `iccn-gallery`, `payout-proofs`, `release-invoices`, `takedown-documents`, `contracts`, and `track-video` if approved references exist. Private contracts must fail unauthenticated public-URL and cached/CDN access tests as well as API tests. Test signed URL expiry, tampering and unrelated-owner access; approved public assets remain readable. Never restore a known-public legal bucket as public to reproduce an insecure baseline.

RESTORE-04: restored auth users and object bytes must belong only to approved Soundpub scope; verify excluded shared identities/objects absent, UUID/FK mapping coherent and protected identity material inaccessible to browser roles. Restore without SMTP/payment/webhook side effects; prove isolation via INT-01. Retrieve encrypted off-host backups with documented key custody and repeat the full restore from scratch. Measure recovery duration/data boundary for cutover/rollback gates. QA independently repeats restore and privacy assertions, not merely reads logs.

## Acceptance and handoff

Mandatory execution set: STATIC-01..03, AUTHZ-01 (every resolved cell), SEC-01..09, FIN-01..08, INT-01..04 and RESTORE-01..04, plus all caller contracts from the completed compatibility matrix. Independent QA reruns critical security, financial, restore and rollback paths with security/finance review where applicable. Required failures or UNVERIFIED/BLOCKED items prevent readiness; no weighted score can override a mandatory gate.

The Phase 1 attachment requires readiness >=85/100 and zero CRITICAL findings, superseding the older audit's proposed 75 threshold. This planner assigns no score, no behavioral PASS and no Phase 2 authorization. Future execution must satisfy `CUTOVER_REQUIREMENTS.md` and `ROLLBACK_REQUIREMENTS.md` before production scheduling.
