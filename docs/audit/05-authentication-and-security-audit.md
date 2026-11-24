# 05 — Authentication and Security Audit

Status: **SERVER-SIDE MODEL IMPLEMENTED; LEGACY BROWSER SESSION PATH STILL ACTIVE**

## Legacy Supabase auth

- The root Supabase client persists sessions in browser storage: `src/integrations/supabase/client.ts:12-19` uses `localStorage`, `persistSession`, and `autoRefreshToken`.
- Legacy role/profile lookup reads `profiles` and `user_roles` directly in `src/services/users.ts:9-10,19-31`.
- Legacy privileged actions are invoked from the browser through Edge Functions: status/role/transfer at `src/services/users.ts:75,113,118`; create/delete/impersonation at `src/components/users/AddUserDialog.tsx:251,273` and `src/pages/Users.tsx:222,905`.
- `src/components/auth/ProtectedRoute.tsx:16-23,44-88` provides route UX gating; the code itself notes that RLS/server authorization is the real boundary. UI gating must not be treated as security enforcement.
- A 6-hour session cap is stored in `localStorage` (`src/lib/sessionLimit.ts:3-5,36-48`) and enforced on logout/expiry (`src/hooks/useAuth.tsx:185-213`).

Risk: in legacy mode, security still depends on Supabase RLS, Edge Function authorization, and browser-held state. Any RLS or function-policy drift is production security drift.

## Backend auth

- Backend auth mode avoids the Supabase token provider: `src/hooks/useAuth.tsx:14-15,149-158,288-289`.
- Local session and CSRF handling are in `src/hooks/useAuth.tsx:74-77,114-130`.
- Backend HTTP client sends bearer token plus CSRF header and includes credentials (`src/api/client.ts:27-37,46-85`).
- Principal shape and roles are defined at `backend/src/auth/index.ts:1-13`.
- Server-side policies enforce `authenticated`, `owner`, `owner-or-admin`, `admin`, and `superadmin` at `backend/src/auth/index.ts:52-67`.
- Repository-resolved principals are validated at `backend/src/auth/index.ts:38-48`.
- Mock identity/dev configuration is server bootstrap only and forbidden in production (`backend/src/auth/index.ts:23-30`); the mock provider is dev/test-only (`backend/src/auth/providers.ts:13-17`).
- OIDC endpoint/audience validation is at `backend/src/auth/providers.ts:110-146`, claim validation at `:218-246`, and provider selection at `:258-269`.
- Authorization URL and code exchange use an exact `/auth` origin/path allowlist (`backend/src/auth/providers.ts:172-199`) and return `redirect: 'error'` on mismatch (`:202`).

Risk: backend authorization is meaningfully stronger than legacy UI gating, but it only protects backend routes when the production frontend actually uses them.

## OAuth/SSO and redirects

- Backend partner SSO adapter: `src/api/auth.ts:22-27`.
- Backend partner login replaces the URL with `/dashboard` in `src/context/SsoAuthContext.tsx:50-59,112-130`.
- Google OAuth is disabled in backend auth mode; legacy `redirectTo` remains `/dashboard` in `src/pages/Auth.tsx:171-184`.
- Legacy impersonation uses `redirect_to` `/auth/impersonate` in `src/pages/Users.tsx:222-228`.
- Backend redirect validation is strict at `backend/src/auth/providers.ts:172-202`.

Risk: OAuth/redirect behavior differs by mode. Cutover needs an E2E matrix for admin, artist, label, copyright, partner SSO, impersonation, and error redirects.

## Secrets and browser-exposed config

- `VITE_*` values are build-time browser config and must never contain secrets. The previous audit’s old key-name mismatch is stale in this worktree, but its warning remains valid; see `12-previous-audit-validation.md`.
- No credential values, tokens, or key material were copied into this audit directory.

## Required controls before cutover

- Confirm production-equivalent OIDC/Keycloak configuration and redirect allowlists.
- Prove RLS/Edge Function parity for every legacy path until that path is disabled.
- Complete role E2E tests for all backend policies and privileged operations.
- Remove or disable browser-held privileged workflows once backend equivalents are default.
- Add deployment-level security headers, TLS enforcement, cookie/CSRF verification, and redirect allowlist regression tests.
- Keep production identity/dev mocks impossible by configuration and by startup validation.

## Finding

Authentication is **not ready for production cutover**. The backend model is credible, but legacy browser-persisted sessions and direct role/profile reads remain active and the production build does not yet enable backend domains.
