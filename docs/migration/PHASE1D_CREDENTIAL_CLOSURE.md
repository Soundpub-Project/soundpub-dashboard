# Phase 1D Credential Closure

## Status

**OPEN. Rotation FAIL. Old credential revocation FAIL.**

## Confirmed affected families

- Current privileged Supabase secret API key and asymmetric service-role JWT were retained in earlier tool transcripts.
- A later transcript exposed SMTP password, email-hook secret, Xendit webhook token, PostgreSQL credential material, Supabase secret key, and symmetric signing-key material.
- Sensitive service-role material also remains in local migration environment files. Values and fingerprints are intentionally omitted.

## Dependency evidence

- `SUPABASE_SECRET_KEY`: gateway, functions, Studio, generated gateway configuration, and unknown external callers.
- Asymmetric service-role/signing material: gateway plus shared Auth/JWT verifiers. Token replacement alone does not revoke an already signed token.
- Symmetric JWT material: Auth, REST, Realtime, Storage, Functions, Supavisor, Studio, and database configuration.
- PostgreSQL password: database and multiple dependent services.
- SMTP and email-hook secrets: Auth, Functions, and external email infrastructure.
- Xendit webhook token: Functions and external provider configuration.

## Rotation decision

No production rotation occurred. Safe rotation requires control of external SMTP/Xendit settings, every shared verifier, user-session recovery, public route ownership, and a separately retrievable private rollback checkpoint. Those prerequisites are not proven. Partial rotation could lose payment/email events, break database consumers, or leave exposed signed JWTs valid.

## Residual exposure search

Earlier exact-value scans covered selected source, generated gateway configuration, recent container logs, shell histories, bundles, reachable Git history, and local Codex sessions. Scope remains incomplete for synchronized transcripts, remote branches, CI, monitoring, rotated logs, backups, and third-party retention.

## Exact blockers

1. External SMTP/Xendit control-plane ownership and coordinated change procedure unavailable.
2. Complete signing-key verifier inventory, supported rollover, old-key retirement, and session recovery unproved.
3. `.com` route and direct-backend exposure unknown.
4. Independently retrievable encrypted rollback checkpoint and separate key custody absent.
5. Retained transcript access/retention and the second migration JWT owner/validity unresolved.

**Credential Incident = OPEN.**
