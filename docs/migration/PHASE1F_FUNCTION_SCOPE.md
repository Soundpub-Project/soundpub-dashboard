# Phase 1F Function Scope — Agent F

**Inventory verified at inspected host; ownership/migration approval INCOMPLETE. Privileged API gate FAIL.**

Observation: 2026-10-27, 13:17–13:22 UTC (20:17–20:22 Asia/Bangkok). Repository HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; comparisons use existing working-tree files, including concurrent work, rather than HEAD alone.

## Read-only boundary and evidence

SSH target: `maskhar@20.20.20.3`. First production inspection ran `docker compose config --format json` from `/data/supabase/instances/supabase-01/config`, with captured output projected to service images and volume mappings before printing. Later reads used this same directory. No source upload, service reload/rebuild/restart, SQL write, token issuance, provider call, or endpoint probe occurred. Only this report and `PHASE1F_PRIVILEGED_API_STATUS.md` are created by Agent F. Existing unrelated working-tree changes were preserved.

Compose and running-container inspection independently agree:

| Property | Observed value |
| --- | --- |
| Service/container | `functions` / `supabase-edge-functions` |
| Image | `supabase/edge-runtime:v1.74.0` |
| Mounted source | `/data/supabase/instances/supabase-01/config/volumes/functions` |
| Container destination | `/home/deno/functions`, read/write bind |
| Entrypoint command | `start --main-service /home/deno/functions/main` |
| Running state / latest start | `running` / `2026-10-27T01:41:54.510600887Z` |
| Runtime JWT switch | `VERIFY_JWT=false` in resolved Compose and running container |
| Resolved application schema | `DATABASE_SCHEMA=soundpub` |
| Auth mail hook | Enabled; URI `https://supabase.carubra.space/functions/v1/auth-email-hook` |
| Other consumers of source mount | Studio mounts same source at `/app/edge-functions`, read-only |
| Source cross-check | All 37 container-visible entrypoint SHA-256 values match host-mounted source |

Remote TypeScript was reviewed in memory with configured secret values redacted before transfer; source was not copied into repository artifacts. Raw Compose environment, raw logs, credentials, payloads, email addresses of users, and SQL/scheduler commands were not retained in these reports. Environment names and source hashes are not credential values.

Runtime source is mounted-source evidence, not proof that every cached worker currently executes those bytes. `main/index.ts:145–169` dispatches the first path segment, uses shared `deno.jsonc`, 150 MB memory, 60-second worker timeout and `noModuleCache=false`, and forwards the entire container environment to every worker. The router has no explicit function allowlist. Mounted source presence alone does not establish reachable public behavior.

The prior `PHASE1E_PUBLIC_ROUTING.md` records an unresolved `supabase.carubra.com` versus `.space` runtime mismatch. That is carried forward, not freshly probed or resolved here. Host/container attestation must not be presented as attestation of the production browser's public path.

## Complete deployed classification

37 top-level `*/index.ts` entrypoints: 36 candidate request handlers plus `main`. All 34 repository handlers have deployed counterparts. Remote-only: `main`, `auth-email-hook`, `hello`.

Owner labels below identify inferred functional domains, not approved human owners or exclusive application ownership. **No handler has an approved complete external-consumer inventory.** Shared columns identify concrete platform/provider dependencies or unresolved shared scope. Every row additionally shares the runtime and forwarded credential environment.

Active vocabulary: **CALL** = executable static repository callsite, not observed traffic; **LOG** = retained runtime dispatch attempts, not successful authenticated requests; **CONFIGURED** = live service configuration selects it; **DISABLED** = deployed constant returns 503; **UNKNOWN** = no supported retirement inference. Migration dispositions and replacements are recommendations only; none was executed.

