# Phase 3E Admission — Opening Balances

Agent D. Reviewed 2026-10-30, Asia/Bangkok. **BLOCKED / CONTRACT ONLY. 33 inherited adjustments unresolved for independent justification; 0 approved carry-forwards; 0 opening events posted.**

## Evidence and exact counts

Inherited authority: final opening/historical/provenance reports and closeout historical balance/reconciliation contracts; full supplied task, including sections 16–39, read from `C:/Users/bimok/.codex/attachments/6d88eb07-6586-4834-a5f6-e178acd9e4c1/Pasted text.txt`. Historical population from `PHASE1F_DATABASE_SCOPE.md`, **2026-10-27T13:31:07.912225 UTC**; older adjustment reason/ordinal detail from Phase 1B. No current production financial snapshot, approved cutover or signed residual schedule is supplied. Parent Agent B final handoff received and both production admission reports read: access BLOCKED, connection failed before BEGIN, mutation 0. Parent prohibits production SQL; none attempted by Agent D. Only four named admission reports are written.

| Measure | Count / state | Meaning |
| --- | ---: | --- |
| Legacy balance adjustments | 33 | Older report identifies all as `migration_opening_balance`; current private row mapping not supplied. |
| Independently justified adjustments evidenced / signed adjustment approvals supplied | 0 / 0 | Evidence reviewed, not a claim about approvals held elsewhere. |
| Adjustments unresolved for independent justification | 33 | Preserve original entries; no automatic carry-forward. |
| Carry-forwards accepted by this review / supplied approved historical exceptions | 0 / 0 | No fabricated exception or approval. |
| Legacy profile comparisons | 182 | Zero arithmetic differences reported, including residual adjustments; not economic validation. |
| Contributing royalty rows / successful uploads | 14,474 / 10 | All rows lack source-row identities; all ten uploads lack replay keys and have count mismatches. |
| Requests / locally paid requests / reservations | 3 / 2 / 5 | Full historical owner-allocation, destination and terminal proof missing. |
| Distinct affected beneficiaries / approved per-currency residual totals | UNKNOWN / NOT COMPUTED | Adjustment count is not a verified distinct-beneficiary count. |
| Approved cutover / independent zero-difference proof | NOT SUPPLIED / NOT COMPUTED | Missing expected balance cannot be assumed zero. |
| Opening postings / historical repair operations in this assignment | 0 / 0 | No database, synthetic fixture or provider execution. |

No source financial amounts or aggregate opening amount are inferred. New local profile export counts **65 / 104** belong to separate older populations; they cannot replace the 182-profile historical capture or approve residuals.

## Why formula equality cannot approve the residual

Reviewed `supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql` derives nonzero legacy adjustments as:

```text
opening_adjustment = prior profile balance
                   - artist/label royalty allocation totals
                   + reservations on pending/approved/paid payouts
```

It inserts `source_type='migration_opening_balance'`, `source_id=profile_id`, with `(source_type, source_id)` replay uniqueness. This preserves the prior chosen balance. It does not establish that balance's source, correct beneficiary, trusted settlement, approved cutover or independent approval. Comparing against a formula containing the same residual is circular evidence.

Legacy `20260816_rebuild_royalty_balances.sql` rebuilds mutable counters and may erase payout effects. `20260904_label_aggregate_payouts.sql` spans label/artist profile funds; use historical allocations, not today's roster. `20260907_reconcile_kaditrudit_payout_balance.sql` is a guarded one-off double-debit correction, not a reusable opening credit. None was executed or adopted here.

Current finance source and `0014_finance_ledger.sql` accept eight event kinds: `ROYALTY_EARNING`, `ROYALTY_ADJUSTMENT`, `MANUAL_ADJUSTMENT`, `PAYOUT_RESERVATION`, `PAYOUT_RELEASE`, `PAYOUT_SETTLEMENT`, `PAYMENT_CHARGE`, `PAYMENT_REFUND`. `MIGRATION_OPENING_BALANCE` remains an unsupported future contract concept. Substituting `MANUAL_ADJUSTMENT` would not satisfy approval or provenance requirements. No implementation change is authorized.

## Required independent reconstruction

```text
available = approved royalty earnings + approved royalty/manual adjustments
            + payout releases - payout reservations
reserved  = payout reservations - payout releases - payout settlements
settled   = payout settlements
```

Use exact IDR decimal strings/integer minor units at accounting scale 2 and existing domain range checks. No floats, silent rounding, unsupported provider precision or currency inference. Charges/refunds remain separate from withdrawable royalty balances.

Legacy paid reservations are already subtracted under legacy accounting. Translating a reservation into a terminal settlement must not debit available again. Preserve original allocation owners through roster changes; never silently move an artist's unexplained difference to a current label.

At a fixed independently approved cutover, future proposed residual equals **approved legacy available minus independently reconstructed available**, excluding unapproved residual adjustments from the evidentiary base. Complete event reconstruction takes priority; never count the same earning in both reconstructed credits and an opening residual. Negative or ambiguous residuals need explicit review, not automatic credit. No residual is computed from current available evidence.

Any future opening contract needs exact beneficiary/currency, signed independent Finance approval, source/cutover identity and hashes, immutable posting/audit, unique cutover/source replay key, one-time replay proof and dry-run zero difference against the independently approved balance. These are requirements, not a new approval request or permission to post.

## Adjustment disposition register

**OB-D1 applies individually to every one of the 33 inherited adjustments:** proposed opening classification **`MANUAL_REVIEW_BEFORE_MIGRATION`**; preserve legacy entry; independent justification UNRESOLVED; exclude from automatic opening carry-forward and migration financial acceptance. Obtain private primary-key/beneficiary/currency/cutover/evidence mapping, original contributing payout allocations/settlement and exact signed Finance disposition. This is a review recommendation; no database exclusion flag was set or implementation enforcement proven.

