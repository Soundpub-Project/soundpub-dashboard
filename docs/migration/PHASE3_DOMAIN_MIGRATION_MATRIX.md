# Phase 3 Domain Migration Matrix

Evidence date: 2026-10-28. Agent G owns this document and the RPC, Edge Function and Realtime replacement matrices only. Documentation review; no production operations, deployment, data import, provider calls or application changes performed. Existing dirty files belong to their existing owners.

## Authority and interpretation

Read the full Phase3 attachment (`C:\Users\bimok\.codex\attachments\5ce24291-61ea-4159-a640-f0886e675d3d\Pasted text.txt`), `SUPABASE_MIGRATION_AUDIT.md`, Phase1G final/database/Auth/Storage contracts and function map, Phase2 final report and architecture documents under `docs/backend/`. Phase2 PASS covers an isolated foundation, not application-domain parity. Current source takes precedence over illustrative routes in those documents.

This is a working-tree snapshot during parallel work. Source references below are repository-relative. The source evidence appendix records hashes; rerun the local check and review changed contracts before updating acceptance. Nothing here certifies a deployed route. “Registered” means source registers a handler and bootstrap supplies its dependency. A proposed replacement service is explicitly **unimplemented**, unless a registered route is named.

| State | Required meaning |
| --- | --- |
| NOT_STARTED | No replacement implementation evidenced for that operation. |
| BACKEND_READY | Backend slice has implementation and recorded isolated test evidence; application parity can still be missing. |
| FRONTEND_ADAPTER_READY | Frontend branch calls shared API infrastructure; full behavioral acceptance still pending. |
| PARITY_VERIFIED | Operation-specific input/output, auth, filtering, status, error, transaction and side-effect comparison passed. Not awarded by this review. |
| DECOUPLED | All attachment section 48 gates passed, including removed direct calls, frontend regression and independent QA. No domain earns this state here. |
| DEFERRED | Explicit later-phase or owner decision, with dependency retained. Not equivalent to completion. |
| BLOCKED | Named missing implementation, unknown contract or compatibility failure prevents domain acceptance. |

## Current registered API boundary

Evidence: `backend/src/api/index.ts`, `backend/src/api/users.ts`, `backend/src/main.ts`, `backend/src/users/{contracts,index,repository}.ts`. Phase2 reports historical 33 passing tests. The existing `backend/agentc-users-test-results.txt` records 45 passing tests including users work; this documentation task did not execute that suite. Neither count proves frontend acceptance.

| Registered source contract | Dependency / actual scope | Remaining compatibility boundary |
| --- | --- | --- |
| `GET /api/v1/me` | Authenticated local UUID and current roles only. | No profile, dashboard aggregates or balances. |
| `GET /api/v1/profile`, `PATCH /api/v1/profile` | Conditional `deps.users`; bootstrap wires `createUsersService`. Owner profile; allowlisted patch; audit. | Frontend API currently exposes GET only; Settings still writes Supabase. |
| `GET /api/v1/admin/users` | Users service; active admin; query `limit,cursor,search,status,role`; response `{items,nextCursor}`. Default 50, max 100. | Frontend adapter reads one page and drops `nextCursor`; cannot equal legacy unbounded list. |
| `PATCH /api/v1/admin/users/:id/status` | Local status, hierarchy, transaction and audit. | No shared GoTrue ban. Inactive access intentionally denies; product compatibility decision remains. |
| `PUT /api/v1/admin/users/:id/roles` | Local roles plus optional `parentLabelId`; audited, hierarchy checked. | Existing parent transfer returns conflict; does not implement historical roster/royalty transfer. |
| `POST /api/v1/admin/users/:userId/suspend` | Foundation local suspension with reason. | Not account deletion, password reset, impersonation or provider revocation. |
| `POST /api/v1/storage/objects`, `GET /api/v1/storage/objects/:objectId/url` | Conditional Storage dependency, wired by bootstrap; verified upload/private signed URL. | No business-resource linking, invoice generation or public catalog projection. |
| `POST /api/v1/storage/uploads`, `POST /api/v1/storage/uploads/:objectId/complete` | Conditional signed-upload methods, supplied in bootstrap. | Completion parameter is object ID, not an assumed separate upload ID. No registered Storage DELETE route. |
| `POST /api/v1/actions/notification` | Conditional async dependency; idempotent synthetic actor event. | Does not accept existing announcement recipients/templates or provide inbox/read APIs. |
| `POST /api/v1/webhooks/events` | Mock-payment exact-byte HMAC intake, replay protection and outbox. | Not Xendit authentication, invoice settlement or payout completion. |

