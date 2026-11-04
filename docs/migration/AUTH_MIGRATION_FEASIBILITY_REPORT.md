# Phase 1B authentication migration feasibility

Status: **BLOCKED. Auth ownership verified: NO. Phase 2: NOT READY.**

Agent E observation date: 2026-10-27, Asia/Bangkok. Live aggregate observations began around 04:54. These are observations of the inspected origin, not proof that the public hostname reaches this origin. No production identities, provider configuration, sessions, passwords, or application data were changed.

## Evidence and limits

Read the full Phase 1B attachment, `PHASE1_FINAL_REPORT.md`, `SUPABASE_MIGRATION_AUDIT.md`, and the Phase 1 artifacts, including `AUTH_MIGRATION_MATRIX.md`, `PHASE1_VERIFICATION_REPORT.md`, `CUTOVER_REQUIREMENTS.md`, and `ROLLBACK_REQUIREMENTS.md`. Historical findings remain historical unless independently checked below. The baseline readiness is 53/100; this scoped report does not recalculate coordinator scoring.

Live verification used SSH to `maskhar@20.20.20.3`, always beginning in `/data/supabase/instances/supabase-01/config`. Database inspection used `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -At`, explicit `BEGIN READ ONLY`, bounded statement timeouts, and `ROLLBACK`. Only aggregate counts and non-secret configuration facts left the server. Identity values, user identifiers, email addresses, tokens, password hashes, and identifier digests are deliberately absent from this report.

Repository sources checked: `src/hooks/useAuth.tsx`, `src/integrations/supabase/client.ts`, `src/lib/sessionLimit.ts`, `src/lib/keycloak.ts`, `src/pages/Auth.tsx`, `src/pages/Users.tsx`, `src/components/auth/ProtectedRoute.tsx`, `src/components/users/ChangeStatusDialog.tsx`, `supabase/functions/sso-login/index.ts`, and `supabase/functions/update-user-status/index.ts`. The mounted deployed `sso-login/index.ts` was independently checked in place for claim checks and lookup predicates; runtime image is `supabase/edge-runtime:v1.74.0`. No function was invoked to create a login session.

## Independently verified identity population

| Check | Live result | Interpretation |
|---|---:|---|
| Shared GoTrue users | 211 | Shared platform population, not Soundpub scope |
| Auth users with Soundpub profile | 182 | Confirmed current application linkage |
| Users without Soundpub profile | 29 | Keep outside automatic migration |
| Soundpub profiles without auth user | 0 | Current profile linkage coherent |
| Profiles missing role record | 0 | Every current profile has a role link |
| Role records without Soundpub profile | 0 | No current orphan role links |
| Duplicate normalized auth-email groups | 0 | Does not prove provider equivalence |
| Profile/auth normalized-email mismatches | 0 | Current data agrees, not a linking policy |
| Provider/subject groups spanning multiple auth users | 0 | Checked `auth.identities(provider, provider_id)` |
| Soundpub-linked users referenced by another application | 8 | Shared identities are proven, not hypothetical |
| Profile-less users referenced by another application | 29 | Other-app membership does not prove Soundpub irrelevance |
| Profile-less users referenced in Soundpub UUID columns | 19 | 57 references, all `audit_logs.target_id` |
| Profile-less users appearing as Soundpub audit actors | 0 | Audit targets are not proof of current ownership |
| Profile-less users with Soundpub source-app marker | 0 | Checked app metadata and user metadata separately; absence is inconclusive |

The cross-application check followed all 43 declared foreign-key columns targeting `auth.users` outside `auth`, `soundpub`, and `storage`. It found eight of the 182 current Soundpub identities also referenced by other application schemas. This is a lower bound: undeclared links, textual identifiers, external systems, and historical membership are not excluded.

The profile-less check inspected all 83 UUID columns across the 33 Soundpub tables, not just profile/role joins. Nineteen distinct users occur in 57 audit-target references. All 29 also have other-application links. Neither fact authorizes deletion, export, or migration. Audit targets can describe historical activity rather than present ownership; their retention and identity-linkage requirements require an explicit disposition. No current business-owner UUID reference to those users was found in the scanned columns. JSON/text-only or external links remain unproven.

| Required classification | Count | Evidence and disposition |
|---|---:|---|
| SOUND PUB CONFIRMED | 174 | Current profile/auth/role links; no other-app link in the declared-FK check. Exclusive ownership is not proven. |
| SHARED | 8 | Current Soundpub link and independently found other-app auth link. Preserve shared source identity; require a migration and revocation boundary. |
| NOT SOUNDPUB | 0 conclusively excluded | Other-app membership alone cannot establish this classification. |
| UNKNOWN | 29 | No current Soundpub profile; 19 still have Soundpub audit-target linkage. Hold all 29 pending provenance/retention review. |
| Total | 211 | Categories are mutually exclusive for this observation. |

