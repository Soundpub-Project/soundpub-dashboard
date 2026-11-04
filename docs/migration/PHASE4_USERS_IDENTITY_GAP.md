# Phase 4 Users and Identity Gap

Status: PARTIAL - standalone local auth verified in isolated development; recovery and Keycloak exchange remain

Evidence date: 2026-11-03 Asia/Bangkok

## Verified in isolated development

- Compose project `dashboard-sounpub-dev` started on loopback-only ports.
- PostgreSQL, object storage, backend, and worker reported healthy.
- `/health`, `/ready`, public catalog, `/api/v1/me`, and admin user listing responded correctly.
- A normal user token was denied admin listing; admin and superadmin tokens were accepted.
- Existing backend APIs cover current profile read/update, bounded admin user listing, status changes, and role replacement.
- Label-managed artist creation already has a backend path that creates a business artist without inventing a login account.
- Standalone email/password login, cookie session restore, logout, lockout, CSRF, password change, CLI provisioning, and administrator password reset pass database-backed tests.
- Browser auth uses the backend HttpOnly cookie as the primary session and retains Supabase session handling only as the temporary partner-SSO fallback.
- Password changes and administrator resets revoke all target sessions. Smoke credentials and sessions are deleted after every isolated HTTP test.

## Remaining legacy responsibilities

- Public self-registration remains unavailable; the login page directs users to an administrator.
- General account creation still invokes `create-user` or `create-whitelabel-artist` Edge Functions.
- Email verification, forgotten-password recovery, and one-time-token delivery are not implemented.
- Keycloak partner login still exchanges through the Supabase `sso-login` Edge Function and creates a Supabase session.
- User deletion and impersonation still use Supabase functions and legacy lifecycle rules.
- Some user screens still read deletion requests, composer fields, avatars, and artist synchronization directly from Supabase.

## Architecture decision

SoundPub primary authentication will be implemented as standalone backend authentication. Keycloak remains partner SSO only and is not the primary identity provider.

The standalone design uses memory-hard password hashing, opaque server-side sessions, HttpOnly cookies, CSRF protection, one-time verification/reset tokens, database-backed lockout, session revocation, and audit logging. It does not issue homemade JWT access or refresh tokens.

Keycloak partner identities will bind through `external_identities` and receive SoundPub-local roles/status after verified partner token exchange. Partner SSO never bypasses local authorization.

Supabase Auth is allowed only as an isolated temporary migration bridge while standalone login is built and tested.

## Safe next implementation

1. Add email verification and password-reset delivery through the existing notification/provider boundary.
2. Migrate eligible users into local credential enrollment without copying Supabase password hashes or sessions.
3. Add the separate Keycloak partner exchange adapter with exact issuer, audience, redirect URI, and JWKS validation.
4. Remove the Supabase session exchange from `SsoAuthContext` after the backend Keycloak adapter passes negative tests.
6. Replace remaining user Edge Functions and direct Supabase calls.
7. Enable remaining `users` operations only after recovery and Keycloak negative tests pass.

Until then, keep browser `VITE_SOUNDPUB_BACKEND_DOMAINS` without `users`. API development and tests may continue with synthetic tokens inside `dashboard-sounpub-dev`.

## Implemented foundation

- Migration `0019_local_auth.sql` adds local credentials, opaque sessions, and one-time token storage.
- Password hashing uses Node.js `scrypt` with N=131072, r=8, p=1, random 32-byte salts, 64-byte derived keys, strict encoded parameters, and constant-time comparison.
- Session and one-time token material uses 32 random bytes; only SHA-256 digests are stored.
- Frontend API requests include credentials and in-memory CSRF tokens; Vite development proxy targets the isolated backend on port `3300`.
- Database-backed auth tests cover generic login failure, five-attempt lockout, cookie attributes, CSRF rotation, protected mutation denial, password change, logout, revocation, and inactive/suspended denial.
- Administrator password reset reuses current user hierarchy checks, revokes target sessions, and writes an audit event.
- Migration is applied only to `dashboard-sounpub-dev`; no production database or Docker resource was contacted.