| Function | Functional owner / approval | Caller evidence | Shared scope / dependency | Active evidence | Migration disposition | Future replacement |
| --- | --- | --- | --- | --- | --- | --- |
| `auth-email-hook` | Platform Auth / SMTP | GoTrue configured hook URI | Stack-wide Auth; Soundpub-specific signup branch | Configured GoTrue hook | PRESERVE SHARED; provenance/owner approval pending | Shared signed Auth mail hook |
| `backup-storage-to-drive` | Soundpub operations (inferred) | Scheduler/operator UNKNOWN | Storage includes `avatars`, `iccn-gallery`, `klikus-biolink`; ownership unresolved | LOG (2); scheduler unknown | HOLD; unauthenticated; partition shared buckets first | Authenticated worker job with approved bucket manifest |
| `change-own-password` | Soundpub identity (inferred) | `src/pages/Settings.tsx:101` | Shared Auth identity mutation | CALL | MIGRATE after Auth ownership decision | Auth adapter / native authenticated password update |
| `create-copyright-invoice` | Soundpub copyright/payments (inferred) | `src/lib/xendit.ts:43` | Xendit credentials/callback consumer scope unknown | CALL | MIGRATE with payment and tenant contracts | Authorized payment API |
| `create-user` | Soundpub user management (inferred) | `src/components/users/AddUserDialog.tsx:239`; `src/components/users/LabelAddArtistDialog.tsx:94` | Shared Auth identity creation | CALL + LOG (25) | MIGRATE hardened source; protect shared Auth consumers | Authorized identity provisioning API |
| `create-whitelabel-artist` | Soundpub whitelabel (inferred) | `src/components/users/AddUserDialog.tsx:217` | Shared Auth identity creation | CALL | MIGRATE after status/tenant validation | Scoped identity provisioning API |
| `create-xendit-invoice` | Soundpub payments (inferred) | `src/lib/xendit.ts:27` | Xendit credentials/callback consumer scope unknown | CALL | MIGRATE with payment reconciliation | Authorized payment API |
| `delete-royalty-upload` | Soundpub royalties (inferred) | `src/pages/UploadRoyalty.tsx:791` | Shared DB/RPC substrate; external caller scope unknown | CALL | MIGRATE with reversal RPC semantics | Admin royalty reversal API |
| `delete-user` | Soundpub user management (inferred) | `src/components/users/DeleteUserDialog.tsx:43`; `src/pages/Users.tsx:773` | Deletes shared Auth identity | CALL | HOLD deletion scope until identity ownership approved | Shared-aware identity lifecycle API |
| `download-release-invoice` | Soundpub billing (inferred) | `src/pages/Invoices.tsx:105` | Storage service authority; other consumers unknown | CALL | MIGRATE PDF creation, metadata and signed URL flow together | Authorized invoice/storage adapter |
| `gcs-manage` | Soundpub legacy storage (inferred) | `src/components/settings/StorageSettings.tsx:178`; `src/components/settings/StorageSettings.tsx:263`; `src/components/settings/StorageSettings.tsx:311` | External storage ownership unresolved | DISABLED; CALL remains | RETIRE only after caller replacement | Native Storage SDK / authorized storage API |
| `gcs-upload` | Soundpub legacy storage (inferred) | `src/components/settings/StorageSettings.tsx:218` | External storage ownership unresolved | DISABLED; CALL remains | RETIRE only after caller replacement | Native Storage SDK / authorized storage API |
| `get-catalog-tracks` | Soundpub public catalog (inferred) | `src/pages/LandingPage.tsx:80` | Public export uses service role; media publication approval needed | CALL | MIGRATE approved public projection only | Public catalog API/view |
| `get-ga4-config` | Soundpub analytics (inferred) | `src/components/analytics/GA4Provider.tsx:46`; `src/components/settings/StorageSettings.tsx:348` | Public config backed by privileged DB read | CALL | MIGRATE public configuration contract | Public analytics config endpoint |
| `hello` | UNKNOWN / runtime example | None found | Platform key wrapper; consumer/owner unknown | UNKNOWN | INVESTIGATE; do not silently delete | None unless owner establishes dependency |
| `info-soundpub` | Soundpub ICCN integration (inferred) | `src/components/settings/IccnIntegrationSettings.tsx:22` (URL use) | Public ICCN consumer; external registration unknown | CALL (preview fetch) | MIGRATE public integration contract | Public ICCN service-info API |
| `main` | Platform runtime | edge-runtime --main-service | All function dispatch and forwarded credentials | CONFIGURED runtime | PRESERVE SHARED; replace infrastructure deliberately | Target runtime ingress/router |
| `process-royalty-upload` | Soundpub royalties (inferred) | `src/pages/UploadRoyalty.tsx:682` | Creates shared Auth managed artists; transactional DB RPC | CALL | MIGRATE importer, Auth and commit RPC together | Admin import worker/API |
| `remove-artist-from-label` | Soundpub label management (inferred) | `src/components/users/DeleteArtistDialog.tsx:43` | Auth-related profiles/artists; consumer scope unapproved | CALL | MIGRATE tenant and release guards | Scoped artist lifecycle API |
| `reset-password` | Soundpub legacy identity (inferred) | None found in executable repo scan | Shared Auth password mutation; internal mail caller | UNKNOWN external; internal mail producer | HOLD; native frontend recovery already used; prove no callers before retirement | Native Auth recovery / approved identity adapter |
| `send-app-email` | Soundpub notifications (inferred) | `src/components/notifications/AnnouncementDialog.tsx:55`; `src/pages/Payouts.tsx:136`; `supabase/functions/reset-password/index.ts:103`; `supabase/functions/send-password-reset/index.ts:138`; `supabase/functions/send-verification-email/index.ts:89`; `supabase/functions/xendit-webhook/index.ts:207` | Four internal producers; connector credential consumer scope unknown | CALL + LOG (2) | HOLD; deployed caller authorization absent | Authenticated mail service with caller capabilities/outbox |
| `send-password-reset` | Soundpub legacy identity (inferred) | None found in executable repo scan | Shared Auth recovery workflow; internal mail caller | UNKNOWN external; internal mail producer | INVESTIGATE before migrate/retire; preserve active native recovery | Native Auth recovery and signed hook |
| `send-royalty-notification` | Soundpub royalties (inferred) | None found in executable repo scan | Direct Gmail connector; provider credential scope unknown | UNKNOWN; no executable repo caller | INVESTIGATE; not proven dead | Authorized royalty notification worker |
| `send-verification-email` | Soundpub legacy identity (inferred) | None found in executable repo scan | Shared Auth verification workflow; internal mail caller | UNKNOWN external; internal mail producer | HOLD; arbitrary target request mutates verification state | Native Auth verification and signed hook |
| `set-artist-password` | Soundpub whitelabel (inferred) | `src/pages/WhitelabelDashboard.tsx:225` | Shared Auth password mutation | CALL | HOLD; admin target hierarchy gap | Scoped identity credential API |
| `spotify-fetch-artist` | Soundpub artist profiles (inferred) | `src/pages/ArtistProfile.tsx:332`; `src/pages/ArtistProfile.tsx:381` | Spotify app credentials; other consumers unknown | CALL | MIGRATE authenticated provider proxy; budget/rate contract needed | Authenticated Spotify adapter |
| `sso-login` | Soundpub ICCN identity (inferred) | `src/context/SsoAuthContext.tsx:47` (URL use); `src/pages/IccnIframeAuth.tsx:43` (URL use); `src/pages/IccnIframeAuth.tsx:77` (URL use) | Keycloak provider plus shared Auth account/session creation | CALL + LOG (1) | HOLD issuer/subject/account-linking and token-contract closure | Verified identity bridge |
| `start-user-impersonation` | Soundpub administration (inferred) | `src/pages/Users.tsx:218` | Shared Auth magic-link/session capability | CALL | HOLD caller-status and redirect-origin policy closure | Audited impersonation API |
| `test-gcs` | Soundpub storage operations (inferred) | `src/components/settings/StorageSettings.tsx:141` | GCS service account; bucket ownership unresolved | CALL | INVESTIGATE ongoing GCS need; not covered by disabled stubs | Restricted storage diagnostic or retire |
| `transfer-artist-label` | Soundpub labels/royalties (inferred) | `src/components/users/ChangeRoleDialog.tsx:215` | Historical royalty ownership dependency | CALL | MIGRATE keep_old_label semantics; no history reassignment assumption | Admin artist transfer API |
| `update-app-settings` | Soundpub configuration (inferred) | `src/components/settings/AuthNoticeSettings.tsx:27`; `src/components/settings/IccnIntegrationSettings.tsx:55`; `src/components/settings/PayoutSettings.tsx:38`; `src/components/settings/PricingSettings.tsx:80`; `src/components/settings/StorageSettings.tsx:112`; `src/components/settings/SuperAdminSettings.tsx:77` | Settings affect ICCN, public analytics and storage | CALL | MIGRATE superadmin allowlist and validation | Authorized settings API |
| `update-user-password` | Soundpub user management (inferred) | `src/components/users/ChangePasswordDialog.tsx:56` | Shared Auth password mutation | CALL | MIGRATE after identity scope and hierarchy/error review | Scoped credential lifecycle API |
| `update-user-role` | Soundpub authorization (inferred) | `src/components/users/ChangeRoleDialog.tsx:186` | Soundpub role table; shared identity implications | CALL | MIGRATE deployed missing-target check and hierarchy | Authorized role management API |
| `update-user-status` | Soundpub user management (inferred) | `src/components/users/ChangeStatusDialog.tsx:74` | Suspension bans shared Auth identity | CALL | HOLD status/ban/revocation contract and shared-owner approval | Shared-aware account lifecycle API |
| `verify-email` | Soundpub legacy identity (inferred) | None found in executable repo scan | Shared Auth confirmation mutation | UNKNOWN; native page uses Auth | INVESTIGATE token consumers before retirement | Native Auth verification and signed hook |
| `verify-password-reset-token` | Soundpub legacy identity (inferred) | None found in executable repo scan | Profile reset token disclosure contract | UNKNOWN; no executable repo caller | INVESTIGATE token consumers before retirement | Native Auth recovery/session validation |
| `xendit-webhook` | Soundpub payments (inferred) | Xendit expected; registration unattested | Provider callback; internal Gmail plus direct Resend | LOG (1); provider registration unknown | MIGRATE authenticated callback and recovery semantics; source drift pending | Authenticated idempotent payment callback worker |

