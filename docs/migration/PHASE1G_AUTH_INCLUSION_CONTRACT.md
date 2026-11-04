# Phase 1G Auth Inclusion Contract — Agent B

Date: 2026-10-27. **Auth Scope: PASS for isolated Phase 2 construction only. UNKNOWN_BLOCKING: 0. Production identity migration/cutover: NOT APPROVED.** Independent QA and overall Phase 2 admission remain separate decisions.

## Evidence and authority

Authoritative source: shared/multi-project `supabase.carubra.space`, server `20.20.20.3`. This contract reuses the Phase1F repeatable-read, read-only Auth snapshot at **2026-10-27 13:22:46 UTC**. It does not claim a new live count. No SSH, production endpoint, account operation, credential inspection, provider call, deployment or production mutation was needed or performed in Phase1G Agent B. Only this document is created.

Required inputs reviewed: `SUPABASE_MIGRATION_AUDIT.md`; `PHASE1F_FINAL_REPORT.md`; `PHASE1F_DATABASE_SCOPE.md`; `PHASE1F_AUTH_SCOPE.md`; `PHASE1F_STORAGE_SCOPE_REPORT.md`; `PHASE1F_STORAGE_SCOPE.csv` (schema/sample and report reconciliation method); `PHASE1F_FUNCTION_SCOPE.md`; `PHASE1F_FINDING_RECLASSIFICATION.md`. Paths without prefixes here are under `docs/migration/`. Auth implementation evidence: `src/hooks/useAuth.tsx`, `supabase/functions/sso-login/index.ts`, `supabase/functions/update-user-status/index.ts`; earlier `AUTH_MIGRATION_MATRIX.md` supports lifecycle context, not current population counts. Phase1F supersedes earlier 174/8/29 ownership candidates. No legacy `.com` behavior is used as production proof.

Phase1F inventoried all application UUID columns, named identity-semantic references and Auth/provider collision checks. It did not prove ownership outside inspected schemas, arbitrary text/JSON references, external consumers, provider-subject trust, or credential/session portability. This contract does not erase those limits. Current ownership remains unproven; Phase2 needs a complete representation contract, not permission to import users.

## Reconciled decision counts

| Phase1F class | INCLUDE | INCLUDE_SHARED_IDENTITY | EXCLUDE | DEFER_NON_BLOCKING | UNKNOWN_BLOCKING | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SOUNDPUB ONLY | 110 | 0 | 0 | 0 | 0 | 110 |
| SHARED | 0 | 16 | 0 | 0 | 0 | 16 |
| OTHER PROJECT | 0 | 0 | 29 | 0 | 0 | 29 |
| UNKNOWN | 0 | 0 | 0 | 56 | 0 | 56 |
| **Total** | **110** | **16** | **29** | **56** | **0** | **211** |

`EXCLUDE` is canonical output category required by Agent B request; all 29 have subtype `EXCLUDE_OTHER_PROJECT`. `EXCLUDE_NO_SOUNDPUB_DEPENDENCY` has count 0. Neither subtype means delete source records. All 56 formerly UNKNOWN are deferred, rather than declaring automatic provisioning proof of non-membership. There are 126 application-user candidates, not 182 or 211 approved Auth imports. Phase2 imports **zero** production identities.

## Deterministic rules, in precedence order

**R1 / INCLUDE:** qualifying Soundpub operational evidence and no observed other-app evidence. Preserve application UUID and necessary Soundpub profile/business links. This is a Soundpub need predicate, not exclusive human/account ownership. Unobserved external use is preserved by the same non-mutating source-reference boundary as shared identities.

**R2 / INCLUDE_SHARED_IDENTITY:** qualifying Soundpub operational evidence plus observed other-app evidence, including legacy overlap. Preserve a Soundpub-local application user plus external identity references; do not clone another application's profiles, roles, credentials or sessions. Shared set is exactly the 16 rows marked R2 below.