No Artists, Labels, Releases, Tracks, Royalties, Payouts, Payments, Copyright, Takedown, settings-read/write, audit-list, notification-inbox, catalog, Spotify or GA4 domain routes are registered in the inspected source. Attachment examples such as `GET /api/v1/artists` or `DELETE /api/v1/storage/objects/:id` must not be advertised as implemented.

## Domain scope and migration order

Keep attachment order; treat shared private Storage and notification intent as prerequisites to financial/legal writes. Auth provider cutover stays Phase4. Proposed service names below describe responsibilities, not new callable endpoints.

| Order / domain | Actual frontend operations and evidence | Scope / DTO boundary | Replacement and current state | Blocker / acceptance evidence still needed |
| --- | --- | --- | --- | --- |
| 1. Users / Profiles / Roles | `src/hooks/useAuth.tsx:166` calls `getCurrentProfile`; `src/pages/Users.tsx:153` calls `listUsers`; `src/services/users.ts` routes profile/list/role/status through dev flag, retains legacy fallback. `src/pages/Settings.tsx:157,178` writes profile; user dialogs still provision/delete/reset credentials; `UserOrphanAudit.tsx:136,194` scans/repairs links. | Selected local user, seven role values, explicit status; no provider tokens/secrets. Profile monetary field is exact decimal. | Profile/list/status/roles adapters: FRONTEND_ADAPTER_READY for code presence. Registered users backend plus recorded synthetic tests. Whole domain: BLOCKED; account lifecycle and orphan services absent. | Backend `balance:string` vs `BackendUser.balance?:number`; list loses cursor; parent display and role priority require parity; Settings PATCH unused; source status/password/impersonation effects differ; browser/independent QA pending. |
| 2. Artists / Labels | `src/pages/ArtistProfile.tsx:174` summary RPC, `:332,381` Spotify; profile writes and roster reads in `MyArtists.tsx`; `src/services/users.ts:81,87,90` transfer/profile/artist writes; AddUserDialog creates roster entries. | Owner/approved label member/admin visibility; parent label is not authorization by itself. Historical royalty owner must remain stable. | Artist profile, roster, summary, label transfer and provider proxy services unimplemented. BLOCKED. | No domain routes; `setRoles` explicitly refuses existing-parent transfer. Need owner/unrelated artist/label/admin/superadmin fixtures, roster joins and history-preserving transactions. |
| 3. Releases / Tracks | `src/pages/Releases.tsx:120,199,349,379,411`, `ReleaseDetail.tsx:217,294`, `Tracks.tsx:92,97`; ReleaseFormPage inserts/updates releases/tracks; `:389` eligibility RPC; DeleteReleaseDialog `:35` delete/refund. | List/detail/create/edit/submission/review/status, nested artists/contributors, ownership, custom-label eligibility, media references and delete/refund. | Release/track services and catalog projection unimplemented. BLOCKED. | No list/detail/mutation routes; preserve filters/sorts/counts and form validation; financial refund + audit atomicity; upload finalization/linking; reject partial multi-call transaction replacement. |
| 4. Storage / Media | `MediaUploadSection.tsx` Storage + TUS, `ReleaseFormPage.tsx` covers, `src/lib/audioClipper.ts` clips; Settings avatars, LabelLogoSettings branding; AdminPayouts proof; CopyrightRegistrationReview contracts; Takedown documents; Invoices Edge-generated PDF; StorageSettings GCS calls. | Logical asset ID plus provider/bucket/key; pending/ready/failed/deleted state; private finance/legal/full media; approved public branding/preview separate. | Generic synthetic Storage backend: BACKEND_READY. Application workflows: BLOCKED; no frontend Storage adapter. GCS stubs DEFERRED retirement until replacement/consumer decision. | Bootstrap allows text/plain, PNG, JPEG, PDF, not track audio/video. TUS/resumable behavior, large media, ACL/resource links, public projection, delete route, cleanup/retention and frontend tests absent. |
| 5. Notifications / Audit / Settings | `NotificationBell.tsx:65,75,90` inbox/read; AnnouncementDialog `:41,55` insert/email; NotificationManagement list/write/delete; AuditLogs `:96`; settings components directly read `app_settings` and invoke `update-app-settings`. `record_auth_audit` remains RPC. | PUBLIC_SETTINGS allowlist; USER_SETTINGS owner preferences; ADMIN_SETTINGS privileged validated values; SECRET_CONFIG server only. Inbox includes owned/global visibility and explicit read semantics. | Generic notification enqueue/outbox: BACKEND_READY foundation only. Inbox, announcements, audit list and settings services unimplemented. BLOCKED. | No inbox/read/settings/audit routes; raw settings export cannot substitute public DTO; do not expose source SECRET_CONFIG. Global read state, pagination and recipient scopes need decisions. Realtime matrix records source defects. |
| 6. Royalties | `src/hooks/useRoyaltyData.ts:10–218` eleven reporting RPCs; `UploadRoyalty.tsx:682,791` import/reverse Edge; `src/lib/fetchAllRoyalties.ts:28` paged direct royalty reads; ComposerRoyalties, CopyrightAnalytics and ComposerRoyaltyUpload write/query composer rows. | Exact money, stream counts, periods, shares, historical label attribution, upload provenance and idempotency. | Reporting/import/reversal domain services unimplemented. BLOCKED. | Generic outbox does not implement import. Need all RPC output/visibility filters, atomic archive/replace/rebuild, numeric precision, reservation interaction, replay/concurrency and negative fixtures. Existing financial provenance gaps remain deferred cutover blockers. |
| 7. Payouts / Payments | `Payouts.tsx:81,111,120,133,136` role stats, request, admin lookup, notifications/email; `AdminPayouts.tsx:149` status RPC; `src/lib/xendit.ts:27,43` invoices; Invoices `:52,105` history/PDF; PaymentCallback is query-string UI/countdown. | Eligibility and balances server authoritative; decimal amounts, reservations, strict transitions, proof assets, invoice IDs and idempotency. | Payout/payment/invoice/PDF domain services unimplemented. BLOCKED. Mock webhook is foundation only. | No financial routes. Need one transaction for request/reservations/audit/outbox; no second debit on paid; rejection releases reservations; mock/sandbox provider and ambiguous timeout reconciliation. URL callback status cannot prove paid state. |
| 8. Copyright | CopyrightOnboarding `:36,62`, CopyrightRegistrationForm schema alias queries and multi-step writes; CopyrightDashboard `:104–133`; CopyrightRegistrationReview `:247,276,392`; CopyrightRoyaltyUpload `:135,184`; CopyrightRoyaltyUploadHistory `:63,82`. | Registrations, works, files, payment, contracts, composer royalties; validated statuses and private legal documents. | Copyright services unimplemented. BLOCKED; four composer-upload/history RPC contracts remain unknown/absent in recorded catalog. | Missing RPCs are active callers, not dead code. Need explicit identity/validation/import/history/reversal/settlement decisions; review/contract state machine, private asset permissions, audit and transaction parity. |
| 9. Takedown | `src/pages/Takedown.tsx:82,83,143–154,171–185`; `TakedownDetail.tsx:38,61,63,79,91`. `(supabase as any).from` still reads/writes cases, items, targets, documents and history. | Case/requester/label/reviewer DTOs; snapshots, DSP status, contact/declaration, document metadata, chronological history. | Takedown service unimplemented. BLOCKED. | No Takedown routes. Separate inserts/updates currently allow partial success; replacement needs transactional case/item/target/history/audit/outbox, staged document recovery and server-derived actor. Reviewer UI does not prove backend policy. |

