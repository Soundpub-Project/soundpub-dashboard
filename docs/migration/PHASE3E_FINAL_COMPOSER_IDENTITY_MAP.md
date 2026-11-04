# Phase 3E final composer identity map

Date: 2026-10-30 (Asia/Bangkok). Agent B. Decision: **PARTIAL evidence; BLOCKED for financial posting and composer payout eligibility**.

## Evidence boundary and precedence

Repository-only review. No SSH, shared/production Supabase inspection or mutation, import, provider operation, or financial posting occurred. No identity or entitlement mapping was created. Report-local handles below locate existing evidence; they are not composer codes, backend identities, or approved beneficiaries.

Acceptance authority reviewed: `PHASE3E_FINAL_REPORT.md`, `PHASE3E_INDEPENDENT_QA.md`, `PHASE3E_FINANCIAL_MODEL.md`, `PHASE3E_MONEY_RULES.md`, `PHASE3E_FINANCIAL_INVARIANTS.md`, `PHASE3E_TRANSACTION_MODEL.md`, `PHASE3E_PAYOUT_STATE_MACHINE.md`, `PHASE3E_RPC_REPLACEMENT_MATRIX.md`, `PHASE3E_PARITY_MATRIX.md`, and `PHASE3E_RECONCILIATION_REPORT.md`. Latest closeout authority: `PHASE3E_CLOSEOUT_FINAL_REPORT.md`, current decision at the top of `PHASE3E_CLOSEOUT_INDEPENDENT_QA.md`, `PHASE3E_CLOSEOUT_COMPOSER_ROYALTY_CONTRACT.md`, and `PHASE3E_CLOSEOUT_PROVENANCE.md`. Their composer gate remains open.

`CANONICAL_SCHEMA.sql` is the recorded 2026-10-27 `soundpub` schema baseline. Prefer its routine bodies, constraints, and RLS over historical `legacy-public-assets/full-schema.sql`, generated TypeScript types, or UI assumptions. Backend migrations/contracts establish current repository behavior, not deployed state. CSV exports establish only their own populations. No current production population is asserted.

## Proven schema relationships and missing joins

| Relationship | Evidence | Supported conclusion / limit |
| --- | --- | --- |
| Stored composer ID to RPC code | `CANONICAL_SCHEMA.sql:1466`, `get_my_composer_royalties(text)` | Return column is named `composer_code`; selected value is `cr.composer_id`. Non-admin predicate is `cr.composer_id = profiles.composer_code`, with `copyright` role required. This alias and exact equality are proven source behavior. They do not establish a unique beneficiary. |
| Legacy profile to composer code | `CANONICAL_SCHEMA.sql:3090`, `:3957`; backend `0006_user_profiles.sql:14` | Nullable text, no profile-code uniqueness constraint. Legacy index is nonunique; backend field has length ceiling 100 and runtime cannot update it. Neither schema supplies a verified composer registry. |
| Registration applicant to code | `CANONICAL_SCHEMA.sql:118`, `:154`, `:3936` | Registration stores `user_id`, applicant type and code. Admin review copies a nonnull code to the applicant's profile; only `active` grants the copyright role in that routine. Partial unique code index covers approved/contract lifecycle statuses, not every registration or profile. Applicant may be personal, band representative, or company label; applicant is not automatically every writer or payee. |
| Code generation | `CANONICAL_SCHEMA.sql:1232`, `generate_composer_code(text)` | Admin-only formatted result from profile-code maximum plus one. Routine does not persist/reserve that result or prove a unique beneficiary. Code format is not identity verification. |
| Registration to work | `CANONICAL_SCHEMA.sql:2982`, `:4649` | `copyright_registration_works.registration_id` has registration FK. Work contains composer/lyricist display names, ownership percentage, collaboration flag, cowriter JSON, optional ISRC/UPC and release metadata. This is evidence of a declared work, not an earning allocation. |
| Work to track/release | Same work table; backend `0008_release_tracks.sql:35` | Work has no `track_id` or `release_id` FK. ISRC/UPC are nullable text. Track `composer` text and contributor JSON do not bind a composer principal or prove entitlement. No reviewed royalty statement identifies a work or track. |
| Work share to royalty total | `CANONICAL_SCHEMA.sql:2989`, `:3001`; `src/pages/CopyrightRegistrationForm.tsx:380` | Work `ownership_percentage` is `numeric(5,2)`, defaults to 100 and checks each value within 0–100. Form supplies numeric percentage and `cowriters_json: []`. No earning-period allocation, approved cowriter identity/share model, cross-writer conservation, rounding or effective-date rule is established. Default 100 is not proof of 100% ownership. |
| Legacy account to backend principal | Backend `0001_foundation.sql:12`, `:29`, `0006_user_profiles.sql:3` | `external_identities` can link source auth identity to backend user with binding provenance; `identity_references` can retain unresolved references. No composer-specific verified binding or approved migration map was supplied. Do not cast composer code to UUID, reuse legacy UUID without binding, or resolve by name/email. |
| Royalty row to source batch | `CANONICAL_SCHEMA.sql:2915`, `:3560`; `FINANCIAL_INTEGRITY_BASELINE.md` | Composer totals have UUID primary key, text code/name, `numeric(18,2)` amount, nullable period/upload ID and timestamps. No upload FK or composer-period/source-event uniqueness constraint. No work, track, release, currency or share field. |

