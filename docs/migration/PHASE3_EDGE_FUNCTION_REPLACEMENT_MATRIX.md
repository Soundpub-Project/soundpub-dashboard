# Phase 3 Edge Function Replacement Matrix

**Overall replacement status: BLOCKED.**

Evidence date: 2026-10-28. Phase1G's 37-entrypoint map remains authoritative for disposition. Current `src` supplies callers; local Edge source supplies responsibility only, not current deployed behavior. No function invocation, SSH, production operation, deployment, secret read or provider request performed.

## Scope and counts

Source scan finds **24 distinct `functions.invoke` names / 36 sites**, plus `sso-login` through three direct fetch sites and `info-soundpub` as one displayed endpoint URL. This yields 25 runtime-called names / 39 invocation or fetch sites, and one additional endpoint-reference name. Eleven of 37 mapped entrypoints have no frontend runtime call or endpoint URL reference found. Absence is not permission to remove shared/external/scheduled consumers.

Disposition counts remain **BACKEND_API 11, WORKER 4, WEBHOOK 1, AUTH_ADAPTER 14, STORAGE_ADAPTER 1, DEPRECATE 2, LATER_REVIEW 4**. Future service descriptions below are **unimplemented** unless a registered route is named explicitly. No guessed route is advertised as live.

Frontend migrated: **0 fully accepted replacements**. Role/status code has a dev-only adapter branch; legacy fallback remains. No row has frontend behavioral parity or independent QA accepted by this review. Test status “not verified” means no operation-specific replacement test was executed or accepted here; historical foundation tests do not prove that function's replacement.

## Entrypoint matrix

