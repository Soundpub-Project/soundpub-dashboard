# Phase 3 security report — Agent F

Date: 2026-10-28; source refreshed at approximately 03:02 UTC, evidence closeout updated on coordinator instruction. **Phase3 status: BLOCKED. Security acceptance: FAIL/incomplete. Current Users foundation extension: PARTIAL; local backend Users tests PASS.** Evidence-based local source review and scoped synthetic self-checks; no production exploitation claim or independent Phase3 sign-off. Only this file and the [parity](PHASE3_PARITY_MATRIX.md)/[authorization](PHASE3_AUTHORIZATION_REPORT.md) artifacts are authored by this assignment.

Complete Phase3 attachment, required Phase1G/2 inputs and base HEAD are recorded in parity report. All 12 Phase2 architecture documents read. Supabase skill applied; current public changelog and RLS documentation read over HTTPS, without contacting application/production endpoints. Cloud rollout notices do not attest configuration/version of this self-hosted stack. No SSH, SCP, Supabase CLI, Docker service operation, SQL execution, login, production data/secret inspection, provider request, source change, reset or deployment performed.

## Threat boundaries and verified controls

Current target is development/test only. Config validates dedicated local/container DB host, soundpub_dev/test database naming and restricted runtime username; rejects production/staging, known source hosts and URL query/fragment overrides. Identity uses exact configured synthetic token and verified local binding, not token payload or browser role. Secret/owner/runtime split and synthetic-only scope remain necessary. Loopback and deny-list scanning are not egress firewall or exhaustive secret proofs.

Users extension now exists: profile read/patch, bounded admin list, status and role mutation, profile migration 0006, shared frontend API and development-only routing branch. Explicit DTO/patch projection excludes binding/provenance/credential fields; strict input rejects actor/role/status/balance/profile-owner mass assignment. Values use bound SQL parameters; dynamic profile columns derive only from parsed allowlist. Actor/target status and roles are reread under row/advisory transaction locks. Audit shares privileged mutations. Runtime cannot update/delete audit history by existing grant design. New grants require fresh runtime verification.

Foundation API generates request IDs, caps JSON bodies at 1 MiB, uses safe error envelope, hides internal exceptions, limits requests with bounded process-local map, and keeps raw webhook parsing scoped. Mock webhook verifies exact-byte timestamp/event HMAC and deduplicates transactionally; notification keys are actor-scoped. Storage creates opaque owner-bound keys, private staging, size/checksum/MIME signature gates and bounded URL lifetime. These are useful controls; none alone proves browser/domain/financial parity.

## Findings

Severity describes consequence if affected workflow is enabled. FAIL means required behavior is absent or reproduction violates its contract; PARTIAL means implemented controls lack required proof or scope. No CRITICAL vulnerability was demonstrated; this is not a zero-CRITICAL certification.