This narrows two earlier closeout statements without changing their decision: the RPC's `composer_id`/`composer_code` alias **is** explained by canonical SQL; a work-level percentage field **does** exist. Neither establishes backend beneficiary mapping or a posting allocation contract. Original reports remain unchanged.

## Local export identity register

Fresh local CSV inspection used `Import-Csv` and ordinal, case-sensitive code equality. Source: `docs/migration-scripts/exported-data/composer_royalties.csv`, `profiles.csv`, `user_roles.csv`; comparison source: `docs/soundpub-local-migration/exported-data/profiles_2026-07-10.csv` and `user_roles_2026-07-10.csv`.

Handles follow first occurrence of each exact composer code in the composer CSV. Data-row numbers exclude header; use the pinned file hash below before applying these locators. Raw identities, names and financial amounts are intentionally omitted.

| Source handle | Composer CSV data rows | Exact profile-code matches: first export / July export | Copyright-role evidence | Backend principal / work / track / earning share | Posting eligibility |
| --- | --- | --- | --- | --- | --- |
| EXPORT-C01 | 1, 2 | 1 / 1; same legacy profile ID | Matching profile has copyright role in first export; each export has one coded copyright profile | All UNRESOLVED; a legacy code match is only candidate linkage | BLOCKED |
| EXPORT-C02 | 3 | 0 / 0 | No code-matched profile | All UNRESOLVED | BLOCKED |
| EXPORT-C03 | 4 | 0 / 0 | No code-matched profile | All UNRESOLVED | BLOCKED |
| EXPORT-C04 | 5 | 0 / 0 | No code-matched profile | All UNRESOLVED | BLOCKED |
| EXPORT-C05 | 6 | 0 / 0 | No code-matched profile | All UNRESOLVED | BLOCKED |

Observed totals: six composer rows, six distinct row IDs, five exact codes, one repeated composer-period group. Rows 1–2 share code, display name, period and amount, but have distinct IDs and creation timestamps. Duplicate economic event versus legitimate separate earning is **UNKNOWN**; neither deduplicate nor credit both without source-event evidence. All six periods fit `YYYY-MM`; all six upload IDs are absent. Month syntax does not prove entitlement or source provenance.

First export: 65 profiles, one nonempty code, three copyright-role rows, one coded copyright profile. July export: 104 profiles, one nonempty code, three copyright-role rows, one coded copyright profile. No duplicate code group observed in either profile export; this does not establish a schema invariant or current uniqueness. Two copyright-role holders per export lack a nonempty code. A role alone cannot resolve an earning beneficiary.

## Snapshot conflict and work evidence

