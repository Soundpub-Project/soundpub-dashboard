# Phase 3E admission — Composer evidence closure

Date: 2026-10-30 (Asia/Bangkok). Agent C. **PARTIAL evidence; financial admission BLOCKED.**

**Exact unresolved migration-critical unknown count: 7 — C01, C02, C03, C04, C05, C06, C07. Closed: 0.** Count refers to the existing seven admission gates, not individual missing fields, export codes, or preview blocker strings. Five export codes and six export rows remain unresolved for posting. Approved backend beneficiary mappings established: **0**. Approvals or historical exceptions established: **0**.

## Scope and authority

Applied the supplied Agent C task: investigate identities, mappings, work linkage, share meaning and posting support using local evidence; preserve the dirty worktree; author only the two requested admission reports unless a safe, indispensable composer fix is proven. No such fix was proven. Existing preview and tests remain unchanged.

No fresh production evidence was supplied during this review. No SSH, production database/service inspection, Supabase operation, provider request, import, financial posting, deployment or traffic change occurred. Local CSV reads were evidence inspection, not test fixtures; executed tests used synthetic data only. Existing reports' production observations remain inherited and dated.

Authority reviewed in `docs/migration/`:

- Original acceptance: `PHASE3E_FINAL_REPORT.md`, `PHASE3E_INDEPENDENT_QA.md`, `PHASE3E_FINANCIAL_MODEL.md`, `PHASE3E_MONEY_RULES.md`, `PHASE3E_FINANCIAL_INVARIANTS.md`, `PHASE3E_TRANSACTION_MODEL.md`, `PHASE3E_PAYOUT_STATE_MACHINE.md`, `PHASE3E_RPC_REPLACEMENT_MATRIX.md`, `PHASE3E_PARITY_MATRIX.md`, `PHASE3E_RECONCILIATION_REPORT.md`.
- Closeout: `PHASE3E_CLOSEOUT_FINAL_REPORT.md`, current decision in `PHASE3E_CLOSEOUT_INDEPENDENT_QA.md`, `PHASE3E_CLOSEOUT_COMPOSER_ROYALTY_CONTRACT.md`, `PHASE3E_CLOSEOUT_PROVENANCE.md`.
- Latest admission authority: `PHASE3E_FINAL_CLOSEOUT_REPORT.md`, `PHASE3E_FINAL_INDEPENDENT_QA.md`, `PHASE3E_FINAL_COMPOSER_IDENTITY_MAP.md`, `PHASE3E_FINAL_COMPOSER_CONTRACT.md`, `PHASE3E_FINAL_PARITY_CLASSIFICATION.md`, `PHASE3E_FINAL_FINANCIAL_INVARIANTS.md`, and composer/source limits in `PHASE3E_FINAL_PROVENANCE_LEDGER.md` and `PHASE3E_FINAL_HISTORICAL_RECONCILIATION.md`.

Latest composer contract/classification supersedes older `PHASE3F_COPYRIGHT` assignment for all five financial composer RPCs: owner is `PHASE3E_FINANCIAL`; financially migrated: **0**; unexplained enumerated RPCs: **0**. Legal registration/contract workflow remains copyright scope. Complete classification does not close financial admission.

`CANONICAL_SCHEMA.sql` establishes recorded legacy schema/source behavior, not current deployment. Backend migrations through `0018` and current source establish repository support, not deployed state. CSVs establish only their own populations. No original report was edited.

## Fresh local evidence

| Question | Evidence and conclusion | Remaining limit |
| --- | --- | --- |
| Is `composer_id` the reader's `composer_code`? | `CANONICAL_SCHEMA.sql:1466`: returned `composer_code` selects `cr.composer_id`; non-admin read requires copyright role and exact equality with own profile code. Direct-table RLS at `:5117` also uses own-profile/code predicate. | Alias is proven source behavior, not beneficiary verification, approved normalization or unique identity. Reader does not establish earning rights. |
| Does code identify one profile? | Profile code is nullable text; index at `:3957` is nonunique. Backend `0006_user_profiles.sql:14` permits nullable text up to 100 characters, without code uniqueness; runtime profile updates exclude code. | One observed match is not current uniqueness or approved backend binding. |
| Does registration identify writer/payee? | Registration at `:118` belongs to an auth user; applicant types include personal, band representative and company label. Admin review at `:250` copies code to applicant profile; active status grants copyright role. Code uniqueness at `:3936` covers only listed approved/contract lifecycle statuses. Contract registration FK is at `:4601`. | Applicant, represented writers and financial beneficiary are not proven equivalent. No reviewed record-level contract establishes authority or payment entitlement. |
| Can generated codes prove identity? | `generate_composer_code` at `:1232` returns formatted maximum-plus-one derived from profiles. | No persisted reservation or verified beneficiary follows from generation. |
| Are works linked? | Work table at `:2982` has registration FK (`:4649`), display names, optional ISRC/UPC, collaboration flag, cowriter JSON and ownership percentage. | No work-to-track/release FK or royalty-to-work link. Optional identifiers and contributor text cannot safely choose recording, writer or payee. |
| Does percentage define earning split? | `ownership_percentage numeric(5,2)` defaults to 100 and individually checks 0–100 (`:2989`, `:3001`). Registration form at `src/pages/CopyrightRegistrationForm.tsx:380` writes percentage and empty cowriter JSON. | No approved cross-writer conservation, rights period, deductions, currency, fractional-share rule or rounding/remainder contract. Default 100 is not evidence of full ownership. |
| Are statement rows traceable? | Composer table at `:2915` has UUID row ID, text code/name, numeric total, optional period/upload ID, timestamps. Reviewed schema supplies no upload FK, stable economic-event uniqueness, currency, work, track or share columns. | Row UUID and display name do not identify an earning event or prove its amount belongs to a beneficiary. |
| Is composer financial posting implemented? | Only `backend/src/composer-royalties/contracts.ts` exists in that module. Pure preview always prohibits posting. `backend/src/main.ts:60`, `backend/src/api/financial.ts:16`, and migrations `0001`–`0018` provide artist finance, not composer entitlement/import/read/correction tables or service. | Generic ledger/account primitives and artist ownership checks do not implement composer financial authorization. |