**R3 / EXCLUDE:** no Soundpub profile or qualifying operational evidence, with observed other-app membership. Do not extract authentication, profile or authorization data for these identities. Historical Soundpub references use non-login references, never forced account inclusion. Nineteen of 29 have historical Soundpub default-profile targets (57 rows) and default-role history (57 separate rows); these do not establish current membership.

**R4 / DEFER_NON_BLOCKING:** current default Soundpub profile/role but no qualifying operational evidence in Phase1F. All 56 satisfy this predicate; 50 lack observed other-app linkage and six have other-app linkage. No current business ownership was found under Phase1F rules; absence is limited to inspected evidence. Retain provenance and references outside login model. No production profile/role copy or login provisioning until later dependency/ownership review. Inactivity alone is never a selection rule.

**R5 / UNKNOWN_BLOCKING:** a newly discovered migration-critical relation cannot be assigned a bounded local user or non-login external reference without losing business meaning or granting unexplained authority. Stop affected extraction/admission review; never force R1/R2 or assume ownership to make count zero. No such unresolved representation exists in the baseline: known operational relations use R1/R2, incidental/default/historical/external relations have reference representation below. Snapshot drift requires reclassification, not reuse of ordinal identities.

Qualifying evidence: domain role D (`superadmin`, `admin`, `label`, `copyright`, `whitelabel`), artist profile A, artist roster label owner L, release E, track T, royalty Y, audit actor C, or business/payment/workflow B. Predicate is `D OR A OR L OR E OR T OR Y OR C OR B`. P=profile and R=role alone do not qualify. Email/domain, provider existence, shared Auth activity, notification/email logs, parent-label defaults, managed-artist marker, audit target and user-editable registration metadata never independently qualify. Domain role evidence selects scope; it does not certify that privilege is legitimate.

B covers the explicit Phase1F business tables: artist deletion, archived royalty, balance adjustment, copyright registration/file/payment, payout/reservation, release payment, royalty upload and takedown request/document/history. Copyright works/contracts and takedown items/targets inherit via their parent records; no invention of a direct user column. Composer royalties/resource UUIDs require semantic review if populated; resource-ID coincidence is not identity proof.

## Shared and deferred identities: adapter/reference boundary

All 16 shared rows have legacy Buzzerhood profile-ID overlap; AUTH-008, AUTH-135 and AUTH-203 also have Cafe membership. Remaining 13 have only legacy Buzzerhood evidence of other-app use. Buzzerhood local users are empty and profile `user_id` values null in Phase1F: legacy overlap is not proven active shared login. Keep conservative shared classification without requiring Buzzerhood migration.

Six deferred cross-app rows: AUTH-057 and AUTH-090 (Artikel plus Buzzerhood legacy), AUTH-065, AUTH-140 and AUTH-205 (Cafe plus Buzzerhood legacy), AUTH-199 (Buzzerhood legacy). Their Soundpub default profiles do not justify including credentials or granting login. Fifty other deferred rows have no observed cross-app reference, which still does not prove exclusive ownership.

Logical target contracts (physical schema belongs to database agent):