`PHASE1F_DATABASE_SCOPE.md:85` records zero composer royalties, zero copyright contracts, four registrations and four works in its inventory. Its later single read-only reconciliation snapshot, `2026-10-27T13:31:07.912225 UTC` (`:601`, `:613`), again records zero composer royalties. Six rows in the older CSV are a different population. No approved lineage explains their disappearance or proves whether they were test, replaced, removed, or otherwise disposed records. Do not restore them or turn their absence into an approved financial exception.

The four recorded works are population evidence only. No record-level registration/code/contract/work/share evidence links them to the five export codes or backend principals. No reviewed local copyright-work data export supplies that missing linkage. Empty composer population makes orphan-upload checks vacuous; it cannot prove import, identity isolation, allocation, correction or payout parity.

## Closeout blockers and required evidence

| ID | Unknown / blocker | Evidence required before closing |
| --- | --- | --- |
| C01 | Composer code to unique current beneficiary | Approved source-system/code/legacy-user/backend-user binding with verification provenance, duplicate/shared/reassigned-code disposition, current status/roles, and exact normalization policy. Existing code equality establishes candidate reads only. |
| C02 | Applicant, writer and payee relationship | Reviewed registration and contract evidence identifying whose rights are represented; explicit entitlement for representative/company applicants and cowriters. Profile, role, applicant or name alone cannot choose payee. |
| C03 | Work and recording identity | Approved work-to-track/release binding with ISRC/UPC collision/missing-value handling, source-row attribution, applicable rights and earning period. No title/name matching or artist-owner substitution. |
| C04 | Share and net-total meaning | Approved definition of preallocated total versus share calculation; percentage precision, per-work conservation, deductions, currency, rounding remainder, rights period and correction semantics. Stored percentage/default does not answer these. |
| C05 | Source event, replay and historical disposition | Authoritative statement/hash and row/event keys; rows 1–2 disposition; six-export-rows versus zero-snapshot lineage; batch ownership, overlap/replay rules and approval. Do not invent history from upload UUIDs or filenames. |
| C06 | Executable financial/import/read authorization | Persisted composer mappings and batch model, authorized backend service/routes, atomic ledger/audit/outbox, immutable offsets and adversarial identity/allocation/replay/correction checks. Existing preview supplies none of those financial effects. |
| C07 | Composer payout policy | Approved eligible roles/beneficiaries and destination, threshold, reconciliation and settlement policy. Current backend payout requires label/whitelabel; copyright role does not grant payout eligibility. |

All five export identities and all six export rows remain **UNRESOLVED for posting**. Zero approved backend beneficiary mappings established. No share allocation or financial exception approved. Financial gate remains Phase 3E responsibility even where UI/domain ownership is `PHASE3F_COPYRIGHT`; see `PHASE3E_FINAL_COMPOSER_CONTRACT.md` for final RPC disposition and tests.

## Evidence fingerprints

SHA-256 captures reviewed working-tree files; no Git commit is asserted for untracked migration work.

| File | SHA-256 |
| --- | --- |
| `docs/migration/CANONICAL_SCHEMA.sql` | `786688DB5D38B717FA3D3B33860D03C67438A09CA7CD11BC1ADFDE8D4E8776E8` |
| `docs/migration-scripts/exported-data/composer_royalties.csv` | `5FC0FF2526C2A42B69F0ECF3DC71BB414C29196548F563FDEF71B70972A621B9` |
| `docs/migration-scripts/exported-data/profiles.csv` | `129598EADCBEDC54E6DED7FCF2E958C7AB29CB5F4CDECB8BE3D68B8A2E81656D` |
| `docs/migration-scripts/exported-data/user_roles.csv` | `5E52966DB887CE5A14689BD1E2DFCC37E912AEC58CF2477F4EC1B3856AE67AC5` |
| `docs/soundpub-local-migration/exported-data/profiles_2026-07-10.csv` | `346981BB4285207BA25E1A81846C754164F1D55DDB4611DACDE482A5981DE7F4` |
| `docs/soundpub-local-migration/exported-data/user_roles_2026-07-10.csv` | `304F1CA7C30154CA1720E4998B98D9E64FB81AD8A695FE1015D7EE586378A8FF` |
