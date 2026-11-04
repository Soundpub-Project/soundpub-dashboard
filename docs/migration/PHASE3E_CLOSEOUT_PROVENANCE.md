# Phase 3E Closeout — Reconciliation and Provenance

Date: 2026-10-29 (Asia/Bangkok). Agent B scope: source review, existing evidence classification and isolated checks only.

## Decision and evidence boundary

Historical/provider provenance: PARTIAL. Production settlement: UNRESOLVED. No historical exception approval or record-level provider reconciliation was supplied. This document does not close the Phase 3E financial gate.

No SSH, production database, provider API or side-effect endpoint was accessed during this review. No production data was imported, credentials used, money processed, shared Supabase mutated or traffic switched. Existing reports are inherited evidence, not fresh production observations. Synthetic tests use disposable local PostgreSQL and mock providers.

Authoritative Phase 3E inputs reviewed: FINAL_REPORT, INDEPENDENT_QA, FINANCIAL_MODEL, MONEY_RULES, FINANCIAL_INVARIANTS, TRANSACTION_MODEL, PAYOUT_STATE_MACHINE, RPC_REPLACEMENT_MATRIX, PARITY_MATRIX and RECONCILIATION_REPORT in this directory. Historical evidence: PHASE1F_DATABASE_SCOPE.md, PHASE1F_FINAL_REPORT.md, PHASE1B_FINANCIAL_PAYMENT_REPORT.md and PHASE1D_XENDIT_REPORT.md. Current source does not attest deployed legacy source.

The latest supplied production financial snapshot is PHASE1F_DATABASE_SCOPE.md's single REPEATABLE READ READ ONLY transaction at 2026-10-27T13:31:07.912225 UTC. Its counts are snapshot-specific, not current population guarantees. Older report-local U/I/A handles cannot be assumed stable across snapshots without a private primary-key mapping.

## Classification rules

| Status | Meaning |
| --- | --- |
| PROVEN | Complete linked evidence for the stated scope; mock proof must say synthetic. |
| PARTIAL | Some linkage exists, but source, settlement, event or approval evidence remains missing. |
| HISTORICAL_EXCEPTION | Explicit authorized disposition with owner, scope, reason, approval, evidence and restrictions; never inferred from age. |
| UNRESOLVED | Required evidence unavailable or contradictory; cannot establish financial finality. |
| NOT_APPLICABLE | Evidence does not apply to this entity; empty populations prove no lifecycle. |

Confidence describes the stated observation, not a probability of settlement. High confidence in a missing field is not high confidence that money settled. No entity below is classified HISTORICAL_EXCEPTION because approval is absent.

## Historical entity register

All row references below are schema/table or report-local handles. Raw user IDs, bank details, provider references and original financial amounts remain private. This is a population-level classification; individual settled-record proof is unavailable.

| Business record | Source row | Provider reference | Invoice reference | Callback/event reference | Settlement evidence | Local financial effect | Confidence / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Royalty credits: 14,474 | `soundpub.royalties`; all reference existing uploads, but all lack `source_row_number` | External royalty statement/source linkage unavailable | NOT_APPLICABLE | Original per-row source event unavailable | No source statement/hash-to-row reconstruction supplied | Stored artist/label/platform allocation arithmetic passes | High for recorded aggregate linkage; PARTIAL |
| Successful royalty uploads: 10 | `soundpub.royalty_uploads`; older U01–U10 are report-local only | Distributor/source artifact not supplied | NOT_APPLICABLE | All 10 lack replay keys; all 10 fail inserted-record count equality | No approved batch reconciliation | 14,474 linked royalty rows; older per-upload counts are historical evidence only | High for reported missing metadata; PARTIAL |
| Current stored balances: 182 profiles | `soundpub.profiles` plus royalties, adjustments and reservations | NOT_APPLICABLE to derived balance | NOT_APPLICABLE | Underlying event lineage incomplete | Stored arithmetic only; no independent economic reconciliation | Allocation + adjustments − pending/approved/paid reservations matches stored balance | High for snapshot arithmetic; PARTIAL |
| Opening adjustments: 33 | `soundpub.balance_adjustments`; older A01–A33 each require private mapping | Independent source/settlement justification unavailable | NOT_APPLICABLE | `migration_opening_balance` reason is not approval | None independently verified | Residual adjustments preserve chosen prior balance | High for existence; UNRESOLVED for justification |
| Payout requests: 3, including 2 paid | `soundpub.payout_requests` | Provider transaction/bank reference not supplied | NOT_APPLICABLE | Trusted settlement event not supplied | Both paid rows have proof paths; bytes and authenticity not reverified | Reservations present; amount consistency passes | High for stored linkage; PARTIAL; paid settlement UNRESOLVED |
| Payout allocations/reservations: 5 | `soundpub.payout_balance_reservations`, linked payout/profile | NOT_APPLICABLE to local hold | NOT_APPLICABLE | Provider settlement event unavailable | Local reservation evidence only | Legacy pending/approved/paid holds participate in balance subtraction | High for snapshot linkage; PARTIAL |
| Release payments: 9 total, 4 paid | `soundpub.release_payments`, linked release/profile | All 9 have nonempty stored Xendit IDs/URLs; values suppressed | 2 paid rows have number/PDF path; same other 2 lack both | Provider-authenticated historical event archive not supplied | PROVIDER_REFERENCE only; no provider/bank verification or PDF-byte proof | Local paid state/timestamp and parent linkage; historical event/effect equivalence unproven | High for reported fields; PARTIAL; paid settlement UNRESOLVED |
| Missing paid invoice artifacts: 2 | Same paid release-payment subset; older I01/I02 not remapped | Stored Xendit references present | Number and PDF path missing | Unavailable | Missing artifact is not proof payment failed or settled | Preserve paid records; no inferred refund or replacement invoice | High for missing fields; UNRESOLVED |
| Copyright payments: 2 expired, 0 paid | `soundpub.copyright_registration_payments`, linked registration/profile | Both have stored IDs/URLs | No paid artifact claim | Not supplied | No paid population to verify | Expired local state; no paid settlement assertion | High for snapshot population; PARTIAL linkage; paid lifecycle NOT_APPLICABLE |
| Composer royalties: 0 | `soundpub.composer_royalties` | NOT_APPLICABLE | NOT_APPLICABLE | NOT_APPLICABLE | Empty population | Orphan-upload check passes vacuously | High for snapshot population; NOT_APPLICABLE; no mapping proof |
| Historical provider refunds | No enumerated refund/settlement population supplied | Unavailable | Original invoice must be linked before acceptance | Unavailable | No real refund evidence | Legacy release deletion/refund helper cannot prove provider refund | UNRESOLVED; absence of supplied evidence is not zero refunds |