- `backend_users.application_user_id` preserves `auth.users.id` for selected R1/R2 users. Same UUID is valid in a dedicated app DB without asserting global ownership. Provider subject is never substituted for application UUID.
- `external_identities` maps application user to validated provider/issuer/subject and source provenance. Source mapping `(source_system, source_auth_user_id)` is unique within Soundpub. Provider binding uniqueness is `(provider, issuer, subject)`; collisions stop binding. An unverified source subject can be retained in a restricted pending reference, never treated as authenticated identity.
- `identity_references` represents unresolved external/default/historical actors or relationship endpoints. Minimum fields: source system, source UUID (restricted), reference kind, source table/column/record locator, reason, validation state, optional resolved application UUID. It has **no email, credential, session, login permission or role**. It is not another imported Auth user.
- Soundpub-owned row UUIDs, original owner/actor UUIDs and relationship provenance remain intact. For an R3/R4 endpoint, a relation adapter resolves to `identity_references`; business reads may show an unavailable external actor. Writes and authorization deny access unless an explicitly verified local user/tenant relation exists. Do not silently null an owner, reassign royalties, or reuse a synthetic fixture as production owner.
- Default `profiles.parent_label_id`, `app_settings` actor references, audit targets/nested historical IDs, log recipients and Storage owner/path UUIDs may require reference endpoints without proving account membership. Preserve those dependencies rather than copying full excluded/deferred profiles. Reference counts are not established by Phase1F per-identity inventory and are **not asserted as zero**. Target DB must support this representation; a direct FK to `backend_users` alone is insufficient for these fields.
- `auth.uid()` becomes verified request principal lookup. Existing Auth FKs become local-user or typed-reference contracts as appropriate. Shared signup trigger, mail hook, GoTrue config and Storage policies stay on source; do not recreate host-wide side effects in target.

Exactly which Google subject or external issuer is shared cannot be established from redacted inventory. Per-class counts do not identify which aliases have a provider. Do not fabricate per-row provider mappings. Phase4 verifies mappings only for included users through restricted extraction. Other apps remain operational on original source; no source user deletion, password change, global ban, role modification or session revocation follows from Soundpub migration.

## Backend-facing user and lifecycle contract

| Field | Required meaning |
| --- | --- |
| application_user_id | UUID, immutable; preserved source UUID for eventual R1/R2 imports; synthetic UUIDs only in Phase2 |
| email | Nullable restricted contact/login attribute, not identity key; preserve verified status separately; no email printed in this manifest |
| status | Explicit active/inactive/suspended state plus provenance; unrecognized source state quarantined, never default active |
| profile linkage | Selected Soundpub profile only; other relation endpoints use reference adapter |
| role linkage | Soundpub-local roles and tenant scope; validate before privilege activation; no source-wide authenticated-role equivalence |
| provider identities | Validated provider + issuer + immutable subject; zero or more, explicit pending state permitted |
| created_at | Preserve source creation timestamp for later imports; do not fabricate verification timestamps |
| migration_source | source instance, snapshot, source user reference, rule/evidence, manifest version and later extraction batch |

Managed artists are business principals even when interactive login is absent. Do not enable passwords/login because an artist was included. Source `password_set`/SSO profile labels are hints, not credential proof.

| Lifecycle | Boundary / later requirement |
| --- | --- |
| Password | Identity provider owns credentials. No plaintext passwords, manually stored hashes or copied source Auth internals. Supported secure hash import requires separately proven compatibility and approval in Phase4; otherwise explicit recovery/onboarding. Neither strategy is assumed working now. |
| Google OAuth | Dedicated target client and callback, verified issuer/audience/signature/expiry and subject; do not merge by email alone. Phase1F Google identity rows prove linkage existence, not portable OAuth grants. |
| Keycloak / ICCN | Dedicated client; require signature algorithm/key trust, issuer, audience, mandatory numeric unexpired exp, nbf where present, azp/client constraints, required app roles and nonce/state/PKCE for browser flow. Explicit trusted issuer+subject binding; email linking needs separate verified proof. Existing profile labels/SSO subjects are pending evidence. |
| Reset / verification | Provider-native, single-use bounded tokens, allowlisted target redirects, rate limits and non-enumerating responses. Do not migrate reset tokens, OTPs, old verification links or profile-stored recovery secrets. |
| Suspension | Deny Soundpub API immediately using current local status; target session revocation belongs to target provider. Never ban shared source identity to suspend Soundpub membership. |
| Inactivity | Preserve source distinction from suspension. Current inactive-login semantics require explicit product policy; until resolved, no automatic privilege upgrade or active-state coercion. Fixtures cover active/inactive/suspended separately. |
| Role change | Authorize current actor and tenant/hierarchy, update Soundpub roles only; enforce fresh authorization rather than stale token metadata. Audit actor/target; deny self/escalation paths outside approved policy. |
| Sessions / logout | Chosen target provider handles sessions. Fresh target login; no source access/refresh tokens, session rows, MFA secrets, recovery factors, signing keys or impersonation refresh-token storage copied. Refresh/logout/revocation and strict sensitive-operation checks must be validated before cutover. |

