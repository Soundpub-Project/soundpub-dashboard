# Phase 1E Credential Incident

## Status

**Credential incident = OPEN. Credential rotation = FAIL. Old credential revocation = FAIL.**

## Incident expansion

Prior reports establish exposure of current privileged Supabase credentials and later exposure of SMTP, email-hook, Xendit, PostgreSQL, Supabase secret, and symmetric signing material in retained tool transcripts. During Phase 1E, a read-only container-inspection command also emitted a Cloudflare tunnel token into tool output. The token value is intentionally omitted. Treat it as compromised.

Because transcript access, synchronization, retention, and readers remain unknown, repository redaction alone cannot contain the incident.

## Dependency map

| Credential family | Privilege/provider | Consumers and verifiers | Shared scope | Rotation mechanism | Required recovery/fallback |
| --- | --- | --- | --- | --- | --- |
| Supabase secret API key | Privileged gateway key; self-hosted Supabase | API gateway, Edge Functions, Studio, generated gateway config, unknown external callers | Shared stack and possible external consumers | Generate replacement, update all consumers, remove old acceptance | Independently retrievable config checkpoint; tested gateway rollback |
| Service-role ES256 JWT/signing material | Full service role; self-hosted signing infrastructure | Gateway, Functions, Auth/JWT verifiers, direct REST/Storage/Realtime consumers | Shared applications and sessions may depend on verifier set | Coordinated signing-key rollover and verifier retirement | Session recovery, dual-key transition if supported, old-key rejection proof |
| Symmetric JWT secret/JWK and HS256 service token | Token signing/verifying authority | Auth, REST, Realtime, Storage, Functions, Supavisor, Studio, database helpers | Entire shared Supabase platform | Replace signing secret/key set and restart/reconfigure every verifier | User-session recovery, service-token replacement, emergency rollback checkpoint |
| PostgreSQL password/URL | Database administrator/application access | DB, Auth, Functions, Meta, Realtime, REST, Storage, Studio, Supavisor, external DB consumers | Shared database services | Change DB credential, update every dependent service atomically | Tested old/new connection plan and local console recovery |
| SMTP password | External email-provider credential | Auth mailer and Functions | Email delivery and recovery flows | Rotate at SMTP provider, update server consumers | Provider-console access, recovery-email test, rollback credential custody |
| Email-hook secret | Internal shared-secret authentication | Auth and Functions hook caller/verifier | Auth email path | Generate replacement and update both ends | Direct SMTP fallback or tested hook rollback |
| Xendit secret key | Payment API privilege | Invoice creation handlers and reconciliation tooling | Financial workflows | Rotate in Xendit control plane and update server-only consumers | Sandbox/production separation, provider reconciliation, rollback owner |
| Xendit webhook token | Payment callback verifier | Xendit dashboard callback configuration and webhook handler | Production callbacks | Rotate provider callback token and handler verifier together | Queued-event/retry plan and callback monitoring |
| Cloudflare tunnel token | Tunnel registration/control | `network-soundpub` tunnel runtime and Cloudflare Zero Trust control plane | Soundpub public ingress | Rotate/revoke tunnel token in Cloudflare and redeploy tunnel | Authenticated Cloudflare access, before-image, alternate ingress/rollback |
| Unclassified migration service-role JWT | Unknown privileged issuer/owner | Local migration artifact; destination and validity unresolved | Unknown | Identify issuer, owner, verifier, then revoke or retire | Preserve evidence; do not probe unknown destination |

## Pre-rotation checkpoint

**Not created.** A compliant checkpoint must be encrypted, independently retrievable off-host, exclude exposed credentials from the archive, and have separate key custody. Existing archives are production-host local and do not satisfy this requirement.

## Secret hygiene checks

- Tracked/public source removals remain staged locally; local `dist/` contains no matches for tested privileged secret variable names.
- Public production still serves the schema export and old debug pages.
- Full secret-value scanning cannot be reported because printing or reusing exposed values would deepen the incident.
- No new replacement credential was generated.

## Exact blockers

1. No authenticated Cloudflare control-plane owner is available to rotate the newly exposed tunnel token and prove old rejection.
2. No SMTP and Xendit provider-control owner is available for coordinated rotation and callback verification.
3. Complete JWT verifier/consumer inventory, supported signing-key rollover, old-key retirement, and session recovery remain unproved.
4. Shared application owners and unknown external consumers are not identified and tested.
5. No independently retrievable encrypted rollback checkpoint with separate key custody exists.
6. Transcript retention/containment and the unclassified migration JWT remain unresolved.

**Gate: FAIL.**
