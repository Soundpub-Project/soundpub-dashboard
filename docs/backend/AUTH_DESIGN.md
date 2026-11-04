# Authentication design

Status: Phase 2 provider-independent contract. Only synthetic identity bindings and local mock/dev identity are authorized.

## Identity is separate from membership

An identity adapter verifies provider evidence and returns trusted issuer/subject, with provider name where needed to disambiguate bindings. Principal resolver loads the corresponding verified `external_identities` binding, `backend_users` record, current local roles and status. No match means unauthenticated; resolution does not create a user.

Application principal contains immutable application UUID, current roles and status. Provider subject is not application UUID. User email is contact/login lookup, never proof of ownership or permission to link two accounts. Do not trust client-provided user IDs, roles, status, tenant IDs or editable provider metadata.

The implementation exposes identity/principal resolver and policy hooks under `backend/src/auth/`. Its transport-facing integration must feed verified identity into repository resolution; returning a bearer token's embedded user/roles directly is insufficient. `/api/v1/me` must prove the provider-to-repository-to-database path, not only return a hard-coded principal.

## Provider boundary

| Responsibility | Phase 2 | Later integration requirement |
| --- | --- | --- |
| Verify access evidence | Local mock/dev resolver or exact server-configured synthetic-token mapping | Mature OIDC/JWT verification with trusted issuer, audience, algorithm, keys and time validation |
| Resolve identity | Local verified binding to application UUID | Same contract; no automatic email-based linking |
| Get current user | Repository lookup in dedicated DB | Current local status and roles remain authoritative |
| Refresh/revoke/logout | Explicit unsupported/mock capability | Provider-owned sessions and revocation; tested before activation |
| Password/reset/verification | No password or token cryptography | Provider-native enrollment/recovery with bounded, single-use flows |

Mock/dev identities are selected by server bootstrap or injected test dependencies. They must not accept a user ID/role header, arbitrary token contents, query override or frontend feature flag as authentication. If synthetic bearer tokens exist, they map only to explicitly configured test identities, carry no production material and are redacted. Anonymous mode yields no principal. Non-development deployment must reject dev/mock identity modes; staging/production remain disabled until a real verified adapter exists.

No homemade password hashing, JWT signing, session store, magic-link bridge, or source Auth table clone is required. Expiry/replay tests of real identity providers belong to their later adapter gates, not an assertion that a mock proves OAuth security.

## Binding and provenance

Future R1/R2 users preserve source application UUIDs; production Phase 2 imports are zero. Unique provider/issuer/subject binding prevents two users claiming one verified identity. A collision fails closed and requires explicit review. Pending source SSO labels/subjects are restricted evidence, never an active binding.

Non-login `identity_references` preserve historical/default/deferred endpoints and cannot be resolved as principal or role assignment. Shared users receive Soundpub-local membership; no other application's profile/role, password, session or provider token is copied. Managed artists may be business principals without interactive login.

Record linkage audits with server-derived actor, target UUID, provider identifier and safe outcome. Exclude raw tokens, private provider metadata and secrets. Database changes, audit and relevant outbox event share one transaction.

## Lifecycle and later provider requirements

Suspension denies Soundpub access using current local state without banning shared source identity. Inactive fixtures use conservative denial in foundation; source inactive-login semantics remain a later product decision, not silently redefined. Unknown statuses deny access. Role/status changes must take effect without waiting for a stale provider token to refresh.

Google/OIDC and Keycloak require trusted issuer/signature/audience, numeric mandatory unexpired `exp`, `nbf` when present, `azp`/client constraints and explicit issuer/subject binding. Browser login adds state, nonce and PKCE where required. Password recovery uses provider-native single-use tokens, allowlisted redirects, rate limits and non-enumerating responses. Session refresh/revocation and sensitive-operation freshness need real-provider tests before production activation.

No source passwords/hashes, sessions, JWTs, refresh tokens, MFA seeds, reset/verification links, signing keys or production client secrets enter repository, docs, logs or local fixtures. Supported future hash migration would require a separate approved provider-controlled encrypted process; it is not assumed feasible.

See [authorization](AUTHORIZATION_MODEL.md), [database design](DATABASE_DESIGN.md), [provider adapters](PROVIDER_ADAPTERS.md), and the binding [Auth inclusion contract](../migration/PHASE1G_AUTH_INCLUSION_CONTRACT.md).

