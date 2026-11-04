# Phase 3E Closeout — Reconciliation Contract

Date: 2026-10-29 (Asia/Bangkok). Agent B. Contract defined; synthetic dry-run validation only. Historical/provider reconciliation remains PARTIAL; settlement gate remains blocked. Evidence populations and settlement levels are in PHASE3E_CLOSEOUT_PROVENANCE.md.

## Execution boundary

Reconciliation is DRY_RUN: compare frozen evidence, report issues, recommend remediation; no row updates, repair, invoice creation, payout, refund, webhook invocation or provider dispatch. Production historical data must never be repaired by this phase. Existing account/invoice reconcilers are reused; no extra endpoint or production connection script is needed.

`reconcileAccount(db, ownerId, expected, currency)` reads ledger/audit/outbox and returns mode, reconciled, issues and eventCount. Caller supplies complete trusted expectations, not an arbitrary subset or a reconstruction from the ledger under test. Empty expected/actual sets prove no financial lifecycle. Duplicate expectations are rejected. Use frozen synthetic snapshots or caller-controlled account locking for consistency.

`reconcileInvoice` compares price snapshot, current track count, mock provider state/amount/currency, charge/refund effect counts/amounts, finance ledger and audit presence. Service `reconcile` additionally surfaces unknown-invoice, mismatch and invalid-transition callback receipts. These functions do no financial repair, but service reconciliation is not a production read-only SQL interface: it performs authority and invoice locking. Do not run it inside a production READ ONLY snapshot or call financial status endpoints to collect historical proof.

For separately scoped historical evidence collection, use reviewed SELECT-only SQL in a bounded REPEATABLE READ READ ONLY transaction ending in ROLLBACK, with statement timeout. Repository `scripts/payment_reconciliation_readonly.sql` is existing arithmetic-check evidence, not provider settlement proof; its query schema must match the intended snapshot. No production collection was performed here.

## Money and identity

Use exact integer minor units and decimal strings, IDR only, scale 2. No JS floating-point conversion, silent rounding or provider precision assumptions. Finance event and payment domains have different maximum accepted amounts; validate with the owning domain's existing parser rather than widening limits. Match provider account/environment, business ID, beneficiary/destination, currency, gross/net/fee semantics and period; unknown fee treatment blocks matching. A URL or invoice number is not a provider transaction identity.

One result preserves entity type, private business/source reference, environment, snapshot/capture time, evidence origin/hash, local/provider states, amount/currency, effect/event/audit references, all issue codes, reconciliation states, provenance classification, confidence, recommendation and approval reference if any. Public artifacts use aggregate counts/report handles; sensitive linkage belongs in an access-controlled evidence register, not repository files.

## Entity requirements

| Entity | Expected reconciliation | Failure boundary |
| --- | --- | --- |
| Invoice | One business-scoped invoice with stable idempotency identity; price per track × positive current track count = snapshot total = invoice = provider amount, same currency; trusted provider reference; state-consistent effects and audit | Local paid alone, changed/missing price, missing provider, duplicate business invoice or unknown/conflicting provider state cannot MATCH. Pending can MATCH as pending, never as settled. |
| Release payment | Invoice linked to authorized release/owner; PAID, no manual review, exact payment/finance charge linkage and callback evidence, matched price; readiness independently checked under submission lock | Payment confirmation grants readiness only, never release activation. REFUNDED/FAILED/PENDING or any unresolved reconciliation issue denies paid readiness. |
| Payout | Exact original request/owner/currency/destination and allocation sum; active reservation before settlement; one settlement per allocation backed by acceptable trusted evidence, exact amount and terminal audit; no competing release | `settleMock` evidence string proves only mock behavior. PAID or proof path alone cannot prove historical settlement. Unverified destination or unresolved source balance prevents approval. |
| Refund | Original PAID invoice and charge, one full refund only, matching provider refund reference/state or signed mock event, one domain refund effect and matching finance reversal/audit; cumulative refund never exceeds charge | Release deletion is not provider refund. Unsupported partial/multiple refunds, missing original charge, unknown provider outcome or duplicate reversal require review; do not credit royalty balance. |
| Reservation | Sum original payout allocations = request amount; owner/currency exact; each hold has zero or one terminal release/settlement; pending/approved hold stays active, paid consumes it, cancellation/rejection/failure releases it once | No double release, settlement after release, stale-owner reassignment or negative hold. Legacy paid reservations stay stored/subtracted under legacy model; do not subtract a second debit when translating. |
| Royalty credit | Approved source artifact/checksum/period/source-row identity; beneficiary and work/release mapping; exact row allocations conserved and summed; one earning per beneficiary/batch with immutable offset for correction, current audit/outbox linkage | Current import posts earnings but leaves batch UNRECONCILED; payout quarantine is not independent source approval. No invented source rows, beneficiary shares or opening credit; unknown composer contract stays blocked. |

