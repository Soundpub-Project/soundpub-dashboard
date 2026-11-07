# Authorization model

Status: Phase 2 server-side policy contract. Default outcome is DENY. Frontend guards provide no backend authorization.

## Evaluation

Require verified identity, mapped local user, recognized current status and recognized role assignment. Deny inactive/suspended/unknown states in synthetic foundation. Resolve resource owner and approved tenant relation from repositories, then apply the named capability policy. Never derive actor, membership or authority from request fields, provider email, user metadata, object path or historical identity reference.

Foundation policy vocabulary is `authenticated`, `owner`, `owner-or-admin`, `admin`, `superadmin`. `superadmin` satisfies `admin`; neither role bypasses active-status checks. Admin bypass of ownership exists only for explicit `owner-or-admin` capability. An `owner` policy stays owner-only, including for admins. Unknown policy denies.

`copyright` and `whitelabel` belong to source compatibility vocabulary. The initial five-role policy adapter may reject these until explicitly supported. Preserve their future data representation; do not silently convert them to `artist`, `label` or `admin`. Their undocumented capabilities remain denied. Validate role arrays rather than granting on one recognized role mixed with unrecognized values.

## Required matrix

ALLOW below assumes active local membership and a recognized role. Resource owner is a database value. These are capability tests, not promises that a generic production resource API exists.

| Principal | Current user | Own resource (`owner`) | Other resource (`owner`) | Other resource (`owner-or-admin`) | Admin action | Superadmin action |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous | DENY | DENY | DENY | DENY | DENY | DENY |
| User owner | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| User other owner | ALLOW | ALLOW for its own resource | DENY | DENY | DENY | DENY |
| Artist | ALLOW | ALLOW if owner | DENY | DENY | DENY | DENY |
| Label | ALLOW | ALLOW if owner | DENY absent explicit roster capability | DENY absent explicit roster capability | DENY | DENY |
| Admin | ALLOW | ALLOW if owner | DENY | ALLOW | ALLOW within target hierarchy | DENY |
| Superadmin | ALLOW | ALLOW if owner | DENY | ALLOW | ALLOW within explicit policy | ALLOW |
| Inactive, any role | DENY | DENY | DENY | DENY | DENY | DENY |
| Suspended, any role | DENY | DENY | DENY | DENY | DENY | DENY |
| Unknown/deferred/reference-only identity | DENY | DENY | DENY | DENY | DENY | DENY |

An artist/label role is not global access to all artists or labels. Parent-label defaults and shared UUIDs are not membership. Later roster policies must use verified local relationships and preserve historical royalty semantics.

## Representative admin slice

The API foundation reserves `POST /api/v1/admin/users/{userId}/suspend` as a synthetic local-status action. It must authenticate and apply shared hierarchy policies before updating target state. User/artist/label callers deny; active admin and superadmin follow explicit target policy. Actor, reason and request ID feed the audit transaction. No shared Auth ban, provider session mutation, email or production user management occurs.

Foundation target policy must prevent ordinary admin from suspending or changing privileged peers/superadmins, promoting superadmin, or using self-action to bypass controls. Superadmin authority still needs explicit target checks; undefined self/peer operations deny. Tests define allowed ordinary-target behavior and negative privileged-target behavior. Role-only middleware is insufficient for target-sensitive actions.

Apply the same status/hierarchy decision in routes, services and Storage capabilities. A route testing only `roles.includes('admin')` must not exclude superadmin or permit inactive principals. Compatibility wiring is an acceptance check, not permission to duplicate divergent rules.

## Reads, writes and errors

Repository reads constrain owner/tenant where possible. Writes recheck applicable ownership/status/roles inside the mutation transaction and prevent changing immutable owner/actor fields through mass assignment. Financial/admin operations need consistent lock/order semantics to prevent races with status/role changes.

Missing/invalid identity returns 401. Authenticated but forbidden returns 403, or consistent 404 masking where resource existence is sensitive. Malformed identifiers return 400 before repository access. Do not disclose another tenant's private metadata in a denial. Authorization decisions and privileged changes use safe structured audit, without tokens or request-private content.

Database least privilege and required RLS/forced RLS add defense in depth; a browser never reaches tables with runtime credentials. Test through actual HTTP routes and dedicated PostgreSQL runtime roles, not only pure policy functions.

See [Auth](AUTH_DESIGN.md), [Storage](STORAGE_DESIGN.md), and [test strategy](PHASE2_TEST_STRATEGY.md).


## Production partner identity

Local username/password session remains primary application authentication. Partner SSO uses backend-issued authorization-code+PKCE transactions. The backend owns state and verifier, binds exact `/auth` redirect origin, expires the transaction after ten minutes, consumes it once, and exchanges the code server-side. The resulting RS256 JWT must resolve through the configured same-origin JWKS endpoint and pass exact `iss`, `aud`, `exp`, optional `nbf`, authorized client, and client-role validation. JWKS keys cache for five minutes and refresh once when an unknown `kid` appears.

A verified token yields only `(issuer, subject)`. Access still requires one pre-bound, verified `external_identities` row and current local user status/roles on every request. Token roles, email, username, tenant, and other claims never grant application authority. Configure `IDENTITY_PROVIDER=oidc`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL`; production/staging require HTTPS. Local cookie authentication remains available and unchanged.

ICCN identity assignment is a superadmin capability, not a generic user-management action. The mutation transaction reloads current database authority, then requires an active target with exactly one verified `artist` role, verified roster membership under configured partner label, matching parent label, active verified label/whitelabel owner, and no local credential. Email never binds identity and no user is auto-provisioned. Legacy unverified bindings require explicit re-verification. A binding from an old issuer remains visible for exact-subject removal; it is never silently rewritten to a new issuer. Unbind clears `sso_provider`, revokes target sessions, and audits only a subject digest.
