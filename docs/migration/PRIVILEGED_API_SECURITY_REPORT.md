# Privileged API Security — Agent C

Observed 2026-10-27, Asia/Bangkok. **Status: BLOCKED; local remediation staged, not deployed.** Both production authorization gates remain UNVERIFIED. This report does not change overall readiness or authorize Phase 2.

## Safety stop and scope

Coordinator observed public anonymous `POST https://supabase.carubra.com/functions/v1/create-user` with `{}` returning HTTP 400 and `{"success":false,"error":"Failed to create user"}`. Public-route ownership remains unresolved. Latest instruction prohibits production deployment or mutation until route ownership is proven, rollback validated, and runtime changes judged safe. That instruction supersedes the earlier deployment request.

No `scp`, remote file write, SQL mutation, service recreation/restart, provider call, endpoint probe, identity creation, or token issuance occurred in this workstream. Remote inspection used SSH to `maskhar@20.20.20.3`, working from `/data/supabase/instances/supabase-01/config`. No credentials or tokens were printed or copied into local source, reports, frontend code, or `VITE_*`. Tests use synthetic credentials only. Existing unrelated work was preserved.

Read the Phase 1B attachment and root instructions; reviewed `SUPABASE_MIGRATION_AUDIT.md`, `PHASE1_FINAL_REPORT.md`, `PHASE1_SOURCE_BASELINE.md`, `SECURITY_FINDINGS.md`, and relevant routing, compatibility, verification, test, auth, financial, schema, and backup baseline artifacts. Rechecked critical caller/source/catalog conclusions rather than treating those reports as live proof. Used the Supabase skill, current changelog, and Edge Function authentication documentation. No SDK dependency or package manifest change was needed.

## Exact local files changed

| File | Change |
| --- | --- |
| `supabase/functions/send-app-email/index.ts` | Authenticate before payload/business access; restrict service and browser capabilities; derive payout mail from owned pending records; validate input/URLs, escape rendered values, enforce shared rate limits and concurrent keyed deduplication; avoid transactional token logging; redact provider failures. |
| `supabase/functions/backup-storage-to-drive/index.ts` | Authenticate before backup access; service identity only; POST/JSON validation and shared rate limit before run insertion, listing, download, or Drive work; reject unavailable providers before backup writes; use server-derived trigger attribution and safe failure responses. |
| `supabase/functions/_shared/privileged-api.ts` | Shared authentication, bounded JSON parsing, atomic database rate slots, CORS, and safe HTTP errors; required by both handlers. |
| `scripts/phase1b-privileged-api-security.test.cjs` | Runnable Node assertion suite using actual transpiled handlers/shared code, isolated Auth/DB/provider fixtures, and shared simulated unique constraints across fresh worker contexts. |
| `docs/migration/PRIVILEGED_API_SECURITY_REPORT.md` | This report. |

No other file is part of Agent C's final patch. Deno's automatically generated root lockfile was removed; subsequent checks use `--no-lock`. Temporary Deno/npm caches and ignored build output are validation artifacts, not application dependencies or deployable changes.

## Read-only origin evidence

Compose configuration confirms service `functions`, image `supabase/edge-runtime:v1.74.0`, and bind source `/data/supabase/instances/supabase-01/config/volumes/functions` mounted at `/home/deno/functions`. This verifies the inspected origin mount; it does **not** prove public hostname routing. Volume inspection occurred before any upload; no upload followed.

Runtime environment metadata confirms `DATABASE_SCHEMA=soundpub`, `VERIFY_JWT=false`, and an existing server-side `SUPABASE_SERVICE_ROLE_KEY`. Only credential presence and decoded nonsecret validity metadata were reported: expected service role, numeric expiry, not expired at observation. `APP_URL` is configured. Both Compose configuration and the running container environment lack `LOVABLE_API_KEY`, `GOOGLE_MAIL_API_KEY`, and `GOOGLE_DRIVE_API_KEY`; the running container's service credential matches Compose. Provider readiness at the public serving origin is unknown.

Live catalog confirms:

- No `cron` schema in `postgres` or `_supabase`; no matching endpoint literal in inspected `pg_proc` bodies. This does not exclude dynamic SQL, another database, or an external scheduler.
- No matching endpoint literal in readable `/etc/cron.d`, `/etc/crontab`, or `/etc/systemd/system`; SSH user's `crontab -l` exits 1. Root/private cron, provider schedules, external clients, and actual request traffic were not comprehensively inventoried.
- `soundpub.rate_limits` has RLS enabled and a unique constraint/index over `(identifier, action_type)`. `service_role` can INSERT; `anon` and `authenticated` cannot. New rate reservations use this existing unique constraint and need no schema/grant migration.
- Email log aggregate: 169 rows — 164 failed announcements, 3 failed payment-success sends, 2 suppressed payment-success sends. This supports historical template use, not successful delivery or a proven caller identity.
- Backup aggregates: 2 runs, 0 object-log rows. Counts and both target source hashes remained unchanged in final read-only inspection. Counts do not prove absence of unrelated concurrent activity elsewhere.

| Origin file | Unchanged SHA-256 |
| --- | --- |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` |

## Caller map and staged authorization

Repository search and mounted deployed-source search found the following executable callers. Caller line numbers refer to unchanged caller source at inspection.

| Endpoint / caller | Credential evidence | Minimum staged capability / impact |
| --- | --- | --- |
| Email: `src/components/notifications/AnnouncementDialog.tsx:55` | Browser `supabase.functions.invoke`; ordinary user session, no server secret | Fresh `auth.getUser(token)`, authoritative active profile and DB role `admin`/`superadmin`; announcement template with a validated role broadcast only. Artist/label/copyright/no-role callers denied. Existing frontend payload shape retained. |
| Email: `src/pages/Payouts.tsx:136` | Browser user session after `request_payout` | Active recognized application role can notify only admin/superadmin recipients about its own matching pending payout created in the last 15 minutes. Match amount/bank/account/holder to stored row; derive display data from authoritative profile/payout and dedup key from payout ID. Arbitrary recipients, fabricated payouts, other owners, nonpending/stale records denied. No frontend change or server secret required. |
| Email: `supabase/functions/send-password-reset/index.ts:138` | Repository and deployed caller construct SDK client with existing service-role key; no forwarded user authorization | Exact configured service credential; `password-reset`, UUID recipient, validated configured-origin reset URL. Existing idempotency key accepted, stored as scoped digest rather than raw reset token. |
| Email: `supabase/functions/reset-password/index.ts:103` | Same service-client evidence | Same service credential; `password-reset-confirmation`, UUID recipient, validated configured-origin login URL. No end-user JWT newly required of this internal call. |
| Email: `supabase/functions/send-verification-email/index.ts:89` | Same service-client evidence | Same service credential; `email-verification`, UUID recipient, validated configured-origin verification URL. |
| Email: `supabase/functions/xendit-webhook/index.ts:189` | Repository and deployed executable source use service client; payload includes payment-derived recipient and idempotency key | Same service credential; `payment-success`, UUID recipient, validated title/amount/track count. No payment callback was sent. |
| Backup: frontend, Edge Function, SQL function, pg_cron, readable host schedule | No executable caller proven in inspected sources/metadata | Exact existing service credential is the sole staged capability. Browser credentials, `apikey` alone, `x-trigger`, source-IP headers, and role claims without credential equality cannot authorize backup. Scheduler identity, auth header, method, body, cadence, and destination ownership remain blockers. |
| Both: external webhook / manual / other internal service | No caller identity proven beyond the four shared-key email callers above | Deny unknown identities. No new webhook, manual admin, anonymous, or alternate-secret exception was invented. External caller completeness remains unproven. |

**Baseline correction:** `EDGE_FUNCTION_MAPPING.md` describes the webhook email reference as commented legacy code. Inspection of both current repository and mounted deployed `xendit-webhook/index.ts` finds an executable `await supabase.functions.invoke('send-app-email', ...)` in the payment path. Preserve this fourth internal email caller. Historical reports were not overwritten.

The four internal email callers share one existing service credential, so this patch cannot distinguish their individual process identities. Service access is limited to their four observed template capabilities and UUID recipients; release/payout status templates, service broadcast, and direct-email selectors are not newly authorized. Finer process-specific credentials require caller changes outside this assignment. Public reset/verification caller security remains a separate trust boundary; authenticating the internal hop does not establish upstream business authorization.

Browser payout mail is a constrained owner notification, not unrestricted privileged email access. Thus a normal role is denied announcements/payment/transactional mail but may perform the explicitly validated owner workflow. Inactive and suspended profiles fail closed for these sensitive operations; login semantics are unchanged. Inactive-operation compatibility requires review before rollout because the baseline says inactive users may still log in.

## Request, replay, and rate behavior

- OPTIONS returns harmless CORS preflight without data access. All other methods except POST return 405. Missing/malformed/invalid authorization returns 401 before body parsing or business queries.
- Service authentication compares SHA-256 digests of the supplied Bearer token and the exact configured legacy service key, then requires its expected role and valid numeric expiry/not-before. Merely claiming `service_role` does not authorize. This deployment's legacy JWT credential format is intentional; opaque keys or another service identity fail closed until their actual caller contract is proven.
- End-user identity comes from Auth `getUser(token)`; role/status are read server-side, never from editable user metadata or request payloads. Auth failure denies; metadata/database failures fail closed.
- JSON body is streamed with a 65,536-byte ceiling; arrays/null, invalid JSON/UTF-8, wrong media type, invalid selector combinations, unknown/inherited template names, invalid roles, nested template data, invalid financial fields, CRLF recipient injection, and action URLs outside configured HTTPS origin/expected paths are rejected. Backup requires an empty JSON object. Previously unauthenticated/bodyless scheduler compatibility is not assumed.
- Atomic rate slots are ordinary INSERTs protected by the existing unique constraint; only SQLSTATE `23505` advances to another slot. DB failure returns 503. This avoids the existing `check_rate_limit` RPC's unlocked read/modify/write race without changing shared SQL. State survives fresh workers through PostgreSQL, not process memory. Caller-supplied IP/trigger headers do not choose quota keys.
- Fixed windows: email 60 service requests/minute across the shared service identity, 10 user requests/minute per verified user; backup 1 request/minute across service callers. Saturation returns 429 with `Retry-After`, before provider/backup work. Up to twice a window's quota may occur across a boundary; these are request limits, not recipient quotas or a distributed backup execution lock. Slot scans may require up to the configured number of unique-conflict round trips. Threshold/cadence compatibility is unverified, especially for the unidentified backup scheduler.
- Existing successful keyed email replay returns HTTP 200 `{skipped:true, reason:"idempotent_duplicate"}` with zero additional delivery, preserving the existing response contract. Concurrent keyed claims return 409 to losers. Payout keys are derived server-side; role order and caller key changes cannot evade the same payout's deduplication. Keys stored in new email logs are scoped digests; transactional metadata excludes action tokens/URLs.
- Keyed claims use atomic slots in a 24-hour fixed window plus persisted successful email logs. Failed/partial attempts can retain a claim until window rollover; this is not an outbox or exactly-once delivery system. Existing raw historical keys were not rewritten, and legacy-key deduplication parity at an unresolved public origin must be reviewed before rollout. Existing current-origin logs have no successful sends.
- **Replay limitation:** existing service Bearer credentials are reusable. Calls without idempotency keys, including verification/confirmation mail and backup, do not become cryptographically replay-proof. Repeating a backup within the minute is rate-denied; a later valid scheduled run is allowed. Adding signatures/nonces or requiring new caller headers would break unmodified callers and was not guessed. Strict one-use credential replay protection remains unverified/unsupported by the existing protocol.

## Validation results

All tests below are local. Auth results and PostgreSQL uniqueness are mocked; no real identity, token validation service, PostgreSQL DML, Gmail, Drive, or public endpoint participates. Deno checks use local Deno 2.9.6 with the pinned SDK's fetched declarations, not the production edge-runtime container.

| Check | Result / evidence |
| --- | --- |
| `node scripts/phase1b-privileged-api-security.test.cjs` | PASS. Actual modified source transpiles into isolated VM contexts; assertions below pass. |
| Anonymous / wrong scheme / forged service role / invalid and simulated expired user credentials | PASS mocks: 401, no business writes or provider calls; anonymous malformed body still 401. API-key-only and forged trigger/IP headers cannot bypass. |
| Unprivileged user / inactive / suspended / missing role | PASS mocks: email privileged capabilities denied; all user credentials denied backup; user metadata claiming superadmin does not bypass authoritative role. |
| Authorized internal email | PASS mocks for all four observed templates; transactional UUID profile selection no longer projects a literal `null` column. Actual internal workflow ALLOW is UNVERIFIED live. |
| Authorized admin announcement and owned payout | PASS mocks for both admin roles and each supported payout owner role; canonical stored payout/name used. Other-owner, missing, stale, mismatched, and nonpending payouts denied. |
| Exact configured service JWT expired / missing expiry / future nbf / wrong role | PASS local handler checks: 401. These checks do not substitute for real Auth expiry verification of user JWTs. |
| Malformed input / unsupported method / oversized body / wrong media type / injection / foreign action URL | PASS mocks: 400/405/413/415 as appropriate, no business writes/provider calls. Escaped template content does not render injected HTML. |
| Keyed email replay / concurrency | PASS mocks: completed replay skips; 12 concurrent fresh workers deliver at most once for one key. Owner payout replay stays suppressed after role-order and caller-key changes. Raw reset token does not enter new email log fixtures. Reusable credential replay limitation remains as described above. |
| Rate limiting | PASS mocks: concurrent 15 user calls allow 10/deny 5; 65 service email calls allow 60/deny 5; fresh workers share quota; next minute allows again. Eight concurrent backup calls yield one successful fixture upload/run and seven 429s. Retry-After positive; provider/log effects occur only for allowed calls. |
| Missing provider / DB failures | PASS mocks: 503, fail closed. Backup run insertion failure does not call Drive; metadata/rate failures do not send mail or start backup. Provider error contents do not enter email log fixtures. |
| Changed Edge TypeScript ESLint | PASS: `npm exec -- eslint supabase/functions/_shared/privileged-api.ts supabase/functions/send-app-email/index.ts supabase/functions/backup-storage-to-drive/index.ts`. |
| Test-file lint | PASS: installed ESLint with `@eslint/js` recommended rules, Node globals, and CommonJS source type. No new lint configuration/dependency. |
| Relevant Edge typecheck | PASS: `npm exec --yes --package=deno -- deno check --no-lock` for both handlers and shared helper. Initial Windows cache cross-drive error resolved by pointing `DENO_DIR` to a cache under local `%TEMP%`; code unchanged for that issue. |
| `npm run build` | PASS; existing large-chunk warning. |
| `npm exec -- tsc --noEmit -p tsconfig.node.json` | PASS. |
| `npm exec -- tsc --noEmit -p tsconfig.app.json` | FAIL: pre-existing TS1005 errors in untouched `src/integrations/supabase/types.ts` at lines 527, 544, 561, 1583, 1600, 1617. Exit 2; outside Agent C edit scope. |
| Public/direct-origin anonymous, unprivileged, internal-allow, malformed, expired/replay, rate-limit integration matrix | **UNVERIFIED: not executed under coordinator safety stop.** No unsafe probe of still-unpatched backup/email handlers. No synthetic production identity created. |
| Rollback rehearsal / shared runtime recreation / independent QA | **UNVERIFIED: not executed or authorized while stopped.** |

## Live changes and remaining gates

**Live changes: NONE.** Mounted target handlers remain at the unchanged origin hashes above. No rollback was created or tested; claiming a deployment-ready rollback would be incorrect. No production secrets/configuration or other functions were changed. The newly added shared helper is local only; do not upload the entire `_shared` directory over the remote-only CORS helper.

Before any future rollout:

1. Coordinator must prove public-route ownership and explicitly clear the safety stop after validating runtime impact and rollback. Current public `create-user` behavior cannot prove these endpoints reach this origin.
2. Prove the backup scheduler/manual caller identity, existing credential source, POST/body contract, cadence, and destination authorization. Fail closed for unknown callers; do not invent a browser secret or silently relabel an anonymous scheduler as trusted.
3. Verify configured provider credentials, application origin/paths, shared-service template scopes, active-profile policy, historical idempotency behavior, retry handling, and quota compatibility at the actual serving runtime. Sensitive-operation inactivity policy and partial-failure/idempotency reservation behavior require explicit acceptance before rollout.
4. In the proven runtime, capture only both intended directories and the required shared helper into private rollback storage, verify hashes and a restore/reload rehearsal without production interruption, then obtain coordinator clearance. Later deploy only reviewed source through `scp`, preserving all existing remote configuration/secrets and `_shared/cors.ts`; recreate `functions` only after runtime safety is established.
5. Run the required public and direct-origin matrix with approved safe identities and provider isolation. Use a real existing internal credential only inside trusted server execution; never print or export it. Resolve strict replay requirements if the existing reusable-Bearer protocol is insufficient. Obtain independent QA.

Email authorization gate: **BLOCKED / live UNVERIFIED**. Backup authorization gate: **BLOCKED / caller identity and live behavior UNVERIFIED**. No claim of zero remaining critical findings or Phase 2 readiness follows from local mock success.
