# Phase 3E royalty dependency inventory — Agent B

Scope: synthetic/disposable backend only. No server connections, production rows, Supabase migrations or other agents' files changed. This slice is implemented, not a claim of complete financial parity or Phase 3E acceptance.

## Authoritative evidence

Read Phase3E supplied request, root AGENTS.md, `.agents/skills/supabase/SKILL.md`, `PHASE3D_FINAL_REPORT.md`, `PHASE3C_CLOSEOUT_FINAL_REPORT.md`, `PHASE3_FINAL_REPORT.md`, `PHASE1F_FINAL_REPORT.md`, `PHASE1G_DATABASE_EXTRACTION_CONTRACT.md`, `PHASE1G_FUNCTION_REPLACEMENT_MAP.md` and financial definitions in `CANONICAL_SCHEMA.sql`. Supabase changelog and RLS documentation consulted; no Supabase service/API implementation added.

Historical extraction contract records 14,474 missing source financial rows, ten upload replay/count gaps and two paid invoice number/PDF gaps. These remain blockers to production reconciliation. Existing safe synthetic functionality does not reconcile that history.

## Tables and direct consumers

| Dependency | Classification | Replacement / boundary |
| --- | --- | --- |
| `royalties` | LEGACY_PRODUCTION_ONLY | Existing numeric(18,2) DSP amounts, artist/label allocations, ISRC/UPC and source-row provenance; new synthetic explicit-owner entries use `royalty_import_entries`. No automatic migration or guessed split. |
| `archived_royalties` | LEGACY_PRODUCTION_ONLY | Preserve financial history; no physical delete replacement. |
| `royalty_uploads` | LEGACY_PRODUCTION_ONLY | Existing pending/processing/success/partial/failed/replaced history; new immutable `royalty_import_batches` accepts all rows or none. |
| `composer_royalties` | LEGACY_PRODUCTION_ONLY | Financial Phase3E boundary blocked pending verified composer-code identity, uniqueness, allocation and correction contract. No write endpoint exposed. |
| Unresolved composer upload-history RPC backing relation (no verified canonical upload table) | PHASE3F_COPYRIGHT / LEGACY_PRODUCTION_ONLY | Do not invent missing DDL or associate ordinary royalty batches with composer upload IDs. |
| `profiles.balance`, `label_royalty_balances`, balance triggers | LEGACY_PRODUCTION_ONLY | Cached legacy values are not authority. Agent C finance events derive availability/reservations/settlements. |
| `payout_requests`, reservations, adjustments | Agent C/D | Not edited. Royalty corrections respect ledger account availability, including reservations. |
| `src/hooks/useRoyaltyData.ts` | Agent H frontend replacement | Stats, monthly, platform, country, periods, period summary, artist/label/track breakdown, comparison, top performers still require caller replacement. No broad analytical parity claimed. |
| `src/lib/fetchAllRoyalties.ts`; `Royalties`, `AllRoyalties`, `RoyaltySummary` pages | Agent H frontend replacement | Direct `royalties` pagination and client summaries must use backend projection; raw legacy allocations absent from this minimal slice. |
| `src/pages/UploadRoyalty.tsx` | Agent H frontend replacement | Direct upload history, release/track/profile lookups, spreadsheet parsing, Edge import/delete; adapt JSON records to contract below. |
| `src/hooks/useExportCsv.ts` | Agent H frontend replacement | Direct royalties/upload exports remain legacy; no unrestricted export endpoint added. |
| `ComposerRoyalties`, `CopyrightRoyaltySummary`, `components/royalty/ComposerRoyaltyUpload` | LEGACY_PRODUCTION_ONLY | Direct composer reads/inserts must fail closed in backend mode until financial mapping contract accepted. |
| `CopyrightRoyaltyUpload`, `CopyrightRoyaltyUploadHistory` | LEGACY_PRODUCTION_ONLY | Unresolved import/validation/history/delete RPCs; do not silently route to ordinary royalty imports. |

## RPC and Edge classifications

