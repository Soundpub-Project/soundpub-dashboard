# Phase 3 authorization report — Agent F

Date: 2026-10-28; source refreshed at approximately 03:02 UTC, evidence closeout updated on coordinator instruction. **Phase3 status: BLOCKED. Full-domain authorization acceptance: FAIL/incomplete. Current Users/Profile/Role implementation: PARTIAL; local backend Users tests PASS.** Foundation denial checks and new Users unit checks pass within stated limits. New domain routes have not received a fresh PostgreSQL/browser authorization acceptance run by this reviewer. No source edits, SQL execution, production contact or deployment performed.

Authority, complete attachment location, required Phase1G/2 inputs and worktree boundary: [parity report](PHASE3_PARITY_MATRIX.md). Read Phase3 sections 14, 16, 23–26, 34, 37, 41–43, 46 and 48 against current source. Base HEAD `48222ffb9c9e60da82d224e1e8aaccd4dd597442` does not include these uncommitted implementations. Findings describe review snapshot; later source/test additions need revalidation.

## Principal and authority path

[Bootstrap](../../backend/src/main.ts) accepts an exact server-configured development token, resolves verified external issuer/subject binding through [principal repository](../../backend/src/db/repositories.ts), then loads current local status and verified global roles (`tenant_id IS NULL`). Browser user ID, role fields, email and provider metadata confer no authority. Reference-only identities never enter this lookup.

[Shared authorization](../../backend/src/auth/index.ts) now recognizes all seven roles: user, artist, label, copyright, whitelabel, admin, superadmin. Unknown/mixed unsupported or empty roles, inactive/suspended users and unknown policies deny. Admin privilege includes superadmin; owner-only policy does not acquire an admin bypass. The earlier five-role gap observed at start was changed by concurrent work; it is **not** an unresolved seven-role vocabulary finding in final reviewed source. Tenant-scoped roles still confer no principal capability; explicit roster/case policies are not implemented.

For Users service reads/writes, [repository lock](../../backend/src/users/repository.ts:23) locks actor/target user rows, takes transaction-scoped advisory authority locks, then rereads verified global roles. [Migration 0005](../../backend/migrations/0005_role_authority_lock.sql) makes role-row changes take same advisory lock. [Users service](../../backend/src/users/index.ts) rechecks current actor in transaction before mutations. These controls are present in source; new read/write races, role INSERT/DELETE grants and service composition have not been independently exercised against PostgreSQL here.

## Current role matrix

ALLOW/DENY below records implemented policy intent, not live DB acceptance. Own profile covers current-user read/patch; Storage column covers owner check before capability issuance. Every ALLOW requires recognized active local principal.

| Principal | Own profile | Other profile patch | Admin list | Ordinary-target status/roles | Admin target | Superadmin target or grant | Own Storage | Other Storage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous/invalid/unmapped | DENY 401 | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| User | ALLOW | No target patch endpoint | DENY | DENY | DENY | DENY | ALLOW | DENY |
| Artist | ALLOW | No target patch endpoint | DENY | DENY | DENY | DENY | ALLOW | DENY |
| Label | ALLOW | No target patch endpoint | DENY | DENY | DENY | DENY | ALLOW | DENY; parent-label alone grants none |
| Copyright | ALLOW | No target patch endpoint | DENY | DENY | DENY | DENY | ALLOW | DENY; no reviewer capability yet |
| Whitelabel | ALLOW | No target patch endpoint | DENY | DENY | DENY | DENY | ALLOW | DENY; no roster capability yet |
| Admin | ALLOW | No target patch endpoint | ALLOW | ALLOW, except self | DENY | DENY | ALLOW | ALLOW via explicit Storage admin mapping |
| Superadmin | ALLOW | No target patch endpoint | ALLOW | ALLOW, except self | ALLOW, except self | DENY | ALLOW | ALLOW via explicit Storage admin mapping |
| Inactive/suspended, any role | DENY 403 | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Roleless/unverified assignment | DENY 403 | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Excluded/deferred/historical reference | No verified login mapping | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

Authenticated request to an absent other-profile endpoint returning 404 proves no resource-specific BOLA protection. Label member/unrelated label, case reviewer/unrelated reviewer, artist roster and financial eligibility cases remain unimplemented, not PASS.

## Route authorization review