Derived balance: available = royalty earnings + royalty/manual adjustments + payout releases − payout reservations; reserved = reservations − releases − settlements; settled = settlements. Charges/refunds are separate totals and never withdrawable royalty funds. Reconciliation must cover every contributing owner/account, including original historical payout allocations after roster change. Stored equality alone cannot justify residual opening adjustments.

## States and reporting

States can coexist; preserve every issue instead of selecting a success-like primary state.

| State | Meaning / required handling |
| --- | --- |
| MATCHED | Complete expected records/effects/evidence match within named scope and lifecycle state; does not mean pending money is settled. |
| LOCAL_AHEAD | Local paid/refunded/settled state ahead of trusted provider; block financial finality. |
| PROVIDER_AHEAD | Trusted provider ahead of local state/effect; recommend reviewed recovery, never auto-post production effects. |
| AMOUNT_MISMATCH | Amount, currency, allocation, price or fee semantics disagree; no tolerance-based success. |
| MISSING_PROVIDER_REFERENCE | Required provider correlation absent; local PAID cannot fill the gap. |
| MISSING_LOCAL_RECORD | Source/provider record lacks a required local business/effect record; keep source-only records visible. |
| DUPLICATE_EFFECT | More than one logical charge/refund/credit/debit/terminal reservation effect, including duplicate business identity with different replay key. |
| MANUAL_REVIEW | Unknown state, unsupported event, missing audit/source/destination, conflicting evidence, incomplete population or ambiguous comparison. |
| HISTORICAL_EXCEPTION | Explicit approved scoped exception with restrictions; not MATCHED and not settlement proof. |

Dry-run summary uses mutually exclusive record buckets: `matched` only when complete and issue-free; `mismatched` for deterministic disagreement/duplicate effects; `unresolved` for missing necessary records/evidence; `ambiguous` for conflicting/unknown semantics; `historical_exception` only with valid approval. Precedence for multi-issue records: ambiguous, mismatched, unresolved, historical_exception, matched. An approval cannot suppress a contradiction; retain all issue/state fields. Record counts must sum to input population; report checks separately because failing predicates can overlap. No-input or missing-population evidence must be reported explicitly, never accepted as complete coverage.

Provenance status is separate from reconciliation state: PARTIAL linkage can accompany MISSING_PROVIDER_REFERENCE or MANUAL_REVIEW; HISTORICAL_EXCEPTION requires actual approval in both. A synthetic MATCHED never upgrades historical provenance to PROVEN.

## Current-code issue mapping and limits

| Existing result | Closeout interpretation |
| --- | --- |
| `MISSING_LEDGER_EVENT` | MISSING_LOCAL_RECORD; add PROVIDER_AHEAD only if independently trusted provider settlement exists. |
| `UNEXPECTED_LEDGER_EVENT` | MANUAL_REVIEW; LOCAL_AHEAD only when trusted source/provider proves local effect is ahead. |
| `AMOUNT_OR_EVIDENCE_MISMATCH` | AMOUNT_MISMATCH only for known amount disagreement; otherwise MANUAL_REVIEW. Existing combined code cannot resolve cause alone. |
| `MISSING_AUDIT_OR_OUTBOX`, `AUDIT_OR_OUTBOX_MISMATCH` | MANUAL_REVIEW; no final financial acceptance. |
| `PROVIDER_MISSING` | MANUAL_REVIEW when reference exists but provider record is missing; MISSING_PROVIDER_REFERENCE only when correlation itself is absent. |
| `STATE_MISMATCH` | LOCAL_AHEAD/PROVIDER_AHEAD only with comparable trusted lifecycle; otherwise MANUAL_REVIEW. |
| `RELEASE_PRICE_MISMATCH`, `AMOUNT_MISMATCH`, `LEDGER_AMOUNT_MISMATCH` | AMOUNT_MISMATCH or MANUAL_REVIEW if required snapshot is absent. |
| `CHARGE_MISMATCH`, `REFUND_MISMATCH`, `FINANCE_LEDGER_MISMATCH` | Inspect missing, excess, wrong-kind/owner/currency/evidence records; classify MISSING_LOCAL_RECORD, DUPLICATE_EFFECT or MANUAL_REVIEW rather than assuming one cause. |
| `AUDIT_MISSING`, `SETTLEMENT_EVIDENCE_MISSING`, `REFUND_EVIDENCE_MISSING`, `MANUAL_REVIEW_REQUIRED` | MANUAL_REVIEW; preserve blocking status. |
| `unknown_invoice`, `mismatch`, `invalid_transition` receipts | Unresolved globally; unknown invoice maps MISSING_LOCAL_RECORD, mismatch needs exact cause, invalid transition maps MANUAL_REVIEW. |
| `unsupported` receipt | Preserve as ambiguous until owning adapter documents it as nonfinancial/irrelevant. Current global query does not include this disposition. |