## Export population and candidate identity register

Re-read CSVs with Python standard-library `csv.DictReader`, UTF-8 BOM handling and exact case-sensitive string equality; no name/email matching or code normalization. Report handles follow first code occurrence in the pinned composer CSV. Data rows exclude header. Handles are locators, not assigned composer identities or approved mappings.

| Handle | Composer CSV data rows | Exact profile-code matches: first / July export | Evidence ceiling | Posting |
| --- | --- | --- | --- | --- |
| EXPORT-C01 | 1, 2 | 1 / 1; same legacy profile ID | Matching profile has copyright role in both exports; candidate legacy linkage only | BLOCKED |
| EXPORT-C02 | 3 | 0 / 0 | No exact profile-code match | BLOCKED |
| EXPORT-C03 | 4 | 0 / 0 | No exact profile-code match | BLOCKED |
| EXPORT-C04 | 5 | 0 / 0 | No exact profile-code match | BLOCKED |
| EXPORT-C05 | 6 | 0 / 0 | No exact profile-code match | BLOCKED |

Observed: six distinct row IDs, five codes, six absent upload IDs, one repeated code-period group. Rows 1–2 have the same code, name, period and amount but distinct IDs and creation timestamps. Duplicate economic event versus separate legitimate earnings remains **UNKNOWN**; neither deduplicate nor credit both.

First profile export: 65 profiles, one populated code, three copyright-role rows and one coded copyright profile. July export: 104 profiles, one populated code, three copyright-role rows and one coded copyright profile. Neither has a duplicate populated exact code; absence of duplicates in exports does not establish a schema constraint or current population.

Additional mapping evidence: `docs/soundpub-local-migration/exported-data/id-mapping.json` contains 104 UUID-string pairs, including the candidate legacy profile, all with changed UUIDs. The adjacent `import-csv-soundpub.js:277` creates Supabase Auth users or finds existing users by email, records old-profile-to-auth-user IDs, then writes a flat map (`:319`). This local map supplies no backend `application_user_id`, verification timestamp, binding provenance, entitlement or approval. Its existence does not prove which importer branch produced any pair. Do not promote it into approved `soundpub.backend_users` or composer mapping, or infer backend identity from UUID shape/email.

Backend `0001_foundation.sql:12` has `external_identities` with source identity and binding provenance; `:29` has unresolved `identity_references`. No reviewed composer-specific verified binding connects these structures to the five export codes.

`PHASE1F_DATABASE_SCOPE.md:85` records four registrations and four works, but no record-level code/work/contract/share data was supplied linking those populations to these codes. Its later read-only snapshot at **2026-10-27T13:31:07.912225 UTC** (`:601`, `:613`) records **zero composer royalty rows**. Older six-row export and zero-row snapshot are different populations with unexplained lineage. Neither restoring rows nor treating them as approved exclusions is justified. Empty-population orphan checks provide no positive composer lifecycle proof. Current production count remains unknown.

## C01–C07 closure register

Every row remains OPEN. Required approving authority and record-level approval evidence have not been supplied; descriptions below identify evidence needed, not invented owners or approvals.

