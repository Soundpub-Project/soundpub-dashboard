# Agent E targeted closeout

**Final status: PASS for all three requested browser blockers.** Complete run 2026-10-28 10:40:43–10:42:24 Asia/Bangkok: **30/30 scenarios PASS, zero failures, 30 screenshots**. Each viewport passed all ten scenarios. Snapshot hashes for all six inspected product files remained unchanged at post-run verification. No remaining blocker within this targeted fixture scope; overall Phase 3A certification remains coordinator/independent-QA responsibility.

Scope: only expired cached sessions, rejected mutation validation UI, and current-profile GET 401/403. Runner `targeted-acceptance.mjs`; evidence and screenshots in `artifacts/targeted/`. This run uses current coordinator-updated `useAuth.tsx`, including profile-denial signout and state clearing; exact SHA-256 source snapshot is embedded in results. No product edits.

Fixture origin is `http://127.0.0.1:8282`. All API/Auth requests are intercepted; external requests are aborted. This origin is intentionally not evidence of live CORS/proxy behavior. Earlier live-chain evidence used `127.0.0.1:8181`.

## Assertions

Each scenario runs at mobile 390×844, tablet 768×1024, desktop 1440×1000:

| Scenario | Assertions and observed product behavior |
| --- | --- |
| Expired access token, accepted refresh | Cached expiry is one hour past; exactly one Auth token refresh request; Users renders; API uses refreshed bearer only. Session remains present. |
| Expired access token, rejected refresh | Fake Auth returns non-retryable 400 `refresh_token_not_found`; exactly one refresh; redirect `/auth`; login visible; cached session removed. |
| Six-hour application session limit | Auth token still valid, stored app session start seven hours past; global Auth logout is intercepted with 204; redirect `/auth`; cached session removed; expiry message captured. Initial profile/list requests may race before signout completes; no zero-request-before-expiry claim. |
| Rejected profile update | Settings full name submitted as whitespace; fixture returns 400; `Gagal memperbarui profil` visible; input preserved; save enabled again; exactly one PATCH; no success toast. |
| Rejected role update | Select Admin for target; fixture returns 400; `VALIDATION_ERROR` visible; dialog stays open and save becomes enabled; exactly one PUT. |
| Rejected status update | Select Inactive; fixture returns 400; `VALIDATION_ERROR` visible; dialog stays open and save becomes enabled; exactly one PATCH. |
| GET profile 401 from Settings and Users | Redirect `/auth`; login visible; `Sesi tidak valid. Silakan login kembali.` visible; cached session removed; logout requested; no admin list or refresh request. |
| GET profile 403 from Settings and Users | Redirect `/auth`; login visible; `Akun tidak memiliki akses. Silakan hubungi administrator.` visible; cached session removed; logout requested; no admin list or refresh request. |

Every scenario also asserts no new API/Auth requests or main-frame navigation during a **2.2-second quiet window**, and zero uncaught page errors. This establishes bounded no-loop behavior, not an indefinitely observed session. Denial checks start with cached Auth user but no loaded business profile; they do not exercise revocation after a previously rendered profile.

## Auth and validation boundary

The runner does not modify signout scope. Current product calls global signout, recorded as `/auth/v1/logout?scope=global`, fulfilled locally with 204. Network-failed logout behavior is not claimed. Fake refresh/logout responses test client behavior only, not Supabase service availability or production token verification.

Validation cases prove rejected-response handling and retained correction UI. Role/status payloads are valid UI selections deliberately rejected by the fixture; they do not establish backend schema rejection for those specific values. Error text `VALIDATION_ERROR` is the current role/status presentation, not a field-specific validation explanation.

## Reproduction

Set `PLAYWRIGHT_PACKAGE_JSON` to an installed Playwright package.json, then run from root:

```powershell
node docs/migration/qa-agent-e/targeted-acceptance.mjs
```

Runner writes results after every case and closes browser/Vite on completion. Screenshot filenames: `<viewport>-<scenario>.png`. An earlier partial run was interrupted when the coordinator announced the hook update; only the complete rerun with updated assertions counts toward closeout.

No Docker/database/SSH/production operations were required for these fixture cases. Historical controlled live-chain PASS remains separately bounded to its recorded source/run snapshot.
