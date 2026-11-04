# Phase 3 Independent QA — Agent H

## Status

**BLOCKED.** Current Users / Profiles / Roles slice is **PARTIAL**; independent evidence does not establish Phase 3 completion or Phase 4 readiness. Frontend integration has reproduced failures, database-dependent suites were deliberately skipped, and browser regression was not performed.

Evidence window: 2026-10-28, approximately 09:57–10:04 Asia/Bangkok. Base HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Review covers current uncommitted workspace, which also contains earlier-phase changes. It is not a review of an immutable Phase 3 commit.

Only this report was created by Agent H. No source or other documentation edits, SSH, production/shared Supabase access, deployments, provider calls, database connections, migrations, resets, or Docker operations were performed. Build artifacts were written outside repository under temporary directories.

## Inputs and evidence boundary

Read Phase 3 attachment at `C:/Users/bimok/.codex/attachments/5ce24291-61ea-4159-a640-f0886e675d3d/Pasted text.txt`, project instructions, Supabase skill, Phase 2 reports, current frontend/backend implementation and available Phase 3 reports. Phase 2 PASS and other agents' results are historical/reviewer inputs, not independently rerun Phase 3 evidence. No other agent's database or browser result is adopted below.

Concurrent edits were observed in `backend/package.json`, `backend/test/api-users.test.ts`, `src/api/users.ts`, `src/hooks/useAuth.tsx`, and `src/pages/Users.tsx`. Frontend build, diagnostic analysis and backend tests were repeated after observed edits. Results remain bounded by executed snapshots; later edits require targeted revalidation.

Runtime: Node `v24.22.1`, npm `12.0.2`, Vite `8.3.0`, Windows PowerShell.

## Independently executed checks

| Check | Result | Observed evidence and limits |
| --- | --- | --- |
| Frontend production-mode build | PASS | Two sanitized programmatic Vite builds exited 0; latest transformed 3,323 modules in 3.05 seconds. Large-chunk warning remained. Build is transpilation/bundling, not typecheck or browser acceptance. |
| Whole frontend typecheck | FAIL | `tsc --noEmit -p tsconfig.app.json` exited 1. Follow-up TypeScript compiler API analysis found 105 diagnostics. No clean HEAD baseline was compiled; these are not all attributed to Phase 3. |
| Focused frontend diagnostic inspection | PARTIAL | No diagnostics in `src/api/*`, `src/services/*`, `useAuth.tsx`, `ChangeRoleDialog.tsx`, or `ChangeStatusDialog.tsx`. `Users.tsx` still emitted three diagnostics: TS2769 at lines 709/783 and TS2322 at 784, in retained `artist_deletion_requests` paths. HEAD source contains those same legacy operations. A blanket claim that all changed files typecheck is unsupported. |
| Backend source typecheck | PASS | `npm run typecheck` from backend exited 0. Its tsconfig includes source, not test files. |
| Backend test execution | PARTIAL | Initial and refreshed runs each reported 36 tests: **34 passed, 0 failed, 2 skipped**, zero cancelled/todo. Latest duration 4,047.7069 ms. Both database URL variables were removed from child environment. |
| Frontend committed-in-workspace client self-check | PASS | `node scripts/phase3-client.test.cjs` exited 0 with `Phase 3 API client self-check: PASS`. Script was written by another agent and independently executed here. It exercises mocked client behavior, not browser or service parity. |
| Additional isolated client checks | PASS | In-memory transpilation with synthetic configuration and mocked fetch verified missing-token denial before fetch, bearer injection, mutation JSON serialization/single request, omitted browser credentials, typed 403/header request ID, timeout and already-aborted cancellation. No network request occurred. |
| Backend isolation scanner | PASS, bounded | `npm run security:check` exited 0. Finite backend text scan; excludes `.env`, dependencies, build output and lockfile. Not exhaustive credential/history/deployment attestation. |
| Default separate-origin browser API transport | FAIL | In-process Fastify injection: `OPTIONS /api/v1/admin/users` from `http://localhost:8181` returned **404**, no allow-origin header. Equivalent authenticated GET returned **200**, also no allow-origin header. Vite source has no API proxy. Authorization header requires browser preflight for configured API port 3000. No browser was started. |
| Backend Users list adapter | FAIL | Synthetic response with non-null `nextCursor` caused exactly one service list call; cursor was discarded. Server defaults to 50 users, so later users cannot be reached through current adapter. |
| Backend parent label DTO preservation | FAIL | Server fixture supplied `parent_label_name: 'Known server label'` with parent outside returned page; frontend service replaced it with `null`. |
| Legacy label-picker parity with backend mode disabled | FAIL | Synthetic active user with both `label` and `admin` assignments produced empty `listLabels()` result. HEAD dialog queried membership in `label`/`whitelabel` and would include that fixture. New service filters on primary role, which becomes `admin`. Regression affects retained legacy branch even while backend flag is off. |
| Database/runtime acceptance | PARTIAL | `db.test.ts` and `api-users.test.ts` skipped because `DB_TEST_URL` and `USERS_DB_TEST_URL` were deliberately unset. No disposable QA database provisioned/reset; no migration 0006, runtime grants, SQL rollback/concurrency or real database/API acceptance independently established. |
| Browser desktop/mobile/state/navigation regression | PARTIAL | Not run. Build, fetch mocks and Fastify injection do not establish actual frontend behavior. |