| Function | Future disposition | Domain / current responsibility | Caller / current source evidence | New endpoint or worker / actual scope | Frontend migrated / test status / state |
| --- | --- | --- | --- | --- | --- |
| `auth-email-hook` | LATER_REVIEW | Shared GoTrue email hook | No `src` caller; shared hook consumer recorded Phase1G | No Soundpub clone; later scoped notification adapter and shared-owner review | N/A shared; not verified; DEFERRED. |
| `backup-storage-to-drive` | WORKER | Storage backup to external Drive connector | No `src` caller found; scheduler/consumer not established | Unimplemented manifest-scoped backup worker; generic outbox is insufficient | N/A browser; no backup/restore replacement proof; BLOCKED. |
| `change-own-password` | AUTH_ADAPTER | Change current account password | Settings `:101` | No route; provider-native verified credential operation, Phase4 | No; not verified; DEFERRED Auth. |
| `create-copyright-invoice` | BACKEND_API | Copyright registration invoice | `src/lib/xendit.ts:43` helper | Unimplemented copyright payment service with idempotent sandbox invoice | No; not verified; BLOCKED. |
| `create-user` | AUTH_ADAPTER | Privileged/label managed account provision | AddUserDialog `:239`; LabelAddArtistDialog `:94` | No account-create route; scoped local provision + later provider adapter, hierarchy/identity map | No; not verified; BLOCKED business provisioning; real Auth Phase4. |
| `create-whitelabel-artist` | AUTH_ADAPTER | Whitelabel-owned managed artist | AddUserDialog `:217` | No route; local roster provisioning and ownership plus later provider integration | No; not verified; BLOCKED. |
| `create-xendit-invoice` | BACKEND_API | Paid release invoice | `src/lib/xendit.ts:27` helper | Unimplemented release payment service; no production Xendit | No; mock provider interface alone insufficient; BLOCKED. |
| `delete-royalty-upload` | BACKEND_API | Audited import reversal/balance rebuild | UploadRoyalty `:791`; calls internal `reverse_royalty_upload` | Unimplemented royalty reversal service; distinct from missing composer `delete_royalty_upload` RPC | No; not verified; BLOCKED. |
| `delete-user` | AUTH_ADAPTER | Account lifecycle and related cleanup | DeleteUserDialog `:43`; Users `:745` | No delete route; Soundpub-local lifecycle/retention, never shared identity deletion | No; not verified; BLOCKED business lifecycle. |
| `download-release-invoice` | STORAGE_ADAPTER | Authorized invoice generation and PDF retrieval | Invoices `:105` | Generic `GET /api/v1/storage/objects/:objectId/url` exists; invoice generator, payment ownership and asset linking absent | No; generic Storage tests only; BLOCKED. |
| `gcs-manage` | DEPRECATE | Legacy GCS list/manage/delete; recorded disabled stub | StorageSettings `:178,263,311` | No replacement administration API; retire only after supported Storage UI and consumer review | No; do not claim current GCS route works; DEFERRED retirement, workflow BLOCKED. |
| `gcs-upload` | DEPRECATE | Legacy GCS upload; recorded disabled stub | StorageSettings `:218` | Generic signed Storage exists; bucket UI, legacy import and provider behavior not replaced | No; not verified; DEFERRED retirement, workflow BLOCKED. |
| `get-catalog-tracks` | BACKEND_API | Public landing catalog projection | LandingPage `:80` | Unimplemented public allowlisted catalog service; authenticated API client alone does not cover public access | No; not verified; BLOCKED. |
| `get-ga4-config` | BACKEND_API | Public GA4 configuration | GA4Provider `:46`; StorageSettings `:348` | Unimplemented allowlisted public settings/analytics projection; no secret return | No; not verified; BLOCKED. |
| `hello` | LATER_REVIEW | Remote-only example; unknown owner/consumer | No `src` caller; Phase1G remote inventory only | Outside Soundpub automatic copy/removal; no endpoint | N/A; not verified; DEFERRED. |
| `info-soundpub` | BACKEND_API | ICCN public integration information | IccnIntegrationSettings `:22` endpoint URL; no runtime fetch there | Unimplemented public integration-info service; verify external consumers | No; not verified; BLOCKED. Current source uses lowercase; historical mixed-case audit finding is not current caller spelling. |
| `main` | LATER_REVIEW | Shared Edge runtime/router | No frontend named invocation; platform ingress recorded Phase1G | Dedicated Fastify ingress exists; shared router ownership/removal is separate | N/A shared; no shared-consumer replacement proof; DEFERRED. |
| `process-royalty-upload` | WORKER | Validate/resolve import, managed artists and transactional commit | UploadRoyalty `:682`; internal `commit_royalty_upload` | Unimplemented royalty import worker/service; outbox framework does not parse/commit these rows | No; not verified; BLOCKED. |
| `remove-artist-from-label` | BACKEND_API | Remove managed artist/label relationship with guards | DeleteArtistDialog `:43` | Unimplemented roster lifecycle transaction, release/history ownership checks | No; not verified; BLOCKED. |
| `reset-password` | AUTH_ADAPTER | Custom password recovery token consume | No literal frontend function caller; native GoTrue recovery pages exist | Provider-native recovery, old-token consumer review; no replacement route | N/A old function caller; not verified; DEFERRED Phase4. |
| `send-app-email` | WORKER | Template mail / role broadcast | AnnouncementDialog `:55`; Payouts `:136` | `POST /api/v1/actions/notification` queues actor-only synthetic event; no template/recipient/capability parity | No; foundation worker tests only; BLOCKED. |
| `send-password-reset` | AUTH_ADAPTER | Custom recovery mail/rate limit | No `src` function caller; native Auth recovery remains | Provider-native recovery + signed scoped notification; review other consumers | N/A function caller; not verified; DEFERRED Phase4. |
| `send-royalty-notification` | WORKER | Royalty email delivery | No `src` caller found; local function performs admin check | Unimplemented royalty outbox handler; recipient scope/provider mocks | N/A browser; consumer/behavior unverified; BLOCKED replacement. |
| `send-verification-email` | AUTH_ADAPTER | Custom enrollment verification mail | No `src` function caller; native Auth resend/verification remains | Provider-native verified enrollment and signed notification | N/A function caller; not verified; DEFERRED Phase4. |
| `set-artist-password` | AUTH_ADAPTER | Label/whitelabel managed artist credential | WhitelabelDashboard `:225` | No route; roster ownership/hierarchy plus provider credential adapter | No; not verified; DEFERRED provider, business capability BLOCKED. |
| `spotify-fetch-artist` | BACKEND_API | Search/sync artist provider data | ArtistProfile `:332,381` | Unimplemented authenticated bounded Spotify proxy/cache; fixture/mock only | No; not verified; BLOCKED. |
| `sso-login` | AUTH_ADAPTER | Keycloak/ICCN token exchange and account linking | SsoAuthContext `:47`; IccnIframeAuth `:43,77`; direct fetch, not invoke | No SSO route; verified issuer/audience/subject adapter, explicit linking; no email-only bind | No; not verified; DEFERRED Phase4. |
| `start-user-impersonation` | AUTH_ADAPTER | Privileged impersonation/session change | Users `:190` | No route; audited short-lived explicit capability and active-status/origin checks | No; not verified; BLOCKED capability; provider sessions Phase4. |
| `test-gcs` | LATER_REVIEW | Legacy provider diagnostic | StorageSettings `:141` | No diagnostic route; owner/need decision before retention/removal | No; not verified; DEFERRED. |
| `transfer-artist-label` | BACKEND_API | Roster transfer with historical royalty policy | `src/services/users.ts:81` legacy branch | `PUT /api/v1/admin/users/:id/roles` supports new local assignments only; existing-parent change intentionally conflicts | No transfer parity; BLOCKED. Do not label role endpoint a successful transfer replacement. |
| `update-app-settings` | BACKEND_API | Privileged settings writes | AuthNoticeSettings `:27`, IccnIntegrationSettings `:55`, PayoutSettings `:38`, PricingSettings `:80`, StorageSettings `:112`, SuperAdminSettings `:77` | Unimplemented validated settings service; split public/user/admin/secret projections | No; not verified; BLOCKED. |
| `update-user-password` | AUTH_ADAPTER | Admin credential update | ChangePasswordDialog `:56` | No route; scoped provider-native password action; no shared-account mutation | No; not verified; DEFERRED provider; business UI BLOCKED. |
| `update-user-role` | BACKEND_API | Change application role | `src/services/users.ts:76` fallback; ChangeRoleDialog uses service | Registered `PUT /api/v1/admin/users/:id/roles`; arrays + optional parent; transaction/audit/hierarchy | Dev branch only, not accepted migration. Recorded backend tests; DTO/list/roster/full UI parity pending. FRONTEND_ADAPTER_READY slice; domain BLOCKED. |
| `update-user-status` | AUTH_ADAPTER | Source status and Auth suspension side effect | `src/services/users.ts:57` fallback; ChangeStatusDialog uses service | Registered `PATCH /api/v1/admin/users/:id/status` changes Soundpub-local state only; no global GoTrue ban | Dev branch only; recorded backend tests, status/provider compatibility pending. FRONTEND_ADAPTER_READY local slice; Auth migration DEFERRED. |
| `verify-email` | AUTH_ADAPTER | Custom verification token consume | No frontend named function caller; native verification pages do exist | Provider-native verification; legacy token/consumer review | N/A function caller; not verified; DEFERRED Phase4. |
| `verify-password-reset-token` | AUTH_ADAPTER | Custom recovery token verification | No `src` function caller | Provider-native recovery/session verification; old consumer inventory pending | N/A function caller; not verified; DEFERRED Phase4. |
| `xendit-webhook` | WEBHOOK | External invoice/payment callback and state changes | Provider callback; no `src` function caller | Registered `/api/v1/webhooks/events` is fake HMAC/mock-payment intake only. Xendit adapter/settlement service unimplemented | N/A browser; no Xendit replay/settlement parity; BLOCKED. No callback registration authorized. |

