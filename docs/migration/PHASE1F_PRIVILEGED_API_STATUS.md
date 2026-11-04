# Phase 1F Privileged API Status — Agent F

**Production privileged API gate: FAIL.** Deployed email and backup lack caller authentication. Additional static high-impact findings affect artist password administration and SSO account linking. Existing local remediation is not production closure.

Observed 2026-10-27, approximately 13:17–13:22 UTC (Asia/Bangkok +07:00). Scope: read-only production source/configuration/catalog/log audit over `maskhar@20.20.20.3`; full function ownership/caller/migration inventory and all entrypoint fingerprints are in [PHASE1F_FUNCTION_SCOPE.md](PHASE1F_FUNCTION_SCOPE.md).

## Evidence boundary

First server inspection resolved Compose mappings from `/data/supabase/instances/supabase-01/config`. Mounted `volumes/functions` and container-visible `/home/deno/functions` source hashes agree for all 37 entrypoints. Running `supabase/edge-runtime:v1.74.0` has `VERIFY_JWT=false`; `main/index.ts:112` therefore skips router JWT verification. CORS and header presence are not authorization. All workers receive the container environment, including privileged credential names, through `main/index.ts:157–158`.

Evidence comes from mounted source, matching container-visible hashes, selected non-secret configuration, read-only PostgreSQL catalog queries and bounded log aggregates. This establishes deployed guard structure, not a passed execution/denial test. Cached worker freshness and the actual production public hostname/runtime remain unverified.

No request was sent to any application/Edge/provider endpoint. No account, token, payment, mail, backup or Storage object was created or changed. No deployment, restart, database migration, route edit or credential rotation occurred. Documentation is the only authored output. Existing local tests were not run; their historical PASS results are not current production evidence. No secrets or raw request/log payloads appear here.

## Confirmed deployed failures and review gaps

### F-01 — CRITICAL: mail caller authorization absent

Remote `send-app-email/index.ts:224–240` skips OPTIONS, constructs a service-role client and parses caller JSON without validating a caller. Lines 263–301 accept role broadcast, recipient user ID or direct recipient email. Lines 318–341 render caller template data, invoke Gmail and write send logs. No getUser, role/active-profile/ownership gate, exact internal credential comparison, body-size limit or caller rate reservation guards this handler.

This is a confirmed missing handler boundary. External reachability through a particular gateway and successful provider delivery were not probed. Unknown templates, missing connector credentials or opt-out logic can stop some requests; none establishes caller authorization. Existing sent-log idempotency lookup is optional, caller-selected, and does not reserve a concurrent claim before delivery.

### F-02 — CRITICAL: backup starts privileged work without caller authentication

Remote `backup-storage-to-drive/index.ts:121–133` inserts `storage_backup_runs` with service authority for every non-OPTIONS method, before provider readiness checks at 142–143. The `x-trigger` header is recorded as attribution, not authenticated identity. Lines 146 onward create/search Drive folders and process Storage downloads/uploads.

A bodyless GET can reach the initial business write; it is therefore not a safe audit probe. The job includes shared/unclassified bucket names, and neither caller identity nor schedule/destination/object ownership has been established. Runtime logs contain two dispatch attempts but do not prove a scheduled, legitimate or successful backup. The local secured candidate has not been deployed.

### F-03 — HIGH: admin can bypass target hierarchy in artist password handler

Remote `set-artist-password/index.ts:40–61` authenticates caller and fetches role. At 74–107, admin/superadmin callers skip all parent/subscription checks. At 109–113 the handler calls `auth.admin.updateUserById(artist_id, { password })`.

The supplied target is not required to hold artist role, and ordinary admin callers have no explicit superadmin-target denial. Static code thus permits an authenticated admin request to reach password replacement for an arbitrary valid Auth target, including a superadmin target. This is a privilege-escalation path in handler logic, not an executed account takeover. In contrast, `update-user-password` contains an explicit superadmin-target guard. Required closure: authoritative target-role/hierarchy checks, active-caller checks and shared-identity ownership before Auth mutation.

### F-04 — HIGH: SSO identity binding incomplete

Remote `sso-login` verifies an RSA signature with configured realm JWKS and exact issuer (45–91). Expiry is checked only when `exp` is numeric, using `exp < now`; absence/type is not rejected. `azp` is checked only when present (322–327). Nonempty client roles are required (330–335).

