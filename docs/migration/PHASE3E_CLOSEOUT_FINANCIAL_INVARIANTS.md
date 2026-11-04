# Phase 3E closeout financial invariants

Date: 2026-10-29. Scope: deterministic synthetic local regression. Original financial reports preserved.

| Required invariant | Executable evidence |
| --- | --- |
| No duplicate royalty credit | `royalties.test.ts` exact checksum replay/overlap rejection; `finance-ledger.test.ts` concurrent same-credit replay; closeout actual import replay with one entry |
| No duplicate payout debit | `payouts.test.ts` competing requests and settlement replay; finance reservation/terminal uniqueness; closeout payout receipt replay |
| No negative available balance from race | `finance-ledger.test.ts` two 800 requests against 1000; closeout both ordered 400 credit/800 reservation cases and actual service overlap |
| No double reservation release | Ledger release replay/terminal exclusivity; payout cancel/reject/fail and closeout paid/cancel race |
| No duplicate invoice effect | `payments.test.ts` concurrent invoice creation, signed callback duplicate/replay/out-of-order cases |
| No double refund | Paid callback/refund overlap and refund replay leave one `PAYMENT_REFUND` effect; ledger refund cap rejects unsupported duplicates |
| No paid payout without acceptable evidence | Local ledger rejects missing evidence and incompatible reservation; payout backend-only settlement capability verifies state. Evidence authenticity/approval is a provider-owner gate, not established by nonempty evidence alone. |
| No financial mutation without audit | Ledger trigger audit/outbox checks and injected failure rollback; payout deferred integrity; payment audit INSERT denial rollback; new actual-import race checks all finance event audit/outbox links |

Money tests retain exact decimal-string/bigint boundaries, precision rejection and round-half-away behavior. Charge/refund values remain separate from withdrawable royalty funds. Reconciliation tests are dry-run and explicitly surface mismatches/unresolved callbacks.

Static egress checks:

- `node scripts/phase3e-static-scan.cjs`: backend-only finance source and known legacy caller guards.
- `node scripts/phase3e-closeout-egress.test.cjs`: recursively resolves relative/alias imports from all four financial API adapters using installed TypeScript; rejects Supabase, REST/function endpoint and provider-host references; checks finance component source too.

The new import gate traverses five financial API/client files. It does not traverse the shared auth/layout graph or execute UI branches. Shared auth/layout still has legacy imports and requires backend-mode runtime browser monitoring. Static PASS is not a claim of zero observed browser requests. Positive browser acceptance, provider evidence classification and independent QA remain their owners' gates.

Run `node scripts/phase3e-closeout-regression.cjs` for financial and Phase 2/3A–3E backend regression with zero required skips. Production data imported: NO. Production provider mutation: NO. Real money: NO. Production credentials: NO. Traffic switched: NO. Shared Supabase mutation: NO.
