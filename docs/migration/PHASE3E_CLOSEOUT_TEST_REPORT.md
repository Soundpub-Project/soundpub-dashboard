# Phase 3E closeout regression report

Date: 2026-10-29. Agent F write scope: scripts/tests and the four assigned closeout reports only.

Completed baseline with the new isolated environment runner: **205 passed, 0 failed, 0 skipped** (147 top-level tests including nested subtests). All four previously skipped DB suites executed and passed. Log: `$env:TEMP/phase3e-closeout-regression.log`. This execution predates inclusion of the new closeout race file in the runner; do not add focused test counts to this total as if they were one run.

Final runner including the new race file and service terminal-race extension: **209 passed, 0 failed, 0 skipped**. Log: `$env:TEMP/phase3e-closeout-regression-final.log`. Focused final race run: **4 passed, 0 failed, 0 skipped**, log `$env:TEMP/phase3e-closeout-races-final.log`. Runner now also pins child `DOCKER_CONTEXT=desktop-linux`, including older tests that invoke Docker without an explicit context argument.

Additional completed checks: backend TypeScript typecheck PASS; isolation/secret scan PASS; frontend client/roster/release contract checks 3 passed/0 failed/0 skipped; Phase 3C static gate PASS; Phase 3E static inventory PASS (10 backend-only files, 24 guarded callers); financial API import graph PASS (5 traversed files). No browser runtime egress claim from static checks.

Reproduce from repository root:

```powershell
node scripts/phase3e-closeout-regression.cjs
node --import ./backend/node_modules/tsx/dist/loader.mjs --test scripts/tests/phase3e-closeout-races.test.ts
npm --prefix backend run typecheck
npm --prefix backend run security:check
node --test scripts/phase3-client.test.cjs scripts/phase3b-frontend.test.cjs src/components/releases/backend-mode.test.cjs
```

Environment dependencies and exact skip sites: `PHASE3E_CLOSEOUT_SKIPPED_TESTS.md`. Race assumptions: `PHASE3E_CLOSEOUT_RACE_REPORT.md`. Invariant and egress limits: `PHASE3E_CLOSEOUT_FINANCIAL_INVARIANTS.md`.

Coordinator separately observed 182 pass/1 failure/4 skips, with orphan-repair reporting connection termination. Connection termination alone does not establish an application defect or prove Docker contention. After the final regression runner exited, orphan-repair was run alone with file concurrency one: **8 passed, 0 failed, 0 skipped**; log `$env:TEMP/phase3e-closeout-orphan-serial.log`. Command from `backend`: `node --import tsx --test --test-concurrency=1 test/orphan-repair.test.ts`. Classification: coordinator failure not reproduced; infrastructure interruption is plausible but root cause is unproven. No orphan implementation change made. No production/shared resources were used or modified. Whole Phase 3E decision remains coordinator-owned; regression success alone does not close provider, composer, historical or browser gates.

## Final coordinator validation

After independent-QA fixes, final acceptance runner log `.tmp/phase3e-closeout-evidence/final-regression-g6.log`: **209 passed, 0 failed, 0 skipped** plus frontend/static import gates. Final positive browser artifact `.tmp/phase3e-closeout-evidence/final-browser-rerun/results.json`: **9 passed, 0 failed**, 12 SQL snapshots, zero unexpected or financial egress. Frontend build and backend typecheck pass. Whole-phase evidence decision remains BLOCKED for non-regression gates.
