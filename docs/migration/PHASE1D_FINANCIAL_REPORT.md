# Phase 1D Financial Report

## Status

**FINANCIAL INTEGRITY = FAIL.**

Production read-only reconciliation completed 20 checks: 15 PASS / 5 FAIL.

| Failed invariant | Count |
| --- | ---: |
| Missing source-row provenance | 14,474 |
| Missing upload replay key | 10 |
| Upload inserted-count mismatch | 10 |
| Paid invoice missing invoice number | 2 |
| Paid invoice missing PDF path | 2 |

Zero arithmetic residual in other checks does not validate opening adjustments, provider/bank settlement, document bytes, refunds, or exact restore equality. No financial production data was changed to force green results.
