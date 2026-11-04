# Credential Incident Report — Phase 1C

Assessment date: 2026-10-27, Asia/Bangkok. Ownership: Agent B, credential incident only.

## Decision

**CREDENTIAL INCIDENT = OPEN. Credential rotation = NOT COMPLETED. Old exposed credentials revoked = NOT VERIFIED. PHASE 1C = BLOCKED.**

Exposure is confirmed, not hypothetical. Memory-only SHA-256 equality comparisons establish that a retained Phase 1B tool transcript contains the **currently configured production `SUPABASE_SECRET_KEY` and `SERVICE_ROLE_KEY_ASYMMETRIC`**. The latter is an ES256 JWT with `role=service_role`. No credential values or credential fingerprints are included here.

No production credential, configuration, source, routing, account, or session was changed. No service was restarted. Closure cannot be claimed from this assessment.

## Additional exposure in this Phase 1C session

A second credential-bearing tool output occurred during this assessment: an SSH command rendered part of `docker compose config`, and its line-based redaction missed several environment keys. Output entered this Codex chat/tool transcript. **Do not copy or quote that output.** It contained SMTP password, email-hook secret, Xendit webhook token, database connection password/URL, Supabase secret key, and a rendered JWKS containing symmetric HS256 key material. The anonymous JWT and public asymmetric verification coordinates in the same output are not themselves private signing credentials. The earlier service-role exposure remains in scope. Transcript retention, synchronization, readers and downstream ingestion remain unknown. No production credentials changed in this session.

Treat newly exposed authentication material as compromised pending coordinated rotation/revocation. Earlier exact-value artifact scans did not cover this transcript or these credential families. Preserve restricted incident evidence; contain copies through supported access controls. Redacting this report alone cannot establish containment.

Read-only Compose-template inspection adds **potential** consumers: `SMTP_PASS` in `auth`/`functions`; `SEND_EMAIL_HOOK_SECRET` in `auth`/`functions`; `XENDIT_WEBHOOK_TOKEN` in `functions` and external provider configuration; `POSTGRES_PASSWORD` in `db`, `auth`, `functions`, `meta`, `realtime`, `rest`, `storage`, `studio`, `supavisor` and optional `analytics`/`pgbouncer`; `JWT_JWKS` in `functions`, `realtime`, `rest`, `storage`; `JWT_KEYS` in `auth`. Verify actual running consumers, other applications, signing authority and session impact privately before rotation. The rendered symmetric JWK is legacy JWT signing material, not a public-only JWKS: possession permits creation of HS256-signed tokens until every verifier retires that key. Retiring it can invalidate sessions; gateway key replacement cannot revoke direct JWT acceptance. Coordinate email-hook and payment-token changes with callers/providers to avoid lost events.

New closure evidence required: complete private dependency map and recoverable checkpoint per credential; replacement at all consumers; old-credential rejection at every applicable verifier; controlled new-credential positive checks; session and connection disposition; transcript/log/build/monitoring scope assessment. Incident remains OPEN and production change lock remains active.
## Incident and bounded evidence

`PUBLIC_ROUTING_REPORT.md`, “Secret-output incident”, acknowledges that an overly broad rendered Envoy configuration excerpt emitted a secret key and service-role JWT into tool output.

The local retained artifact is:

`C:/Users/bimok/.codex/sessions/2026/10/27/rollout-2026-10-27T04-52-58-01a17a33-d1b1-7fd2-9950-8feae055960a.jsonl`

It contains four secret-key occurrences and four service-role JWT occurrences; these are occurrence counts, not four distinct credentials. Parsed privileged JWTs in this file use ES256. Exact in-memory comparisons to live Compose values confirm both affected credential identities. No credential was transmitted in a command argument or printed for comparison.

The currently rendered `/etc/envoy/lds.yaml` contains the secret key, ES256 service-role token, and HS256 service-role token. This establishes a larger sensitive source boundary, but **does not prove the HS256 token appeared in the offending excerpt**. Its confidentiality remains subject to review of other output copies and credential-bearing local artifacts.

Additional local findings:

- `docs/soundpub-local-migration/.env` contains the current production HS256 `SERVICE_ROLE_KEY`; exact equality confirmed. This is a sensitive local consumer/artifact, not proof of public disclosure.
- `docs/migration-scripts/.env` contains another service-role JWT that does not match any of the three current privileged gateway credentials. Its issuer ownership, current validity, recipients, and revocation authority remain unresolved. Treat as potentially affected until classified; do not test it against an inferred third-party destination.
- Current repository/build scans found JWT-shaped strings in local environment files, `dist/assets/index-DHaLZubl.js`, and exported CSV files. Classification found no service-role JWT or secret-key-pattern match in the scanned bundle or CSV artifacts. The two migration environment files above were the privileged repository-tree matches.
- Reachable Git history pattern searches found JWT-related changes in `.env`, `public/cors-test.html`, and `public/test-oauth.html`. Decodable JWTs in inspected matching revisions were `anon`, not `service_role`. No secret-key-pattern history match was returned. This does not cover unreachable objects, remote-only branches, deleted logs, arbitrary secret formats, or private signing-key leakage.

All remote Supabase inspection used direct SSH `maskhar@20.20.20.3` and changed directory to `/data/supabase/instances/supabase-01/config` first. Compose and container contents were captured in process memory with selected metadata only.

Remote exact-value scans returned no matches for the three privileged gateway credentials in `volumes/api`, `volumes/functions`, or readable `/home/maskhar/.bash_history` and `.zsh_history` paths. Missing/unreadable paths and rotated history are not covered. The generated gateway file resides inside its container and was checked separately. Latest 2,000 log lines per service for `api-gw`, `functions`, `auth`, `rest`, `storage`, and `studio` returned no exact matches. Earlier/rotated logs, other services, journald, CI, monitoring, backups, synchronized transcripts, and server/account-side chat retention remain unbounded. Local Codex session files and the existing PowerShell history location were scanned without emitting matching lines. No transcript was deleted or modified.

## Redacted dependency map

