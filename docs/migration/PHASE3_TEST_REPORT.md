# Phase 3 Test Report

## Status

PARTIAL — implemented foundation checks pass; full per-domain Phase 3 test matrix is incomplete.

## Results

| Check | Result | Notes |
| --- | --- | --- |
| Frontend production build | PASS | `npm run build`; bundle warning only. |
| Frontend API client self-check | PASS | `node scripts/phase3-client.test.cjs`. |
| Backend typecheck | PASS | `npm run typecheck`. |
| Backend build | PASS | `npm run build`. |
| Backend Users unit/API tests | PASS | Input, hierarchy, mass-assignment, auth, audit, pagination, status and role paths covered. |
| Backend full local suite | PASS | Agent run: 45 passed, zero failed/skipped. Coordinator filtered run: 34 passed, two DB-dependent suites skipped under filter. |
| Migration | PASS for Users slice | Versioned `0006_user_profiles.sql`; agent full suite included DB migration/integration checks. |
| Static Supabase gate | FAIL | 145 direct non-auth business call matches and 36 direct auth matches remain in `src` after excluding generated types. |
| Parity | FAIL | Users legacy/new differential behavior and all remaining domains incomplete. |
| Frontend browser regression | FAIL | Required desktop/mobile/state matrix not run. |

## Required Follow-up

Add adapter tests and browser tests per domain as each domain reaches backend-ready state. Do not classify a domain `DECOUPLED` from API tests alone.