Phase1F observed 200 email and 14 Google provider rows (214 rows / 210 users); one deferred user has no provider row. Included groups have 120 email-user occurrences and 9 Google-user occurrences, overlapping in three users, covering 126 users. The 11 stored SSO subjects are all in deferred identities; their issuer/subject trust is unverified. None must be activated to construct Phase2 adapter. These are snapshot aggregates, not credentials or per-alias assignments.

## Credentials and security isolation

Phase2: dedicated PostgreSQL, API, application credentials and migration namespace; synthetic/sanitized fixtures, provider mocks/sandboxes and development object storage only. No production data imports, shared service-role/JWT/DB/SMTP secrets, live provider callbacks, production Auth calls or production network write capabilities. Build cannot require shared stack availability. Synthetic cases must cover local/shared/other/deferred users, dangling historical references, absent providers and denied external principals.

Never export shared GoTrue config, Auth sessions, refresh tokens, password/reset/verification secrets, provider tokens, source client secrets or signing keys with user scope. Provider token fields in `auth.identities.identity_data` are not a portable mapping. Restrict future extraction to an explicit field allowlist. Any future password-hash import is a separate encrypted provider-controlled procedure, never a repository manifest.

Do not use user metadata for authorization. Validate UUID and provider inputs at trust boundary; scope authorization to application membership and current roles, not merely valid shared-stack JWT or bucket access. Restricted source UUIDs/emails/provider subjects belong in approved encrypted artifacts outside repo, not chat or logs. Existing deployed SSO/privileged API gaps and exposed-credential remediation remain cutover/security work; this document does not mark them fixed.

## Extraction query and manifest method

This document is a snapshot **classification manifest**, not an executable production user import. Its aliases are Phase1F `row_number() over (order by auth.users.id)` labels, not durable identifiers. Do not join historical AUTH-### aliases to a new live ordinal population. Additions/deletions can change every subsequent alias; equal totals do not prove identical users.

For future authorized refresh, use direct SSH `maskhar@20.20.20.3`, first `cd /data/supabase/instances/supabase-01/config`, then `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`. Stream SQL through stdin; no remote scripts, temporary tables, uploads, DDL/DML or source config reads needed. Use the **Read-only reproduction and runnable check** SQL in `PHASE1F_AUTH_SCOPE.md`, preserving its catalog-derived `identity_refs`, `flags`, `scored` and `classified` CTEs. All SQL stays inside `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, statement timeout, and `ROLLBACK`. Add `SET LOCAL lock_timeout='3s'`.

Replace its final inventory SELECT with the following SELECT while retaining those CTEs. This is a query fragment, not standalone SQL; `classified` is the exact Phase1F CTE, not a production table:

```sql
SELECT alias,
       classification AS phase1f_class,
       CASE
         WHEN soundpub_operational AND other_evidence THEN 'INCLUDE_SHARED_IDENTITY'
         WHEN soundpub_operational THEN 'INCLUDE'
         WHEN NOT profile AND other_evidence THEN 'EXCLUDE'
         ELSE 'DEFER_NON_BLOCKING'
       END AS inclusion_class,
       CASE WHEN NOT soundpub_operational AND NOT profile AND other_evidence
            THEN 'EXCLUDE_OTHER_PROJECT' END AS exclusion_subtype,
       profile, role, domain_role, artist_profile, label_artist,
       release_link, track_link, royalty_link, audit_actor, audit_target,
       business_link, other_current, buzzerhood_legacy,
       academy, cafe, artikel, carubra
