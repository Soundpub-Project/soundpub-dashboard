# Phase 3E Final Opening Balance Report — Agent D

Reviewed 2026-10-30, Asia/Bangkok. **Opening-balance migration: BLOCKED / CONTRACT ONLY.** No historical amounts imported, residuals calculated from production, opening events posted, repairs performed or approvals invented.

## Evidence and counts

Authority: `PHASE3E_CLOSEOUT_HISTORICAL_BALANCE_CONTRACT.md`, `PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md` and `PHASE3E_CLOSEOUT_PROVENANCE.md`. Historical observations: `PHASE1F_DATABASE_SCOPE.md` financial snapshot **2026-10-27T13:31:07.912225 UTC**; older adjustment detail in `PHASE1B_FINANCIAL_PAYMENT_REPORT.md`. These are inherited point-in-time evidence, not fresh production reads or an approved cutover. Commands, test counts, script limitations and SHA-256 fingerprints are recorded in companion `PHASE3E_FINAL_HISTORICAL_RECONCILIATION.md`.

| Measure | Result | Interpretation |
| --- | --- | --- |
| Legacy balance adjustments | 33 | Latest inherited population count; older report identifies all 33 as `migration_opening_balance`. |
| Independently justified / signed adjustment approvals supplied | 0 / 0 | None evidenced in reviewed inputs; no claim about evidence outside this review. |
| Adjustments accepted for carry-forward by this review | 0 | All 33 remain UNRESOLVED for justification. |
| Legacy profile balance comparisons | 182 | Zero arithmetic differences/negative balances reported; includes the 33 adjustments. Equality is not independent economic proof. |
| Legacy royalty rows / successful uploads | 14,474 / 10 | Missing source-row lineage for all rows; missing replay keys and count mismatches for all uploads. |
| Legacy requests / paid requests / reservation rows | 3 / 2 / 5 | Original allocation and settlement evidence needed; local proof paths alone are insufficient. |
| Approved cutover instant / beneficiary-currency residual schedule | NOT SUPPLIED / NOT COMPUTED | No approved expected amounts, signed per-account differences or zero-difference cutover proof. |
| Approved historical exceptions supplied | 0 | Proposed roles/dispositions below do not create exceptions. |
| Opening events posted / historical repair operations by Agent D | 0 / 0 | No production connection; only disposable synthetic setup/checks. |

No aggregate financial amount is inferred from counts. Older adjustment handles cannot be mapped to the latest snapshot without a private primary-key register. An adjustment count is not a distinct-beneficiary count.

## Why stored equality does not approve opening credit

Reviewed legacy migration `supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql` calculates each nonzero opening adjustment as:

```text
prior profile balance - artist/label royalty allocation totals
  + reservations on pending/approved/paid payouts
```

It inserts `source_type='migration_opening_balance'`, `source_id=profile_id` with uniqueness on `(source_type, source_id)`. This preserves a chosen prior balance. The formula and uniqueness do not supply the prior balance's independent source/settlement justification, approved cutover identity or signed reviewer approval. Passing a comparison that includes these residuals cannot validate those same residuals.

`20260904_label_aggregate_payouts.sql` spans label and artist funds; owner attribution must use historical allocation evidence. `20260907_reconcile_kaditrudit_payout_balance.sql` is a guarded one-off correction after double-debit-trigger removal, not a reusable opening amount. `20260816_rebuild_royalty_balances.sql` reconstructs mutable counters and may erase payout effects. None was executed or adopted as an opening strategy in this task.

Current backend `backend/src/finance/index.ts` and `backend/migrations/0014_finance_ledger.sql` accept eight kinds: ROYALTY_EARNING, ROYALTY_ADJUSTMENT, MANUAL_ADJUSTMENT, PAYOUT_RESERVATION, PAYOUT_RELEASE, PAYOUT_SETTLEMENT, PAYMENT_CHARGE, PAYMENT_REFUND. **`MIGRATION_OPENING_BALANCE` remains a future contract concept, not a supported posting kind in those contracts.** Do not silently substitute MANUAL_ADJUSTMENT to bypass approval or provenance requirements.

## Required dry-run accounting

Use exact IDR integer minor units / decimal strings at scale 2 with existing domain parsers; reject lossy precision and out-of-range input. No JS floating-point arithmetic or automatic negative residual credit.

```text
available = approved royalty earnings + approved royalty/manual adjustments
            + payout releases - payout reservations
reserved  = payout reservations - payout releases - payout settlements
settled   = payout settlements
```

Payment charges/refunds stay separate from withdrawable royalties. Legacy paid reservations remain deducted under the legacy model; translating to a settlement event must not subtract a second available-balance debit. Reconcile original payout allocation owners even after roster changes; never assign an unexplained artist/label difference to current label.

A future proposed residual equals independently approved cutover available balance minus independently reconstructed available balance, excluding these unapproved opening adjustments from its evidentiary base. Complete event reconstruction takes priority. Avoid counting the same credit in both reconstruction and opening residual. Residuals require per-beneficiary/currency private evidence; negative/ambiguous results require manual resolution. No residual or zero-difference result is computed here.

## Per-adjustment disposition

**FIN** = required independent Finance reviewer, with data migration lead responsible for private row mapping. Named assignee/acceptance and approval reference: **NOT SUPPLIED** for every row. Coordinator must route and obtain named ownership; role labels are not approval claims.

**OB-D1** = preserve original legacy entry; UNRESOLVED; exclude from automatic opening carry-forward and production financial acceptance. Obtain independently supported amount, beneficiary/currency, approved cutover, source/hash and original payout allocation/settlement links, then signed Finance disposition. No edit, deletion, replay or new credit authorized by this report.