## Evidence and compatibility boundaries

The generated caller appendix uses full source paths for every literal invocation, SSO fetch and info endpoint reference. Named helper calls in `src/lib/xendit.ts` remain frontend dependencies even when pages invoke the helper rather than Edge directly. Settings' displayed info URL is classified as an endpoint contract reference, not a successful request.

Phase1G records five semantic deployed/repository drifts: `backup-storage-to-drive`, `send-app-email`, `send-royalty-notification`, `update-user-role`, `xendit-webhook`. Local source alone cannot establish current production handler behavior. Preserve that uncertainty and remote-only fixes during later remediation. Shared `main`, `auth-email-hook`, unowned `hello` and unresolved diagnostics must not be copied or disabled based on absent frontend callers.

No function replacement can pass solely because a provider interface, worker loop, Storage signed URL or mock webhook exists. Preserve request validation, output/error mapping, current role/status/ownership, transaction/compensation, idempotency and side effects. High-risk invoice/import/reversal flows need deterministic synthetic contract/concurrency tests and frontend regression. Source native Auth references are PHASE4_AUTH; unaccepted business callers remain LATER_PHASE. Shared/legacy entries require explicit owner/consumer review before removal.

Production Xendit, shared Auth, shared mail hooks, source Storage and callback URLs remain untouched. Coverage and disposition reconciliation check lives in the domain matrix.