This classification is an aggregate server-side result, not an approved per-identity export manifest. The historical matrix remains unchanged under Agent E's three-file write scope. An authorized owner must produce the restricted identity-level decision record and reconcile it with that matrix before migration. User-editable `raw_user_meta_data.source_app` is never authoritative for ownership or authorization.

## Google OAuth

Verified in live metadata:

- Google is enabled in the inspected GoTrue container. There are 14 Google identities: 13 linked to current Soundpub profiles and one profile-less identity held UNKNOWN.
- All 13 linked identities have a subject matching `provider_id`, `email_verified=true`, issuer `https://accounts.google.com`, and normalized identity email matching the auth-user email. All 13 auth emails are confirmed.
- Three linked users have both email and Google identity rows. No cross-user duplicate `(provider, provider_id)` group or normalized auth-email duplicate was found.
- The GoTrue redirect allowlist is explicitly configured with eight entries and includes wildcard syntax. A Google redirect URI is configured. Provider-console allowlists were not accessed; configured presence does not prove correct callback routing or safe wildcard scope.

**Unknown:** consent and provenance of the three dual-provider links; actual provider-console authorized redirects; frontend deployment configuration; callback state/PKCE/nonce behavior; verified-email enforcement during account linking; behavior when a provider changes an email or subjects conflict. Stored `email_verified=true` does not prove every login enforces that claim. No live OAuth login, linking operation, reset, or notification was initiated. Require isolated fixtures for same email/different subject, same subject/changed email, duplicate callback, invalid state/nonce, and disallowed redirect before PASS.

## ICCN / Keycloak

Non-secret expected issuer derived from the inspected functions-container configuration: `https://sso.iccn.or.id/realms/PORTALICCN`; configured client ID is `Soundpub`. This verifies the intended local validation target, not identity-provider administration or public-route destination. `SSO_CLIENT_SECRET` is not populated in this container. Public-client versus confidential-client requirements remain unverified.

Live profile metadata contains 17 `sso_provider='iccn'` markers. Only 11 have a nonempty stored subject; six lack that binding. There are zero duplicate nonempty `(sso_provider, sso_user_id)` groups. These profile markers are not native Keycloak rows in `auth.identities`, and the schema does not preserve a per-identity issuer binding.

| Requirement | Mounted deployed-handler evidence | Gate |
|---|---|---|
| Signature and issuer | RSA signature verified using configured realm JWKS; exact issuer equality checked | Source check verified; adversarial integration untested |
| Required subject | `payload.sub` read, but missing subject can remain null | FAIL readiness |
| Required numeric expiration | Rejects expired numeric `exp`; absence/non-numeric value is not rejected by that predicate | FAIL readiness |
| Audience | No `payload.aud` validation found | FAIL readiness |
| Authorized client | Rejects mismatching `azp` only when present; requires a nonempty application client-role list | Missing `azp` policy unresolved |
| Verified email | No `payload.email_verified` enforcement found | FAIL readiness |
| Existing identity binding | Existing profile lookup uses email; no issuer/subject lookup predicate found | FAIL readiness |
| Callback allowlist | Handler accepts request-supplied `redirect_uri` for code exchange; provider-side enforcement not independently verified | BLOCKED |

The browser source generates state and PKCE verifier/challenge and consumes stored state with an age check. These source controls do not prove the deployed browser/provider flow, and do not repair direct bearer-token login or the handler's email-based identity selection.

Required closure: bind accounts to validated `(issuer, subject)`, explicitly reject missing/invalid required claims, enforce the intended audience/client and verified-email policy, reconcile all six missing subjects and all existing bindings without automatic email merging, then independently exercise signed synthetic fixtures and provider sandbox callbacks. Agent E has no authorization to alter production authentication or provider callbacks.

## Password feasibility

**Result: UNRESOLVED.** Aggregate server-side format inspection found 174 of 182 linked auth users with nonempty password material; all 174 match a bcrypt format marker, zero match another nonempty format, and eight have no password material. No password hash, prefix value, cost, or credential was returned. The 174-password count is not the same classification as the 174 non-shared linked users; no equivalence is implied.