Initial CORS probe omitted required rate-limiter dependency and returned 500. That harness result was discarded. Corrected probe supplied rate limiter and asserted GET 200 before recording the 404 preflight finding.

## Commands and reproduction context

Working directory unless noted: `I:/website-devops/soundpub-project/soundpub-dashboard`.

```powershell
git status --short
git rev-parse HEAD
node --version
npm --version
.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.app.json
npm run typecheck --prefix backend
npm run security:check --prefix backend
node scripts/phase3-client.test.cjs
git show HEAD:src/components/users/ChangeRoleDialog.tsx
```

Sanitized frontend build command; does not load root environment files or replace repository `dist`:

```powershell
@'
import {build} from 'vite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'qa-synthetic-public-placeholder';
const out = mkdtempSync(join(tmpdir(), 'soundpub-phase3-qa-build-'));
console.log('QA_BUILD_OUTPUT=' + out);
await build({envDir: false, build: {outDir: out, emptyOutDir: false}});
'@ | node --input-type=module
```

Latest output: `I:/DevData/TEMP/soundpub-phase3-qa-build-Hqxp19`. Previous output: `I:/DevData/TEMP/soundpub-phase3-qa-build-lLk4HO`. Neither was served or deployed.

Backend suite command, run from `I:/website-devops/soundpub-project/soundpub-dashboard/backend`:

```powershell
@'
import {spawnSync} from 'node:child_process';
const env = {...process.env, NODE_ENV: 'test'};
delete env.DB_TEST_URL;
delete env.USERS_DB_TEST_URL;
const r = spawnSync(process.execPath,
  ['node_modules/tsx/dist/cli.mjs', '--test', '--test-reporter=spec', 'test/*.test.ts'],
  {env, encoding: 'utf8'});
console.log(r.stdout.split('\n').filter(line => !line.startsWith('{')).join('\n'));
console.error(r.stderr);
process.exitCode = r.status ?? 1;
'@ | node --input-type=module
```

Runnable transport check, also from backend; uses injection only, no socket or DB:

```powershell
@'
import assert from 'node:assert/strict';
import {buildApp} from './src/api/index.ts';
const actor = {id: '00000000-0000-4000-8000-000000000001', roles: ['admin'], status: 'active'};
const app = buildApp({
  auth: {authenticate: async () => actor}, readiness: {check: async () => true},
  rateLimiter: {consume: async () => ({allowed: true})},
  admin: {suspendUser: async () => {}}, webhooks: {receive: async () => false},
  users: {list: async () => ({items: [], nextCursor: null})},
});
try {
  const options = await app.inject({method: 'OPTIONS', url: '/api/v1/admin/users', headers: {
    origin: 'http://localhost:8181', 'access-control-request-method': 'GET',
    'access-control-request-headers': 'authorization',
  }});
  const get = await app.inject({method: 'GET', url: '/api/v1/admin/users', headers: {
    origin: 'http://localhost:8181', authorization: 'Bearer synthetic',
  }});
  assert.equal(get.statusCode, 200);
  console.log({preflight: options.statusCode, get: get.statusCode,
    preflightAllowOrigin: options.headers['access-control-allow-origin'] ?? null,
    getAllowOrigin: get.headers['access-control-allow-origin'] ?? null});
} finally { await app.close(); }
'@ | node --import tsx --input-type=module
```

Additional adapter probes transpiled current `src/services/users.ts` in memory, replacing only imports with synthetic routing/API/Supabase objects. Legacy fixture used one active profile and two role rows, `label` and `admin`; backend fixture used one user, non-null next cursor and parent absent from page. These exercise service mapping logic, not HTTP/DB integration. No test source file was added by QA.

## Static Supabase scan

Local TypeScript AST traversal of `src` counted actual call expressions, unwrapped casts/parentheses, and avoided counting chained `.then()` as another Auth operation. This catches calls such as `(supabase as any).from(...)` and `(supabase as any).rpc(...)` that simple literal scans miss.

| Root call family | Count |
| --- | ---: |
| `supabase.from(...)`, including cast receivers | 214 |
| `supabase.rpc(...)`, including cast receivers | 32 |
| `supabase.functions.invoke(...)` | 36 |
| `supabase.storage.from(...)` | 36 |
| Direct `supabase.auth.<method>(...)` | 36 |
| `supabase.channel(...)` | 3 |
| **Total counted root calls** | **357** |

Calls span 78 files; 82 textual client import statements and four `postgres_changes` strings were also observed. Storage roots count once per bucket chain, not once per subsequent upload/signing method. Counts are source call sites, not runtime requests or migrated operations. Aliased/custom clients and dynamic access require inventory review; these counts do not establish exhaustive classification or `UNEXPECTED = 0`.