| Route | Server checks and data boundary | Evidence | Acceptance |
| --- | --- | --- | --- |
| GET /api/v1/me | Shared bearer + current active recognized roles; response id/roles only | API/auth/repository; injected seven-role 200 and missing/invalid 401, inactive/root 403 executed | PASS for injected foundation contract; DB/browser PARTIAL |
| GET /api/v1/profile | Actor-derived own ID; transaction rechecks status/roles; explicit projection excludes bindings/provenance/references | Users profile service and repository.find | PARTIAL; actual DB HTTP NR |
| PATCH /api/v1/profile | Same actor; strict patch allowlist; cannot set owner, email, balance, status, role, parent or credentials; audit shares transaction | profilePatch unit negatives executed; service/repository inspected | PARTIAL; SQL rollback, other-owner and actual HTTP NR |
| GET /api/v1/admin/users | Shared bearer then admin policy, then locked current actor; bound allowlisted filters, fixed created_at/id ordering and max 100 | Users service.list/repository.list | PARTIAL; frontend pagination fails, no DB authorization result here |
| PATCH /api/v1/admin/users/{id}/status | Current actor and target locked; all target global roles checked, including unverified assignments; self/peer/superadmin protections; audit | setStatus, canManageUser, allRoles; pure hierarchy tests passed | PARTIAL; new SQL/grants/race matrix NR |
| PUT /api/v1/admin/users/{id}/roles | Same hierarchy for old/requested roles; cannot assign superadmin or ordinary admin peer; supplied changed parent rejected 409, existing supplied parent must active label/whitelabel; actor-derived audit | setRoles, strict rolesPut, bound repository SQL; pure unit checks passed | PARTIAL; parent writes removed, roster/DB evidence absent |
| POST /api/v1/admin/users/{userId}/suspend | Existing reason schema; bootstrap now delegates to Users setStatus with reason, local audit/outbox | Main/API source; injected role gate tested with mocked action | PARTIAL; earlier Phase2 SQL QA does not certify new delegation |
| POST /api/v1/storage/objects and /storage/uploads | Shared active principal; server-generated owner/key; no client bucket/owner accepted | API schema/main adapter; memory/mocked S3 tests passed | PARTIAL; no business-resource relationship/tenant policy |
| POST /api/v1/storage/uploads/{objectId}/complete | Shared active principal; owner or explicit admin before staging verification | S3 owned/assertObjectAccess; mocked owner/stranger tests | FAIL pending/ready lifecycle invariant; see security S04 |
| GET /api/v1/storage/objects/{objectId}/url | Same owner/admin, bounded 300-second URL, final key must exist | S3 signedUrl and PG metadata | PARTIAL access; FAIL durable-ready gating; real URL expiry/tamper NR |
| POST /api/v1/actions/notification | Shared active principal; server-derived actor payload, actor-scoped key and hash, durable transaction in main | API/idempotency/outbox tests inspect foundation behavior | PARTIAL; synthetic notification, no arbitrary recipient capability |
| POST /api/v1/webhooks/events | Fake-provider exact-byte timestamp/event HMAC, replay digest and transaction; browser bearer not authority | Webhook tests passed with mocks | PARTIAL foundation; no production payment authorization/parity |
| Health/readiness/OpenAPI | Explicit unauthenticated local probes/docs; no private projection intended | Foundation API tests passed | PASS within injected tests; network deployment not inspected |

Validation runs before handler authentication, so malformed unauthenticated mutations may return 400 before 401. This is current transport ordering; do not claim every unauthenticated input always yields 401. No secret error details should be returned in either ordering.

## RLS and database permission decisions

Phase3 section 42 permits BACKEND_ONLY_RLS_OPTIONAL, RLS_DEFENSE_IN_DEPTH or RLS_REQUIRED with rationale. Earlier Phase1G extraction ledger calls for rebuilt/forced RLS on runtime-reachable tables. Later Phase3 permission to select a strategy makes missing RLS alone insufficient to claim a confirmed authorization bypass; each decision still needs documented scope and actual negative evidence.

| Actual target relation(s) | Classification observed/decision for review | Rationale and verification gap |
| --- | --- | --- |
| profiles | BACKEND_ONLY_RLS_OPTIONAL, explicitly declared in migration 0006 | Private backend schema; own profile service and admin service resolve authority. RLS/policies absent. Comment does not prove grants or row isolation; requires restricted-login and HTTP negative tests. |
| backend_users | BACKEND_ONLY_RLS_OPTIONAL foundation boundary | Current actor/status system table; runtime SELECT/UPDATE across users. No actor-scoped PostgreSQL context or row-isolation guarantee. |
| external_identities, identity_references, roles | BACKEND_ONLY_RLS_OPTIONAL foundation boundary | Runtime reads; mapping/reference provenance must never be public DTO. No cross-project selection implicit in UUID. |
| user_roles | BACKEND_ONLY_RLS_OPTIONAL foundation boundary, materially changed in 0006 | Formerly SELECT-only runtime; new INSERT/DELETE grants make service hierarchy sole per-user write boundary. Trigger serializes authority, not authorization. No new runtime-grant probe executed. |
| audit_logs | BACKEND_ONLY_RLS_OPTIONAL foundation boundary | Runtime SELECT/INSERT only by migration 0004; history mutation denied by grant design. New audit append remains server-derived; read API absent. |
| storage_assets | BACKEND_ONLY_RLS_OPTIONAL foundation boundary | Runtime operational writes across owners, service ownership boundary, no row context. Pending/ready lifecycle defect confirmed with mock dependencies. |
| outbox_events, idempotency_keys, integration_effects, webhook_events | BACKEND_ONLY_RLS_OPTIONAL foundation boundary | Internal worker/API state, explicit actor/provider keys. Runtime grants and at-least-once effects need end-to-end tests. |
| schema_migrations | BACKEND_ONLY_RLS_OPTIONAL, migration-owner only | No runtime ledger write grant intended; current catalog not queried. |
| Remaining domain tables | UNCLASSIFIED / NOT IMPLEMENTED | Artists, release/track, royalty, financial, copyright, takedown, notification/settings domain tables not introduced by current target migrations. Do not infer policy parity from canonical source SQL. Each later table needs explicit choice/rationale and tests before acceptance. |