| ID | Finding | Evidence required to close |
| --- | --- | --- |
| C01 — OPEN | Code-to-unique-current-beneficiary unresolved. Alias, one legacy candidate and old-to-Supabase UUID map do not prove backend identity. | Reviewed source-system/code/legacy-user/backend-user binding with verification provenance; exact normalization policy; shared, duplicate and reassigned-code disposition; current principal status/roles. |
| C02 — OPEN | Applicant/writer/payee authority unresolved. Schema permits representatives and companies. | Reviewed registration and actual contract evidence identifying writers, represented rights, beneficiary/payee authority and effective period, including company/representative and cowriter cases. |
| C03 — OPEN | Statement-to-work-to-recording entitlement unresolved. Optional ISRC/UPC and names are insufficient. | Approved source-event/work/track/release links, applicable rights and earning period; missing/colliding identifier handling; explicit disposition of unresolved links. |
| C04 — OPEN | Meaning of supplied net total, shares and corrections unresolved. Work percentage exists but supplies no earning-allocation model. | Approved preallocated-total versus calculated-share definition; currency, deductions, share precision/conservation, rights/effective dates, rounding/remainder and immutable correction/spent-value policy. |
| C05 — OPEN | Source-event identity, replay and historical disposition unresolved. Upload IDs absent; repeated pair and six-versus-zero lineage unexplained. | Authoritative statement/artifact hash, stable event/row keys, batch provenance, overlap/replay decisions, repeated-pair disposition and approved population lineage. |
| C06 — OPEN | Authorized composer financial read/import/post/correction lifecycle absent. Existing preview is safe but has no durable or financial effects. | After economic/identity evidence: persisted approved mappings and source/batch model; current authorization and isolation; atomic history/ledger/audit/outbox; durable replay/conflict and offset behavior; synthetic adversarial and independent acceptance evidence. |
| C07 — OPEN | Composer payout eligibility/destination/settlement policy unapproved. Current request requires label/whitelabel. | Approved composer beneficiary/role policy, verified destination, threshold, reconciled earnings and settlement rules; tested enforcement without granting unrelated roles as workaround. |

**Unknowns before review: 7. Unknowns closed by this review: 0. Unknowns remaining: 7.** C06's missing implementation is a proven fact; admission capability remains unresolved. Five unresolved code mappings and two coarse preview blockers are not alternative unknown counts.

## Fresh verification and change boundary

| Command from repository root | Observed result | Evidence limit |
| --- | --- | --- |
| `node backend/node_modules/tsx/dist/cli.mjs --test backend/test/composer-royalties.test.ts backend/test/royalties.test.ts` | PASS: 19 passed, 0 failed, 0 skipped; nine composer tests and ten artist royalty unit tests | Synthetic preview/boundary and artist query-double orchestration only; no composer posting, HTTP, DB, allocation or payout lifecycle. |
| `npm --prefix backend run typecheck` | PASS, exit 0 | Compile-time consistency only. |
| `node src/components/finance/backend-mode.test.cjs` | PASS, exit 0; zero Supabase accesses in exercised harness | Guard/adapter harness and wrapper assertions, not full browser/copyright decoupling. |
| `node scripts/phase3e-static-scan.cjs` | PASS, exit 0; ten backend-only files and 24 guarded legacy callers | Bounded static inventory, not runtime production evidence. |

Only authored paths:

- `docs/migration/PHASE3E_ADMISSION_COMPOSER_CLOSURE.md`
- `docs/migration/PHASE3E_ADMISSION_COMPOSER_POSTING_CONTRACT.md`

No code/test/schema edit was indispensable. Existing dirty changes were not reverted. Posting remains prohibited; no Phase 3E PASS or Phase 3F readiness follows from this review.

## Evidence fingerprints

SHA-256 identifies reviewed working-tree bytes, not deployment, signatures or approval. Raw identities and amounts omitted from this report.

| File | SHA-256 |
| --- | --- |
| `docs/migration/CANONICAL_SCHEMA.sql` | `786688DB5D38B717FA3D3B33860D03C67438A09CA7CD11BC1ADFDE8D4E8776E8` |
| `docs/migration-scripts/exported-data/composer_royalties.csv` | `5FC0FF2526C2A42B69F0ECF3DC71BB414C29196548F563FDEF71B70972A621B9` |
| `docs/migration-scripts/exported-data/profiles.csv` | `129598EADCBEDC54E6DED7FCF2E958C7AB29CB5F4CDECB8BE3D68B8A2E81656D` |
| `docs/migration-scripts/exported-data/user_roles.csv` | `5E52966DB887CE5A14689BD1E2DFCC37E912AEC58CF2477F4EC1B3856AE67AC5` |
| `docs/soundpub-local-migration/exported-data/profiles_2026-07-10.csv` | `346981BB4285207BA25E1A81846C754164F1D55DDB4611DACDE482A5981DE7F4` |
| `docs/soundpub-local-migration/exported-data/user_roles_2026-07-10.csv` | `304F1CA7C30154CA1720E4998B98D9E64FB81AD8A695FE1015D7EE586378A8FF` |
| `docs/soundpub-local-migration/exported-data/id-mapping.json` | `5AC8B92894A32EFB81C823DCA18E91C56132A8A02A27A771373493105CC4BB4E` |
| `backend/src/composer-royalties/contracts.ts` | `54E199418321E6BEE8DC5F4AF9950108343D1BA4C9135524A197C1A8F1956F67` |
| `backend/test/composer-royalties.test.ts` | `83BC9DB432127DA928A4B158645E50AA8FC8569E6C35FBF4869D3EB161AF7BD1` |
