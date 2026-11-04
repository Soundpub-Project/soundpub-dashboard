# Phase 1C Authorization Matrix Report — Agent H

Observed 2026-10-27, Asia/Bangkok. **Status: BLOCKED; production matrix not passed.** Retain `PHASE1B_AUTHORIZATION_MATRIX.md` and `PHASE1B_INDEPENDENT_QA.md` as historical evidence. Their 10 SQL access violations and three frontend failures are not closed by this report; concurrent fixes require independent retesting.

## Evidence and boundaries

Production catalogs inspected over SSH from the required Docker directory using an explicit read-only transaction. No production identities, writes, uploads, deployments, real payment/email or privileged function calls. Coordinator incident lock has not been released to this agent.

Focused runnable check: `node scripts/phase1c-contracts-roles.test.cjs`. Disposable PostgreSQL 17 container uses `--network none`, no ports and no production mounts/data, then is removed with its anonymous volume. Actual staged contracts migration executes against reduced platform tables. Synthetic UID and admin-role adapters exercise real PostgreSQL role/RLS evaluation but are NOT real authenticated integration identities. Registration RLS, live full Storage policy OR composition, token/session verification and public HTTP stack are outside this fixture.

## Focused contracts SQL observations

| Actor | SELECT observed | CREATE | UPDATE / DELETE |
| --- | --- | --- | --- |
| anonymous | 0 | Not exercised | Not exercised |
| user | 0 | Not exercised | Not exercised |
| artist | 0 | Not exercised | Not exercised |
| label | 0 | Not exercised | Not exercised |
| owner | 1 owned object | Denied by RLS | Not exercised |
| other owner | 0 target objects | Not exercised | Not exercised |
| admin | 3 fixture objects | Allowed | Allowed on inserted fixture |
| superadmin | 3 fixture objects | Allowed | Allowed on inserted fixture |
| inactive owner | 1 owned object | Not exercised | Not exercised |
| suspended owner | 1 owned object | Not exercised | Not exercised |
| copyright, non-owner | 0 | Not exercised | Not exercised |

All diagnostic assertions pass, including explicit observation of retained inactive/suspended owner reads. This does not establish the desired account-status policy. Copyright/reviewer positive scope remains unspecified. These are SQL fixture results, not production gate PASS.

## Resource and operation coverage still required

| Resource | Current evidence / unresolved requirement |
| --- | --- |
| profiles | Prior SQL reads/financial field guard; full real-role CRUD and status restrictions unverified |
| user administration | No real identity management tests here; privileged target hierarchy unverified |
| roles | Prior 36 SQL direct-DML denials; trusted role API positive/negative matrix unverified |
| artists | Prior inactive artist-profile INSERT finding; real-role CRUD unverified |
| labels | Managed scope, reassignment and CRUD matrix unverified |
| releases | Prior display-name collision and owner activation/reassignment findings require retest |
| tracks | Prior display-name collision read finding requires retest; full CRUD unverified |
| royalties | Prior SQL read scope only; real-role mutations/import privileges unverified |
| payouts | Prior suspended-label request_payout finding requires retest; real-role matrix unverified |
| copyright | Live registration INSERT still checks only own user_id; prior forged approval/payment findings require closure |
| contracts | Focused SQL observations above; deployed owner/admin policies absent, HTTP access and lifecycle unverified |
| takedown | Prior partial SQL scope; full real-role CRUD/privileged actions unverified |
| notifications | Own OR global read/update policies require operation/field-level oracle and actual-role tests |
| storage | Broad authenticated media SELECT still live; contracts lifecycle and valid signed URL tamper/expiry unverified |
| privileged Edge Functions | Public role matrix and intended positive callers unverified by this agent |
| privileged RPCs | Coordinate with definer owner; historical findings are not closed without actual-role checks |

Every unexecuted cell remains unverified. Expected sensitive writes require active scoped owners or authorized staff, foreign users must be denied, and privileged state changes require trusted authorization. Account recovery reads for inactive/suspended identities need an explicit business contract before judging their intended ALLOW.

## Broad OR grants and client findings

Live policies are permissive: adding a narrow policy cannot cancel an existing broad grant. Storage `SoundPub authenticated read private buckets` permits every authenticated identity to read release-covers/track-audio/track-video; none of eight live Storage policies includes contracts. Contract table SELECT grants owner OR admin; admin ALL adds a separate permissive grant. Profile grants include self, parent-label and admin scope; role grants include self/admin SELECT and conditional admin ALL, subject to separate SQL grants. Detailed Storage inventory and staged client gaps appear in `CONTRACTS_ACCESS_REPORT.md`.

ProtectedRoute still checks `if (userRole && !allowedRoles.includes(userRole))`; null role does not enter that rejection branch. It does not consume profile status. This confirms source remains relevant to prior fail-open findings, not that any production exploit was attempted.

## Verification and blockers

`node scripts/phase1b-contracts-security.test.cjs` passes 2/2 source checks. New isolated contracts role diagnostic passes. Ten safe public Storage GETs across `.com`/`.space` returned HTTP 400 for nonexistent paths, anonymous/invalid credentials and invalid signing token; these cannot establish existing-object authorization or genuine signed URL tamper/expiry.

Blockers: incident-lock release; controlled public routing; complete safe isolated auth/Storage stack and actual role/status identities; operation-specific business oracle for reviewer/status/global notifications; closure and retest of historical SQL/frontend violations; valid object lifecycle plus signed URL tamper/expiry tests; deployed public verification; independent QA. No production PASS or readiness points claimed. Phase 2 remains blocked.