Current password availability does not establish portability. The future identity system, exact version, supported bcrypt importer, cost/variant support, UUID preservation, and approved encrypted import process are not selected and tested in the supplied evidence. Source GoTrue is `supabase/gotrue:v2.189.0`. There are 105 managed-artist profiles, and the SSO handler can provision random passwords with `password_set=false`; a stored bcrypt value does not establish a usable user password or permission to enable login.

Direct migration can be considered only after a supported importer passes a synthetic bcrypt fixture and ownership-filtered, encrypted rehearsal. A transitional bridge or forced reset is a future policy choice, not a verified requirement or an action taken here. Preserve managed/no-password semantics and external SSO ownership. Do not export hashes to this repository or an unapproved target.

## Sessions, logout, and status semantics

| Topic | Verified fact | Remaining limit |
|---|---|---|
| Browser refresh | Supabase client persists to `localStorage` with `autoRefreshToken=true`; hook subscribes to auth events | Actual refresh replay/rotation flow not exercised |
| Access-token expiry | Inspected GoTrue explicitly sets `GOTRUE_JWT_EXP=3600` | JWT validation/revocation at every public consumer untested |
| Rotation | Rotation/reuse environment overrides absent; pinned GoTrue v2.189.0 source declares rotation default true | Default-source evidence, not behavioral proof; effective reuse interval not verified |
| Session lifetime | No explicit timebox/inactivity/single-session override found; 16 linked session rows, all with null `not_after` | Cannot claim a six-hour server-side limit |
| Refresh revocation metadata | 46 linked refresh rows, 30 marked revoked at observation | Counts do not prove cause, logout propagation, or replay protection |
| Logout | Hook calls `supabase.auth.signOut()` without scope and clears local state; JavaScript API documents global scope by default | Existing access JWT can remain valid until expiry; shared-app impact on eight users requires testing |
| Six-hour limit | `sessionLimit.ts` and hook enforce browser timer/focus checks | Client storage/timers are not a server authorization boundary |
| Inactive | Repository product semantics allow login; zero current inactive profiles | Preserve behavior; no positive fixture test performed |
| Suspended | Repository status handler sets GoTrue ban on suspend and removes ban on suspended-to-active; zero current suspended profiles | Existing JWT denial and suspension revocation unverified |
| Impersonation | User-management browser source retains original privileged refresh token in `sessionStorage` | Scoped, audited, revocable replacement and restore behavior unverified |

