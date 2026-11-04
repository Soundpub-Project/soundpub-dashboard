# Phase3E ledger invariant evidence

Executable check: from `backend`, run `npx tsx --test test/finance-ledger.test.ts`. Uses disposable PostgreSQL 17 on loopback via verified local Docker Desktop context. No external DB URLs or credentials. All migration files load in ordered sequence and second migration run is empty.

| Invariant | Enforcement / evidence |
| --- | --- |
| No duplicate royalty credit | Persistent account/key and account/kind/business-reference uniqueness; exact replay comparison. Concurrent identical credit blocks then replays same event ID. |
| No duplicate payout debit | One reservation per reference; only one release OR settlement per original reservation. Settlement reduces reserved, not available again. |
| No negative availability from race | Account row lock and DB balance guard. Two 800 requests against 1000: second blocks, then controlled insufficient balance. |
| No paid settlement without evidence | Evidence required in API and DB; matching reservation owner, amount, currency and reference required. Provider evidence authentication belongs to payout domain. |
| Released reservation not reserved | Immutable release offsets exact reservation once; terminal exclusivity blocks subsequent settlement. |
| Refund cannot exceed charge | Original matching charge required; current contract one full refund only. Unique invoice effect and evidence prevent duplicate refund. |
| No duplicate invoice financial effect | Account/kind/invoice uniqueness and persistent replay; charge/refund do not affect withdrawable royalty balance. |
| No event without audit/outbox | DB trigger atomically creates immutable audit and outbox. Injected outbox failure leaves no event. Parent business failure rolls back entire transaction. |
| No mutable settled history | Runtime lacks UPDATE/DELETE; immutable triggers also reject migration-owner UPDATE/DELETE. Correction uses adjustment event. |
| No lossy money boundary | Decimal strings only; exact bigint arithmetic; invalid floats/exponents/precision rejected; signed half-away rounding tested. |
| No unreconciled state presented final | Dry-run reconciliation compares complete expected event set, amounts/evidence and audit/outbox links; mismatch blocks reconciled result. |

Final execution: 12 tests passed, 0 failed, 0 skipped; backend TypeScript typecheck passed. Direct SQL competing-insert race proves DB guard independently of API locks. Concurrent release versus settlement permits one terminal effect. Stale transaction isolation explicitly rejected. These are ledger-layer results, not whole Phase3E acceptance. Eligibility, roster allocation, import provenance, payment callback authentication, invoice/payout state parity and browser acceptance remain owning agents' gates.

Unknown business contracts fail closed: legacy opening balances, unverified beneficiary mapping, unsupported currencies, provider precision conversion, partial refunds, multi-beneficiary label payout allocation and corrections exceeding unspent value. No financial data imported and no provider called.
