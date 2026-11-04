# Phase 3A security report

**Local backend security checks PASS; Phase 3A pre-cutover gate PASS.** No production identity, traffic, credentials or shared Supabase was used.

- Identity provider contract accepts exact server-configured mock tokens or Auth `GET /auth/v1/user` on isolated loopback. Real verifier accepts only a successful provider response with UUID subject. Issuer+subject uniquely maps to verified `external_identities`; email, editable metadata, decoded JWT roles, headers and client IDs have no authority. Provider response/status/timeout failure denies access.
- Verified identity resolves current `backend_users` status and verified DB roles each request. Missing/unknown identity yields 401; inactive/suspended/forbidden yields 403. No automatic linking or account creation.
- Own profile PATCH is allowlisted and audited; admin role/status mutations re-lock authority, check target hierarchy, forbid self/privileged changes, audit within transaction. Relationship-dependent role removal and label transfer fail with conflict instead of leaving orphans or rewriting historical ownership.
- Local development CORS accepts `http://localhost:8181` or `http://127.0.0.1:8181`; rejects other Origin; no allow-credentials or wildcard origins. Same-origin Vite `/api` proxy remains default. This explicit allowlist is a development contract, not a production deployment policy.
- Backend-mode avatar/logo upload refuses legacy Supabase Storage writes followed by backend profile updates. Upload parity remains deferred to storage domain; file previews/legacy-only components do not imply backend media migration.
- No production issuer, JWT signing secret, service-role key or credential entered repo or frontend. Mock and legacy providers are development/test only; production boot remains intentionally forbidden by isolation guards.

Negative tests cover forged identity/role/metadata, unknown binding, inactive/suspended, other-user profile, admin privilege abuse, invalid status/role, cursor mismatch, transaction rollback and stale role. Browser-to-proxy-to-DB and session refresh/denial UI pass with controlled synthetic credentials; actual Supabase-issued token cryptographic verification and production integration remain explicitly untested and unauthorized.