Existing invoice checks are necessary but not a complete independent evidence verifier: mock provider state is written alongside local callback effects; finance-ledger comparison checks count/amount/nonempty evidence, not a complete one-to-one kind/owner/currency/event-reference match; domain audit checks action presence rather than exact actor, amount and idempotency payload. The closeout contract requires that stronger linkage before provenance acceptance. Existing passing tests do not close those inspection gaps or demonstrate exploitability. Production adapter/provider settlement and trusted payout destination remain outside proven scope. Findings are handed to coordinator; Agent B does not modify financial runtime.

## Approval and remediation

No automatic production repair. Recommend source recovery, provider reconciliation, private row mapping, reviewed compensating event or historical exception approval with owner/scope/reason/evidence/impact/restrictions. Preserve historical records and original event identity. Do not clear manual-review flags, overwrite balances, fabricate source/replay keys, regenerate a payable invoice or reinterpret a local paid flag as reconciliation.

Synthetic automatic repair, if later needed, must be deterministic and local-test-only with original evidence and auditable compensation. No repair is implemented or needed for this review. Approval of an exception must also prove it cannot feed future incorrect balances, payout eligibility, readiness, duplicate provider submissions or callback replay. Without approval and exclusion controls it remains blocking.

## Focused checks and dry-run evidence

Existing focused command (local synthetic PostgreSQL only):

```powershell
node backend/node_modules/tsx/dist/cli.mjs --test backend/test/finance-ledger.test.ts backend/test/payments.test.ts backend/test/payouts.test.ts backend/test/royalties.test.ts
```

The finance-ledger suite exercises complete expected-set DRY_RUN comparison, mismatch detection, no repair, immutable audit/outbox, exact money, terminal reservation exclusivity, replay and lock-barrier races. Payment suite exercises invoice reconciliation, authenticated mock callbacks, unknown/mismatched events, refund replay/race and readiness. Payout and royalty suites check allocation/reservation and import/correction behavior. These are synthetic contract checks; they do not enumerate or approve historical records.

Focused result: 26 PASS, 0 FAIL, 0 SKIP. Existing ledger test derives expectations from ledger rows, so its success is comparison/integrity evidence rather than independent source provenance.

Additional runnable check: `node backend/node_modules/tsx/dist/cli.mjs scripts/phase3e-closeout-reconciliation.ts`. It creates only disposable local PostgreSQL using the existing harness, defines synthetic expectations before posting, compares matched/amount-mismatch/missing-record/unexpected-event scenarios, rejects duplicate expectations, and asserts exact ledger/audit/outbox snapshots remain unchanged across comparison. Its summary unit is comparison scenarios, not historical records; the unexpected-event scenario is ambiguous because no independent explanation is supplied. It never reads environment database URLs or calls HTTP/provider endpoints. Synthetic setup writes occur before the read-only comparison; fixture cleanup removes its own container.

Additional check result: PASS, exit 0. Scenario counts: matched 1, mismatched 1, unresolved 1, ambiguous 1, historical_exception 0. Duplicate expectations rejected; ledger/audit/outbox unchanged. These counts describe four independent comparisons over one synthetic source event, not four distinct financial records. No exception approval or provider settlement was tested.

Historical dry run: NOT RUN; production settlement classification: UNRESOLVED. Historical record buckets cannot be inferred from overlapping aggregate predicates; no fabricated matched/mismatched record totals are reported.