## Extracted frontend caller evidence

Literal names extracted across all `.ts` / `.tsx` files under `src`, including multiline calls. Line numbers are snapshot locators, not runtime proof.

| Name | Exact source sites |
| --- | --- |
| `change-own-password` | `src/pages/Settings.tsx:101` |
| `create-copyright-invoice` | `src/lib/xendit.ts:43` |
| `create-user` | `src/components/users/AddUserDialog.tsx:239`; `src/components/users/LabelAddArtistDialog.tsx:94` |
| `create-whitelabel-artist` | `src/components/users/AddUserDialog.tsx:217` |
| `create-xendit-invoice` | `src/lib/xendit.ts:27` |
| `delete-royalty-upload` | `src/pages/UploadRoyalty.tsx:791` |
| `delete-user` | `src/components/users/DeleteUserDialog.tsx:43`; `src/pages/Users.tsx:745` |
| `download-release-invoice` | `src/pages/Invoices.tsx:105` |
| `gcs-manage` | `src/components/settings/StorageSettings.tsx:178`; `src/components/settings/StorageSettings.tsx:263`; `src/components/settings/StorageSettings.tsx:311` |
| `gcs-upload` | `src/components/settings/StorageSettings.tsx:218` |
| `get-catalog-tracks` | `src/pages/LandingPage.tsx:80` |
| `get-ga4-config` | `src/components/analytics/GA4Provider.tsx:46`; `src/components/settings/StorageSettings.tsx:348` |
| `process-royalty-upload` | `src/pages/UploadRoyalty.tsx:682` |
| `remove-artist-from-label` | `src/components/users/DeleteArtistDialog.tsx:43` |
| `send-app-email` | `src/components/notifications/AnnouncementDialog.tsx:55`; `src/pages/Payouts.tsx:136` |
| `set-artist-password` | `src/pages/WhitelabelDashboard.tsx:225` |
| `spotify-fetch-artist` | `src/pages/ArtistProfile.tsx:332`; `src/pages/ArtistProfile.tsx:381` |
| `start-user-impersonation` | `src/pages/Users.tsx:190` |
| `test-gcs` | `src/components/settings/StorageSettings.tsx:141` |
| `transfer-artist-label` | `src/services/users.ts:82` |
| `update-app-settings` | `src/components/settings/AuthNoticeSettings.tsx:27`; `src/components/settings/IccnIntegrationSettings.tsx:55`; `src/components/settings/PayoutSettings.tsx:38`; `src/components/settings/PricingSettings.tsx:80`; `src/components/settings/StorageSettings.tsx:112`; `src/components/settings/SuperAdminSettings.tsx:77` |
| `update-user-password` | `src/components/users/ChangePasswordDialog.tsx:56` |
| `update-user-role` | `src/services/users.ts:77` |
| `update-user-status` | `src/services/users.ts:58` |

Direct URL contracts outside `functions.invoke`: `src/context/SsoAuthContext.tsx:47` builds `sso-login` URL used by fetch; `src/pages/IccnIframeAuth.tsx:43,77` fetch `sso-login`; `src/components/settings/IccnIntegrationSettings.tsx:22` displays `info-soundpub` URL. These are additional to the invocation table.