| ID | Severity | Result | Finding and evidence | Closure evidence |
| --- | --- | --- | --- | --- |
| S01 | HIGH | FAIL | [Auth hook](../../src/hooks/useAuth.tsx:10) sources API credential from Supabase session; [main](../../backend/src/main.ts) accepts only server-configured synthetic token map. Backend Users mode therefore has no working isolated browser identity contract. If frontend uses a production Supabase session, this path would forward production bearer material to development API, contrary to phase boundary. No token/session was obtained or transmitted by reviewer. | Explicit synthetic local identity injection through replaceable provider, no source session import, actual browser 200/401/status tests. Do not configure real sessions as mock tokens. |
| S02 | HIGH | FAIL | Partial Users switch leaves create/delete/password/impersonation/composer and other pages using Supabase while migrated read/status/role operations use dedicated DB. [Users page](../../src/pages/Users.tsx), user dialogs and [Users service](../../src/services/users.ts) retain these paths. Missing proof synthetic IDs/user context cannot reach legacy mutations when backend mode selected. No such mutation performed. | Disable unsupported legacy mutations in isolated mode or route complete workflow to safe adapters; test zero legacy writes for backend-mode actions. |
| S03 | MEDIUM | FAIL | [Users adapter](../../src/services/users.ts:27) discards nextCursor; listLabels filters partial page; server parent_label_name overwritten by local-page map. Mock-fetch reproduction: first 50 of larger result, one request only, valid parent name becomes null. Authority/visibility UI cannot represent complete list. | Fixture >50 users, parent/label on later page, filters and every page reachable; no dropped DTO fields. |
| S04 | MEDIUM | FAIL | [PG metadata](../../backend/src/storage/pg.ts:12) returns pending and ready rows with no status field. [completeUpload](../../backend/src/storage/s3.ts:217) writes final key, deletes staging, then marks ready; failed metadata update leaves final key with pending metadata. signedUrl/download check owner and key, not persisted ready state. Mock S3/repository reproduction returned a signed URL and original bytes after completion failed. Bytes were validated; this demonstrates lifecycle/publication failure, not unrelated-user access or MIME bypass. | Separate pending-intent lookup from ready-download lookup; recovery/retry semantics. Fault injection after final PUT/staging deletion/before ready must deny pending download/signing and allow safe retry. |
| S05 | MEDIUM | PARTIAL | [Migration 0006](../../backend/migrations/0006_user_profiles.sql) adds runtime role INSERT/DELETE without RLS. During review profile INSERT narrowed to id only and parent UPDATE grants removed; earlier broad profile INSERT concern closed in source. Role service checks exist, but compromised runtime credentials can still change roles across users. Prior Phase2 role-write denial no longer applies after 0006. | Explicit grant boundary and restricted-login/hierarchy/race/rollback tests under new migration. No public arbitrary SQL path demonstrated. |
| S06 | MEDIUM | PARTIAL; prior loss path closed in source | Initial setParent cleared parent_label_reference_id. Refreshed [Users service](../../backend/src/users/index.ts) rejects local-parent changes and [repository](../../backend/src/users/repository.ts) removes parent writes; migration removes parent UPDATE grants. No current reference-erasure claim through removed path. No DB reproduction used. | Synthetic historical-reference fixture; future Artists reassignment must preserve source edge/audit; test no implicit login/membership or reference loss. |
| S07 | MEDIUM | FAIL for separate-origin browser setup | Backend has no local CORS allowance and Vite no API proxy. Injected OPTIONS /api/v1/me from http://localhost:8181 returned 404, no Access-Control-Allow-Origin. Client adds Authorization, so cross-origin browser request needs preflight. Same-origin deployment might avoid this; it was not configured/tested here. | Explicit local origin/proxy design, real browser preflight/request test and readable request IDs; no wildcard credential workaround. |
| S08 | MEDIUM | PARTIAL | Backend balance DTO exact text; frontend BackendUser now accepts number or string and Auth hook now applies Number conversion. Users list passes string unchanged in mock-fetch probe. Runtime DTO/precision policy untested; Number can lose cents on large exact numeric(20,2) values. No target financial calculation implemented. | Shared DTO/adapter fixtures for decimal strings, nulls, amounts beyond safe JS integer and display; no authoritative browser money arithmetic. |
| S09 | HIGH for future financial/case use | FAIL / NOT_STARTED | Target lacks release/track, royalty, payout/payment, copyright, takedown and business settings/notification API authorization. Generic admin and owner Storage checks do not replace resource/case/tenant semantics. Four copyright RPC contracts have no healthy source implementation to copy. | Domain services/transactions/DTOs, explicit capability and negative matrices, deterministic financial/copyright oracles and independent QA. No production provider connection. |

S01/S02 are activation blockers, not evidence production traffic changed. Refreshed routing uses VITE_SOUNDPUB_BACKEND_DOMAINS containing users and requires `import.meta.env.DEV`; production mode remains false by source design. Earlier VITE_BACKEND_USERS flag was replaced during review. No browser or built artifact verified that guard. No global cutover authorized. Retaining legacy branches is allowed during progressive migration, but backend-mode mixed mutations still need explicit safe boundaries.

## Additional limits requiring no invented completion

- Seven-role vocabulary is now present in source and new Users unit checks, superseding initial five-role observation. It does not implement tenant/case privileges. Foundation/Users RLS strategy is documented in authorization report; no row-isolation test passed here.
- RLS absence in private backend tables is not automatically an exploit. Phase3 permits an explicit BACKEND_ONLY_RLS_OPTIONAL strategy; migration 0006 declares it for profiles. Remaining domains still need table-specific decisions and proof. Service credentials and DB grants remain security boundaries.
- API rate limiting is process-local and applies in preHandler, after parser/schema work. Global/replica limits and malformed-request flood resistance unproven. This is accepted development ceiling, not production defense.
- Signed URLs remain bearer capabilities until expiry; no immediate revocation test, live expiry/tamper or case/finance privacy matrix. Real audio/video and large media need explicit MIME/size support; current bootstrap allows text/plain, PNG, JPEG, PDF only.
- Object storage and PostgreSQL lack one transaction. Completion replay after staging deletion may 404; reconciliation/cleanup/retention tests absent. S04 is one reproduced failure window, not exhaustive recovery audit.
- Error category client supports standard statuses, but 413/415 fall through to INTERNAL_ERROR. Timeout covers request after token provider resolves; provider stall is not bounded. Success payload is type assertion, not runtime DTO validation. These are adapter limitations, not proven data disclosure.
- Existing source frontend route guard can render with null role; backend defaults deny. Client-only six-hour limit, source refresh/session/impersonation semantics and real OIDC migration remain Phase4 or separately scoped work; never weaken current backend for legacy parity.
- Structured request logs/aggregate telemetry exist; no domain-specific storage/authorization/DB failure metric acceptance, query-duration/response-size benchmark, full log capture or secret-history/image audit performed. Security scanner is finite backend patterns, not frontend/browser bundle/secret clearance.
- Historical financial provenance, provider binding, external media rights/checksums, off-host restore and rollback defects stay later production gates. Phase3 review does not close or rescore them.

## Executed verification

