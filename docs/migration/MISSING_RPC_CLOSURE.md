# Phase 1B missing RPC classification

Status: **BROKEN FEATURE** for four active copyright royalty calls; not DEAD CODE. No database change or migration-critical callable replacement implemented.

| RPC | Source flow | Classification | Verified reason |
|---|---|---|---|
| `validate_royalty_csv_row` | `src/pages/CopyrightRoyaltyUpload.tsx` validation loop | BROKEN FEATURE | Active caller; Phase 1 `pg_proc` exact-name search found no function in any schema; error branch silently drops failed row. |
| `import_composer_royalties` | `src/pages/CopyrightRoyaltyUpload.tsx` import action | BROKEN FEATURE | Active caller, absent live. Migration semantics and atomicity cannot be inferred from name. |
| `get_royalty_upload_history` | `src/pages/CopyrightRoyaltyUploadHistory.tsx` list | BROKEN FEATURE | Active caller, absent live. Page reports failed load. |
| `delete_royalty_upload` | `src/pages/CopyrightRoyaltyUploadHistory.tsx` deletion | BROKEN FEATURE | Active caller, absent live. Existing `delete-royalty-upload` Edge Function is a different API and cannot silently replace this RPC. |

Classification uses active JSX handlers and Phase 1 read-only production catalog evidence in `docs/migration/API_COMPATIBILITY_MATRIX.md`; no signed-in production UI run was performed. Before fixing, confirm workflow owners, financial accounting semantics and authorized callers. Test isolated role matrix, replay and financial reversals. Do not create placeholder SQL that appears to work but corrupts royalties.

## Phase 1C Agent D update — 2026-10-27

**Missing active RPCs resolved = FAIL / BLOCKED.** Preserve the Phase 1B classification above. A fresh all-schema pg_proc exact-name count under a production READ ONLY transaction returns zero implementations for each of the four names. Source callers remain active. No retirement decision, equivalent replacement or approved financial contract is evidenced.

Proposed disposition for coordinator review is **restore all four implementations**, retaining existing composer features. This is a proposed resolution, not completed closure. No placeholder functions or caller changes were made.

| RPC | Contract evidenced by source | Exact unresolved decision before implementation |
| --- | --- | --- |
| `validate_royalty_csv_row` | Four text inputs `_composer_code`, `_composer_name`, `_total_net_royalti`, `_period`; structured validity/errors plus normalized values | Composer identity authority, name-match rule, decimal/negative/zero amount rules and accepted period grammar; all must be enforced again during import. |
| `import_composer_royalties` | JSON row list, period, filename, replace flag; success/success_rows/error result | Atomic replacement scope, accounting effects, stable replay identifier, per-row error versus all-or-nothing semantics and immutable provenance. Existing caller has no explicit idempotency key. |
| `get_royalty_upload_history` | `_limit=100`; provenance/status/error fields | Separate composer versus distribution upload ownership, stable ordering and limit bounds. Shared royalty_uploads ledger cannot be assumed interchangeable. |
| `delete_royalty_upload` | `_upload_id`; deleted_royalty_records result | Authorized reversal versus destructive deletion, payout/settlement restrictions, balance reconciliation and retained audit evidence. |

The canonical composer_royalties table has text composer_id, monetary precision numeric(18,2), and a nullable upload_id with no composer-upload foreign key. The existing distribution ledger/reversal contract does not establish composer accounting rules. Restoring names alone would mask unresolved financial semantics. API/financial owner must resolve this table's authoritative linkage and transactions, or explicitly approve feature retirement with route/caller regression tests. No UNKNOWN classification remains; four BROKEN FEATURE contracts remain active and unresolved. Public production/browser verification and independent QA are still required after implementation/deployment.