## Shared contracts and explicit differences

| Contract concern | Evidence / required mapping | Status |
| --- | --- | --- |
| Money | `backend/src/users/contracts.ts` returns string balance; frontend `src/api/users.ts` declares number. Legacy reporting uses `Number(...)`. Keep backend exact decimals; convert explicitly only for display. Never calculate authoritative availability in browser. | BLOCKED compatibility defect; no financial parity claim. |
| Roles | Source vocabulary: `superadmin,admin,label,artist,user,copyright,whitelabel`; backend roles lookup preserves values. Frontend selects one primary role; backend returns array. Verify all multi-role cases and priority. | Adapter exists; parity pending. |
| Status | `active,inactive,suspended`; target denies nonactive locally. Source inactive login and global Auth ban are different behaviors. No global source ban in replacement. | Intentional security boundary; product parity decision pending. |
| Pagination | Backend users `{items,nextCursor}`, stable created-at/UUID ordering and validated filters; frontend single-page adapter ignores cursor. Legacy queries often unbounded/offset/range. | BLOCKED for complete list parity. |
| Profile mutation | Backend allowlists name/contact/branding URLs; rejects role/status/balance mass assignment. Existing composer code, artist completion, notification preferences and roster edits need separate capabilities. | Owner PATCH registered; current frontend not wired. |
| Errors | Backend `{error:{code,message,requestId}}`; client maps HTTP to typed UI categories. Shared timeout/cancellation exists; no automatic retry. Legacy raw Supabase/SQL error parsing still exists in nonmigrated domains. | Client foundation only; frontend error/regression tests pending. |
| Settings | Never send all `app_settings` as DTO. Partition public branding/pricing/notice, owner preferences, admin integration settings and server-only secrets. Gallery remains disabled for synthetic migration scope. | No replacement endpoints. |
| Identity and source choice | `useBackendUsers` requires DEV + explicit flag; `useAuth` token provider uses synthetic dev token for branch. Browser Supabase login/session still exists; no proof those identities match synthetic users. | Auth references classified PHASE4_AUTH; business fallbacks LATER_PHASE until accepted. |
| RLS | `backend/migrations/0006_user_profiles.sql` declares BACKEND_ONLY_RLS_OPTIONAL for backend-private profile table. Other domain tables lack implementations and per-table classifications. | Do not claim domain RLS strategy complete. |