Reference semantics, fetched during this review: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase sign-out](https://supabase.com/docs/guides/auth/signout), and [GoTrue v2.189.0 configuration source](https://github.com/supabase/auth/blob/v2.189.0/internal/conf/configuration.go). Current documentation is not substituted for the installed-version or live behavior evidence. The Supabase changelog was checked; no upgrade or configuration change was attempted.

## Runnable aggregate regression check

Run only through the existing SSH/Compose read-only `psql` method above. This emits counts, never identity values or credentials. Expected observation: `182, 29, 19, 0` respectively. A changed count requires fresh ownership review rather than changing the expected value to obtain PASS.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH unknown_users AS (
  SELECT users.id FROM auth.users AS users
  WHERE NOT EXISTS (
    SELECT 1 FROM soundpub.profiles AS profiles WHERE profiles.id = users.id
  )
)
SELECT
  (SELECT count(*) FROM soundpub.profiles) AS linked_profiles,
  (SELECT count(*) FROM unknown_users) AS unknown_users,
  (SELECT count(DISTINCT audit.target_id)
   FROM soundpub.audit_logs AS audit
   JOIN unknown_users ON unknown_users.id = audit.target_id) AS unknown_audit_targets,
  (SELECT count(*) FROM soundpub.profiles AS profiles
   WHERE NOT EXISTS (
     SELECT 1 FROM auth.users AS users WHERE users.id = profiles.id
   )) AS orphan_profiles;
ROLLBACK;
```

## Exact blockers and acceptance evidence

| ID | Blocker | Evidence required to close |
|---|---|---|
| AUTH-E1 | Eight proven shared identities; exclusivity of the remainder unproven | Restricted per-identity ownership approval, cross-app impact and migration/revocation plan |
| AUTH-E2 | Twenty-nine UNKNOWN identities; 19 appear in Soundpub audit targets | Registration/audit provenance, retained-link disposition, and proof each excluded identity cannot own required Soundpub data |
| AUTH-E3 | Incomplete/unsafe ICCN binding and claim enforcement | Validated issuer+subject mappings for all applicable accounts and isolated rejection/positive tests |
| AUTH-E4 | Google linking and provider callback policy untested | Authorized provider configuration evidence and isolated conflict/callback matrix |
| AUTH-E5 | Future identity system/importer undefined | Synthetic password import or approved bridge/reset rehearsal with managed/SSO semantics |
| AUTH-E6 | Refresh/logout/status/impersonation behavior unproven | Isolated session replay, revocation, inactive/suspended, shared-user, and impersonation tests |

No identity is approved for production migration by this report. Overall auth gate remains BLOCKED even though current linkage counts and eight shared identities are now independently established.

## Phase 1C closure assessment — 2026-10-27

**AUTH OWNERSHIP = NO. AUTH MIGRATION FEASIBILITY = BLOCKED.** Phase 1B remains the historical evidence above. Coordinator baseline is 50/100; this report awards no readiness points. Incident lock remains active: inspection only, no auth/provider calls, deployment, account export, password reset, session issuance/revocation, or production mutation.

Fresh SSH inspection started in the mandated Docker directory and used `BEGIN READ ONLY`, bounded statement timeouts and `ROLLBACK`. Aggregate results: 211 auth users, 182 profiles, hence 29 profile-less users; 19 profile-less users remain audit targets; 14 Google identities, 13 profile-linked; zero duplicate provider/subject groups. All 13 linked Google rows still contain matching subject, expected issuer and verified-email claim. Six ICCN profile markers still lack a subject. Of 182 linked users, 174 have password material, all matching bcrypt format; eight have none. No credential values, hashes, identity values or provider responses were returned. Shared-user linkage count eight is carried from Phase 1B, not freshly re-proven in this pass.

### Ownership decisions and outstanding authority

| Required classification | Count | Phase 1C decision |
|---|---:|---|
| SOUNDPUB ONLY | 0 proven | 174 linked users have no other-app declared-FK link in prior evidence; that is insufficient to certify exclusive ownership |
| SHARED | 8 previously verified | Hold migration/revocation pending cross-app owner approval; retain source identities |
| NOT SOUNDPUB | 0 proven | Other-app linkage alone cannot exclude Soundpub retention obligations |
| UNKNOWN NON-CRITICAL | 0 proven | No owner-approved non-critical determination supplied |
| UNKNOWN BLOCKING | 203 | 174 linked candidates awaiting exclusivity decision plus 29 profile-less users awaiting scope/retention decisions |
| Total | 211 | Mutually exclusive conservative evidence categories; no migration approval |

Within the 29 profile-less users, 19 have audit-target linkage and ten lack such linkage in the prior UUID scan. All 29 had other-app references. Neither subgroup can be excluded automatically. A restricted decision register must join identities to business and historical evidence, record approver and retention treatment, and reconcile all 211 without exposing that register in this repository. An identity missing from profiles must not be deleted or silently stripped from retained audit history.

### Provider, password and session closure requirements

Repository review still finds email-based account selection in `sso-login`, no audience validation or verified-email requirement, nullable subject handling and expiration checking that does not require a numeric claim. No source patch is safe as an isolated closure: existing bindings lack issuer storage, six subjects are absent, and automatic rebinding could take over or strand accounts. Required integration tests remain issuer/subject collision, changed email, missing claims, wrong audience/client, invalid signature/state/PKCE, replay and denied redirect. Provider-console callbacks and wildcard scope remain unverified; no production provider call was made.

Password path proposed for owner approval: **explicit forced reset for eligible password-login accounts**, using a supported target-provider reset flow after target selection and isolated delivery/recovery tests. This is a proposal, not an approved or verified supported migration path. Do not reset managed artists or SSO-only accounts merely because random password material exists. Hash import remains unproven; no hash export occurred. Until target, eligibility, notification/accessibility, support and rollback are demonstrated, password feasibility remains BLOCKED and no silent password loss is permitted.

Required session contract for rehearsal: target login issues fresh target sessions; source refresh tokens are never imported; refresh rotation rejects replay; logout revokes the intended session scope; suspension and compromise revoke refresh capability and deny sensitive operations despite surviving access JWTs; admin revocation is audited. Inactive users retain the existing allowed-login behavior unless explicitly changed by product owner. Shared-source global sign-out requires cross-app agreement. Six-hour browser timers do not satisfy server revocation. No behavioral claim in this paragraph is marked tested. Target implementation, expiry/reuse windows and cross-app revocation boundaries remain unresolved.

Acceptance still requires AUTH-E1 through AUTH-E6, a restricted approved identity register, a demonstrated password path, isolated session/provider tests and deployed/public independent verification after coordinator unlock. No migration-relevant UNKNOWN is relabeled non-critical to obtain PASS.