FROM classified
ORDER BY alias;
```

This baseline query partitions observed evidence; it cannot detect every future unsupported reference. Before authorizing a later extraction, repeat full UUID/FK semantic sweep and selected-row dependency closure, including indirect business parents, actor fields, default labels, nested historical IDs and Storage references. Emit explicit edge manifests `source_table, source_column, source_record_locator, source_identity_reference, relation_kind, local_user_or_external_reference, resolution_state`. Unsupported critical relations trigger R5; a query returning no UNKNOWN literal is not proof of zero blockers.

Two outputs from the same repeatable-read snapshot: (1) redacted evidence/classification report for review; (2) later authorized encrypted restricted identity map, outside repo, using immutable source UUID, source instance, snapshot ID, category/reason, evidence and dependency edges. For selected users only, allowlist contact/status/profile/role timestamps and provider/subject fields after verification; join provider records by immutable selected source UUID, never email. No `SELECT u.*`, raw metadata, `identity_data`, or whole `auth` dump. R3/R4 emit only necessary relation references in separate restricted edge manifest, not full identity payloads.

Record extraction timestamp, schema/query version, explicit field allowlist, evidence report digest, manifest digest, row counts and unresolved edge count. Any new snapshot replaces counts/aliases as a full new version with reviewed differences; never claim exact historical UUID mapping recoverable from this redacted report. Validate distinct source UUIDs, one classification per source user, selected FK closure, no unrelated schema/credentials, all nonlocal references denied login, provider collision checks and no critical unknown. Phase1F's 211-count invariant must fail closed on drift; investigate rather than change production. Actual extraction/implementation is later-phase work, not performed here.

## Row-level snapshot manifest

Evidence codes and aliases are copied exactly from Phase1F, expanded to one row per identity. H=historical target, O=other-app evidence; other codes defined above. R1–R4 determine disposition without requiring personal identifiers. Provider membership is not guessed per row.

| Alias | Phase1F class | Inclusion category | Evidence | Rule |
| --- | --- | --- | --- | --- |
| AUTH-001 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-002 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,C,B | R1 |
| AUTH-003 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-004 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-005 | SOUNDPUB ONLY | INCLUDE | P,R,A,C | R1 |
| AUTH-006 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-007 | SOUNDPUB ONLY | INCLUDE | P,R,E,T | R1 |
| AUTH-008 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,C,O:cafe,O:buzzerhood-legacy | R2 |
| AUTH-009 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-010 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-011 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-012 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-013 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-014 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-015 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-016 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-017 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-018 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-019 | SOUNDPUB ONLY | INCLUDE | P,R,A,C | R1 |
| AUTH-020 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y | R1 |
| AUTH-021 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-022 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-023 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,C,B,O:buzzerhood-legacy | R2 |
| AUTH-024 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-025 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-026 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-027 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-028 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-029 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-030 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-031 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-032 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-033 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-034 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,B | R1 |
| AUTH-035 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-036 | SOUNDPUB ONLY | INCLUDE | P,R,A,E | R1 |
| AUTH-037 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-038 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-039 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-040 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-041 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-042 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-043 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-044 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-045 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-046 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-047 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-048 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-049 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-050 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-051 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-052 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-053 | SOUNDPUB ONLY | INCLUDE | P,R,E,T | R1 |
| AUTH-054 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-055 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-056 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,C,B | R1 |
| AUTH-057 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:artikel,O:buzzerhood-legacy | R4 |
| AUTH-058 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-059 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-060 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-061 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-062 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,C,B | R1 |
| AUTH-063 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-064 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,B | R1 |
| AUTH-065 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:cafe,O:buzzerhood-legacy | R4 |
| AUTH-066 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-067 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-068 | SOUNDPUB ONLY | INCLUDE | P,R,A,C | R1 |
| AUTH-069 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-070 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-071 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-072 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-073 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-074 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-075 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-076 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-077 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-078 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-079 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-080 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,C,O:buzzerhood-legacy | R2 |
| AUTH-081 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-082 | OTHER PROJECT | EXCLUDE | O:academy | R3 |
| AUTH-083 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-084 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-085 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-086 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-087 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-088 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,C,B | R1 |
| AUTH-089 | SOUNDPUB ONLY | INCLUDE | P,R,D,L | R1 |
| AUTH-090 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:artikel,O:buzzerhood-legacy | R4 |
| AUTH-091 | SOUNDPUB ONLY | INCLUDE | P,R,E,T | R1 |
| AUTH-092 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-093 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-094 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,C,O:buzzerhood-legacy | R2 |
| AUTH-095 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-096 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-097 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-098 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-099 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-100 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-101 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-102 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-103 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-104 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-105 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-106 | OTHER PROJECT | EXCLUDE | H,O:academy,O:cafe,O:artikel,O:carubra | R3 |
| AUTH-107 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-108 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-109 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-110 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-111 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-112 | SOUNDPUB ONLY | INCLUDE | P,R,E,T | R1 |
| AUTH-113 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-114 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-115 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-116 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-117 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-118 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-119 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-120 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,C,B | R1 |
| AUTH-121 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-122 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-123 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-124 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-125 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-126 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-127 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-128 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-129 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,D,C,O:buzzerhood-legacy | R2 |
| AUTH-130 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-131 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-132 | SOUNDPUB ONLY | INCLUDE | P,R,D,C | R1 |
| AUTH-133 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,B | R1 |
| AUTH-134 | SOUNDPUB ONLY | INCLUDE | P,R,D,E,C,B | R1 |
| AUTH-135 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,C,O:cafe,O:buzzerhood-legacy | R2 |
| AUTH-136 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-137 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-138 | SOUNDPUB ONLY | INCLUDE | P,R,C | R1 |
| AUTH-139 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,C,B | R1 |
| AUTH-140 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:cafe,O:buzzerhood-legacy | R4 |
| AUTH-141 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |
| AUTH-142 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-143 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-144 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-145 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-146 | SOUNDPUB ONLY | INCLUDE | P,R,C | R1 |
| AUTH-147 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-148 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-149 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-150 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-151 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-152 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,O:buzzerhood-legacy | R2 |
| AUTH-153 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-154 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-155 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,E,T,O:buzzerhood-legacy | R2 |
| AUTH-156 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-157 | SOUNDPUB ONLY | INCLUDE | P,R,D,C | R1 |
| AUTH-158 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-159 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-160 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-161 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-162 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-163 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-164 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-165 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-166 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-167 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-168 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-169 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-170 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-171 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-172 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-173 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-174 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-175 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-176 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-177 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-178 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-179 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,C | R1 |
| AUTH-180 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-181 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-182 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,C,O:buzzerhood-legacy | R2 |
| AUTH-183 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-184 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-185 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-186 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,B | R1 |
| AUTH-187 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-188 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-189 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,C | R1 |
| AUTH-190 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-191 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-192 | SOUNDPUB ONLY | INCLUDE | P,R,E,T,Y,B | R1 |
| AUTH-193 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-194 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-195 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-196 | SOUNDPUB ONLY | INCLUDE | P,R,Y,B | R1 |
| AUTH-197 | SOUNDPUB ONLY | INCLUDE | P,R,A | R1 |
| AUTH-198 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-199 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:buzzerhood-legacy | R4 |
| AUTH-200 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-201 | OTHER PROJECT | EXCLUDE | O:academy,O:buzzerhood-legacy | R3 |
| AUTH-202 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,Y,C,B | R1 |
| AUTH-203 | SHARED | INCLUDE_SHARED_IDENTITY | P,R,A,O:cafe,O:buzzerhood-legacy | R2 |
| AUTH-204 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-205 | UNKNOWN | DEFER_NON_BLOCKING | P,R,O:cafe,O:buzzerhood-legacy | R4 |
| AUTH-206 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T | R1 |
| AUTH-207 | OTHER PROJECT | EXCLUDE | H,O:academy | R3 |
| AUTH-208 | SOUNDPUB ONLY | INCLUDE | P,R,D,L,E,C,B | R1 |
| AUTH-209 | UNKNOWN | DEFER_NON_BLOCKING | P,R | R4 |
| AUTH-210 | SOUNDPUB ONLY | INCLUDE | P,R,D | R1 |
| AUTH-211 | SOUNDPUB ONLY | INCLUDE | P,R,A,E,T,Y,B | R1 |


## Runnable local reconciliation check

Run this Python block from repository root. No network, writes, credentials or production access. It verifies every alias, evidence and decision against Phase1F, not just totals. It does not establish real-world ownership or validate provider authentication.

```python
from pathlib import Path
from collections import Counter
import re
base = Path('docs/migration')
expected = {}
mapping = {'SOUNDPUB ONLY': ('INCLUDE', 'R1'),
           'SHARED': ('INCLUDE_SHARED_IDENTITY', 'R2'),
           'OTHER PROJECT': ('EXCLUDE', 'R3'),
           'UNKNOWN': ('DEFER_NON_BLOCKING', 'R4')}