## Preserved inclusion and blocked states

Phase1G database ledger covers 33 source tables and 56 functions, including shared-interface replacements, not permission to copy ACLs or SECURITY DEFINER behavior. Only 27 business-state table dispositions are future retention requirements; six operational histories rebuild empty. Current foundation does not reproduce that entire schema.

Auth scope is 110 INCLUDE + 16 INCLUDE_SHARED_IDENTITY candidates; 29 excluded and 56 deferred. Production import remains zero. Historical/default/deferred endpoints use typed non-login references and never gain roles/login through FKs, paths or email matches. Selected UUID continuity is a future requirement, not an executed migration.

Storage scope remains 582 local INCLUDE + 408 external reference identities; 108 excluded and 1,807 deferred. These are snapshot-bound identity counts, not verified bytes. Whole buckets are never inclusion units. Gallery's 18 legacy `.com` candidates remain disabled/deferred, not aliases to `.space`. External bytes/rights, provider binding, source remediation, financial provenance, restore and cutover gates remain outstanding.

Every direct business dependency below is retained as LATER_PHASE unless its replacement passes the completion gate. Shared platform entrypoints are explicitly outside automatic migration/removal. No claim of `UNEXPECTED = 0` for the entire application is made by these four matrices; full inventory/classification belongs to the inventory and QA owners.

## Verification and handoff

Validation performed here is static reconciliation of actual `src` callers, Phase1G registry, backend route registrations, DTOs and references. No browser, API, DB or provider test was executed. No domain is PARITY_VERIFIED or DECOUPLED by this review. Coordinator should reconcile the companion matrices with inventory/parity/security/QA reports after parallel code settles.

### Runnable local coverage check

Run from repository root with Python 3. This reads source/docs only; it checks name coverage, not behavior or runtime readiness.