`info-soundpub` has an actual preview `fetch(endpointUrl)` at `src/components/settings/IccnIntegrationSettings.tsx:131`; its URL is also displayed/copied. Unlike the older baseline, current source therefore supplies an executable caller. `sso-login` URL variables feed fetch calls in SSO context and iframe login. AST scanning excludes commented legacy invocations and includes multiline invocations.

The live `xendit-webhook/index.ts:207` invocation of `send-app-email` is executable. Together with `send-password-reset:138`, `reset-password:103`, and `send-verification-email:89`, it forms four deployed internal mail producers. Its subsequent Resend call is an additional provider path. Earlier descriptions of a commented-only webhook mail reference do not describe this snapshot.

## Shared scope and activity limits

- `auth-email-hook/index.ts:30–32` specializes one Soundpub signup redirect but has generic templates for other Auth actions. GoTrue selects the hook stack-wide. Preserve other applications' delivery when migrating Soundpub.
- `backup-storage-to-drive/index.ts:20–29` lists `track-audio`, `track-video`, `audio-clips`, `release-covers`, `label-logos`, `avatars`, `iccn-gallery`, and `klikus-biolink`. Bucket labels, including non-Soundpub-looking names, do not prove ownership; no object or bucket receives exclusive Soundpub classification here.
- Identity create/delete/password/confirmation/suspension/impersonation and SSO handlers operate on shared GoTrue Auth, even when their profile/role tables use `soundpub`. A schema name cannot establish ownership of an Auth identity or authority to remove it.
- Read-only PostgreSQL catalog inspection shows multiple application schemas. `cron.job` is absent in inspected database `postgres`; no stored routine `prosrc` contains a literal `functions/v1/<slug>` reference. This excludes neither dynamic URLs, other databases, database webhook URL arguments, external schedulers nor provider dashboards.
- `maskhar` user crontab read exits 1. Readable `/etc/crontab` and `/etc/cron.d/*` contain no literal Edge URL references. Other users' private schedules, systemd timer payloads, remote automation and indirect scripts were not comprehensively inspected. Backup scheduler identity/cadence remains UNKNOWN.
- Native recovery page uses `supabase.auth.updateUser`; verification page reads Auth user rather than invoking legacy Edge verification. Legacy token endpoints remain deployed. Lack of a current repository caller is insufficient evidence to retire them.
- `gcs-manage` and `gcs-upload` return `GCS_DISABLED`/503 before business work. Their frontend callers and the separate authenticated `test-gcs` credential/token/listing path still exist.

