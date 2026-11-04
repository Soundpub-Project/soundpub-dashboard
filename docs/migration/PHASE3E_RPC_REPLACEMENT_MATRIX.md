# Phase 3E RPC and Edge Replacement Matrix

Backend-mode classification; production legacy functions remain untouched. `MIGRATED` requires passing backend financial integration tests; mappings without those tests remain planned, not verified parity.

| Legacy RPC/function | Backend-mode disposition | Financial boundary |
| --- | --- | --- |
| `get_royalty_stats`, `get_royalty_monthly_summary`, `get_royalty_platform_summary`, `get_royalty_country_summary`, `get_royalty_periods`, `get_royalty_period_summary` | MIGRATED (summary API; full report parity pending) | Derived server-side royalty analytics; no browser RPC. |
| `get_royalty_label_breakdown`, `get_royalty_artist_breakdown`, `get_royalty_track_breakdown`, `get_royalty_comparison`, `get_royalty_top_performers` | LEGACY_PRODUCTION_ONLY | Legacy analytical projections are not authoritative financial postings; fail closed where backend report unavailable. |
| `commit_royalty_upload`, `reverse_royalty_upload`, `rebuild_royalty_balances` | MIGRATED (synthetic backend import/reversal/ledger) | Immutable postings, atomic batch transaction, deterministic replay. No production data repair. |
| `get_dashboard_role_stats` | MIGRATED (backend balance only); LEGACY_PRODUCTION_ONLY for unrelated dashboard counts | Backend ledger derives balance, not `profiles.balance`. |
| `request_payout`, `update_payout_status`, `complete_payout` | MIGRATED (backend payout API) | Authorization, lock, reservation, settlement, audit and idempotency in database transaction. |
| `delete_release_with_refund` | LEGACY_PRODUCTION_ONLY | Deletion is release lifecycle, not proof of payment refund; backend rejects/defer unsupported workflow. |
| `get_my_composer_royalties`, `import_composer_royalties`, `validate_royalty_csv_row`, `get_royalty_upload_history`, `delete_royalty_upload` (Copyright workflow) | PHASE3F_COPYRIGHT | Composer financial posting remains blocked until beneficiary and copyright contract reconciled; do not silently credit. |

| Legacy Edge Function | Backend-mode disposition | Boundary |
| --- | --- | --- |
| `process-royalty-upload`, `delete-royalty-upload` | BACKEND_API | Preview, commit, history and reversal; no remote function deploy. |
| `create-xendit-invoice`, `xendit-webhook` | MOCK_PROVIDER / WEBHOOK | Mock invoice and signed synthetic events only; no production Xendit calls. |
| `download-release-invoice` | DEFER_CUTOVER | Download disabled until authorized invoice artifact exists; status data alone is not a receipt. |
| `create-copyright-invoice` | DEFER_CUTOVER | Copyright payment workflow is Phase 3F; no guessed invoice contract. |
| `send-royalty-notification` | WORKER (deferred) | Financial commit must not imply email delivery; durable outbox first. |
| `send-app-email` (payout notification caller) | DEFER_CUTOVER | Payout transaction may enqueue event, but must never call production email. |

Unexplained financial RPCs in enumerated repo calls: 0. `MIGRATED` means target replacement identified; acceptance remains governed by Phase 3E final report and actual test evidence.
