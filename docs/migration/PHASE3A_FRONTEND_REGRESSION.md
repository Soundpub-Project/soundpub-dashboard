# Phase 3A frontend regression

## Executed

- `node src/services/users.test.cjs`: PASS. Exercises backend/legacy selection, API DTO and nullable patch, multi-page cursor/reuse, mixed-role labels, parent-label name, role-transfer denial and no legacy access in backend service branch.
- `node scripts/phase3-client.test.cjs`: PASS. Access-token forwarding, missing token 401 and server 403/error mapping.
- Vite build: PASS. Backend mode remains `import.meta.env.DEV` only. Root full TypeScript check still fails on broad legacy baseline including 3 errors in `src/pages/Users.tsx` deletion-request section, which is hidden in backend Users mode; not fixed outside this sub-phase.
- Backend-mode avatar and label-logo upload inputs are disabled and handlers reject; legacy-only storage code remains for production/legacy mode. Profile URL removal is a backend-only PATCH.
- `qa-agent-e/REPORT.md` and its executable browser harness: 27 isolated Chromium scenarios, mobile 390x844, tablet 768x1024, desktop 1440x900. All 9 assertion groups passed and 18 additional states were observed; 27 screenshots. Routes: `/dashboard/users`, `/dashboard/settings`, anonymous `/auth` redirect. Synthetic cached sessions and Playwright-fulfilled API responses; role/status/profile request submission validated, not persistence.
- Follow-up desktop live browser run: synthetic SDK session -> real Vite `/api` proxy -> owned backend mock provider -> disposable PostgreSQL. Rendered 105 users across two pages; profile/status/role changes persisted, profile survived reload, 401/403 and current-role freshness verified. `qa-agent-e/artifacts/live/results.json` reports PASS with cleaned owned container.

## Missing or limited

Targeted closeout: `qa-agent-e/TARGETED_CLOSEOUT.md` asserts **30/30 PASS**, ten scenarios per viewport. Expired Auth refresh succeeds once or fails and redirects; six-hour limit signs out; rejected profile/role/status changes preserve correction UI; rejected profile GET 401/403 clears session and redirects to `/auth`. No-loop quiet window is 2.2 seconds, not indefinite proof. Browser acceptance for Phase 3A's controlled scope: **PASS**. The live run uses exact mock tokens, not a real Supabase-issued access token or local GoTrue signature verification. Existing `VITE_*` environment values must be cleared and env-file loading disabled for further synthetic browser/build checks.