## Retained logs: bounded evidence

Read `docker compose logs --no-color --timestamps --since 24h --tail 20000 functions` at approximately `2026-10-27T13:18:52Z`. Returned 103 lines across stdout/stderr; no raw lines are published.

| Deployed handler | Dispatch attempts | First UTC | Last UTC |
| --- | ---: | --- | --- |
| `backup-storage-to-drive` | 2 | 2026-10-26T21:54:24.357258393Z | 2026-10-27T01:44:13.126644093Z |
| `create-user` | 25 | 2026-10-26T20:33:59.772730646Z | 2026-10-27T13:17:53.982966015Z |
| `send-app-email` | 2 | 2026-10-26T21:54:24.017111129Z | 2026-10-27T01:44:12.665688498Z |
| `sso-login` | 1 | 2026-10-27T11:36:39.847341235Z | 2026-10-27T11:36:39.847341235Z |
| `xendit-webhook` | 1 | 2026-10-27T01:42:23.873751067Z | 2026-10-27T01:42:23.873751067Z |

One additional dispatch targets a nonexistent topology-test slug; excluded from deployed inventory. It was observed in existing logs, not sent by Agent F. Concurrent audits can add traffic. Logs can predate latest container start, and older dispatches cannot attest current source.

Follow-up fixed-pattern count: 20 `wall clock duration warning`, zero `wall clock duration reached`; do not label those warnings as 20 proven request failures. Boot-error count changed from 2 to 4 between bounded reads; this demonstrates a moving log window/activity, not proven failures of a named deployed handler. No successful provider delivery, authorized owner identity, public hostname attribution or absence of side effects can be inferred from dispatch lines.