No mandatory audience, numeric expiry, subject, not-before or email-verification contract is enforced in the reviewed flow. Existing profile is selected by email (380–384), and its stored SSO subject/provider is not required to match incoming issuer/subject before session generation (388–410, 463–481). This does not imply signatures can be forged; it means accepted provider claims/account linking lack required identity constraints. Local account status is not checked before the magic-link/session path. Provider/account-owner approval and isolated collision, expiry, audience and subject-mismatch tests remain necessary.

### F-05 — HIGH: legacy verification sender accepts arbitrary target

Remote `send-verification-email/index.ts:29–85` accepts `userId` and email without a caller identity, loads the supplied profile and replaces its verification token. Limiting runs only when caller supplies truthy `isResend` (38–56). No authenticated target ownership guard exists. This is a state-changing unauthenticated target-selection path; it is not classified safe merely because no current frontend caller was found.

The separate `reset-password`, `verify-email`, and `verify-password-reset-token` handlers require stored capability tokens. Their lack of a user JWT is not, by itself, proof of unauthorized execution. Non-atomic token consumption, nullable/invalid expiry handling, unchecked update errors and legacy caller ownership remain unresolved.

### F-06 — cross-cutting status, credential and public-runtime gaps

Live `soundpub.is_admin(user_id uuid)` is SECURITY DEFINER and delegates only to `soundpub.has_role` for admin/superadmin. Live `has_role` checks membership in `soundpub.user_roles` only. Neither checks caller profile status. Thus role-only RPC checks in royalty import/delete/notification do not prove inactive or suspended caller denial.

Many other handlers fetch authoritative DB roles but omit a live active-caller-profile check. Target active status, recipient status, subscription status, Auth getUser success and a role check must not be reported as equivalent controls. Auth ban/revocation behavior was not exercised. Target-role lookup errors in deletion/password paths and several partial business/audit writes are also not explicitly fail-closed.

Prior `PHASE1E_PUBLIC_ROUTING.md` reports an unresolved public `.com` origin/runtime mismatch; this audit did not repeat requests or resolve routing. Prior credential-incident/rotation reports remain dependencies, not freshly attested remediation. Old-key rejection, all-consumer rollover and legitimate new credentials were not tested here.

## Complete deployed authorization inventory

Line references below point to remote `<function>/index.ts` under the confirmed mount; local line numbers/bytes can differ. All static verdicts are limited by actual gateway policy, DB behavior and worker freshness. All 37 entrypoints are included; intentionally public read APIs are distinguished from privileged mutation APIs.