| Dependency | Classification | Behavior / replacement |
| --- | --- | --- |
| `commit_royalty_upload` | LEGACY_PRODUCTION_ONLY | Actor, filename, JSON rows, optional replacement/idempotency; existing allocation/replacement semantics are not copied. New strict synthetic `commit` revalidates persisted ownership. |
| `reverse_royalty_upload` | LEGACY_PRODUCTION_ONLY | New `correct` provides append-only full-batch offset, audit and available-balance guard; no legacy data imported. |
| `current_user_can_view_royalty`, `migration_reporting_label_id` | LEGACY_PRODUCTION_ONLY | New summary uses current locked actor and explicit beneficiary; historical label visibility parity not claimed. |
| `get_royalty_stats`, `get_dashboard_role_stats` | LEGACY_PRODUCTION_ONLY | New `summary` covers exact own/admin-selected earnings only; available balance belongs to Agent C. |
| `get_royalty_monthly_summary`, `get_royalty_periods`, `get_royalty_period_summary` | LEGACY_PRODUCTION_ONLY | Detailed legacy analysis deferred; new batch history carries period/source/totals. |
| `get_royalty_platform_summary`, `get_royalty_country_summary`, `get_royalty_label_breakdown`, `get_royalty_artist_breakdown`, `get_royalty_track_breakdown`, `get_royalty_comparison`, `get_royalty_top_performers` | LEGACY_PRODUCTION_ONLY | No platform/country/stream/split dimensions in minimal explicit-beneficiary synthetic contract. Do not fabricate analytical parity. |
| `rebuild_royalty_balances`, `update_balance_on_payout_status_change` | LEGACY_PRODUCTION_ONLY | Never invoke; new ledger invariant/trigger owned by Agent C. |
| `get_my_composer_royalties(text)` | LEGACY_PRODUCTION_ONLY | Read-only caller/composer-code filter: canonical routine grants admin all records; otherwise copyright role plus matching profile composer code. Returns id, composer code/name, total net, period, upload/time. Backend mapping not yet proven. |
| `import_composer_royalties`, `validate_royalty_csv_row`, `get_royalty_upload_history`, `delete_royalty_upload` | LEGACY_PRODUCTION_ONLY | Frontend contracts visible but canonical definitions unresolved. Fail closed; no aliases to different royalty semantics. |
| `generate_composer_code`, `admin_review_copyright_registration` | PHASE3F_COPYRIGHT | Legal identity/review workflow outside royalty financial slice. |
| Edge `process-royalty-upload` | BACKEND_API | New synchronous bounded JSON import replaces synthetic upload/parse/validate/preview/commit. No auto-provisioning by names, no provider. |
| Edge `delete-royalty-upload` | BACKEND_API | Full offset correction preserves originals. |
| Edge `send-royalty-notification` | WORKER / DEFER_CUTOVER | Agent C finance-event outbox exists; notification delivery not added or invoked here. |
| Xendit/invoice functions and release payment state | Agent E / MOCK_PROVIDER | Inspected classification in authoritative map; no provider/server calls. |

## Backend handoff for coordinator / Agent H

Files owned by this slice: `backend/src/royalties/{contracts,index,routes}.ts`, `backend/migrations/0015_royalties.sql`, `backend/test/royalties.test.ts`, this inventory. Agent C retains `0014_finance_ledger.sql` and `backend/src/finance/**`.

`createRoyaltiesService(pool)` exposes `preview(actor,input)`, `commit(actor,input,requestId)`, `history(actor,query)`, `detail(actor,id)`, `correct(actor,id,input,requestId)`, `summary(actor,query)`.

`registerRoyaltiesRoutes(app,service,authenticate)` exported from `backend/src/royalties/routes.ts`. Coordinator must call it from shared API bootstrap with existing bearer authentication/error handler and add service dependency/bootstrap/OpenAPI entries. Those shared files lie outside Agent B write scope.

| Method / path | Input | Output |
| --- | --- | --- |
| POST `/api/v1/royalties/imports/preview` | Statement below | `valid_rows, invalid_rows, total_amount, currency, unknown_mappings, duplicates, errors:[{row,code}], warnings, checksum` |
| POST `/api/v1/royalties/imports/commit` | Same statement; server recalculates checksum and totals | `{id,replayed}` |
| GET `/api/v1/royalties/imports` | `limit` 1..100 default 50, `offset` 0..100000 default 0 | `{items:[batch]}` newest first |
| GET `/api/v1/royalties/imports/:id` | UUID | Batch plus bounded `entries` |
| POST `/api/v1/royalties/imports/:id/correction` | `{reason}` nonempty <=1000 characters | `{id,replayed}`; different reason on corrected batch yields 409 |
| GET `/api/v1/royalties/summary` | Optional `beneficiary_id`, admin required for other owner | `beneficiary_id,currency,gross_earnings,corrections,net_earnings,status,available_balance:null` |

