# Phase 3A identity transport — Agent B

## Result

Backend bridge implementation and focused transport tests: PASS. End-to-end browser/disposable-PostgreSQL acceptance: NOT VERIFIED by Agent B. Production token acceptance/cutover: NOT ENABLED.

Phase 3 reports identified an exact synthetic-token map in bootstrap while browser sessions supplied Supabase access tokens. The new replaceable `IdentityProvider.verifyAccessToken` boundary feeds the existing local principal resolver. Bootstrap defaults to `MockIdentityProvider`; explicit `supabase-legacy` configuration selects `SupabaseLegacyIdentityProvider`.

## Verification and authority

The legacy adapter sends `GET /auth/v1/user` to a server-configured isolated Auth origin, with `apikey` set to a publishable/anon key and `Authorization: Bearer <access token>`. Supabase Auth verifies the access token, including legacy HS256 signatures and expiry. The backend does not decode JWT claims or possess a shared signing secret. Asymmetric verification can later replace this adapter with a JWKS verifier without changing principal resolution.

Only a successful 200 response with a UUID `id` yields identity. Issuer is the configured origin plus `/auth/v1`; subject is that verified response ID. Email, frontend IDs, JWT role, user metadata and app metadata never supply identity bindings or authorization. Email is deliberately omitted. Existing identity contract uses issuer/subject; issuer namespaces the provider, and provider user ID equals subject. No schema or repository change is required.

Existing repository resolves a unique verified `external_identities` issuer/subject binding to `backend_users`, then reads current verified global roles. Unknown/ambiguous mappings deny access; no automatic provisioning or email linking occurs. Principal resolution runs for every request; API policy denies inactive/suspended users and roleless principals. There is no token/principal cache or fallback to mock credentials when the selected legacy verifier rejects evidence.

Malformed/empty/oversized bearer values, non-200 responses, malformed provider bodies, network errors and timeouts yield no identity. Requests use a five-second abort signal and reject redirects. Repository failures propagate through existing safe API error handling.

## Isolated configuration

Server environment only:

```dotenv
IDENTITY_PROVIDER=supabase-legacy
LEGACY_AUTH_URL=http://127.0.0.1:54321
LEGACY_AUTH_API_KEY=<isolated publishable or anon key>
```

`LEGACY_AUTH_URL` must be an HTTP(S) loopback origin (`localhost`, `127.0.0.1`, or `[::1]`), without path, credentials, query or fragment. Development/test environments alone are allowed. Staging/production fail closed. Existing foundation environment checks remain active. No remote endpoint, production secret, user or session was used. Do not tunnel or proxy production Auth into this loopback origin.

Default mock mode retains exact server-configured `DEV_AUTH_TOKENS_JSON` bindings, copied and frozen. Synthetic mappings cannot authorize real Supabase sessions. Select a single provider explicitly; mock and legacy modes are never combined. Local browser fixtures must use an isolated Auth issuer matching their verified DB bindings. Existing production sessions are outside this acceptance scope.

## Evidence

Commands run from `backend/`:

```text
npx tsx --test test/auth.test.ts test/auth-bridge.test.ts test/authorization.test.ts
11 passed; 0 failed; 0 skipped
npx tsx --test test/auth.test.ts test/auth-bridge.test.ts test/authorization.test.ts test/api.test.ts
13 passed; 0 failed; 0 skipped
npm run typecheck
PASS
```

New tests inject a fake Auth transport; they perform no Auth HTTP request. Fastify injection exercises `/api/v1/me` through the adapter, principal resolver and a controlled repository fixture. Coverage includes required Auth headers/endpoint, redirect/timeout configuration, invalid/expired rejection responses, malformed provider data, provider outages, unknown identities, forged frontend IDs/roles and metadata, immediate local role changes, inactive/suspended users, exact mock mappings and configuration isolation. These tests establish the adapter contract; they do not independently prove Supabase cryptographic verification or actual DB execution.

Official references reviewed: [Supabase JWT guide](https://supabase.com/docs/guides/auth/jwts), [getUser reference](https://supabase.com/docs/reference/javascript/auth-getuser), and current changelog. No applicable API breaking change identified; announced cloud TLS cipher retirement does not alter this native-fetch local Auth contract.

## Remaining gates and lifecycle boundary

Coordinator/QA must verify isolated browser session transport and disposable-DB identity bindings, role/status enforcement and concurrent authority changes. Browser fixtures need a compatible isolated issuer/session; Agent B changed no frontend, domain routes, repositories or database schema. Real production token format/issuer configuration was deliberately not inspected or exercised. Remote/production activation remains outside this implementation's environment gate.

Login/logout, signup, password/reset, email verification, SSO, full identity deletion and impersonation remain `PHASE4_AUTH`; no lifecycle migration or external identity mutation is implemented. No SSH, production contact, deployment, production import, traffic switch or shared Supabase mutation occurred.

## Coordinator closure

Subsequent independent evidence closes Phase 3A transport gates: disposable PostgreSQL full suite 52/52 without skip; desktop browser through real Vite proxy, `MockIdentityProvider`, principal repository and DB Users service; immediate inactive/removed-role denial; persisted profile/role/status and audit; mobile/tablet/desktop session refresh/denial closeout 30/30. This verifies the replaceable transport architecture with controlled credentials. It does not claim a production token, remote Supabase Auth endpoint or cutover. Final Phase 3A transport status: **PASS for isolated pre-cutover scope**.