```python
from pathlib import Path
import re

base = Path('docs/migration')
rpc_doc = (base / 'PHASE3_RPC_REPLACEMENT_MATRIX.md').read_text(encoding='utf-8')
edge_doc = (base / 'PHASE3_EDGE_FUNCTION_REPLACEMENT_MATRIX.md').read_text(encoding='utf-8')
rt_doc = (base / 'PHASE3_REALTIME_REPLACEMENT_MATRIX.md').read_text(encoding='utf-8')
patterns = {
    'rpc': r'''\.rpc\s*\(\s*['"]([^'"]+)''',
    'edge': r'''\.functions\s*\.invoke\s*\(\s*['"]([^'"]+)''',
}
found = {kind: set() for kind in patterns}
channels = set()
for path in Path('src').rglob('*'):
    if path.suffix not in ('.ts', '.tsx'):
        continue
    source = path.read_text(encoding='utf-8')
    for kind, pattern in patterns.items():
        found[kind].update(re.findall(pattern, source))
    channels.update(re.findall(r'''\.channel\s*\(\s*['"]([^'"]+)''', source))
assert all(f'`{name}`' in rpc_doc for name in found['rpc'])
assert all(f'`{name}`' in edge_doc for name in found['edge'])
assert all(f'`{name}`' in rt_doc for name in channels)
legacy = (base / 'PHASE1G_FUNCTION_REPLACEMENT_MAP.md').read_text(encoding='utf-8')
entries = re.findall(r'^\| `([^`]+)` \| ([A-Z_]+) \|', legacy, re.M)
assert len(entries) == len(set(name for name, _ in entries)) == 37
assert all(f'`{name}` | {kind} |' in edge_doc for name, kind in entries)
catalog = (base / 'PHASE1G_DATABASE_EXTRACTION_CONTRACT.md').read_text(encoding='utf-8')
routines = re.findall(r'^\| (soundpub\.[^|]+) \| function \|', catalog, re.M)
assert len(routines) == 56
assert all(f'`{signature.strip()}`' in rpc_doc for signature in routines)
print('PASS: frontend RPC/Edge/channel names, 37 dispositions, 56 SQL signatures covered')
```

## Final reconciliation snapshot

**Status: BLOCKED.** Coordinator-supplied current inventory counts: **145 direct non-auth business call matches**, **36 auth matches**. These use the coordinator inventory counting method; they are not counts of unique endpoints, RPC names, channel handlers or migrated features. This task did not independently reproduce those two aggregate counts. Auth references remain PHASE4_AUTH where applicable; active non-auth business dependencies retain explicit blockers.

Local literal scan independently extracted 27 RPC names / 32 RPC sites; 24 invoked Edge names / 36 invocation sites; 3 channel constructions. Companion matrices retain every extracted name/site and all 56 catalog SQL signatures. No domain marked DECOUPLED.

### Source digest evidence

SHA-256 identifies inspected working-tree files; it is not deployed-source attestation. Parallel changes after this snapshot require reconciliation.

| Source | SHA-256 |
| --- | --- |
| `backend/src/api/index.ts` | `5637d18847ebae39531a8372a0d2a9650f88cb349cf48ac5259b24842d6017c1` |
| `backend/src/api/users.ts` | `04114ef07c3f98e7cbca6a7e6105c63a7943e8c38651ba1772444dc253806f48` |
| `backend/src/main.ts` | `79bf3fbd14c392e1f085d50b4a924235f62ecffa8542a0052da3888aec00ed2e` |
| `backend/src/users/contracts.ts` | `ee1db4c1445df91f5cb827cc42ef0a65b1fd4ce07698a603a6f3389a53784280` |
| `backend/src/users/index.ts` | `ee3e34be8e5f7fa24440a1898dd8c5e844e72b2ca1eb727d20cc83ad8ffee392` |
| `src/api/client.ts` | `a645e58e398e6c532a7279ae69ac5292bee77424eb36f73c14f2df81b6550a99` |
| `src/api/routing.ts` | `f32548212e30d25882e306cdb586e1594e1c86ca1334cfa37386fbfa6ace2769` |
| `src/api/users.ts` | `c1a6981a61d1e9863413fd99e92b3df4c8de5c4e83fac140c72f5bfcbac77ac4` |
| `src/services/users.ts` | `f5d61611866c9fb9360d4b5c1e0e9bd9221f560971fc6d4fa433bb289c5fc71c` |
| `src/components/layout/DashboardLayout.tsx` | `614a122c543c61a4f72b0946d6bef5f34b15cc578d2ff1bdf86b292705b70d6b` |
| `src/components/notifications/NotificationBell.tsx` | `aaf0fa6a4c6f87465f2dbbfe44a144bfcc2c1e9f6c23237e3d40bb6c50f1c247` |
| `src/components/notifications/NotificationCenter.tsx` | `dafda974f7a81e2748f8d8c978e0286be67fecdcb3cd1d9789e858aa970ae389` |