```json
{
  "source": "synthetic-dsp",
  "period": "2026-10",
  "currency": "IDR",
  "filename": "synthetic.json",
  "rows": [{
    "source_row_id": "synthetic-1",
    "beneficiary_id": "00000000-0000-4000-8000-000000000002",
    "release_id": "00000000-0000-4000-8000-000000000003",
    "track_id": "00000000-0000-4000-8000-000000000004",
    "gross_amount": "0.30",
    "deduction_amount": "0.10",
    "net_amount": "0.20"
  }]
}
```

This is parsed JSON upload, not multipart/CSV/XLSX. Frontend adapter can parse existing workbook locally and submit bounded explicit records; do not infer source/period/currency or unresolved share allocation. Unknown keys including browser balances/status/checksums are rejected. Up to 1000 rows; no partial acceptance. Read-only preview never persists rows. Currency fixed IDR, input/calculation/storage/display precision two decimals, no rounding at import: excess precision rejected. Integer minor-unit arithmetic and numeric(18,2) entries; numeric(24,2) batch/summary aggregation. Per-beneficiary batch net capped to ledger MAX_MINOR. Gross means pre-correction sum of net royalty entries, not DSP gross revenue.

Beneficiary must be active persisted track owner (release artist fallback). Track must belong to supplied release. Label splits, platform shares, composer splits, missing identities and manual beneficiary remapping are not assumed. Admin/superadmin import/history/detail/correction; active authenticated owner summary; admin may select other beneficiary. Live DB status/roles locked and rechecked inside transaction. Inactive/suspended actor fails 403. Anonymous 401 belongs to injected route authenticator.

Checksum includes canonical source/period/currency and canonical rows ordered by source-row ID. Decimal spelling and filename changes do not change checksum. Stable provider source-row IDs mandatory: same source/period/source-row in different content yields 409, including after correction. Full exact replay returns same batch without another ledger effect or audit. Unknown mapping and malformed row commit fail 400. Preview reports input duplicates; existing persisted overlaps are detected on commit.

## Agent C ledger integration contract

Uses existing Agent C `parseMoney`, `formatMoney`, `MAX_MINOR` and transaction-scoped `postEvent(db,input)`. Same transaction inserts batch, entries, `finance_accounts` if absent, `finance_events`, finance-trigger audit/outbox and royalty audit. Account locks sorted by beneficiary UUID. Imports globally serialized with transaction advisory lock; source-row unique constraint remains final duplicate guard.

Each positive beneficiary total produces one `ROYALTY_EARNING` with integer `amount_minor`; zero amounts intentionally produce no financial effect. `business_reference=royalty:<batch UUID>`, `idempotency_key=royalty:earning:<batch UUID>`, authenticated `actor_id`, currency IDR. Agent C triggers provide finance audit/outbox. No nested transaction or separate post-commit credit.

Correction inserts immutable batch-offset record and negative `ROYALTY_ADJUSTMENT`, same business reference, `idempotency_key=royalty:correction:<batch UUID>`. Original entries unchanged. Shared `postEvent` locks account and maps Agent C trigger insufficient-balance rejection to controlled 409 if value already spent/reserved. Any correction failure rolls back offset, events and audit. Per-beneficiary totals ordered consistently to avoid account-order inversion. Repeated same correction returns original effect; no physical delete or reimport of consumed source rows.

Batch status remains `UNRECONCILED` (or derived `VOIDED_WITH_OFFSET`). This does not claim legacy provider reconciliation. Ledger includes these synthetic earnings; royalty summary deliberately supplies no available balance. UI must use Agent C balance endpoint for spendable/reserved/settled values and must not present royalty totals as withdrawable balance.

## Verification and blockers

`cd backend; npx tsx --test test/royalties.test.ts`: ten passing synthetic tests. Tests cover exact large money, checksum/order normalization, malformed/duplicate/unknown preview rows, no preview mutation, replay exactly once, audit-failure rollback orchestration, forged/mismatched amount, overlapping rows, stale role, correction replay and insufficient balance. Transaction test double is not PostgreSQL race/trigger proof.

No servers allowed for this agent. Coordinator/QA must apply 0014 then 0015 to disposable PostgreSQL and prove runtime grants, SQL/trigger behavior, concurrent duplicate import, correction versus payout reservation, multi-beneficiary rollback, audit/outbox failure rollback and persisted history/summary. API bootstrap/OpenAPI, frontend replacement/browser acceptance, legacy financial parity, composer semantics, provenance reconciliation and independent DB QA remain required. Do not mark Phase3E DECOUPLED based on this slice alone.