Classifications for unchanged system tables summarize documented private-backend foundation strategy; they are review documentation, not newly applied policies. `roles` is a lookup in addition to tables enumerated in Phase2 design. During review migration 0006 was narrowed to profile INSERT(id) and UPDATE only editable fields/timestamp; parent-label UPDATE grants were removed. Earlier broad INSERT finding is closed in source, without fresh runtime grant attestation. Runtime role INSERT/DELETE remains intentional and needs current PostgreSQL negative tests. No HTTP injection or exploit demonstrated.

## Unclosed authorization and provenance gaps

- **A01 — Synthetic browser authority: FAIL.** Auth hook supplies Supabase session token to backend mock lookup. No isolated browser principal flow; default result is 401 unless someone incorrectly imports session evidence into dev configuration. Do not weaken backend verification or copy tokens. Production build switch off limits current exposure but is not browser acceptance.
- **A02 — Tenant/case authorization: FAIL outside current Users slice.** Global roles only; label membership, managed artist, legal reviewer, resource ownership and financial account relations absent. Broad Storage admin is a foundation capability, not future case/finance authorization.
- **A03 — Historical parent reference preservation: PARTIAL; earlier loss path closed in source.** Initial code projected only local parent and cleared parent_label_reference_id in setParent. Refreshed source removes setParent and parent writes, blocks changed local-parent requests and revokes parent UPDATE grants. Historical reference cannot be cleared through that earlier route path. Synthetic reference-only DB fixture and preservation/transition audit still not executed; future Artists transfer must implement explicit policy.
- **A04 — New runtime role authority: PARTIAL.** INSERT/DELETE on user_roles is intentional for role endpoint, but previous Phase2 statement “runtime cannot write roles” is now stale for target after 0006. Revalidate direct SQL capability, HTTP hierarchy, concurrent demotion/promotion and rollback with migration 0006; do not cite old grant denial as current proof.
- **A05 — Source UI guards: PARTIAL.** ProtectedRoute still admits allowedRoles check when role is null; server policies deny unknown/empty authority. This is UI behavior evidence, not proof source RLS is bypassed. Browser failure state and stale-profile handling remain untested.
- **A06 — Inactive policy difference: PARTIAL.** Target active-only is deliberate foundation rule; source inactive-login UI differs. Keep conservative denial and document product decision before equivalence.

## Checks actually executed

Fresh backend selection: 34 passed, zero failures/skips; `db.test.ts` and `api-users.test.ts` explicitly excluded. Includes two new Users hierarchy/strict-input unit tests. Typecheck and finite isolation scan passed. Twenty injected foundation HTTP assertions passed; admin action was mocked, so no target-sensitive SQL claim follows. Memory/mocked S3 access tests passed, plus separate pending-finalization defect reproduced. No PostgreSQL, grants, migration or browser query executed in this review.

New `api-users.test.ts` contains repository/service/API/negative/migration cases and requires USERS_DB_TEST_URL. Its presence is useful work, not executed evidence. Historical Phase2 independent role-lock tests used previous service and grants. Neither independent Phase3 QA nor a complete domain-owner/member/other-user matrix is established.

## Final evidence closeout

Coordinator confirms local backend Users tests PASS. [Phase3 test report](PHASE3_TEST_REPORT.md) records owner full local suite 45 passed, zero failed/skipped, including Users migration/integration/API checks. This is reported evidence, not a PostgreSQL rerun by this reviewer. Earlier NR statements and route PARTIAL statuses preserve direct-review limits; they do not dispute owner test results or claim missing backend implementation. No blanket full-domain authorization or independent QA PASS follows from Users tests.

Final Phase3 status: **BLOCKED**, with frontend parity still missing. Require synthetic browser identity, safe partial-domain routing, outstanding reference/race coverage where not demonstrated by owner tests, Storage ready-state correction and independent QA. Missing later-domain work remains unaccepted. Production actions: **NONE**. This report grants no extraction, deployment or cutover permission.