Original 20 production assertions: 15 PASS, 5 FAIL. Failures are `missing_source_row=14474`, `missing_upload_replay_key=10`, `upload_inserted_count=10`, `paid_without_invoice_number=2`, `paid_without_pdf_path=2`. These overlap; do not sum them into a count of affected business records. Additional 21 checks pass but cannot validate provider settlement. Zero duplicate replay keys is vacuous where keys are absent.

## Synthetic provenance and source limits

| Entity / source | Evidence supported | Limit / classification |
| --- | --- | --- |
| `backend/src/payments/index.ts` and `provider.ts` | Durable mock invoice, signed raw-body webhook, event receipt/disposition, payment effect, finance event and domain audit linkage; full refund/replay and reconciliation exercised | Synthetic contract PROVEN by focused checks; provider mirror is updated by same callback transaction, not independent external settlement evidence. |
| `backend/src/finance/index.ts` | `reconcileAccount` compares complete supplied expectations with events and audit/outbox integrity without repair | Synthetic comparison PROVEN; supplied expectations must themselves be authoritative. No independent provider verification is created by this function. |
| `backend/src/payouts/index.ts` and `finance.ts` | Public transition rejects paid; trusted `settleMock` requires nonempty evidence and settles original allocations once | Synthetic terminal accounting PROVEN by tests; string presence is not authenticated provider/bank settlement. |
| `backend/src/payouts/policy.ts` | Missing minimum fails eligibility through nonpositive threshold; unresolved import in current owner/roster scope blocks payout | `destinationReady: true` is current source behavior, not verified bank destination evidence. Future production enablement requires a trusted destination/settlement policy. |
| `backend/src/royalties/index.ts` | Source/period/row identity, beneficiary mapping, checksum, earnings and offset history; imports remain UNRECONCILED | Source posts earnings at import. Payout policy quarantines unresolved imports; raw ledger available must not be described as excluding them. No approved reconciliation transition evidenced by reviewed source. PARTIAL financial approval. |
| Legacy invoice/webhook source | Provider field handling and local paid/parent updates are inspectable | PHASE1D_XENDIT_REPORT records invoice retry/concurrency failure; source review is not deployed lifecycle or settlement proof. PARTIAL. |

## Settlement evidence levels

| Level | Evidence | Acceptance |
| --- | --- | --- |
| LOCAL_STATUS_ONLY | Local `PAID`, timestamp, local audit or proof-path string | Never proves provider settlement. |
| PROVIDER_REFERENCE | Persisted provider invoice/transfer ID scoped to provider account and environment | Correlation only, not paid proof. |
| PROVIDER_PAID_STATE | Trusted provider read/export with matching identity, amount, currency, beneficiary and final state | Provider assertion; still reconcile local effects, duplicates and reversals. |
| CALLBACK_EVENT | Authenticated event identity/raw-body digest and receipt, matched business reference, amount/currency, terminal state and durable effect/audit | Lifecycle evidence; unresolved/out-of-order/conflicting receipts remain reviewable. Synthetic events prove mock scope only. |
| RECONCILED_SETTLEMENT | Provider finality/evidence linked to business record, immutable local effect and audit, exact amounts/currency/destination, no duplicate effect, unresolved callback or outstanding hold; explicit approval where required | Acceptable only in declared environment. Provider PAID semantics must distinguish invoice payment from actual transfer settlement; bank evidence required where provider contract requires it. |
| MANUAL_EXCEPTION | Named reviewer approval, record scope, reason, evidence deficiency, financial impact, restrictions and remediation | Approved disposition only; never relabel as independently proven settlement. |

## Required disposition

Recover source statements and private immutable row mapping for all affected royalty/upload records; retain original metadata. Independently justify each opening adjustment against an approved cutover snapshot. Obtain authenticated provider exports/event evidence and original invoice/proof bytes for paid payments/payouts; hash and privately link them to exact business records. Recover missing artifacts only under separate authorized work. Never create a new payable invoice merely to replace missing documentation.

Historical exceptions can become non-blocking for isolated synthetic acceptance only after named approval and enforceable exclusion from migration, payout eligibility, release readiness and provider replay. No such approval is inferred here. Future incorrect behavior remains possible if unresolved balances are imported, local PAID is trusted, destination policy is enabled unchanged, or absent replay keys are fabricated. Production migration/cutover remains blocked on those paths.

## Focused verification

Command: `node backend/node_modules/tsx/dist/cli.mjs --test backend/test/finance-ledger.test.ts backend/test/payments.test.ts backend/test/payouts.test.ts backend/test/royalties.test.ts`.

Results are recorded in PHASE3E_CLOSEOUT_RECONCILIATION_CONTRACT.md. No new production read or historical settlement verification is claimed.
