# Phase 4 Users and Identity Gap

Status: PARTIAL - standalone local auth and backend Keycloak PKCE exchange verified in isolated development; provider activation remains

Evidence date: 2026-11-07 Asia/Bangkok

## Verified in isolated development

- Compose project `dashboard-sounpub-dev` started on loopback-only ports.
- PostgreSQL, object storage, backend, and worker reported healthy.
- `/health`, `/ready`, public catalog, `/api/v1/me`, and admin user listing responded correctly.
- A normal user token was denied admin listing; admin and superadmin tokens were accepted.
- Existing backend APIs cover current profile read/update, bounded admin user listing, status changes, and role replacement.
- Label-managed artist creation already has a backend path that creates a business artist without inventing a login account.
- Standalone email/password login, cookie session restore, logout, lockout, CSRF, password change, CLI provisioning, and administrator password reset pass database-backed tests.
- Browser backend-mode auth uses only backend HttpOnly sessions. Partner SSO code exchange also creates a backend-local session and has no Supabase fallback.
- Password changes and administrator resets revoke all target sessions. Smoke credentials and sessions are deleted after every isolated HTTP test.

## Remaining legacy responsibilities

- Public self-registration remains unavailable; the login page directs users to an administrator.
- Backend-mode account creation uses `/api/v1/admin/users`; legacy non-backend builds still retain Edge Function paths pending final frontend inventory removal.
- Email verification and forgotten-password recovery are backend-owned; real email provider delivery remains deferred.
- Keycloak partner login uses backend-issued state/PKCE transactions and verified pre-bound ICCN identities. Dev activation remains disabled pending realm/client evidence.
- User deletion has a backend lifecycle path; impersonation remains partial and legacy-dependent.
- Some user screens still read deletion requests, composer fields, avatars, and artist synchronization directly from Supabase.

## Architecture decision

SoundPub primary authentication will be implemented as standalone backend authentication. Keycloak remains partner SSO only and is not the primary identity provider.

The standalone design uses memory-hard password hashing, opaque server-side sessions, HttpOnly cookies, CSRF protection, one-time verification/reset tokens, database-backed lockout, session revocation, and audit logging. It does not issue homemade JWT access or refresh tokens.

Keycloak partner identities will bind through `external_identities` and receive SoundPub-local roles/status after verified partner token exchange. Partner SSO never bypasses local authorization.

Supabase Auth is allowed only as an isolated temporary migration bridge while standalone login is built and tested.

## Safe next implementation

1. Add explicit admin workflow to bind a verified ICCN `(issuer, subject)` to an eligible existing artist under configured partner label.
2. Add shared one-time OAuth transaction storage before multi-instance/public activation.
3. Validate configured realm/client, callback and logout against a non-production Keycloak environment.
4. Migrate eligible users into local credential enrollment without copying Supabase password hashes or sessions.
5. Replace remaining user Edge Functions and direct Supabase calls.

Until then, keep `VITE_PARTNER_SSO_ENABLED=false` and `PARTNER_LABEL_ID` unset in `dashboard-sounpub-dev`. Do not add real realm credentials until onboarding, shared replay storage, and sandbox browser evidence exist.

## Implemented foundation

- Migration `0019_local_auth.sql` adds local credentials, opaque sessions, and one-time token storage.
- Password hashing uses Node.js `scrypt` with N=131072, r=8, p=1, random 32-byte salts, 64-byte derived keys, strict encoded parameters, and constant-time comparison.
- Session and one-time token material uses 32 random bytes; only SHA-256 digests are stored.
- Frontend API requests include credentials and in-memory CSRF tokens; Vite development proxy targets the isolated backend on port `3300`.
- Database-backed auth tests cover generic login failure, five-attempt lockout, cookie attributes, CSRF rotation, protected mutation denial, password change, logout, revocation, and inactive/suspended denial.
- Administrator password reset reuses current user hierarchy checks, revokes target sessions, and writes an audit event.
- Migration is applied only to `dashboard-sounpub-dev`; no production database or Docker resource was contacted.