Handles below reproduce the older Phase 1B report only. Each requires private primary-key mapping before any record-specific action; they are not verified identifiers in the later snapshot. The same owner/disposition applies to **each** of the 33 latest-snapshot adjustments, including any whose older handle cannot be mapped.

| Older report handle | Required owner | Disposition | Approval supplied |
| --- | --- | --- | --- |
| A01 | FIN | OB-D1 | None |
| A02 | FIN | OB-D1 | None |
| A03 | FIN | OB-D1 | None |
| A04 | FIN | OB-D1 | None |
| A05 | FIN | OB-D1 | None |
| A06 | FIN | OB-D1 | None |
| A07 | FIN | OB-D1 | None |
| A08 | FIN | OB-D1 | None |
| A09 | FIN | OB-D1 | None |
| A10 | FIN | OB-D1 | None |
| A11 | FIN | OB-D1 | None |
| A12 | FIN | OB-D1 | None |
| A13 | FIN | OB-D1 | None |
| A14 | FIN | OB-D1 | None |
| A15 | FIN | OB-D1 | None |
| A16 | FIN | OB-D1 | None |
| A17 | FIN | OB-D1 | None |
| A18 | FIN | OB-D1 | None |
| A19 | FIN | OB-D1 | None |
| A20 | FIN | OB-D1 | None |
| A21 | FIN | OB-D1 | None |
| A22 | FIN | OB-D1 | None |
| A23 | FIN | OB-D1 | None |
| A24 | FIN | OB-D1 | None |
| A25 | FIN | OB-D1 | None |
| A26 | FIN | OB-D1 | None |
| A27 | FIN | OB-D1 | None |
| A28 | FIN | OB-D1 | None |
| A29 | FIN | OB-D1 | None |
| A30 | FIN | OB-D1 | None |
| A31 | FIN | OB-D1 | None |
| A32 | FIN | OB-D1 | None |
| A33 | FIN | OB-D1 | None |

## Remaining opening-balance blockers

Required owner roles below remain unconfirmed assignments; named owners and evidence references must be supplied. No blocker is accepted as an approved exception.

| ID | Blocker | Required owner | Disposition / closure evidence |
| --- | --- | --- | --- |
| OB-01 | No approved cutover, complete frozen population or private A01–A33 mapping | Phase 3E coordinator + data migration lead | Keep migration blocked; establish approved timestamp, snapshot/hash, beneficiary/currency register and named reviewer. Historical collection must be separately scoped, SELECT-only, bounded READ ONLY and end ROLLBACK. |
| OB-02 | Missing independent basis for all 33 residual adjustments | Independent Finance reviewer | Apply OB-D1 individually; retain every unresolved difference and obtain signed amount/evidence/disposition. Zero arithmetic difference including the same residual is insufficient. |
| OB-03 | Missing statement/source-row/replay and upload-count reconciliation | Royalty data owner + royalty import maintainer | Close HR-02/03/04 in companion report before treating earnings as authoritative opening input. Do not fabricate keys or adjust counts to match. |
| OB-04 | Incomplete historical payout, destination, refund/fee and payment provenance | Payout/payments integration owners + Finance reviewer | Close HR-06/07/08/09; prove original owners, exact terminal effects and settlement without double subtraction or royalty/payment mixing. |
| OB-05 | No approved exception/exclusion controls or production eligibility admission | Phase 3E coordinator + royalty/payout backend maintainers + Finance reviewer | Keep historical balances outside production eligibility/cutover acceptance. Require scoped signed exceptions and enforceable exclusion from incorrect balances, payouts, readiness, provider submissions and replay. Existing UNRECONCILED quarantine is not independent approval. |
| OB-06 | Future opening posting kind, cutover replay identity and approved dry-run zero difference unimplemented/unproved | Finance backend maintainer + data migration lead + independent Finance reviewer | Retain contract-only status; any future separately authorized change needs immutable posting/audit, unique cutover/source key, exact approved residual and one-time replay proof. Do not implement or post in Phase 3E review. |

Any future approval must identify signer/authority, exact private record scope, source/evidence hashes, amount/currency, cutover, reason, missing-evidence impact, restrictions and review date. Independent Finance sign-off and dry-run difference of zero against an independently approved cutover snapshot are prerequisites to posting. `HISTORICAL_EXCEPTION` remains distinct from MATCHED and settlement proof.

## Executed validation and fingerprints

Fresh results shared with historical report: dedicated synthetic dry run **PASS** (1 matched / 1 mismatched / 1 unresolved / 1 ambiguous scenario, 0 exceptions; snapshots unchanged); focused finance/payment/payout/royalty suites **26 PASS / 0 FAIL / 0 SKIP**; local static check **PASS** for source inspection and absence of opening event kind. Static check now reports `rollback_contract=SATISFIED`; the SQL was not run against historical data. Commands and replayable static check are in companion report. No whole-phase regression, provider settlement, production snapshot or opening-posting acceptance is claimed.

Additional executed `Get-FileHash -Algorithm SHA256` evidence:

| File | SHA-256 |
| --- | --- |
| `supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql` | `C12BB8F7F7E8DD20BB71B76061FC4674A1B7F894B6D8053338FAD087B384434D` |
| `backend/src/finance/index.ts` | `7272CEE67FDA504E925571469443C799F56EA05F59366B41EA53E8106810495A` |
| `backend/migrations/0014_finance_ledger.sql` | `5F8B7C0BD0B021FCE3B5DC60655AB5CF50A1B8BB44101C89A4E82486EF42359B` |

Decision: **33 adjustments UNRESOLVED for justification; 0 accepted carry-forwards; no supplied approvals; no opening posting. Production historical balances and cutover remain BLOCKED.**