Supporting local searches:

```powershell
rg -n -U 'supabase\s*\.\s*(from|rpc|functions|storage|auth|channel)|postgres_changes' src
rg -n 'createClient|supabaseClient|supabaseAdmin' src
rg -n 'supabase|supabase-js|functions\.invoke|\.rpc\(|postgres_changes' backend/src backend/migrations
rg -n 'proxy|cors|CORS|VITE_SOUNDPUB|nextCursor|parent_label_name|setApiTokenProvider' src/api src/services src/hooks/useAuth.tsx vite.config.ts backend/src/api backend/src/users .env.example
```

Backend search found Supabase host strings in configuration deny-list, not a backend Supabase client. Remaining frontend business calls include Users legacy branches/dialogs, Settings profile writes, artists/releases/tracks, storage, royalties/payouts, copyright and takedown. Auth remains an intentional future-phase concern, but individual remaining business references still need complete classification and migration proof.

## Production-isolation evidence

- **QA operations: PASS within this session.** No production data migrated, traffic switched, shared Supabase accessed/mutated, provider contacted, or credentials obtained. No external infrastructure attestation is claimed.
- **Build containment: PASS.** Synthetic public frontend values, `envDir: false`, inherited `VITE_*` cleared, temporary output only. No frontend app execution capable of starting Supabase session refresh.
- **Backend guards: PASS within source/config tests.** Runtime rejects production/staging and unapproved DB targets; allowed names/hosts and dedicated usernames are checked before connection. Configuration tests and finite isolation scanner passed.
- **Deployment topology: source evidence only.** Compose declares loopback-published PostgreSQL/API/object storage and dedicated local database, with internal network plus ingress bridge. Bridge is not an egress firewall; no current containers/networks were inspected.
- **Frontend feature isolation: PARTIAL.** `.env.example` leaves backend domains empty; router requires `import.meta.env.DEV`. This prevents backend selection in ordinary production-mode build but does not prove all retained legacy behavior is preserved. Mixed-role label regression reproduces with backend disabled.
- **Isolated browser identity/mutations: BLOCKED.** Current Auth hook supplies Supabase session token, whereas backend runtime accepts configured synthetic identity tokens. Some Users actions still invoke legacy Supabase functions/table writes. No safe complete synthetic browser workflow or zero-legacy-write guarantee was independently demonstrated. No session token was read or forwarded during QA.

## Blockers and release decision

1. Fix pagination reachability and preserve backend parent-label names; test labels/users beyond first page.
2. Preserve label membership behavior for mixed-role users in retained legacy branch.
3. Establish safe synthetic browser identity and working local CORS/proxy transport; exercise actual frontend states/navigation without shared Supabase.
4. Independently run migration 0006, restricted-role, service/API, rollback and authority-concurrency tests against exclusively owned disposable local database. Prior Phase 2 role-write-denial evidence cannot certify migration 0006, which now grants runtime role INSERT/DELETE.
5. Complete remaining domain implementations/classifications and deterministic parity evidence. Current source is not fully decoupled; artist-label relationship changes intentionally return conflict until domain transactions exist.
6. Resolve frontend typecheck gate or explicitly approve measured legacy baseline; current whole-project result is FAIL and focused Users file still has three diagnostics.

No domain is independently certified **DECOUPLED**. **Phase 4: NOT READY on this evidence. Final independent QA status: BLOCKED.** No production operations are requested or authorized by this report.

## Source fingerprints

Selected SHA-256 values from approximately 10:04 Asia/Bangkok; these identify inspected source, not a frozen final worktree:

| File | SHA-256 |
| --- | --- |
| `src/api/client.ts` | `a645e58e398e6c532a7279ae69ac5292bee77424eb36f73c14f2df81b6550a99` |
| `src/api/routing.ts` | `f32548212e30d25882e306cdb586e1594e1c86ca1334cfa37386fbfa6ace2769` |
| `src/api/users.ts` | `ba45802e61ac565e9992cf27b92ed1ff9911aec3dbf3c55b8b3db38fa0744f07` |
| `src/services/users.ts` | `f5d61611866c9fb9360d4b5c1e0e9bd9221f560971fc6d4fa433bb289c5fc71c` |
| `backend/src/api/index.ts` | `5637d18847ebae39531a8372a0d2a9650f88cb349cf48ac5259b24842d6017c1` |
| `backend/src/users/index.ts` | `ee3e34be8e5f7fa24440a1898dd8c5e844e72b2ca1eb727d20cc83ad8ffee392` |
| `backend/migrations/0006_user_profiles.sql` | `09c330f95adbd033eaaf74182b01a9ded1bce50b9774d198a764b3a86ba718f6` |

## Coordinator changes after QA snapshot

Pagination iteration, server parent_label_name preservation, multi-role label selection and local same-origin Vite /api proxy were added after this independent run. They passed coordinator build and client self-check, but were not independently browser/database retested; QA status remains BLOCKED.
