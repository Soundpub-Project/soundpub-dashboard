# Phase 3E authorization matrix — Agent D payout slice

Authorization reads current DB state under existing Users status/role locks, not browser principal roles or user metadata. Only global verified roles count. Account status must be active. Scope below covers payouts; royalty/payment agents must append their own evidence before whole-phase acceptance.

| Actor | Eligibility | Request | Own list/detail | Unrelated detail | Cancel pending own | Admin list / approve / reject / fail | Paid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous | 401 | 401 | 401 | 401 | 401 | 401 | Deny |
| Active user | Ineligible role | 403 | Allowed | 404 | Allowed if owns historical request | 403 | Deny |
| Active artist | Ineligible role | 403 | Allowed | 404 | Allowed if owns historical request | 403 | Deny |
| Active label | Backend checks | Self only | Allowed | 404 | pending only | 403 | Deny |
| Active whitelabel | Backend checks | Self only | Allowed | 404 | pending only | 403 | Deny |
| Owner | Current role/policy checks | Only eligible label/whitelabel | Allowed | 404 | pending only | Role dependent | Deny from browser |
| Unrelated owner | Own scope only | Own scope only | Own scope only | 404 | 404 | 403 | Deny |
| Active admin | Ineligible unless also label | No beneficiary override | Allowed | Allowed | Own pending only | Allowed | Trusted backend capability only |
| Active superadmin | Ineligible unless also label | No beneficiary override | Allowed | Allowed | Own pending only | Allowed | Trusted backend capability only |
| Inactive / suspended | 403 | 403 | 403 | 403 | 403 | 403 | Deny |
| Removed role / stale principal | Rechecked | 403 without label/whitelabel | Current active role required | 404 unless current admin | Current active role required | 403 without current admin | Deny |

Destination readiness, email verification, minimum threshold, exact current ledger availability, no active pending reservation and reconciliation readiness are backend prerequisites. Forged `user_id`, balances, status, beneficiary or unknown fields reject. Request cannot debit arbitrary artist: allocation uses locked verified current roster. Persistent allocations bind all terminal effects to original sources after transfer.

No financial admin impersonation endpoint exists. Browser admin cannot mark paid; synthetic trusted reconciliation invokes `settleMock` separately. Paid/rejected/failed/cancelled terminal states cannot regress. No runtime DELETE or edits to allocation/receipt exist. Account numbers are accepted only as validated request destination fields and excluded from response/audit/outbox.

Evidence: `backend/test/payouts.test.ts` exercises forged owner, unrelated detail/cancel, ordinary-user admin transition abuse, browser paid state, removed label role, suspended admin, replay and terminal-state denial using disposable local PostgreSQL and runtime role. Backend API composition, bearer bridge, complete multi-role HTTP/browser matrix and concurrent authority-removal barrier tests remain coordinator/independent QA gates; table describes enforced policy, not a claim every cell has independent execution evidence.
