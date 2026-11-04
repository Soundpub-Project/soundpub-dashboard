# Phase 3A independent QA

Independent Agent F inspected source and did not edit product or docs. Original audit: **BLOCKED**. Agent E independently executed Chromium fixture cases, not a full live backend chain.

| Gate | Independently established | Limitation |
| --- | --- | --- |
| PostgreSQL migration/runtime suite | PASS: 52 passed, 0 failed, 0 skipped; disposable PostgreSQL 17.11, local port 56439, cleanup verified | Initial snapshot predates coordinator CORS and upload guard |
| Identity adapter negative cases | PASS with controlled mock HTTP and repository fixtures | No actual Supabase Auth response or live browser-to-DB verification |
| Users service/client probes | PASS: iteration, parent display, multi-role label, transfer block, no backend-branch Supabase calls | Not real data differential |
| Frontend/browser | 27 Chromium fixture scenarios from Agent E | Backend API intercepted; 18 scenarios observation-only |
| Direct dependency scan | 37 original scope business call sites classified | Original audit found two unexpected Settings Storage calls, now guarded after audit; follow-up needed |
| CORS | Original audit FAIL: 404 preflight | Coordinator added allowlisted preflight and focused tests after audit; follow-up needed |
| Production isolation | PASS within audited operations | Not external infrastructure attestation |

Delta audit: upload guards and allowed/disallowed CORS independently PASS (11 focused backend tests, 0 skipped); 39 root business calls classified including settings logo; **0 unexpected backend-mode calls**. Required matrices now exist. Agent E live browser artifact independently inspected: desktop chain loads 105 users across two pages, persists profile/role/status and audits, enforces current roles/status. Targeted fixture rerun then asserted **30/30 PASS**, ten scenarios per viewport: expired refresh/rejection and six-hour signout, rejected profile/role/status mutations, and profile 401/403 session clearing; six product-file hashes matched current source. Agent F inspected runner, results and screenshots without rerunning browsers. **Final independent verdict: PASS / DECOUPLED for isolated, pre-cutover Users/Profile/Roles scope.** Desktop-only live execution is acceptable with mobile/tablet/desktop fixture coverage; real production tokens and traffic remain outside scope. Details: `qa-agent-e/REPORT.md`, `qa-agent-e/TARGETED_CLOSEOUT.md`, `PHASE3A_TEST_REPORT.md`.
