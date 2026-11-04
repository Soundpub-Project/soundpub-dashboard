# Phase 3E closeout race report

Date: 2026-10-29. Synthetic PostgreSQL only. New executable: `scripts/tests/phase3e-closeout-races.test.ts`.

| Race | Deterministic barrier | Assertions / boundary |
| --- | --- | --- |
| Credit vs reservation, both serial orders | First event owns account lock; `pg_blocking_pids` verifies second PID waits before commit | Starting 1000.00 plus 400.00 earning and 800.00 reservation produces available 600.00/reserved 800.00 in both orders. Exact replay yields two earnings including seed, one reservation, no duplicate credit or overspend. Ledger-level coverage. |
| Actual royalty import vs payout | Gate holds account lock; import reaches that gate; payout must block behind import authority lock before gate releases | Actual services persist one import entry and one payout. Replays retain IDs and balances 600.00/800.00. Every finance event has audit/outbox links. Uses explicit synthetic policy with reconciliation/destination ready; does not prove default production reconciliation eligibility. |
| Paid callback vs refund | Existing `backend/test/payments.test.ts` holds invoice row until both contenders are observed waiting | Final REFUNDED, one refund effect, replay safe; later PAID callback cannot restore paid state. Starts with a paid invoice, not a first payment racing an unqualified refund. |
| Settlement vs cancellation | New service test holds account, observes settlement waiting and cancellation blocked behind settlement authority lock | Approved payout settles once; cancellation rejects; final paid, reserved zero, settled 800.00, available remains 600.00; no release event. Cancellation after approval is forbidden by existing state machine. |
| Ledger release vs settlement | Existing `backend/test/finance-ledger.test.ts` observes settlement PID blocked behind release transaction | Release commits; settlement rejects reservation conflict; exactly one terminal financial effect. Covers release-first order at ledger layer. |

Tests observe database locks rather than use fixed sleeps to guess contention. Polling deadlines fail if the required overlap never occurs. Service-level reverse terminal ordering is constrained by state machine: pending permits cancel but not settlement; approved permits settlement but not owner cancel. No unsupported state transition was added to manufacture a race.

Commands from root:

```powershell
node --import ./backend/node_modules/tsx/dist/loader.mjs --test scripts/tests/phase3e-closeout-races.test.ts
node scripts/phase3e-closeout-regression.cjs
```

Callback/refund, ledger terminal exclusivity and earlier concurrency suites are included by the regression runner. These local checks do not prove provider settlement authenticity or historical balance provenance.