Section 35 allows exactly one opening disposition from `RECONSTRUCTABLE`, `APPROVED_MIGRATION_OPENING_BALANCE`, `MANUAL_REVIEW_BEFORE_MIGRATION`, `EXCLUDE`, `BLOCKS_CUTOVER`. The register below proposes the same one review class for each older handle; it does not certify completed current-row disposition or owner acceptance.

| Required field — applies individually to A01–A33 | Available evidence / missing verification |
| --- | --- |
| Beneficiary | Private primary-key/beneficiary mapping NOT SUPPLIED; no name/email inference. |
| Currency | Historical per-row currency NOT VERIFIED; backend IDR convention is not evidence of original currency. |
| Amount | Independent per-adjustment amount NOT VERIFIED; no zero or balancing amount assumed. |
| Source | Older Phase 1B register identifies `migration_opening_balance`; original economic source/evidence hash not supplied. |
| Justification | Independent economic justification NOT VERIFIED for all 33. |
| Historical derivation | Residual formula above explains legacy construction only; original earnings/payout/cutover derivation unproven. |
| Reconciliation evidence | Stored arithmetic equality is inherited; complete per-row independent reconciliation NOT EXECUTED. |
| Approval | No signed approval/reference or explicit accepted migration rule supplied for any row. |
| Required owner | Independent Finance reviewer, migration lead for private mapping; named accepted assignee NOT SUPPLIED for every row. |

**FIN REQUIRED / UNCONFIRMED** below means that role requirement only, not a named owner assignment. **NONE SUPPLIED** means evidence reviewed, not an assertion that approvals cannot exist elsewhere.

| Older handle | Proposed opening classification | Owner | Signed approval |
| --- | --- | --- | --- |
| A01 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A02 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A03 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A04 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A05 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A06 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A07 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A08 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A09 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A10 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A11 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A12 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A13 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A14 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A15 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A16 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A17 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A18 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A19 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A20 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A21 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A22 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A23 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A24 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A25 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A26 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A27 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A28 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A29 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A30 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A31 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A32 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |
| A33 | MANUAL_REVIEW_BEFORE_MIGRATION | FIN REQUIRED / UNCONFIRMED | NONE SUPPLIED |

A01–A33 are older report ordinals, not verified current record IDs. The latest inherited 33-row population needs a private map to these handles; no cross-snapshot equality is assumed. Proposed roles cannot reduce unowned unresolved counts or count as approval. **Opening balances fully dispositioned: NO. Accepted final current-row disposition count: NOT VERIFIED. Named ownership unconfirmed for all 33 inherited adjustments; full current unowned total UNKNOWN.**

## One-time migration input — sections 37–39

Future opening input must contain: source system/environment and frozen snapshot/hash; approved cutover timestamp; private source-row/cutover replay identity; verified backend beneficiary binding; exact currency/amount; independent reconstructed event/evidence references; signed Finance approval/accepted migration rule; exactly one allowed opening disposition; restrictions excluding every unapproved row. A private approved manifest must reconcile these inputs once before immutable event/audit posting. Repeat submission must replay or conflict without another credit; source drift requires review, not a different key and duplicate credit. This is a required deterministic input contract, **not an implemented importer or approved manifest**.

No ongoing legacy `profiles.balance`, balance RPC or legacy financial mutation is permitted after cutover. Source review confirms `backend/src/finance/index.ts::getBalance` derives balances from backend `soundpub.finance_events`, and `backend/src/payouts/finance.ts` calls that ledger derivation for eligibility/reservations; legacy label-first allocation preference is not a legacy balance query. This bounded source finding is not a whole-app runtime/egress or deployed-state proof. Unsupported opening posting kind and missing approved input remain blocked; no `MANUAL_ADJUSTMENT` substitute is accepted.

**Domain admission and cutover are separate:** real credentials/money are not required for backend-domain acceptance. Assigned historical review can remain cutover work only if fully enumerated and explicitly excluded from future financial calculations under an enforceable migration contract. Those prerequisites remain unproven here. Proposed `REQUIRES_FINANCE_REVIEW`/`CUTOVER_RECONCILIATION_REQUIRED` routing does not approve exclusions or make current balances safe to migrate.

## Opening blockers and admission

The historical reconciliation report's **11 open blocker IDs D-02–D-12** include all opening dependencies. Opening-critical subset: D-02 confirmed production access failure/no fresh financial snapshot; D-03 fixed cutover/private register; D-04 royalty source/replay/count evidence; D-05 all 33 adjustment approvals; D-06/D-07 payment/payout provenance; D-08 refund/fee populations; D-10/D-11 approved eligibility/exclusion controls; D-12 adequate extracts/schema. These IDs are not extra independent financial records. Inherited 33-table inventory is planning only. Historical dry-run **NOT EXECUTED**; unknown/unclassified totals remain **UNKNOWN**, not 0.

`UNRECONCILED` import quarantine, null public availability and `destinationReady: true` are not independent opening approval or destination verification. Any approved exception must prove scoped restrictions against incorrect future balances, payout eligibility, release readiness, duplicate provider submissions and callback replay. No such signed exception/control proof is supplied. Historical balances, payout eligibility and cutover acceptance remain BLOCKED.

Validation: local source/static checks and export counts only; replayable check and execution boundary in `PHASE3E_ADMISSION_HISTORICAL_RECONCILIATION.md`, hashes in `PHASE3E_ADMISSION_PROVENANCE_LEDGER.md`. No historical opening amount, zero-difference schedule, financial repair, bank settlement or posting approval is claimed.
