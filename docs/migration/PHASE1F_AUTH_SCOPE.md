# Phase 1F Auth Identity Isolation Audit

**Read-only production audit complete. Ownership classification is provisional; Auth migration gate remains BLOCKED.**

Snapshot: **2026-10-27 13:22:46 UTC** (20:22:46 Asia/Bangkok). Agent D. Direct SSH: `maskhar@20.20.20.3`; working directory: `/data/supabase/instances/supabase-01/config`; database access: `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`.

Every database inspection ran inside an explicit read-only transaction and ended with `ROLLBACK`. Final classification used repeatable-read isolation; `transaction_read_only=on`. No users, sessions, tokens, schemas, data, grants, services, configuration, or remote files changed. Only this local report was created. No credentials, emails, names, IP addresses, provider subjects, identity UUIDs, password hashes, or raw audit/metadata payloads are included.

## Classification result

| Classification | Identities | Meaning and disposition |
| --- | ---: | --- |
| SOUNDPUB ONLY | 110 | Soundpub operational evidence; no other-app UUID reference found within inspected database scope. Candidate Soundpub set, not proof of global exclusivity or permission to migrate. |
| SHARED | 16 | Soundpub operational evidence plus another-app record. Three have Cafe profiles; all 16 also have legacy Buzzerhood profiles. Preserve cross-app dependencies; review ownership before any migration. |
| OTHER PROJECT | 29 | Academy profile exists; no current Soundpub profile, role, actor activity, or operational relation. Exclude from default Soundpub migration scope; retain historical linkage for review. |
| UNKNOWN | 56 | Soundpub profile and role exist, but no qualifying operational evidence. Fifty have no observed other-app reference; six also have other-app records. Keep quarantined from automatic inclusion or exclusion. |
| **Total** | **211** | Every current `auth.users` identity occurs exactly once. |

**SOUNDPUB ONLY is a snapshot classification, not owner approval.** A shared database cannot establish absence of use by applications outside the inspected schemas, external identity providers, or deleted history. No identity is approved for migration by this report.

The 16 SHARED records comprise **3 with current Cafe membership evidence** and **13 with only legacy Buzzerhood overlap as other-app evidence**. Buzzerhood currently has a separate local user model: `buzzerhood.profiles.user_id` references `buzzerhood.users.id`, not `auth.users.id`. Its 49 profiles all have null `user_id`; its local users table is empty. Thirty-one profile primary keys exactly match current Auth UUIDs: 22 with Soundpub profiles and 9 Academy-only identities. This is a legacy cross-app footprint, not proof of active shared login. Retain conservative SHARED treatment until Buzzerhood ownership resolves those records.

The previously reported eight overlapping Soundpub identities are accounted for: **6 Cafe-profile overlaps and 2 Artikel-role overlaps**, with no overlap between those two sets. Three Cafe identities have Soundpub operational evidence; remaining five are UNKNOWN because Soundpub default records do not prove actual use. Legacy Buzzerhood adds 14 more Soundpub-profile overlaps, giving 22 total with other-app evidence: 16 SHARED and 6 UNKNOWN.

## Evidence rules and production findings

A Soundpub profile (`P`), generic/default role (`R`), default parent label, notification, email log entry, editable metadata marker, or being an audit target does **not** independently prove Soundpub ownership.

Qualifying operational evidence is at least one of: a domain role (`superadmin`, `admin`, `label`, `copyright`, `whitelabel`); artist profile; ownership of an artist roster; release relation; track relation; royalty relation; Soundpub audit actor; or business/payment/workflow relation. This establishes app linkage, not human intent, role correctness, or approved exclusive ownership.

| Evidence | Count / observation |
| --- | --- |
| Auth users | 211 |
| Soundpub profiles / distinct role users / role rows | 182 / 182 / 182 |
| Profile-less Auth users | 29; all 29 have Academy profiles, 27 have Academy roles |
| Profiles missing Auth parent / missing role | 0 / 0 |
| Profiles with parent label | 153; label assignment can be automatic |
| Managed-artist profiles | 105; marker alone does not decide ownership |
| Identities with qualifying Soundpub operational evidence | 126: 110 SOUNDPUB ONLY and 16 SHARED |
| Domain roles | 20 users: 1 superadmin, 3 admin, 15 label, 1 copyright; no whitelabel |
| Generic/default roles | 157 artist, 5 user; neither qualifies alone |
| Artist profiles | 81 users |
| Artist roster label ownership | 10 users across 132 artist rows |
| Release / track / royalty relations | 93 / 83 / 36 distinct users; counts overlap |
| Business/payment/workflow relations | 42 users; counts overlap other evidence |
| Current Auth users acting in Soundpub audit | 25; all have Soundpub profiles |
| Soundpub audit rows / auth audit rows / Soundpub auth events | 18,307 / 508 / 0 |
| Other-app evidence among Auth users | 51 distinct users: 22 with Soundpub profiles, 29 without |
| Academy / Cafe / Artikel / Carubra profile or role footprint | 29 / 7 / 3 / 1 current Auth users; counts overlap |