| Function | Deployed caller guard / source lines | Privileged capability or effect | Static status / unresolved boundary |
| --- | --- | --- | --- |
| `auth-email-hook` | POST; Standard Webhooks signature verified before delivery (51–64) | SMTP mail; generic Auth actions and Soundpub signup branch | Guard present statically; delivery/replay/provider key rollover untested |
| `backup-storage-to-drive` | No caller authentication; only OPTIONS bypass (121–131) | Service-role run insert, Storage reads, Drive folder/upload writes | FAIL: first business write precedes provider readiness; spoofable x-trigger is attribution only |
| `change-own-password` | Auth getUser; target fixed to returned user.id (30–80) | Auth admin password update; profile and audit writes | Own-target guard present; caller active status/current-password/revocation behavior not established |
| `create-copyright-invoice` | Bearer getUser; registration AND payment user_id match (11–29) | Service-role payment lookup/update; Xendit invoice creation | Owner guards present; no caller active-profile guard; origin-derived redirect and concurrency/recovery need validation |
| `create-user` | POST; strict Bearer; getUser(token); authoritative active profile and role; target hierarchy/parent checks (53–136) | Auth createUser; Soundpub profile/role/artists writes | Hardened guard present and source matches local; public integration and shared-identity scope UNVERIFIED |
| `create-whitelabel-artist` | Auth getUser; role must equal whitelabel; parent bound to caller (40–106) | Auth user creation; profile/role writes | Role/parent guards present; no caller active-profile check |
| `create-xendit-invoice` | Bearer getUser; owner/creator or admin guard; extra custom-label rules (56–79,168–235) | Privileged payment/release writes and Xendit calls | Guards present; existing owner-filtered invoice branch precedes release authorization; full recovery/state/status tests absent |
| `delete-royalty-upload` | Strict Bearer; getUser; role-only is_admin RPC; bounded input (54–75) | Service-role reverse_royalty_upload RPC | Role guard present; no caller active-profile check; failures use HTTP 200 with ok:false |
| `delete-user` | Auth getUser; admin/superadmin; self-delete and superadmin-target checks (26–112) | Deletes GoTrue Auth identity; audit write | Shared identity deletion unapproved; target-role lookup error not explicitly fail-closed; caller status unchecked |
| `download-release-invoice` | POST; getUser; admin/superadmin; payment must be paid (61–81) | PDF upload, payment metadata update, 600-second signed Storage URL | Guard present; download is not a pure read; caller active-profile check absent |
| `gcs-manage` | Constant GCS_DISABLED=true (30–57) | 503 response; no active storage business branch | Disabled statically; frontend still calls |
| `gcs-upload` | Constant GCS_DISABLED=true (34–62) | 503 response; no active upload business branch | Disabled statically; frontend still calls |
| `get-catalog-tracks` | No caller authentication; active/unarchived release filter (20–84) | Service-role public catalog projection including audio_url/clip_url and label name | Public intent; approve media projection; negative/NaN pagination and filter input contract unproven |
| `get-ga4-config` | No caller authentication; ga4_enabled gates response (19–57) | Service-role setting read; returns public measurement ID | Public intent; no privileged mutation found |
| `hello` | withSupabase auth modes publishable/secret (15–30) | Constant hello JSON; commented admin example is inactive | Wrapper declaration only; dependency/active consumers unverified |
| `info-soundpub` | No caller authentication; fixed app_settings key selection (19–55) | Service-role read of ICCN description/photos | Public intent; no arbitrary setting selector found |
| `main` | Global JWT branch skipped with VERIFY_JWT=false (111–130) | Dynamic worker dispatch; forwards entire environment (145–169) | Handler-level authorization mandatory; no explicit slug allowlist or per-worker credential restriction |
| `process-royalty-upload` | POST; strict Bearer; getUser; role-only is_admin (138–158) | Auth managed-artist creation/cleanup; commit_royalty_upload RPC | Role/input guards present; recipient active checks do not establish caller active status |
| `remove-artist-from-label` | getUser; admin or label/whitelabel; parent ownership for label callers (28–109) | Service-role artist/profile lifecycle writes | Scope guard present; release lookup failure logs and continues (115–123); caller status unchecked |
| `reset-password` | No session required; profile reset-token match and date expiry (30–73) | Auth password update; clear token; auth event; internal mail | Bearer recovery-token capability; non-atomic token clear and unchecked partial writes; not automatically unauthenticated takeover |
| `send-app-email` | No caller authentication, role, ownership or service identity guard (224–320) | Service-role recipient/fanout selection and send log writes; Gmail delivery | FAIL: arbitrary recipientEmail/broadcastRoles and template data reach provider path |
| `send-password-reset` | Public email input; check_rate_limit RPC; unknown address gets generic response (48–112) | Writes target reset token, auth event and internal mail | Public recovery intent; limiter errors log and continue; no current repo producer found |
| `send-royalty-notification` | getUser plus role-only is_admin RPC; payload presence checks (90–138) | Privileged recipient reads; direct Gmail connector delivery | Role guard present; caller status unchecked; no executable repo producer found |
| `send-verification-email` | No caller authentication; supplied userId chooses profile; rate limit only if isResend (29–85) | Overwrites target verification token; internal mail; auth-event write | FAIL: target binding absent; caller can omit isResend to skip limiter |
| `set-artist-password` | getUser and DB role; admin skips parent/subscription branch; others need parent and subscription (40–113) | Auth admin password update for supplied artist_id | HIGH: admin branch has no target-artist-role or superadmin-target guard; caller active-profile check absent |
| `spotify-fetch-artist` | Bearer getUser before Spotify token use (74–92) | Spotify client-credential token and artist/search API calls | Authentication present; no caller active/profile-role/rate guard; denial payloads use HTTP 200 |
| `sso-login` | RSA signature and exact issuer; numeric exp checked if present; azp checked if present; nonempty client role set (45–91,320–335) | Shared Auth account/profile/role creation and session issuance via magic link/verifyOtp | HIGH: no mandatory aud/exp/sub/nbf or existing issuer-subject binding; links existing account by email |
| `start-user-impersonation` | getUser; superadmin DB role; target active; redirect suffix only (26–69) | Auth magic-link generation; audit insert | Caller active profile and approved redirect origin unchecked; audit insert error not required for success |
| `test-gcs` | getUser; admin/superadmin DB role (30–50) | GCS service-account OAuth token issuance and bucket listing | Guard present; external credential use is active; caller status unchecked |
| `transfer-artist-label` | getUser; admin/superadmin; confirmation and keep_old_label only; target artist-role check (31–124) | Privileged parent-label/catalog changes; retains old royalty history | Guards present; caller active-profile check absent; transactional/tenant behavior untested |
| `update-app-settings` | getUser; superadmin; 1–50 allowlisted keys/value limits (33–73) | Privileged settings upserts and audit insert | Guard present; caller status unchecked; individual upserts can partially succeed |
| `update-user-password` | getUser; admin/superadmin or owning label; superadmin target protection (32–125) | Auth admin password update | Target-role query errors not explicitly denied in admin path; no target artist-role check for label branch; caller status unchecked |
| `update-user-role` | getUser; admin; no self change; superadmin grant/target protections; missing target 404 (19–109) | Privileged role update and audit insert | Guard present; deployed lookup fix differs from local; caller status unchecked |
| `update-user-status` | getUser; admin; self/target-superadmin protections (27–100) | Profile status; Auth ban/unban; audit write | Caller status unchecked; Auth update errors are not checked (126–135); cross-app ban scope unresolved |
| `verify-email` | No session required; profile token match and expiry (28–84) | Profile confirmation/token clear; Auth email_confirm:true | Token capability; profile/Auth steps are not atomic and update failures unchecked |
| `verify-password-reset-token` | No session required; profile token match and expiry (28–68) | Returns matched profile ID/email/expiry | Token capability; unknown/null/invalid expiry contract and external consumers unverified |
| `xendit-webhook` | POST; configured callback token required; exact header match before parsing/DB; invoice amount/currency checks (46–93,126–128) | Privileged payment/release/registration/notification writes; Gmail and Resend | Guard present statically; raw hash differs local; callback registration/replay/revocation and durable multi-step recovery unverified |

