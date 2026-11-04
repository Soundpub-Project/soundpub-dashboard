# Phase 3E Financial Parity Matrix

All targets are synthetic backend behavior, not proof of production parity. Historic exceptions in `PHASE1D_XENDIT_REPORT.md` and `PHASE1F_FINAL_REPORT.md` remain unresolved until scoped production read-only reconciliation under separate approval.

| Operation | Legacy behavior | Backend target / effect | Authority | Replay / transaction | Parity |
| --- | --- | --- | --- | --- | --- |
| Royalty import | `process-royalty-upload` and `commit_royalty_upload`; allocation/identity history complex | Validate preview, immutable earnings, atomic batch and audit; no guessed recipient | Admin only, current role and beneficiary mapping | Stable period/source/checksum; single transaction | Intentional safety change; mapping/revenue split unresolved until documented |
| Royalty reversal | `delete-royalty-upload`/`reverse_royalty_upload` and rebuild | Offset settled entries, never erase history | Admin only | Replay key and financial-scope lock; atomic | Intentional safety change |
| Royalty list/summary | Direct table and analytics RPC | Read authorized source events/derived totals | Owner/eligible label/admin | Read-only | Aggregation parity pending synthetic differential tests |
| Balance | Mutable profile balance and dashboard RPC | Derive earned minus paid minus active reservations plus approved adjustments | Owner/admin | Lock financial scope on mutation | Intentional safety change |
| Payout request | `request_payout` reservation RPC | Check eligible account, lock balance, create reservation/request/audit/outbox | Eligible verified owner | Idempotent key; one transaction; overdraft rejected | Intentional safety change |
| Payout transition | `update_payout_status`, `complete_payout`; proof upload | Trusted admin or mock-system transition; settle or release reservation exactly once | Current admin / trusted reconciliation | Unique transition effect; one transaction | Intentional safety change; proof workflow deferred |
| Invoice create | `create-xendit-invoice` could duplicate under concurrent/retry | Local invoice first, stable mock provider identity, no real charge | Release owner/authorized admin | Unique business+key; one local transaction | Prior regression 1/3; intentionally fixed only when proven in tests |
| Callback | `xendit-webhook` could mark paid before later effect | Signed raw-body synthetic event, durable dedup and monotonic state | Mock provider signature | Persist event, invoice and audit atomically | Prior production settlement unverified |
| Refund | Release-delete helper conflates deletion/refund | Explicit capped reversal with original invoice link | Trusted admin/system only | Unique refund key; transaction | Intentionally distinct; production reconciliation pending |
| Release readiness | Deferred payment adapter in Phase 3C | Authenticated payment status only; no client paid claim | Existing release authority | Read under submission lock | Payment integration needs explicit local test |
| Composer royalties | Copyright RPC and table semantics | Financial mapping postponed; fail closed until identity/share contract | No implied write authority | No financial posting without contract | PHASE3F_COPYRIGHT / BLOCKED |

Backend errors must never expose raw SQL or provider details. Unknown amount, beneficiary, currency, ownership, or provider state blocks settlement; no fallback to legacy balance in backend mode.