The read-only catalog sweep enumerated application base/partitioned tables and UUID columns across all non-system app schemas. Named identity columns were joined to current Auth UUIDs; foreign keys were inspected to distinguish Auth IDs, Soundpub profiles, app-local users, artists, and resource IDs. A supplementary sweep of **all UUID columns** found only four additional matching columns: Soundpub balance-adjustment `source_id`, payout `processed_by`, takedown `requester_id`, and Academy audit `resource_id`. Identity-semantic fields were incorporated; resource IDs were not treated as membership by themselves. No additional app schema with matching Auth UUIDs was found. This does not search arbitrary text or every embedded JSON value.

### Automatic provisioning contaminates naive ownership counts

Production `auth.users` has one non-internal trigger, `on_auth_user_created`, calling `soundpub.handle_new_user()`. Definition fingerprint: `3577cbe0ab2df86ba658404475bcc3ef` (MD5 of function source, not an identity or credential).

Production function reads user metadata `source_app` / `app` before app metadata, skips `utero_academy`, and otherwise provisions a Soundpub profile and artist role. Profile triggers `auto_assign_new_user_to_soundpub_label` and `auto_assign_artist_role` also attach default Soundpub label/role records. Therefore an unmarked signup from another app can acquire Soundpub-looking records. Function bodies were inspected with SQL string literals redacted; no function was invoked.

All 211 Auth users lack both inspected app-metadata ownership markers (`source_app`, `app`). User metadata has `source_app=soundpub` for 3 users, `utero_academy` for 10, absent for 198; user-metadata `app` is absent for all 211. User metadata is editable and is corroboration only. One UNKNOWN identity carries the Soundpub user marker; it remains UNKNOWN.

### Nineteen profile-less historical targets

Nineteen of 29 Academy-only identities occur as Soundpub profile audit targets: **57 rows**, comprising **19 profile inserts and 38 profile updates**. All 57 have null actor. None has current Soundpub actor activity or qualifying operational relation.

Their UUIDs also occur in `before_data.user_id` / `after_data.user_id` of **57 user-role audit rows**: **38 artist insertions and 19 artist removals**. No privileged Soundpub role was found in that history. Direct profile-target counts and nested user-role counts refer to separate audit rows. Profile-create audit timestamps are not within 60 seconds of Auth creation; provenance is not assumed to be the original signup trigger. No profile-delete audit target was found for these users, so removal mechanism and timing remain unproven.

These are historical default-profile/default-role traces, not evidence of current Soundpub ownership. OTHER PROJECT classification means exclude from the default migration set, **not** delete Auth identities or erase historical references.

## Provider, SSO and provenance limits

| Class | Email provider users | Google provider users | Multiple providers | No provider row | Auth audit actor present | Profile SSO subject present |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SOUNDPUB ONLY | 106 | 6 | 2 | 0 | 13 | 0 |
| SHARED | 14 | 3 | 1 | 0 | 3 | 0 |
| OTHER PROJECT | 29 | 1 | 1 | 0 | 19 | 0 |
| UNKNOWN | 51 | 4 | 0 | 1 | 1 | 11 |

Provider totals overlap where multiple providers exist: **200 email rows, 14 Google rows**, 214 rows across 210 users. One UNKNOWN identity has no provider row. Normalized-email duplicate groups, provider+subject collision groups, orphan identity rows, profile/Auth email mismatches, and soft-deleted Auth users: **0 each**. These checks compare values within PostgreSQL; no values were output.

Soundpub profiles mark 19 users as Google, 17 as ICCN, and 146 with no SSO provider. Only 11 have a stored SSO subject; all 11 remain UNKNOWN, all have email-only Auth provider linkage, and none has an app-metadata ownership marker. Profile provider labels are not provider-identity counts and cannot prove verified Google or Keycloak/ICCN issuer+subject binding. Issuer, audience, expiry, collision handling, and trust of these bindings were not established.