| Check | Result | Exact limit |
| --- | --- | --- |
| Current backend selected tests | 34 passed, 0 failed/skipped | All current test files except db.test.ts and api-users.test.ts; includes two Users unit tests; mocks/injection only |
| Backend typecheck | Exit 0 | Current TypeScript, no emit |
| security:check | Exit 0 | Finite local backend isolation/secret pattern scanner |
| Foundation HTTP probe | 20 assertions passed | Injected identity/action/rate/readiness; seven roles, missing/bad/unknown/inactive and admin route gates; preflight absence asserted; no DB hierarchy test |
| Frontend adapter reproduction | Defect reproduced | Actual TS transpiled in memory with TypeScript already installed; API URL replaced by loopback, backend branch forced, mock fetch; no source write or network |
| Storage failure reproduction | Defect reproduced | Actual S3DevObjectStorage + mocked S3 transport/metadata; no object store or DB connection |
| Database migrations/Users DB API | PASS reported; reviewer NOT RUN | Coordinator/owner evidence in Phase3 test report records passing local Users integration; direct runtime-grant/race scope must follow actual assertions, not test-file presence |
| Frontend browser/regression | NOT RUN / acceptance FAIL | No desktop/mobile/loading/empty/error/forbidden/navigation evidence; frontend build and shared client self-check separately reported PASS |
| Production operations/data/provider effects | None performed | Public vendor documentation fetch only; no application traffic or secret retrieval |

Latest selection ran under Node v24.22.1/npm 12.0.2. Historical Phase2 full suite 33/33, local RustFS and independent role-lock closeout remain historical. They do not prove new profiles migration, widened grants or browser adapter. Initial obsolete-role probe and incomplete Storage harness were corrected; failed harness attempts excluded from success counts.

## Runnable local regression check

Run from repository root with Node and existing dependencies. This preserves the reproduced frontend contract gap as one executable assertion block without creating test/source files. It intentionally asserts current defects; after a fix, update assertions to desired full-pagination/name-preservation behavior. Synthetic data and mock fetch only; no token or endpoint from existing environment is used.

```powershell
@'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from './backend/node_modules/typescript/lib/typescript.js';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(
  ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,
    target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const clientUrl = moduleUrl(readFileSync('src/api/client.ts','utf8').replaceAll(
  'import.meta.env.VITE_SOUNDPUB_API_URL', JSON.stringify('http://localhost:3000')));
const client = await import(clientUrl);
client.setApiTokenProvider(async () => 'synthetic-development-token');
const usersUrl = moduleUrl(readFileSync('src/api/users.ts','utf8').replace(
  "'./client'", JSON.stringify(clientUrl)));
const serviceUrl = moduleUrl(readFileSync('src/services/users.ts','utf8')
  .replace(/import \{ usesBackendDomain \}[^\n]+/,
    'const usesBackendDomain = () => true;')
  .replace("'@/api/users'", JSON.stringify(usersUrl))
  .replace(/import \{ supabase \}[^\n]+/,
    'const supabase = new Proxy({}, {get(){throw Error("Legacy path used")}});'));
const service = await import(serviceUrl);
let calls = 0;
const items = Array.from({length:50}, (_,i) => ({id:`user-${i}`,email:null,
  full_name:`User ${i}`,roles:['user'],status:'active',balance:'123.45',
  created_at:'2026-10-28T00:00:00.000Z',
  parent_label_id:i === 0 ? 'label-51' : null,
  parent_label_name:i === 0 ? 'Verified parent label' : null}));
globalThis.fetch = async () => {
  calls++;
  return new Response(JSON.stringify({items,nextCursor:'more-users'}),
    {status:200,headers:{'content-type':'application/json'}});
};
const result = await service.listUsers();
assert.equal(calls,1);
assert.equal(result.length,50);
assert.equal(result[0].parent_label_name,null);
assert.equal(typeof result[0].balance,'string');
console.log('REPRODUCED: dropped pagination and parent name; decimal string unchanged');
'@ | node --input-type=module
```

## Admission decision

Coordinator confirms local backend Users tests PASS. [Phase3 test report](PHASE3_TEST_REPORT.md) records owner full local suite **45 passed, zero failed/skipped**, including Users DB/migration/API checks; frontend build and shared API-client self-check also reported PASS. These are attributed results, not fresh DB/browser executions by this reviewer. Earlier NOT RUN rows describe this reviewer's commands; they do not negate owner evidence. Frontend Users differential parity/browser regression and independent Phase3 QA remain unproved.

Final Phase3 decision: **BLOCKED**. Do not certify Users DECOUPLED or Phase3 security/parity PASS. Repair synthetic browser identity/transport and adapter gaps, prevent backend-mode legacy writes, validate historical references, close Storage ready-state failure and obtain independent QA. Domain backlog and production readiness remain separate gates. Production data migrated: **NO**; production traffic switched: **NO**; shared Supabase mutated by this assignment: **NO**. No production operation or source remediation authorized by this documentation assignment.

## Coordinator Remediation After Security Snapshot

Source now iterates Users cursor pages, preserves server parent-label name, filters label candidates by full roles, and proxies local Vite /api same-origin. Findings S03/S07 require independent browser and synthetic service retest before closing; report's BLOCKED decision stands. S01/S02/S04 remain open.
