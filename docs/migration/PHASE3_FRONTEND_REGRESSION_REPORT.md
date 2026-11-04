# Phase 3 Frontend Regression Report

## Status

FAIL — full frontend regression evidence required by Phase 3 is unavailable because no domain is enabled against a real backend identity adapter and most domains still use Supabase directly.

## Automated Evidence

- `npm run build`: PASS on 2026-10-28.
- `node scripts/phase3-client.test.cjs`: PASS; authentication requirement, bearer injection, success decoding, typed forbidden error, and request ID mapping checked.
- Focused TypeScript scan for changed API/service/user files: PASS.
- Whole-project `tsc --noEmit`: FAIL from pre-existing unrelated frontend type errors; changed Phase 3 files emit no focused errors.

## Browser Matrix

| Scenario | Result | Evidence |
| --- | --- | --- |
| Desktop | NOT RUN | No browser/E2E harness configured for backend domain adapter. |
| Mobile | NOT RUN | No browser/E2E harness configured. |
| Loading | PARTIAL | Existing loading states retained; not exercised against backend. |
| Empty state | NOT RUN | Backend list not browser-tested. |
| Validation | PARTIAL | Backend schema/API tests cover invalid payloads; UI not browser-tested. |
| Error state | PARTIAL | API client typed error mapping self-check passes; UI messages not end-to-end tested. |
| Unauthorized | PARTIAL | Backend API tests deny unauthorized access; UI navigation not end-to-end tested. |
| Successful action | PARTIAL | Backend API tests pass; UI role/status actions not connected to real token verification. |
| Navigation after action | NOT RUN | Browser test absent. |

## Blockers

- Phase 4 identity verifier is absent; Supabase JWTs cannot yet authenticate to Phase 2 mock-only backend safely.
- Artist-label transfer intentionally returns conflict until Artists/Royalties transactional ownership exists.
- Direct Supabase calls remain across all non-Users domains and some Users workflows.

## Post-QA Changes

Cursor iteration, server parent-name preservation, multi-role label lookup and local same-origin Vite proxy were added after independent QA. Build and API client self-check pass; browser state/navigation regression is still NOT RUN and overall status remains FAIL.