Auth audit has 508 rows and 53 distinct actor strings; 448 rows reference currently existing users. No top-level or `traits` `source_app` / `app` key was found in those rows. Global Auth activity establishes use of the shared Auth service, not which frontend initiated it. Soundpub `auth_events` is empty, so it provides no additional provenance.

Session revocation, refresh, logout, suspension, password migration, reset flows, signing-key rotation, external SSO verification, and authentication with production accounts were outside this read-only scope. Their readiness must not be inferred from classification or collision checks.

## Redacted identity inventory

Aliases are **snapshot-local ordinal labels**, generated inside PostgreSQL by `row_number() over (order by auth.users.id)`. No UUID prefix, hash of a user ID, email, provider subject, or reversible mapping is stored here. Additions/removals can change ordinals; rerun under an authorized restricted connection when resolving identities. Below, `001` means `AUTH-001`.

| Code | Evidence |
| --- | --- |
| P / R | Soundpub profile / role; insufficient alone |
| D | Soundpub domain role, excluding artist and generic user |
| A / L | Artist profile / artist roster label ownership |
| E / T / Y | Release relation / track relation / royalty relation |
| C | Current Auth identity is a Soundpub audit actor |
| B | Business/payment/workflow relation |
| H | Profile-less current Auth identity is a historical Soundpub profile/user audit target |
| O:academy | Academy profile |
| O:cafe | Cafe profile |
| O:artikel | Artikel role |
| O:carubra | Carubra profile |
| O:buzzerhood-legacy | Legacy Buzzerhood profile primary key matches Auth UUID; no current local-user binding |

Rows group identical evidence to keep inventory compact. **211 aliases, 211 distinct current users, no missing or duplicate assignment.**

| Classification | Evidence | Count | Redacted alias suffixes |
| --- | --- | ---: | --- |
| OTHER PROJECT | H,O:academy | 18 | 012, 044, 049, 092, 098, 099, 100, 102, 109, 110, 117, 123, 128, 148, 169, 184, 193, 207 |
| OTHER PROJECT | O:academy,O:buzzerhood-legacy | 9 | 078, 111, 115, 122, 137, 162, 171, 195, 201 |
| OTHER PROJECT | O:academy | 1 | 082 |
| OTHER PROJECT | H,O:academy,O:cafe,O:artikel,O:carubra | 1 | 106 |
| SHARED | P,R,A,C,O:cafe,O:buzzerhood-legacy | 2 | 008, 135 |
| SHARED | P,R,A,E,T,C,B,O:buzzerhood-legacy | 1 | 023 |
| SHARED | P,R,A,E,T,O:buzzerhood-legacy | 7 | 031, 032, 035, 067, 149, 150, 155 |
| SHARED | P,R,A,E,T,C,O:buzzerhood-legacy | 2 | 080, 094 |
| SHARED | P,R,D,C,O:buzzerhood-legacy | 1 | 129 |
| SHARED | P,R,A,O:buzzerhood-legacy | 1 | 152 |
| SHARED | P,R,A,C,O:buzzerhood-legacy | 1 | 182 |
| SHARED | P,R,A,O:cafe,O:buzzerhood-legacy | 1 | 203 |
| SOUNDPUB ONLY | P,R,A,E,T | 41 | 001, 003, 010, 016, 022, 024, 025, 028, 030, 039, 047, 050, 054, 059, 061, 063, 070, 072, 073, 077, 081, 083, 105, 108, 114, 127, 143, 151, 156, 158, 160, 164, 165, 172, 175, 178, 180, 185, 200, 204, 206 |
| SOUNDPUB ONLY | P,R,A,E,T,C,B | 1 | 002 |
| SOUNDPUB ONLY | P,R,A,C | 3 | 005, 019, 068 |
| SOUNDPUB ONLY | P,R,A | 6 | 006, 026, 142, 144, 181, 197 |
| SOUNDPUB ONLY | P,R,E,T | 4 | 007, 053, 091, 112 |
| SOUNDPUB ONLY | P,R,E,T,Y,B | 11 | 013, 027, 055, 101, 118, 136, 163, 173, 187, 190, 192 |
| SOUNDPUB ONLY | P,R,A,E,T,Y,B | 11 | 017, 029, 048, 069, 071, 093, 097, 103, 113, 141, 211 |
| SOUNDPUB ONLY | P,R,E,T,Y | 1 | 020 |
| SOUNDPUB ONLY | P,R,D,L,E,Y,B | 2 | 034, 133 |
| SOUNDPUB ONLY | P,R,A,E | 1 | 036 |
| SOUNDPUB ONLY | P,R,D | 6 | 041, 051, 096, 124, 168, 210 |
| SOUNDPUB ONLY | P,R,D,L,E,C,B | 2 | 056, 208 |
| SOUNDPUB ONLY | P,R,D,L,E,Y,C,B | 4 | 062, 120, 139, 202 |
| SOUNDPUB ONLY | P,R,A,E,T,B | 2 | 064, 186 |
| SOUNDPUB ONLY | P,R,Y,B | 6 | 084, 095, 154, 167, 191, 196 |
| SOUNDPUB ONLY | P,R,E,T,Y,C,B | 1 | 088 |
| SOUNDPUB ONLY | P,R,D,L | 1 | 089 |
| SOUNDPUB ONLY | P,R,D,C | 2 | 132, 157 |
| SOUNDPUB ONLY | P,R,D,E,C,B | 1 | 134 |
| SOUNDPUB ONLY | P,R,C | 2 | 138, 146 |
| SOUNDPUB ONLY | P,R,A,E,T,C | 1 | 179 |
| SOUNDPUB ONLY | P,R,D,L,C | 1 | 189 |
| UNKNOWN | P,R | 50 | 004, 009, 011, 014, 015, 018, 021, 033, 037, 038, 040, 042, 043, 045, 046, 052, 058, 060, 066, 074, 075, 076, 079, 085, 086, 087, 104, 107, 116, 119, 121, 125, 126, 130, 131, 145, 147, 153, 159, 161, 166, 170, 174, 176, 177, 183, 188, 194, 198, 209 |
| UNKNOWN | P,R,O:artikel,O:buzzerhood-legacy | 2 | 057, 090 |
| UNKNOWN | P,R,O:cafe,O:buzzerhood-legacy | 3 | 065, 140, 205 |
| UNKNOWN | P,R,O:buzzerhood-legacy | 1 | 199 |