| Credential family | Confirmed consumers | Privilege and rotation implication |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` — confirmed exposed | `api-gw.SUPABASE_SECRET_KEY`; `functions.SUPABASE_SECRET_KEYS`; `studio.SUPABASE_SECRET_KEY`; generated Envoy configuration | Privileged backend API access. Update accepted key sets and all external callers before removing old acceptance. Exact route authorization remains a separate gate. |
| `SERVICE_ROLE_KEY_ASYMMETRIC` — confirmed exposed | `api-gw.SERVICE_ROLE_KEY_ASYMMETRIC`; generated Envoy configuration | ES256 `service_role`, elevated database/storage/Auth API potential subject to endpoint behavior. Issuing a replacement token alone cannot revoke the stolen signed token at every JWT verifier. Signing-key retirement or proven token-level rejection is required. |
| `SERVICE_ROLE_KEY` — sensitive scope unresolved | `api-gw.SERVICE_ROLE_KEY`; `functions.SUPABASE_SERVICE_ROLE_KEY`; `storage.SERVICE_KEY`; `studio.SUPABASE_SERVICE_KEY`; local migration environment; generated Envoy configuration | HS256 `service_role`. A shared signing-secret change can invalidate users, anon keys, service tokens, and platform consumers. Do not claim gateway key replacement revokes direct JWT acceptance. |
| Other local migration service-role JWT | `docs/migration-scripts/.env` | Owner/issuer/validity unknown; requires owner-led classification and rotation if confidentiality cannot be established. |

The authoritative inspected stack serves `.space`; `.com` ownership is unresolved in the Phase 1B baseline. The credentials are production stack credentials, not confirmed credentials of the unknown `.com` origin. Never send them there to discover whether they work.

Confirmed signing/verification dependencies include `auth` (`GOTRUE_JWT_SECRET`, `GOTRUE_JWT_KEYS`), `rest` (`PGRST_JWT_SECRET`, application JWT settings), `functions` (`JWT_SECRET`, `SUPABASE_JWKS`), `storage` (`AUTH_JWT_SECRET`, `JWT_JWKS`), `realtime` (`API_JWT_SECRET`, `API_JWT_JWKS`, metrics JWT secret), `supavisor` (API/metrics JWT secrets), `studio` (`AUTH_JWT_SECRET`), and `db` (`JWT_SECRET`). Variable presence is verified; this is not proof every verifier accepts every listed token. Live images include GoTrue v2.189.0, PostgREST v14.12, storage-api v1.60.4, Edge Runtime v1.74.0, and Envoy v1.39.0.

Host `.env` is mode `0600`, UID 1000. Function mount is confirmed as `/data/supabase/instances/supabase-01/config/volumes/functions` to `/home/deno/functions`. No upload was needed. Other running Compose containers include a Cloudflare connector; its token was not exposed by this investigation. External schedulers, CI, other applications sharing Auth/storage, backup jobs, and operator tooling are not exhaustively inventoried.

## Recovery checkpoint required before mutation

No recovery snapshot was created because no rotation transaction was safe to begin. The current `.env` is an operational source, **not an independently validated recovery checkpoint**.

Before any change, the credential owner must establish a private, restricted checkpoint outside the repository containing the existing environment, Compose inputs, signing-key configuration, gateway templates/generated configuration, exact running images, and consumer configuration references. Encrypt the checkpoint with a separately held recovery key, record non-secret integrity metadata, verify retrieval, and establish SSH recovery access independent of Supabase credentials. Account for concurrent production work before capturing or applying configuration.

Record shared-application owners, approved outage/session behavior, session refresh/revocation procedure, and a deterministic way to restore service with uncompromised replacement credentials. A rollback may restore code/configuration compatibility, but **must not silently re-enable stolen credentials after revocation**. Retained compromised material is for restricted incident evidence only. Pre-revocation rollback leaves the incident OPEN.

## Safe rotation order and verification contract

1. Restrict access to retained transcript and synchronized copies through supported account/storage controls; preserve restricted evidence. Inventory every consumer and establish the private checkpoint above. Classify the additional local migration JWT. Confirm control of affected public routes and direct backend reachability.
2. Review installed-version signing-key rollover behavior and identify every verifier/cache. Establish a replacement signing-key configuration and test user-session effects in isolation. Rotating only an ES256 service token while retaining its public verification key does not establish revocation.
3. Generate replacements entirely within authorized secret storage on the server. Introduce supported temporary acceptance overlap only where required. Update internal and external secret-key consumers and asymmetric-token consumers. Keep privileged credentials out of frontend environments and repository artifacts.
4. Recreate only `api-gw`, `functions`, and `studio` when their respective secret-key inputs change; include each additional confirmed token consumer only when its inputs change. An asymmetric signing-key retirement must also reload every affected verifier/issuer using the installed stack's supported sequence. If HS256 rotation is required, coordinate all mapped symmetric consumers, regenerate dependent anon/service tokens, and update public-client anon configuration and external consumers before retiring old acceptance. Do not restart the database merely because its container environment has a JWT variable; determine actual SQL/runtime configuration first.
5. Verify replacement credentials using harmless read-only operations on the controlled public path and required internal paths. Check service health and legitimate application behavior. Exercise user/session recovery without borrowing real users' sessions or creating privileged identities.
6. Remove old API-key acceptance and retire old signing-key verification as required. Test each old credential separately as API key and Bearer token on all relevant controlled surfaces, including direct Auth/REST/storage/function verifiers where reachable. Require authentication rejection; a business error or unavailable route is insufficient. Test new privileged credentials only on intended server paths and anonymous/ordinary-user denial separately.
7. Scan configured consumers, bundles, logs, histories, and retained copies for residual old material using comparisons that emit metadata only. Obtain independent verification of old rejection/new success and close only after scope and consumer ownership are bounded.

## Exact blockers and outstanding evidence

- Two currently valid configured privileged credentials are confirmed retained in local transcript material. No supported transcript/account retention purge or access-restriction control was established; copies and recipients outside this workstation are unknown.
- ES256 signing-key retirement spans shared Auth and multiple verifiers. Consumer completeness, installed-version rollover behavior, direct-verifier revocation, and session recovery have not been demonstrated. No supported per-token revocation has been proven. Replacing the gateway value would leave a potentially usable signed credential.
- External credential consumers and shared-application owners are not fully mapped. The unknown `.com` destination cannot be treated as a verified consumer or test endpoint.
- No independently retrievable private recovery checkpoint or coordinated session/outage recovery has been validated.
- The second migration-tool service-role JWT has unresolved ownership/validity; the current HS256 token's broader artifact confidentiality remains unresolved.

These are evidence gaps, not requests for routine permission. Rotation was withheld because the user explicitly requires safe, fully understood consumer updates and recovery before production changes. Neither rotation nor revocation nor incident closure receives PASS.

## Verification and handoff

Completed: direct SSH reachability; selected Compose dependency mapping; running generated gateway exact-value checks; local transcript credential classification and exact live equality checks; local environment comparison; repository/build/CSV pattern classification; reachable-history inspection; bounded server source/history/log checks. Supabase changelog index fetched successfully before considering changes; no implementation was attempted.

Not completed: production rotation, old-credential rejection, replacement success, exhaustive artifact/consumer inventory, shared-session recovery, transcript containment, independent incident closure. No production credential was used for an HTTP request during this assessment.

Only authored file: `docs/migration/CREDENTIAL_INCIDENT_REPORT.md`. Preserve prior reports. Coordinator must retain the credential mandatory gate as OPEN and Phase 2 as NOT READY.