## Fresh source fingerprint and drift

Raw bytes: **20 identical, 14 different** among 34 repository counterparts. After leading UTF-8 BOM removal and CRLF-to-LF normalization: **29 equivalent, 5 code differences**. Normalization is not AST/behavior equivalence. Five code drifts: `backup-storage-to-drive`, `send-app-email`, `send-royalty-notification`, `update-user-role`, `xendit-webhook`.

The remote notification handler adds required payload validation; remote role handler adds lookup error/missing-target handling. Preserve these deployed checks during canonical-source selection. Email/backup local guards are absent remotely. Webhook code also differs and needs separate review; local test results must not be attached to mounted bytes.

Paths below are relative to the confirmed remote source root; each hash also matched its container-visible file.

| Runtime entrypoint | Mounted SHA-256 | Compared with working tree |
| --- | --- | --- |
| `auth-email-hook/index.ts` | `38330b9ef8b6c15566243c34c78f9dee2f81f2306e2402111ae8bb55b249dc08` | Remote only |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | code drift |
| `change-own-password/index.ts` | `7b0b04457b1e7708a9c4abca01f023a455b7d48bc858c1ea36187ea725af6d91` | identical |
| `create-copyright-invoice/index.ts` | `0313441792d0c2e752e917968be44dbe192347362092234aac6d1d317328351f` | BOM/EOL only |
| `create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | identical |
| `create-whitelabel-artist/index.ts` | `a222b5d0d9a099905b80d520fe50ffbae9b0a4e87299478cae443161c18c4cc0` | identical |
| `create-xendit-invoice/index.ts` | `ff8b90a5ef58e065d42867e4df2f789f6ac634ba043817c9f939f14e0b8c1bee` | BOM/EOL only |
| `delete-royalty-upload/index.ts` | `b888425b64c5f06a50a75e2b7a06ab934f8f49d52725047f823bdd90705cacb4` | identical |
| `delete-user/index.ts` | `8bc0a0d0189381e4148cfba5b3155268f944ea9c53a02f37e46b79a4f83934a2` | BOM/EOL only |
| `download-release-invoice/index.ts` | `2077542241060fc2f7a430869436343a3a484cfc6180c21116d7246249067c1f` | BOM/EOL only |
| `gcs-manage/index.ts` | `87cc6035897e5552ad251a71dc73f182c8d0ac5e325f8c0fc373b1c845f90369` | identical |
| `gcs-upload/index.ts` | `7259dfc41ef674d3c76198b9ef27e21e7d612eb320b8a68a967db71401026caa` | identical |
| `get-catalog-tracks/index.ts` | `bd65552c991536f51e35499cfe22a5a1ce332a2c837237435a6bebc3928e94e4` | identical |
| `get-ga4-config/index.ts` | `5e78fc0308996bcdbe3c2ab2f3c028408cbe24ee74eb17229aa8b976fb8209fb` | identical |
| `hello/index.ts` | `65e7d7ce5d898dd285e660cbab54521fca4bf990c41370f51fad5b4d4cae5f42` | Remote only |
| `info-soundpub/index.ts` | `fda238cbb476296b0d1e3102001c0f54662986223a0b27d9b43cff6597fabc3f` | identical |
| `main/index.ts` | `81e7902f1d281cb6efaa048390a0d7e0dd1f88c8c80ff4ed1ec76d9faeace6c1` | Remote only |
| `process-royalty-upload/index.ts` | `aff3b88aeb8b43a5f19dca79c670379d05f09c2540fcc7a9ac79539269f974eb` | identical |
| `remove-artist-from-label/index.ts` | `bd717890c776f2006f79b9bdad3a2596fd75ac00982ca179939978446deda1fb` | identical |
| `reset-password/index.ts` | `798f0e3905b920d55813c9579f3e082fe241da6ec9f06b0e1ad816ae5f24d802` | identical |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | code drift |
| `send-password-reset/index.ts` | `8f6764633f8d863391b59505a55ad232680a75fe004da1c8234f120347222855` | BOM/EOL only |
| `send-royalty-notification/index.ts` | `2d06940ac9793386a2fcad0bcd3ea6f8606954322c9ea5afa311191c5ba167a9` | code drift |
| `send-verification-email/index.ts` | `420183b4d1956f469f2583a5325110a6e2e63fef6db1f74c10376357f6386beb` | identical |
| `set-artist-password/index.ts` | `018af8d6c526c418ba64bb04e9ab67b9d4870793239c72d1e0eb635d0bb95b87` | identical |
| `spotify-fetch-artist/index.ts` | `4bc29c14896df308f9fc8d3908239e8568f9a063f0ab2fc9569e765bf1d42f6a` | identical |
| `sso-login/index.ts` | `4f136d72cfcf955bf43a5fc2ebc17684298718a04c114106f9e94f8674fbe2f6` | identical |
| `start-user-impersonation/index.ts` | `e777b231ac5984ffe5213546b4dd290349b1b83f52750f6b9fda04a86cf73dd9` | BOM/EOL only |
| `test-gcs/index.ts` | `c87f14fcbeac0063ff31a0ab4d9cb4ea01c6c00613d405b16fb1515918cfcee3` | identical |
| `transfer-artist-label/index.ts` | `3fa02c86c0f8171200aa6b2129fde458cb9dd021d3decb9ea6f3a756fd87827c` | identical |
| `update-app-settings/index.ts` | `4160dc078753a5cecc5ce1f680354c87aa2852a73f1b273c527caf02f8b3a0c6` | BOM/EOL only |
| `update-user-password/index.ts` | `74d448d023b90540cce59e76189782728b19334190ae57036a53520478a6d437` | identical |
| `update-user-role/index.ts` | `25655be455b3c97cece34b4876cedc3dca3930be3f6f84295deb7519b31b25b3` | code drift |
| `update-user-status/index.ts` | `525a9fc00b1652c13eaace9b47f243a190710ed69aa5dd875ea4a937db43e5d6` | identical |
| `verify-email/index.ts` | `85473579b5b968bbc2e947f2ecf8c9cf0773bb1e447e2a3e8c042d8c87e36ec3` | BOM/EOL only |
| `verify-password-reset-token/index.ts` | `fcb2056fdab1c461f41e0e4eeb016af4b2ae83a7e6dfb0f63dfd47b0179b2dbc` | BOM/EOL only |
| `xendit-webhook/index.ts` | `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb` | code drift |

Support files: remote `_shared/cors.ts` SHA-256 `d0d945158d49295b15c6c4f11e534b2a7a5da17461d57b122b3e5b50a92a8f53` matches current workspace. Remote `deno.jsonc` SHA-256 `a9a29da36c2576f755dd868b9f553a02afdf7d7bccf52e97e65c7f68cf36bfef`. Remote `send-app-email/TEMPLATE_ADDITIONS.ts` exists; no import was identified in reviewed entrypoint. Remote `_shared/privileged-api.ts` is **absent**, while local candidate exists with SHA-256 `3c8a599959c29b0be91056333c27087a1c74edf047d4edb17fdf23ac24188d1f`.

Hidden `.backup-xendit-/...`, `index.ts.backup` and `index.ts.before-...` files are retained backup artifacts, excluded from top-level runtime totals. They are not assumed independently callable or safe to delete. Environment files and secret configuration are outside migration source selection.

## Closure required

Approve named owners and per-caller identities; establish actual public runtime; resolve deployed authorization defects in companion report; partition shared Auth, buckets and credentials; choose reviewed canonical sources including remote-only infrastructure; then validate authorized/denied behavior in an isolated environment and correlate approved public deployment. This read-only inventory earns no production authorization PASS and authorizes no removal, deployment or credential change.

