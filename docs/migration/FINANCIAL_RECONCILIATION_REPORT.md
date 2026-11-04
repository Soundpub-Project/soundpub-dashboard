# Phase 1C Financial Reconciliation Report

**FINANCIAL INTEGRITY = BLOCKED. Read-only SQL checks: 15 PASS / 5 FAIL.**

Observed 2026-10-27, Asia/Bangkok. Fresh baseline snapshot: 2026-10-27 01:39:35 UTC / 08:39:35 Asia/Bangkok; runnable reconciliation followed in a separate read-only snapshot. Prior exception-level evidence remains in `PHASE1B_FINANCIAL_PAYMENT_REPORT.md` and `FINANCIAL_INTEGRITY_BASELINE.md`.

## Safety and reproducible check

Production SQL used SSH `maskhar@20.20.20.3`, starting in `/data/supabase/instances/supabase-01/config`, then `docker compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`. Every production SQL batch explicitly used REPEATABLE READ READ ONLY with 45-second statement timeout. No financial RPC or balance mutation was executed. Published evidence contains counts only.

Run `scripts/payment_reconciliation_readonly.sql` through that command. It returns 20 named criteria, failure counts and totals: **15 PASS / 5 FAIL**. SQL exit 0 means queries completed; consumers must inspect failed_checks rather than mistake exit 0 for financial acceptance. No repair SQL is included.

## Current exact invariants

PostgreSQL NUMERIC and IS DISTINCT FROM are used, without float sums or tolerance:

```text
artist_revenue = SUM(royalty artist allocations)
label_revenue = SUM(royalty label allocations)
balance = artist allocations + label allocations + adjustments
          - reservations for pending/approved/paid payouts
payout.amount = SUM(payout reservation amounts)
royalty.net_revenue = artist_revenue + label_revenue + soundpub_revenue
```

| Current population | Count |
| --- | ---: |
| Profiles / royalties / uploads | 182 / 14,474 / 10 |
| Composer / archived royalties | 0 / 0 |
| Adjustments / reservations | 33 / 5 |
| Approved / paid payouts | 1 / 2 |
| Paid / expired release payments | 4 / 5 |
| Paid / expired copyright payments | 0 / 2 |

Fifteen passing SQL criteria have zero discrepancies: stored balance, artist revenue, label revenue, negative balance, allocation equation, missing recipient, reservation amount, paid payout without reservation, paid payout without proof path, orphan composer upload, duplicate release provider invoice, duplicate copyright provider invoice, cross-domain provider invoice, paid release without timestamp, and paid release without provider reference. Empty populations do not prove composer or paid-copyright behavior. Paths do not prove bytes/readability.

## Historical exceptions and unresolved discrepancies

| Failing SQL criterion | Affected rows | Disposition |
| --- | ---: | --- |
| missing_source_row | 14,474 | Historical provenance absent; original source evidence required. Preserve rows. |
| missing_upload_replay_key | 10 | Historical replay identity absent; do not invent keys retroactively. |
| upload_inserted_count | 10 | All stored inserted_records are 0; actual royalty counts differ. total_records still matches each upload. Preserve metadata pending approved provenance rule. |
| paid_without_invoice_number | 2 | Historical invoice handles I01/I02 remain unresolved. |
| paid_without_pdf_path | 2 | Same I01/I02; document recovery and byte verification required. |

All **33 migration_opening_balance adjustments**, handles A01–A33 in the prior report, still require independent settlement evidence and finance disposition. Their presence is not an arithmetic mismatch, and zero current residual cannot establish correct historical opening balances or disprove historical double decrement. No historical loss was inferred or accepted.

Other unresolved acceptance requirements: canonical sub-cent payout precision mismatch; multi-paid release deletion refunds only one source payment; payment authenticity/client insert boundaries pending security-owner verification; missing active composer RPC contracts; bank/provider settlement and refund/reversal reconciliation; payout proof and invoice document bytes; exact source/isolated-restore comparison by every financial PK/column; independent QA. These were not retested on canonical production constraints here and prior failures remain open. No adjustment or balance was changed to make equations pass.

## Isolated SQL regression

Created local disposable `postgres:17-alpine` container `soundpub-phase1c-agentf` with `--network none`, no published ports and no production data/mounts. Ran, sequentially with ON_ERROR_STOP:

1. `scripts/royalty_financial_smoke.sql`.
2. `20261023041039_harden_royalty_financial_workflows.sql`.
3. `20261023053436_secure_royalty_period_imports_and_recipient_mapping.sql`.
4. `20261023055419_royalty_import_integrity_hotfix.sql`.
5. `20261023055703_royalty_artist_history_guard.sql`.
6. `scripts/royalty_financial_assertions.sql`.
7. `scripts/royalty_import_safety_assertions.sql`.
8. `scripts/royalty_import_adversarial_assertions.sql`.

**8 script stages PASS / 0 FAIL**, including **4 fixture/assertion scripts PASS / 0 FAIL** and four migration setup stages. These are script counts, not invented individual assertion counts. Minimal smoke schema lacks full canonical constraints/RLS and does not close prior canonical precision/refund failures. Removed container and disposable volume after testing. Never run mutation-capable fixture/assertion scripts against production.

Webhook recovery regression is **41 PASS / 0 FAIL**; original invoice-create regression remains **1 PASS / 2 FAIL**. See `XENDIT_IDEMPOTENCY_REPORT.md` for deployment, the subsequent incident lock, evidence limitations and unresolved durable recovery. Financial integrity and Phase 2 readiness remain blocked.