## Read-only reproduction and runnable check

Run from the stated Docker directory through the stated SSH target. The following is a **psql script**, using `\gset` to assemble a SELECT-only UUID-reference CTE from catalog identifiers. No temporary tables, DDL, DML, stored functions, or production auth endpoints are used. Output contains ordinal aliases and evidence flags only. `partition_assert=1` passed for this snapshot; division by zero signals count/invariant drift and requires investigation, not mutation.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='60s';
SELECT 'snapshot',to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),current_setting('transaction_read_only');
SELECT string_agg(format('SELECT DISTINCT %L::text AS schema_name,%L::text AS table_name,%L::text AS column_name,t.%I AS user_id FROM %I.%I t JOIN auth.users u ON u.id=t.%I',n.nspname,c.relname,a.attname,a.attname,n.nspname,c.relname,a.attname),' UNION ALL ' ORDER BY n.nspname,c.relname,a.attnum) AS identity_refs
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE a.attnum>0 AND NOT a.attisdropped AND a.atttypid='uuid'::regtype AND c.relkind IN ('r','p')
AND n.nspname NOT IN ('auth','storage','vault','realtime','_realtime','supabase_functions','net','pg_catalog','information_schema')
AND n.nspname NOT LIKE 'pg_toast%'
AND (a.attname ~ '(^|_)(user_id|actor_id|author_id|reviewer_id|owner_id|profile_id|label_id|created_by|updated_by|uploaded_by|approved_by|reviewed_by|submitted_by|verified_by|recorded_by|invited_by|granted_by|finalized_by|assigned_by|generated_by|processed_by|requester_id|archived_by|changed_by|target_id)$' OR a.attname='id' AND c.relname IN ('profiles','user_profiles','users'))
\gset
WITH refs AS (:identity_refs), flags AS (
SELECT u.id,
EXISTS(SELECT 1 FROM soundpub.profiles p WHERE p.id=u.id) AS profile,
EXISTS(SELECT 1 FROM soundpub.user_roles r WHERE r.user_id=u.id) AS role,
EXISTS(SELECT 1 FROM soundpub.user_roles r WHERE r.user_id=u.id AND r.role::text IN ('superadmin','admin','label','copyright','whitelabel')) AS domain_role,
EXISTS(SELECT 1 FROM soundpub.artist_profiles p WHERE p.user_id=u.id) AS artist_profile,
EXISTS(SELECT 1 FROM soundpub.artists a WHERE a.label_id=u.id) AS label_artist,
EXISTS(SELECT 1 FROM soundpub.releases r WHERE u.id IN (r.label_id,r.artist_user_id,r.created_by)) AS release_link,
EXISTS(SELECT 1 FROM soundpub.tracks t WHERE t.artist_user_id=u.id) AS track_link,
EXISTS(SELECT 1 FROM soundpub.royalties r WHERE u.id IN (r.artist_user_id,r.label_user_id)) AS royalty_link,
EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.actor_id=u.id) AS audit_actor,
EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.target_id=u.id AND a.target_type IN ('profiles','profile','users','user','auth.users')) AS audit_target,
EXISTS(SELECT 1 FROM refs r WHERE r.user_id=u.id AND r.schema_name='soundpub' AND r.table_name IN ('artist_deletion_requests','archived_royalties','balance_adjustments','copyright_registration_files','copyright_registration_payments','copyright_registrations','payout_balance_reservations','payout_requests','release_payments','royalty_uploads','takedown_request_documents','takedown_status_history','takedown_requests')) AS business_link,
EXISTS(SELECT 1 FROM refs r WHERE r.user_id=u.id AND r.schema_name NOT IN ('soundpub','buzzerhood')) AS other_current,
EXISTS(SELECT 1 FROM buzzerhood.profiles p WHERE p.id=u.id) AS buzzerhood_legacy,
EXISTS(SELECT 1 FROM utero_academy.user_profiles p WHERE p.id=u.id) AS academy,
EXISTS(SELECT 1 FROM chatten_cafe.profiles p WHERE p.id=u.id) AS cafe,
EXISTS(SELECT 1 FROM artikel.user_roles r WHERE r.user_id=u.id) AS artikel,
EXISTS(SELECT 1 FROM carubra_db.profiles p WHERE p.id=u.id) AS carubra,
CASE WHEN u.raw_user_meta_data->>'source_app' IN ('soundpub','utero_academy') THEN u.raw_user_meta_data->>'source_app' ELSE 'ABSENT_OR_OTHER' END AS user_source
FROM auth.users u), scored AS (
SELECT *, (domain_role OR artist_profile OR label_artist OR release_link OR track_link OR royalty_link OR audit_actor OR business_link) AS soundpub_operational,(other_current OR buzzerhood_legacy) AS other_evidence FROM flags), classified AS (
SELECT *,CASE WHEN soundpub_operational AND NOT other_evidence THEN 'SOUNDPUB ONLY'
WHEN soundpub_operational AND other_evidence THEN 'SHARED'
WHEN NOT profile AND NOT soundpub_operational AND other_evidence THEN 'OTHER PROJECT'
ELSE 'UNKNOWN' END AS classification,
'AUTH-'||lpad(row_number() OVER(ORDER BY id)::text,3,'0') AS alias FROM scored)
SELECT alias,classification,concat_ws(',',
CASE WHEN profile THEN 'P' END,CASE WHEN role THEN 'R' END,
CASE WHEN domain_role THEN 'D' END,CASE WHEN artist_profile THEN 'A' END,
CASE WHEN label_artist THEN 'L' END,CASE WHEN release_link THEN 'E' END,
CASE WHEN track_link THEN 'T' END,CASE WHEN royalty_link THEN 'Y' END,
CASE WHEN audit_actor THEN 'C' END,CASE WHEN business_link THEN 'B' END,
CASE WHEN NOT profile AND audit_target THEN 'H' END,
CASE WHEN academy THEN 'O:academy' END,CASE WHEN cafe THEN 'O:cafe' END,
CASE WHEN artikel THEN 'O:artikel' END,CASE WHEN carubra THEN 'O:carubra' END,
CASE WHEN buzzerhood_legacy THEN 'O:buzzerhood-legacy' END) AS evidence
FROM classified ORDER BY alias;
WITH refs AS (:identity_refs), flags AS (
SELECT u.id,
EXISTS(SELECT 1 FROM soundpub.profiles p WHERE p.id=u.id) AS profile,
EXISTS(SELECT 1 FROM soundpub.user_roles r WHERE r.user_id=u.id) AS role,
EXISTS(SELECT 1 FROM soundpub.user_roles r WHERE r.user_id=u.id AND r.role::text IN ('superadmin','admin','label','copyright','whitelabel')) AS domain_role,
EXISTS(SELECT 1 FROM soundpub.artist_profiles p WHERE p.user_id=u.id) AS artist_profile,
EXISTS(SELECT 1 FROM soundpub.artists a WHERE a.label_id=u.id) AS label_artist,
EXISTS(SELECT 1 FROM soundpub.releases r WHERE u.id IN (r.label_id,r.artist_user_id,r.created_by)) AS release_link,
EXISTS(SELECT 1 FROM soundpub.tracks t WHERE t.artist_user_id=u.id) AS track_link,
EXISTS(SELECT 1 FROM soundpub.royalties r WHERE u.id IN (r.artist_user_id,r.label_user_id)) AS royalty_link,
EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.actor_id=u.id) AS audit_actor,
EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.target_id=u.id AND a.target_type IN ('profiles','profile','users','user','auth.users')) AS audit_target,
EXISTS(SELECT 1 FROM refs r WHERE r.user_id=u.id AND r.schema_name='soundpub' AND r.table_name IN ('artist_deletion_requests','archived_royalties','balance_adjustments','copyright_registration_files','copyright_registration_payments','copyright_registrations','payout_balance_reservations','payout_requests','release_payments','royalty_uploads','takedown_request_documents','takedown_status_history','takedown_requests')) AS business_link,
EXISTS(SELECT 1 FROM refs r WHERE r.user_id=u.id AND r.schema_name NOT IN ('soundpub','buzzerhood')) AS other_current,
EXISTS(SELECT 1 FROM buzzerhood.profiles p WHERE p.id=u.id) AS buzzerhood_legacy,
EXISTS(SELECT 1 FROM utero_academy.user_profiles p WHERE p.id=u.id) AS academy,
EXISTS(SELECT 1 FROM chatten_cafe.profiles p WHERE p.id=u.id) AS cafe,
EXISTS(SELECT 1 FROM artikel.user_roles r WHERE r.user_id=u.id) AS artikel,
EXISTS(SELECT 1 FROM carubra_db.profiles p WHERE p.id=u.id) AS carubra,
CASE WHEN u.raw_user_meta_data->>'source_app' IN ('soundpub','utero_academy') THEN u.raw_user_meta_data->>'source_app' ELSE 'ABSENT_OR_OTHER' END AS user_source
FROM auth.users u), scored AS (
SELECT *, (domain_role OR artist_profile OR label_artist OR release_link OR track_link OR royalty_link OR audit_actor OR business_link) AS soundpub_operational,(other_current OR buzzerhood_legacy) AS other_evidence FROM flags), classified AS (
SELECT *,CASE WHEN soundpub_operational AND NOT other_evidence THEN 'SOUNDPUB ONLY'
WHEN soundpub_operational AND other_evidence THEN 'SHARED'
WHEN NOT profile AND NOT soundpub_operational AND other_evidence THEN 'OTHER PROJECT'
ELSE 'UNKNOWN' END AS classification,
'AUTH-'||lpad(row_number() OVER(ORDER BY id)::text,3,'0') AS alias FROM scored)
SELECT 'partition_assert',1 / CASE WHEN count(*)=211 AND count(DISTINCT id)=211 AND count(DISTINCT alias)=211 AND count(*) FILTER(WHERE classification='SOUNDPUB ONLY')=110 AND count(*) FILTER(WHERE classification='SHARED')=16 AND count(*) FILTER(WHERE classification='OTHER PROJECT')=29 AND count(*) FILTER(WHERE classification='UNKNOWN')=56 AND count(*) FILTER(WHERE profile)=182 AND count(*) FILTER(WHERE classification IN ('SOUNDPUB ONLY','SHARED') AND NOT soundpub_operational)=0 THEN 1 ELSE 0 END AS pass FROM classified;
ROLLBACK;
```

## Migration decision

**Identity inventory: COMPLETE for current database snapshot. Approved Auth ownership: NOT ESTABLISHED. Migration isolation: BLOCKED.**

Resolve 56 UNKNOWN identities, obtain Soundpub and other-app owner decisions for 16 SHARED candidates and the six UNKNOWN cross-app overlaps, and validate external SSO/provider bindings before defining any executable inclusion list. SOUNDPUB ONLY candidates still require ownership approval and external-dependency checks. Preserve Academy-only users and historical Soundpub references; do not copy all 211 Auth users or infer 182 exclusive users from profiles. This report authorizes no migration, account deletion, session operation, or production change.