for line in (base / 'PHASE1F_AUTH_SCOPE.md').read_text(encoding='utf-8-sig').splitlines():
    p = [s.strip() for s in line.split('|')]
    if len(p) != 6 or p[1] not in mapping or not p[3].isdigit():
        continue
    aliases = re.findall(r'\b\d{3}\b', p[4])
    assert len(aliases) == int(p[3])
    for alias in aliases:
        key = 'AUTH-' + alias
        assert key not in expected
        category, rule = mapping[p[1]]
        expected[key] = (p[1], category, p[2], rule)
actual = {}
for line in (base / 'PHASE1G_AUTH_INCLUSION_CONTRACT.md').read_text(encoding='utf-8').splitlines():
    p = [s.strip() for s in line.split('|')]
    if len(p) == 7 and re.fullmatch(r'AUTH-\d{3}', p[1]):
        assert p[1] not in actual
        actual[p[1]] = tuple(p[2:6])
assert set(actual) == {'AUTH-%03d' % i for i in range(1, 212)}
assert actual == expected
counts = Counter(v[1] for v in actual.values())
assert counts == {'INCLUDE': 110, 'INCLUDE_SHARED_IDENTITY': 16,
                  'EXCLUDE': 29, 'DEFER_NON_BLOCKING': 56}
