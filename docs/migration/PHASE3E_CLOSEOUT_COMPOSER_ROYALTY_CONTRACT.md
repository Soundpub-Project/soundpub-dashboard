# Phase 3E closeout — Composer royalty contract

Date: 2026-10-29. Agent C. Status: **BLOCKED for financial posting; read-only statement validation PASS**.

## Evidence and scope

Reviewed the original Phase 3E final report, independent QA, financial model, money rules, invariants, transaction model, payout state machine, RPC replacement matrix, parity matrix and reconciliation report. No original report was overwritten. No production inspection, SSH, Supabase mutation, financial import or provider operation occurred.

Repository evidence:

- `docs/migration/legacy-public-assets/full-schema.sql`: `composer_royalties` stores text `composer_id`, display name, nullable period, numeric total, optional upload ID and timestamps. No share, currency, work, release or track column. This historical export is evidence of a stored schema, not current production verification.
- `src/components/royalty/ComposerRoyaltyUpload.tsx`: direct insert of composer-period totals; accepts negative amounts with warning; permissive `parseFloat`; partial batch success; no replay key or financial reversal. These behaviors cannot establish safe posting parity.
- `src/pages/CopyrightRoyaltyUpload.tsx`: different `composer_code` input, required period, validation RPC, batch import RPC and replace flag. Validation RPC failures continue the loop, potentially omitting failed rows. Backend-mode guard disables this legacy component.
- `src/pages/CopyrightDashboard.tsx`: reader expects `composer_code`, total, period and upload ID. This differs from stored `composer_id`; equivalence is unproven.
- `docs/migration/SECURITY_DEFINER_AUDIT.md`: recorded `get_my_composer_royalties(text)` checks admin or copyright role and own composer code; shared-code ownership QA remains open.
- `docs/migration/PHASE3_FRONTEND_SUPABASE_INVENTORY.md` and `PHASE3_RPC_REPLACEMENT_MATRIX.md`: four composer import/history RPCs absent from the recorded catalog. Caller shapes are requirements evidence, not executable legacy behavior.
- `backend/src/royalties/index.ts`: existing artist mapping requires active persisted track/release artist ownership. This is not composer ownership and cannot be reused as a composer entitlement rule.

## Minimum executable contract

`backend/src/composer-royalties/contracts.ts` adds a pure preview boundary, deliberately not registered as an HTTP or financial service. It uses installed Zod and existing exact-money helpers. No database, principal, account, ledger, audit, provider or network writes occur.

| Field | Contract |
| --- | --- |
| Composer identity | Nonempty exact case-sensitive `composer_code`; `composer_name` is display only. Neither proves backend user ownership. No automatic account creation, name matching, or aliasing `composer_id` to a UUID. |
| Work/release/track | Unavailable in existing composer-period statement. Missing mapping always blocks posting. Artist track composer text is not an entitlement record. |
| Share percentage | Not supplied by observed source. No invented 100% rule, equal split or artist 70/30 split. Share fields, including fractional shares and invalid totals, reject at the strict boundary. |
| Earning amount | Already allocated composer-period total, nonnegative decimal string, at most two fractional digits and 16 integral digits. Exact bigint sum; zero permitted in preview. No recomputation or rounding. |
| Currency | Explicit IDR for this proposed synthetic contract; legacy display suggests IDR but persisted legacy totals alone do not prove currency. |
| Period | Required `YYYY-MM`; legacy optional periods and quarterly examples require manual classification, not silent conversion. |
| Source batch | Required explicit source and source batch reference. Preview does not establish durable uniqueness or provenance. |
| Status | Always `UNRECONCILED`, `posting_allowed=false`, with identity and work-allocation blockers. Syntactically valid does not mean entitled or reconciled. |
| Correction/reversal | Negative inputs, replace and correction fields reject. No destructive overwrite or deletion. Future approved correction must reference immutable original and append an audited offset under account locks; overspent corrections require manual review. |

Duplicate composer codes within one batch reject, even if names differ. Distinct composers retain their own supplied amounts; totals are summed exactly. Case variants are not guessed to be aliases, and neither may post. Unknown codes remain unresolved; no resolver or authoritative composer registry is invented. Preview replay is deterministic and has no financial effect. Durable import replay, overlap detection, replacement and composer correction remain unimplemented because ownership and source-event contracts are missing.

## Authorization and financial gate

Preview is an internal pure function, not an authorization mechanism. Any future route must resolve current persisted active role, authorize admin import and scope composer reads to a unique verified backend identity. User-editable names, codes and JWT metadata cannot grant ownership. Ambiguous/shared codes, unknown composer, absent work ownership, unknown currency, unresolved allocation or provider provenance must prevent ledger publication and payout eligibility.

Financial posting remains blocked pending an approved mapping from legacy composer ID/code to a unique backend principal and work entitlement, plus approved source-row identity and correction semantics. No source evidence supports a share-total or fractional-share precision rule. A future share-bearing format requires explicit business approval and a conservation/rounding contract before implementation. This closeout does not start Phase 3F or claim missing financial behavior is complete by reclassifying it.

## Composer RPC accounting

| RPC | Classification | Disposition |
| --- | --- | --- |
| `get_my_composer_royalties` | PHASE3F_COPYRIGHT | Recorded legacy read exists; safe backend equivalent blocked on verified composer identity and exact totals. |
| `validate_royalty_csv_row` | PHASE3F_COPYRIGHT | Absent recorded implementation. Pure strict statement preview now exists, but no parity claim or replacement route. |
| `import_composer_royalties` | PHASE3F_COPYRIGHT | Absent recorded implementation; no backend financial composer import. Posting remains an explicit Phase 3E blocker. |
| `get_royalty_upload_history` | PHASE3F_COPYRIGHT | Absent recorded implementation; requires durable composer batch model. |
| `delete_royalty_upload` | PHASE3F_COPYRIGHT | Absent recorded implementation; future reversal must preserve original financial history. Distinct from Edge Function `delete-royalty-upload`. |

UNEXPLAINED = 0. None qualify as MIGRATED_FINANCIAL. Classification describes domain ownership; it does not waive the composer financial gate.

## Focused verification

Run from repository root:

```text
node backend/node_modules/tsx/dist/cli.mjs --test backend/test/composer-royalties.test.ts backend/test/royalties.test.ts
npm --prefix backend run typecheck
```

Composer checks cover syntax-valid preallocated total, multiple composers, exact fractional money, rejected share fields/totals, duplicate composer, unknown identity/missing work quarantine, deterministic preview replay, correction/reversal rejection, strict trust boundaries and exclusion from artist royalty row schema. These are validation and rejection checks, **not proof of valid share allocation, durable composer import idempotency, financial correction or payout readiness**.

Executed 2026-10-29: focused suites **19 passed, 0 failed, 0 skipped** (9 composer boundary checks and 10 existing artist royalty checks). Backend TypeScript typecheck **PASS**. No DB environment or production credentials required. Composer posting gate remains **BLOCKED** for the missing business evidence identified above.
