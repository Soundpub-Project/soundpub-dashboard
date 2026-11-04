# Phase 3E Historical Balance Migration Contract

Status: CONTRACT ONLY. No historical data imported, opening balances posted, or production financial rows changed in this closeout.

## Source and classification

| Legacy source | Reconstructable? | Cutover treatment |
| --- | --- | --- |
| `Soundpub.royalties` allocation rows and upload/reversal history | Only where source-row identity, beneficiary, amount, period, correction and reconciliation evidence all agree | Reconstruct immutable credits/corrections once per source identity; otherwise quarantine as `HISTORICAL_EXCEPTION` or `UNRESOLVED`. |
| `Soundpub.profiles.balance`, `artist_revenue`, `label_revenue` | No: mutable snapshots, not a complete event ledger | Read-only snapshot for comparison, never authoritative credit. `20260816_rebuild_royalty_balances.sql` reconstructs fields from royalties and may erase payout effects. |
| `Soundpub.payout_requests`, `payout_balance_reservations`, proof and audit rows | Only when request, reservation, terminal debit/release and provider settlement evidence link exactly | Reconstruct matched reservations and terminal effects; local `paid` alone is not settlement proof. |
| Label aggregate balance and artist balances | Not by summing snapshots: legacy payout debits may span linked artists | Reconcile by historical beneficiary and linked payout allocation before attributing any owner amount. |
| Xendit invoices, callbacks, refunds and release payments | Only with matching provider identity, amount, currency, event and settlement evidence | Payment effects remain separate from withdrawable royalty balance; unresolved items block payment/submission cutover. |

`20260904_label_aggregate_payouts.sql` deducts payout funds across label and artist profile rows; `20260907_reconcile_kaditrudit_payout_balance.sql` records a guarded one-off correction after removing a double-debit trigger. Neither is a generic opening balance. Never copy its hard-coded amount or use a profile snapshot as a financial event.

## Cutover invariant

For each beneficiary/currency at a fixed, approved cutover instant, compare independently reconstructed earnings, corrections, reservations, releases and settled payouts to the read-only legacy snapshot and approved provider evidence. Record source identifiers, exact IDR minor units, timestamp, reviewer, exception reason and evidence hash. Discrepancies remain `UNRESOLVED`; no automatic balancing or silent assignment to a label. Never blend historical payment invoice effects into withdrawable royalties. Reconciliation is dry-run only until data ownership, source completeness and provider settlement are approved.

If complete event reconstruction is impossible, a future `MIGRATION_OPENING_BALANCE` event may represent the *approved* residual per beneficiary/currency at cutover. It must have a unique cutover/source key, exact approved amount, signed reviewer approval and supporting evidence references, immutable posting and audit, one-time replay protection, and explicit provenance classification. Require independent finance sign-off and dry-run difference of zero against the approved cutover snapshot before posting. Negative or ambiguous residuals need manual resolution, not automatic credit. Never invent an amount, synthesize provider proof, or post an opening balance in Phase 3E.

Until approved migration and provider reconciliation exist, historical production payout eligibility and production parity remain blocked. Synthetic backend behavior does not certify historic balances. See `PHASE3E_CLOSEOUT_PROVENANCE.md` for evidence classes and `PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md` for dry-run states.