Public catalog returns full media URLs in addition to clips. Whether each exported field/object is approved public requires product/storage ownership evidence; service-role access cannot substitute for that approval. `download-release-invoice` may upload a PDF and update payment metadata before returning a signed URL; its name does not imply a read-only endpoint.

## Source identity: local candidate versus production mount

Snapshot compares existing working tree; concurrent agents may subsequently change it.

| Source | Mounted/container SHA-256 | Working-tree SHA-256 | Comparison |
| --- | --- | --- | --- |
| `create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | identical |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | `95a57892f6a60ce34bd2b86673ce4a0ce9237f5ad0eddb420d9f3674118bcc8e` | code drift |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | `d7708c39e063ab30f8161cb84e4352638d90482738248c3500e7c390c796b460` | code drift |
| `xendit-webhook/index.ts` | `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb` | `e4a36a4675c67c8791891bc8f48bd82168e228658ff57c09c102325d20448970` | code drift |

Local `_shared/privileged-api.ts` SHA-256: `3c8a599959c29b0be91056333c27087a1c74edf047d4edb17fdf23ac24188d1f`. **Remote helper absent.** Local and remote `_shared/cors.ts` match at `d0d945158d49295b15c6c4f11e534b2a7a5da17461d57b122b3e5b50a92a8f53`. Therefore an older claim that repository lacks this CORS helper is no longer current.

Local mail/backup candidates use POST-only exact configured service-key authentication; browser mail branches also use Auth getUser plus authoritative active profile/role, bounded input and rate reservation. Service JWT claim checks are secondary to exact configured-key equality, not acceptance of arbitrary decoded role claims. These are reviewed candidate properties, not deployment or test results.

Shared service credential authenticates a bearer, not an individual producer. It does not provide per-process least privilege or replay prevention. A keyed dedup/rate claim is not a durable mail outbox or a distributed backup execution lock. No production readiness credit is awarded for local helper presence.

## Legitimate caller compatibility and capability scope

| Caller | Expected capability | Current evidence / unresolved contract |
| --- | --- | --- |
| `src/components/notifications/AnnouncementDialog.tsx:55` | Admin announcement fanout | Executable browser call; deployed mail has no caller guard; candidate narrows admin capability |
| `src/pages/Payouts.tsx:136` | Payout owner's pending-payout notification | Executable ordinary-user workflow; blanket user-mail denial would break it; candidate checks stored payout ownership and derives recipients |
| Remote `send-password-reset/index.ts:138` | Internal password-reset template | Service-role client invocation; legacy external producer unknown |
| Remote `reset-password/index.ts:103` | Internal password-reset-confirmation template | Service-role client invocation after token flow; shared Auth scope unapproved |
| Remote `send-verification-email/index.ts:89` | Internal email-verification template | Service-role client invocation; upstream arbitrary-target gap remains |
| Remote `xendit-webhook/index.ts:207` | Internal payment-success template | Active executable call; callback-token trust is separate; direct Resend path also remains |
| Backup scheduler/operator | Authorized scoped backup job | No executable repository caller; identity, cadence, payload, bucket/object manifest and destination ownership UNKNOWN |
| Shared GoTrue Auth service | Signed SMTP Auth hook | Live hook URI enabled; generic non-Soundpub Auth actions also supported |
| ICCN / external integration | Public info API and verified SSO | Public info preview fetch confirmed; external registration and complete consumer map unknown |

Database/catalog and readable host-cron scans found no literal Edge URL callers; they do not exclude dynamic/indirect/private/external calls. Full schedule limitations and log window are recorded in companion scope report.

## Required authorization matrix: evidence, not execution claims

Every dynamic case below is **NOT RUN** in this audit. No denial is assumed safe to probe against handlers known to write before authorization.

| Case | Deployed static assessment | Required isolated / approved integration evidence |
| --- | --- | --- |
| Anonymous mail/backup | Missing boundary; non-OPTIONS reaches business path | Deny before DB/provider effects |
| Ordinary user mail | No deployed capability enforcement | Deny arbitrary/broadcast mail; allow only valid owned payout workflow |
| Unauthorized role / inactive / suspended | Most roles checked per handler; active-caller coverage incomplete | Authoritative live status, role and target ownership deny matrix |
| Invalid/forged service identity | Mail/backup do not inspect it | Reject invalid/forged/expired identity before effects |
| Revoked/old credential | Revocation/rotation not established here | Old rejection and intended new caller success on actual runtime |
| Admin escalation | create-user blocks superadmin grant; set-artist-password hierarchy gap remains | Deny target-superadmin password change and forbidden grants |
| Legitimate superadmin | Several static role gates exist | Intended scoped positive case, active status, audit and shared-identity authorization |
| Legitimate internal mail producer | Four executable deployed producers | Each approved template/recipient/action URL; upstream authorization intact |
| Legitimate scheduler | Identity UNKNOWN | Explicit service identity, approved objects/destination, bounded concurrency/retry |
| Provider Auth/Xendit webhook | Signature/token guards present statically | Valid/invalid signature/token, replay, rotation, controlled delivery and retry recovery |
| Cross-tenant target | Parent/owner checks vary by handler | Two-way tenant denial and no shared-application identity damage |
| Rate/replay/provider failure | Controls vary; mail has optional non-atomic dedup | Zero forbidden effects, durable retry behavior, no duplicate financial/provider actions |

Observed dispatches for mail, backup, user creation, SSO and webhook are activity evidence only. They identify neither caller authorization nor success. No log-based PASS is claimed for any matrix row.

## Closure status and next ownership

| Gate | Status |
| --- | --- |
| Compose mapping and mounted/container source inventory | VERIFIED for inspected host |
| Complete runtime classification | Documented; inferred owners and unresolved consumers explicitly marked |
| Exclusive Soundpub/shared ownership approval | INCOMPLETE |
| Deployed privileged mail/backup boundary | FAIL |
| Admin credential target hierarchy | FAIL statically in set-artist-password |
| SSO provider-to-local identity binding | INCOMPLETE / high-impact gaps |
| Public production runtime/source identity | UNVERIFIED in this audit; prior routing blocker carried forward |
| Legitimate caller compatibility and revoked-key matrix | NOT RUN / UNVERIFIED |
| Production privileged API readiness | FAIL |

Closure belongs jointly to runtime/routing, shared Auth, mail/backup, provider/credential and product owners. First establish intended runtime and caller/identity/object ownership, then review canonical source and close confirmed boundaries, then use isolated fixtures/provider controls for the full matrix before an approved deployment. No deployment or mutation is authorized or performed by this report. Phase 2 readiness is not established.