assert counts['UNKNOWN_BLOCKING'] == 0
assert sum('O:' in v[2] for v in actual.values()
           if v[1] == 'DEFER_NON_BLOCKING') == 6
assert all(set(v[2].split(',')) & set('DALETYCB')
           for v in actual.values() if v[1].startswith('INCLUDE'))
print('PASS: 211 distinct aliases; exact Phase1F evidence; 110/16/29/56/0')
```

## Admission and evidence limits

Auth inclusion set and reference behavior are deterministic at Phase1F snapshot; 126 qualifying users identified, 29 excluded, 56 safely deferred; zero critical identity representation questions remain for **synthetic Phase2 construction**. Deferred identities retain no implied login or ownership. Shared/external dependencies are preserved without requiring other projects to migrate. UUID preservation, provider validation, lifecycle boundaries and read-only manifest method are specified.

**Auth scope contract PASS is conditional on implementing the local-user/external-reference distinction and the isolated Phase2 boundary.** It does not certify a production export, ownership approvals, verified per-user provider mappings, password compatibility, session revocation, full text/JSON dependency inventory, current live counts or cutover security. Actual migration needs refreshed restricted manifests, dependency-edge validation, account/provider review and independent QA. If database target drops required external-reference support or a critical edge cannot be represented safely, reopen Auth scope rather than asserting PASS.

No global readiness score or overall Phase2 READY decision is assigned by Agent B. Database/Storage closure, boundary artifact, scoring and independent QA remain with coordinating agents. Prior Phase1F production gates stay intact for actual user migration/cutover.
