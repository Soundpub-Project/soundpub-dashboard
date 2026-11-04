# Phase 1E Financial Reconciliation

## Status

**Financial integrity = FAIL.**

Fresh production read-only reconciliation returned 15 PASS / 5 FAIL:

| Invariant | Failures |
| --- | ---: |
| `missing_source_row` | 14,474 |
| `missing_upload_replay_key` | 10 |
| `upload_inserted_count` | 10 |
| `paid_without_invoice_number` | 2 |
| `paid_without_pdf_path` | 2 |

Arithmetic balances, allocations, reservations, duplicate invoice IDs, cross-domain invoice IDs, paid timestamps/providers, and payout proof paths passed the tested checks. These passes do not classify the five failing populations as approved legacy exceptions or prove provider/bank settlement, invoice bytes, refunds, and restore equality.

No production row was changed to force a pass. Required finance owner action: classify each failing population, approve documented legacy exceptions where valid, repair only proven corrupt state through reviewed scripts, and rerun reconciliation plus exact restore comparison.

**Gate: FAIL.**
