# Phase 3 Remaining Supabase References

Status: **BLOCKED**. Agent B. Current exact frontend scan: **145 non-auth business matches + 36 Auth matches = 181** (generated types excluded). These are textual occurrences, not unique business operations or production request volume. Production-active Users legacy adapter is **LATER_PHASE**, never MIGRATED.

Snapshot: 2026-10-28T03:03:46.428Z; dirty workspace at HEAD `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Frontend source fingerprint `ba39acf6a2fd544e87c7ac65e901e61e7efaf9f2ac8872ed69b4fc50228f4e65`. [Complete dependency inventory](PHASE3_FRONTEND_SUPABASE_INVENTORY.md) contains **409 source records + 165 import edges = 574 dependency records**. Scope covers all 166 frontend TS/TSX files, including aliases, cast clients, wrapper imports, raw SSO fetches, TUS, URL-shape assumptions, generated types and session cleanup. Current source changes by other agents are preserved.


Final read-only verification: exact scan counts (145 business / 36 Auth), 409 source rows, 165 import rows and allowed classifications passed. Pinned source fingerprint check failed: current workspace fingerprint was eeb6bcfc626cdf3ed7de62430864333e9fc197f2a8ba433adcb9975afbd359ab, while matrix snapshot is ba39acf6a2fd544e87c7ac65e901e61e7efaf9f2ac8872ed69b4fc50228f4e65. Concurrent workspace edits occurred after the pinned inventory snapshot; line anchors and DTO observations are snapshot evidence. Overall BLOCKED; no parity or current-tree fingerprint PASS claimed.

## Section 49 exact gate

Literal, case-sensitive strings below are counted across frontend source; types.ts has zero of these six strings and is excluded explicitly. Matches within a single line count individually. Multiline `.from()` and `(supabase as any).rpc()` explain why literal totals are smaller than semantic totals.

| Exact pattern | Occurrences | Disposition |
| --- | --- | --- |
| supabase.from( | 45 | Per-hit classification below |
| supabase.rpc( | 24 | Per-hit classification below |
| supabase.functions.invoke( | 36 | Per-hit classification below |
| supabase.storage | 36 | Per-hit classification below |
| supabase.auth | 36 | PHASE4_AUTH except production-active Users service session fallback LATER_PHASE |
| postgres_changes | 4 | Per-hit classification below |

Business subtotal excludes supabase.auth: **45 + 24 + 36 + 36 + 4 = 145**. Auth subtotal: **36**. All **181** exact hits map to D records.

| Section 50 classification | Exact frontend hits |
| --- | --- |
| MIGRATED | 0 |
| PHASE4_AUTH | 40 |
| LATER_PHASE | 120 |
| LEGACY_ONLY | 21 |
| TEST_ONLY | 0 |
| UNEXPECTED | 0 |

**UNEXPECTED = 0** is a classification result only. Active business calls remain; Auth and parity blockers remain. Neither this result nor dev-only route selection passes Phase 3. Overall **BLOCKED**.

## Classification rationale

| Classification | Rule / current evidence |
| --- | --- |
| MIGRATED | Zero. Existing dev API adapters do not establish production routing or parity. |
| PHASE4_AUTH | GoTrue session/auth/recovery/verification/SSO/credential/impersonation contracts intentionally retained for verified Phase 4 identity integration. record_auth_audit is tied to current Auth lifecycle. |
| LATER_PHASE | All reachable application data/RPC/Edge/Storage/Realtime/config dependencies awaiting migration. Includes every Supabase fallback in src/services/users.ts, even its auth.getSession call, because production selects this branch. |
| LEGACY_ONLY | Six retained modules lack a static import path from src/main.tsx; unused Royalties client import and historical migration/docs/scripts also retained explicitly. No deletion inferred. |
| TEST_ONLY | Test fixtures/assertions or explicit safety/negative checks. Reachable StorageSettings diagnostics are active application dependencies, not TEST_ONLY. |
| UNEXPECTED | Zero unexplained scanned matches. New unclassified references must fail this gate; known blocked behavior stays LATER_PHASE/BLOCKED rather than hidden. |

Six source modules classified LEGACY_ONLY by import-graph evidence:

- `src/components/analytics/GA4Provider.tsx`
- `src/components/notifications/NotificationCenter.tsx`
- `src/components/releases/ArtistReleaseFormDialog.tsx`
- `src/components/releases/ReleaseFormDialog.tsx`
- `src/integrations/lovable/index.ts`
- `src/pages/WhitelabelDashboard.tsx`

`WhitelabelDashboard` is retained source; current whitelabel route renders MyArtists. `/catalog` still routes LandingPage, so its function dependency is active despite archived wording in comments. Generated schema types are shared compile-time coupling, not network operations. Royalties still consumes fetchAllRoyalties/useRoyaltyData after its unused client import.

## Every exact frontend hit

One row groups same file/pattern/classification. Each line number maps to its source dependency ID. See D matrix for operation, domain, auth, replacement, state and risk; no raw hit is discarded.

| file | exact pattern | count | line : inventory ID | classification |
| --- | --- | --- | --- | --- |
| src/components/analytics/GA4Provider.tsx | supabase.functions.invoke( | 1 | 46:D004 | LEGACY_ONLY |
| src/components/auth/AuthEnvironmentNotice.tsx | supabase.from( | 1 | 45:D005 | LATER_PHASE |
| src/components/layout/DashboardLayout.tsx | postgres_changes | 2 | 63:D010, 77:D010 | LATER_PHASE |
| src/components/layout/DashboardLayout.tsx | supabase.auth | 1 | 126:D012 | PHASE4_AUTH |
| src/components/notifications/AnnouncementDialog.tsx | supabase.from( | 1 | 41:D013 | LATER_PHASE |
| src/components/notifications/AnnouncementDialog.tsx | supabase.functions.invoke( | 1 | 55:D014 | LATER_PHASE |
| src/components/notifications/NotificationBell.tsx | postgres_changes | 1 | 43:D015 | LATER_PHASE |
| src/components/notifications/NotificationCenter.tsx | postgres_changes | 1 | 34:D020 | LEGACY_ONLY |
| src/components/releases/ArtistReleaseFormDialog.tsx | supabase.auth | 1 | 275:D033 | LEGACY_ONLY |
| src/components/releases/ArtistReleaseFormDialog.tsx | supabase.from( | 7 | 363:D039, 400:D041, 461:D043, 520:D045, 524:D046, 534:D047, 570:D049 | LEGACY_ONLY |
| src/components/releases/ArtistReleaseFormDialog.tsx | supabase.storage | 2 | 289:D034, 295:D035 | LEGACY_ONLY |
| src/components/releases/DeleteReleaseDialog.tsx | supabase.rpc( | 1 | 35:D050 | LATER_PHASE |
| src/components/releases/MediaUploadSection.tsx | supabase.auth | 1 | 136:D051 | PHASE4_AUTH |
| src/components/releases/MediaUploadSection.tsx | supabase.storage | 2 | 207:D053, 210:D054 | LATER_PHASE |
| src/components/releases/ReleaseFormDialog.tsx | supabase.auth | 1 | 512:D062 | LEGACY_ONLY |
| src/components/releases/ReleaseFormDialog.tsx | supabase.from( | 3 | 680:D070, 816:D073, 872:D075 | LEGACY_ONLY |
| src/components/releases/ReleaseFormDialog.tsx | supabase.storage | 3 | 528:D063, 554:D064, 561:D065 | LEGACY_ONLY |
| src/components/releases/ReleaseFormPage.tsx | supabase.auth | 1 | 781:D085 | PHASE4_AUTH |
| src/components/releases/ReleaseFormPage.tsx | supabase.from( | 2 | 393:D079, 990:D093 | LATER_PHASE |
| src/components/releases/ReleaseFormPage.tsx | supabase.storage | 3 | 799:D086, 828:D087, 835:D088 | LATER_PHASE |
| src/components/settings/AuthNoticeSettings.tsx | supabase.from( | 1 | 21:D102 | LATER_PHASE |
| src/components/settings/AuthNoticeSettings.tsx | supabase.functions.invoke( | 1 | 27:D103 | LATER_PHASE |
| src/components/settings/IccnIntegrationSettings.tsx | supabase.functions.invoke( | 1 | 55:D107 | LATER_PHASE |
| src/components/settings/IccnIntegrationSettings.tsx | supabase.storage | 2 | 91:D108, 93:D109 | LATER_PHASE |
| src/components/settings/LabelLogoSettings.tsx | supabase.storage | 2 | 61:D111, 67:D112 | LATER_PHASE |
| src/components/settings/PayoutSettings.tsx | supabase.functions.invoke( | 1 | 38:D116 | LATER_PHASE |
| src/components/settings/PricingSettings.tsx | supabase.functions.invoke( | 1 | 80:D118 | LATER_PHASE |
| src/components/settings/StorageSettings.tsx | supabase.functions.invoke( | 7 | 112:D120, 141:D121, 178:D122, 218:D123, 263:D125, 311:D126, 348:D127 | LATER_PHASE |
| src/components/settings/SuperAdminSettings.tsx | supabase.functions.invoke( | 1 | 77:D129 | LATER_PHASE |
| src/components/settings/SuperAdminSettings.tsx | supabase.storage | 4 | 137:D130, 143:D131, 208:D132, 214:D133 | LATER_PHASE |
| src/components/users/AddUserDialog.tsx | supabase.auth | 1 | 200:D136 | PHASE4_AUTH |
| src/components/users/AddUserDialog.tsx | supabase.functions.invoke( | 2 | 217:D137, 239:D138 | PHASE4_AUTH |
| src/components/users/ChangePasswordDialog.tsx | supabase.auth | 1 | 54:D141 | PHASE4_AUTH |
| src/components/users/ChangePasswordDialog.tsx | supabase.functions.invoke( | 1 | 56:D142 | PHASE4_AUTH |
| src/components/users/DeleteArtistDialog.tsx | supabase.functions.invoke( | 1 | 43:D143 | LATER_PHASE |
| src/components/users/DeleteUserDialog.tsx | supabase.auth | 1 | 41:D144 | PHASE4_AUTH |
| src/components/users/DeleteUserDialog.tsx | supabase.functions.invoke( | 1 | 43:D145 | PHASE4_AUTH |
| src/components/users/LabelAddArtistDialog.tsx | supabase.from( | 1 | 133:D152 | LATER_PHASE |
| src/components/users/LabelAddArtistDialog.tsx | supabase.functions.invoke( | 1 | 94:D149 | PHASE4_AUTH |
| src/components/users/LabelAddArtistDialog.tsx | supabase.storage | 2 | 122:D150, 127:D151 | LATER_PHASE |
| src/components/users/RequestDeletionDialog.tsx | supabase.auth | 1 | 48:D153 | PHASE4_AUTH |
| src/context/SsoAuthContext.tsx | supabase.auth | 3 | 69:D156, 107:D158, 252:D159 | PHASE4_AUTH |
| src/hooks/useAuth.tsx | supabase.auth | 7 | 10:D160, 84:D162, 106:D163, 128:D165, 185:D166, 198:D168, 218:D170 | PHASE4_AUTH |
| src/hooks/useExportCsv.ts | supabase.from( | 10 | 54:D171, 64:D172, 74:D173, 84:D174, 94:D175, 104:D176, 114:D177, 124:D178, 134:D179, 144:D180 | LATER_PHASE |
| src/hooks/useRoyaltyData.ts | supabase.rpc( | 11 | 10:D181, 31:D182, 48:D183, 66:D184, 83:D185, 97:D186, 119:D187, 140:D188, 164:D189, 191:D190, 218:D191 | LATER_PHASE |
| src/integrations/lovable/index.ts | supabase.auth | 1 | 31:D192 | LEGACY_ONLY |
| src/lib/audioClipper.ts | supabase.storage | 1 | 18:D199 | LATER_PHASE |
| src/lib/xendit.ts | supabase.functions.invoke( | 2 | 27:D203, 43:D204 | LATER_PHASE |
| src/pages/AdminPayouts.tsx | supabase.rpc( | 1 | 149:D208 | LATER_PHASE |
| src/pages/AdminPayouts.tsx | supabase.storage | 1 | 146:D207 | LATER_PHASE |
| src/pages/ArtistProfile.tsx | supabase.functions.invoke( | 2 | 332:D218, 381:D220 | LATER_PHASE |
| src/pages/ArtistProfile.tsx | supabase.rpc( | 1 | 174:D210 | LATER_PHASE |
| src/pages/ArtistProfile.tsx | supabase.storage | 2 | 263:D213, 270:D214 | LATER_PHASE |
| src/pages/Auth.tsx | supabase.auth | 1 | 174:D228 | PHASE4_AUTH |
| src/pages/CopyrightDashboard.tsx | supabase.storage | 1 | 80:D232 | LATER_PHASE |
| src/pages/CopyrightRegistrationReview.tsx | supabase.auth | 1 | 345:D266 | PHASE4_AUTH |
| src/pages/CopyrightRegistrationReview.tsx | supabase.rpc( | 3 | 247:D260, 276:D262, 392:D269 | LATER_PHASE |
| src/pages/CopyrightRegistrationReview.tsx | supabase.storage | 2 | 328:D265, 385:D268 | LATER_PHASE |
| src/pages/CopyrightRoyaltyUpload.tsx | supabase.rpc( | 2 | 135:D277, 184:D278 | LATER_PHASE |
| src/pages/CopyrightRoyaltyUploadHistory.tsx | supabase.rpc( | 2 | 63:D279, 82:D280 | LATER_PHASE |
| src/pages/Dashboard.tsx | supabase.from( | 5 | 125:D281, 126:D282, 150:D284, 160:D285, 161:D286 | LATER_PHASE |
| src/pages/ForgotPassword.tsx | supabase.auth | 1 | 38:D288 | PHASE4_AUTH |
| src/pages/IccnIframeAuth.tsx | supabase.auth | 3 | 24:D289, 55:D291, 85:D293 | PHASE4_AUTH |
| src/pages/ImpersonationCallback.tsx | supabase.auth | 1 | 27:D295 | PHASE4_AUTH |
| src/pages/Invoices.tsx | supabase.from( | 2 | 63:D297, 64:D298 | LATER_PHASE |
| src/pages/Invoices.tsx | supabase.functions.invoke( | 1 | 105:D299 | LATER_PHASE |
| src/pages/LandingPage.tsx | supabase.functions.invoke( | 1 | 80:D300 | LATER_PHASE |
| src/pages/MediaLibrary.tsx | supabase.from( | 2 | 256:D304, 257:D305 | LATER_PHASE |
| src/pages/MediaLibrary.tsx | supabase.storage | 5 | 94:D301, 98:D302, 134:D303, 311:D306, 361:D307 | LATER_PHASE |
| src/pages/Payouts.tsx | supabase.from( | 1 | 133:D318 | LATER_PHASE |
| src/pages/Payouts.tsx | supabase.functions.invoke( | 1 | 136:D319 | LATER_PHASE |
| src/pages/Payouts.tsx | supabase.rpc( | 2 | 81:D314, 111:D316 | LATER_PHASE |
| src/pages/Payouts.tsx | supabase.storage | 1 | 164:D320 | LATER_PHASE |
| src/pages/Releases.tsx | supabase.from( | 1 | 408:D339 | LATER_PHASE |
| src/pages/ResetPassword.tsx | supabase.auth | 3 | 37:D341, 80:D342, 86:D343 | PHASE4_AUTH |
| src/pages/Settings.tsx | supabase.functions.invoke( | 1 | 101:D345 | PHASE4_AUTH |
| src/pages/Settings.tsx | supabase.storage | 2 | 147:D346, 152:D347 | LATER_PHASE |
| src/pages/Takedown.tsx | supabase.storage | 1 | 150:D357 | LATER_PHASE |
| src/pages/Tracks.tsx | supabase.from( | 1 | 97:D372 | LATER_PHASE |
| src/pages/UploadRoyalty.tsx | supabase.auth | 1 | 673:D378 | PHASE4_AUTH |
| src/pages/UploadRoyalty.tsx | supabase.functions.invoke( | 2 | 682:D379, 791:D380 | LATER_PHASE |
| src/pages/UserOrphanAudit.tsx | supabase.rpc( | 1 | 136:D381 | LATER_PHASE |
| src/pages/Users.tsx | supabase.auth | 2 | 188:D383, 743:D387 | PHASE4_AUTH |
| src/pages/Users.tsx | supabase.functions.invoke( | 2 | 190:D384, 745:D388 | PHASE4_AUTH |
| src/pages/VerifyEmail.tsx | supabase.auth | 1 | 19:D390 | PHASE4_AUTH |
| src/pages/VerifyEmailRequired.tsx | supabase.auth | 1 | 49:D392 | PHASE4_AUTH |
| src/pages/WhitelabelDashboard.tsx | supabase.functions.invoke( | 1 | 225:D397 | LEGACY_ONLY |
| src/services/users.ts | supabase.auth | 1 | 57:D403 | LATER_PHASE |
| src/services/users.ts | supabase.from( | 7 | 18:D399, 19:D400, 33:D401, 34:D402, 88:D407, 91:D408, 92:D409 | LATER_PHASE |
| src/services/users.ts | supabase.functions.invoke( | 3 | 58:D404, 77:D405, 82:D406 | LATER_PHASE |

## Semantic references omitted by six literal strings

| Reference family | Exact source-record count / evidence | Classification / required migration |
| --- | --- | --- |
| PostgREST query/mutation chains | 230: 130 SELECT, 44 INSERT including 2 UPSERT, 47 UPDATE, 9 DELETE; 25 distinct tables. Casts, multiline receivers and Soundpub aliases included. | LATER_PHASE or retained LEGACY_ONLY; replace entire resource workflow and server authorization. |
| RPC | 32 call sites, 27 distinct RPC names. | Per D row; four missing Copyright contracts remain BLOCKED. record_auth_audit remains Auth lifecycle. |
| Edge Functions | 40 call sites, 26 distinct names: 36 invoke chains plus 4 direct fetches (three sso-login, one info-soundpub). | LATER_PHASE/PHASE4_AUTH/LEGACY_ONLY by D row; preserve Phase1G disposition. |
| Storage | 41 records: 36 SDK chains + TUS upload + 4 generic byte-fetch consumers. | Owner/case/finance resource links and stable asset IDs; private capability URLs; audio-size/resume/MIME parity missing. |
| Auth | 37 source records: 36 SDK chains + auth subscription cleanup. | PHASE4_AUTH except production-active Users legacy adapter session lookup LATER_PHASE. Additional session/type/config coupling in OTHER/import rows. |
| Realtime | 6 source records: three channels, two removeChannel calls, one channel.unsubscribe; four postgres_changes registrations. | POLLING_ACCEPTABLE; preserve own/roster/global visibility and cleanup. |
| Other direct/supporting references | 23 records: schema selection, client factory/config/types, URL parser, diagnostic PUT, external PDF bearer, token/impersonation and Users adapter contracts. | Explicit D rows; provider DTO/config migration and U1-U9 blockers. |
| Imports and wrappers | 165 edges: 82 Supabase client imports, 3 SDK imports, 80 helper/provider/domain API imports. | I matrix traces consumer dependencies without inflating network call counts. |

## Current blockers

Users U1–U9 are detailed in inventory. Split-logo fields remain absent in frontend DTO/Auth projection; cursor is discarded; parent names are rebuilt from first page; role fallback/selection needs parity fixtures; provider/local status differs; AuthProvider and token bridge still depend on Supabase. Current DTO now permits number|string balance and converts Number for display; this removes the earlier strict type mismatch but does not prove exact financial parity. Backend explicitly returns 409 for changed parentLabelId until Artists supplies roster/history transactions. Dev-only backend switch leaves all production legacy calls active.

Four absent Copyright RPCs, disabled GCS diagnostic stubs, pending:// legal-file placeholders, external PDF bearer forwarding, audio/resumable Storage gaps, private/public URL fallback, financial transactions and shared-bucket orphan deletion remain explicit blockers/risks. No absent RPC, field or workflow is marked migrated merely because a route or adapter exists.

## Repository-wide reference context

Supplemental scan covers 617 text/config/source files returned by rg --files --hidden with dependency/build directories, .git, .agents, secret environment files and these two generated reports excluded. Text extensions: TS/TSX/JS/JSX/CJS/MJS, JSON, YAML, TOML, CSS, HTML, Markdown, SQL, TXT, PowerShell, shell and CSV; also Dockerfile/.gitignore/.env.example. No actual .env values or credential files are printed. Scan is repository source evidence, not ignored/generated/dependency content or server deployment evidence.

Broad regex `supabase|postgres_changes|storage/v1|functions/v1` (case-insensitive): **326 matching files / 4021 matching lines** at supplemental scan time. Multiple occurrences on one line count once here. Frontend files receive per-record classifications through D/I; outside files receive one context classification. This broad line count is separate from 181 exact frontend occurrences and can drift as other agents add reports.

Frontend matching files: 85. Outside frontend: 241 files. Backend production-host denylist and log redaction strings do not call Supabase; they remain defensive configuration LATER_PHASE references, not migrated application operations. Supabase Edge/migration source remains retained active compatibility code; documentation/backup copies remain LEGACY_ONLY; assertion files remain TEST_ONLY.

| file | matching lines | line numbers | classification / evidence |
| --- | --- | --- | --- |
| .env.example | 3 | 4, 7, 8 | LATER_PHASE |
| .gitignore | 1 | 45 | LEGACY_ONLY |
| AGENTS.md | 9 | 3, 5, 7, 8, 9, 10, 14, 15, 18 | LEGACY_ONLY |
| backend/scripts/check-isolation.mjs | 2 | 10, 13 | TEST_ONLY |
| backend/src/config/index.ts | 2 | 7, 8 | LATER_PHASE; denylist/redaction only |
| backend/src/observability/index.ts | 1 | 11 | LATER_PHASE; denylist/redaction only |
| backend/test/config.test.ts | 2 | 40, 52 | TEST_ONLY |
| backups/docker/docker-compose-backup.yml | 53 | 11, 16, 17, 39, 51, 52, 53, 54, 56, 57, 69, 96, 105, 106, 107, 108, 116, 117, 142, 224, 234, 252, 256, 293, 294, 314, 318, 339, 340, 376, 377, 391, 402, 425, 426, 442, 443, 462, 463, 472, 473, 476, 477, 479, 480, 481, 493, 494, 506, 507, 550, 551, 582 | LEGACY_ONLY |
| backups/docker/docker-compose-updated.yml | 53 | 11, 16, 17, 39, 51, 52, 53, 54, 56, 57, 69, 96, 105, 106, 107, 108, 116, 117, 142, 224, 234, 252, 256, 293, 294, 314, 318, 339, 340, 376, 377, 391, 402, 425, 426, 442, 443, 462, 463, 472, 473, 476, 477, 479, 480, 481, 495, 496, 508, 509, 552, 553, 584 | LEGACY_ONLY |
| docker-compose.yml | 2 | 7, 8 | LATER_PHASE |
| Dockerfile | 5 | 7, 8, 17, 18, 30 | LATER_PHASE |
| docs/API_DOCUMENTATION.md | 25 | 20, 21, 24, 29, 30, 37, 42, 43, 284, 366, 377, 397, 470, 494, 495, 496, 514, 535, 557, 570, 579, 617, 627, 637, 660 | LEGACY_ONLY; historical/design evidence |
| docs/backend/ARCHITECTURE.md | 3 | 11, 16, 64 | LEGACY_ONLY; historical/design evidence |
| docs/backend/DATABASE_DESIGN.md | 1 | 7 | LEGACY_ONLY; historical/design evidence |
| docs/backend/MODULE_BOUNDARIES.md | 2 | 9, 13 | LEGACY_ONLY; historical/design evidence |
| docs/backend/PROVIDER_ADAPTERS.md | 1 | 39 | LEGACY_ONLY; historical/design evidence |
| docs/BUG_FIXES_AND_SOLUTIONS.md | 19 | 29, 41, 78, 79, 132, 133, 134, 135, 136, 139, 140, 143, 148, 149, 150, 151, 152, 162, 309 | LEGACY_ONLY; historical/design evidence |
| docs/COMMANDS_CHEATSHEET.md | 28 | 11, 16, 25, 30, 35, 42, 49, 65, 76, 98, 103, 108, 113, 118, 127, 132, 137, 143, 166, 171, 176, 185, 190, 195, 204, 209, 214, 219 | LEGACY_ONLY; historical/design evidence |
| docs/DEBUGGING_GUIDE.md | 25 | 48, 120, 125, 126, 141, 142, 143, 144, 145, 146, 149, 154, 155, 156, 157, 158, 170, 201, 204, 205, 238, 270, 285, 347, 348 | LEGACY_ONLY; historical/design evidence |
| docs/DEPLOYMENT_GUIDE_AUTH.md | 14 | 88, 102, 105, 106, 107, 108, 109, 110, 116, 129, 308, 309, 310, 320 | LEGACY_ONLY; historical/design evidence |
| docs/EDGE_FUNCTION_TIMEOUT_FIX.md | 5 | 15, 20, 29, 36, 81 | LEGACY_ONLY; historical/design evidence |
| docs/FINAL_SUMMARY.md | 20 | 30, 40, 42, 43, 44, 45, 71, 101, 102, 103, 104, 107, 111, 112, 113, 114, 115, 118, 209, 212 | LEGACY_ONLY; historical/design evidence |
| docs/FRONTEND_AUTH_IMPLEMENTATION_COMPLETE.md | 7 | 179, 211, 214, 215, 216, 217, 218 | LEGACY_ONLY; historical/design evidence |
| docs/IMPLEMENTATION_CHECKLIST.md | 17 | 18, 87, 96, 99, 105, 116, 120, 130, 143, 157, 168, 388, 389, 390, 391, 392, 511 | LEGACY_ONLY; historical/design evidence |
| docs/INDEX.md | 8 | 287, 288, 289, 290, 291, 307, 308, 309 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/dashboard-guide.md | 3 | 60, 102, 200 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/README.md | 5 | 68, 78, 79, 168, 169 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/summary.md | 5 | 14, 15, 27, 54, 64 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/webhook-diagnosis.md | 12 | 16, 49, 50, 67, 100, 101, 128, 129, 145, 159, 171, 172 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/webhook-flow-diagram.md | 1 | 25 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/webhook-helper-scripts.md | 5 | 34, 83, 97, 130, 193 | LEGACY_ONLY; historical/design evidence |
| docs/integrations/xendit/webhook-troubleshooting.md | 6 | 38, 50, 73, 74, 122, 123 | LEGACY_ONLY; historical/design evidence |
| docs/MIGRATION_DOCKER_GUIDE.md | 26 | 1, 3, 4, 5, 14, 15, 47, 50, 56, 63, 70, 76, 88, 111, 228, 230, 237, 238, 239, 240, 253, 263, 264, 265, 266, 267 | LEGACY_ONLY; historical/design evidence |
| docs/MIGRATION_GUIDE.md | 6 | 26, 32, 98, 101, 379, 418 | LEGACY_ONLY; historical/design evidence |
| docs/migration-scripts/.env.example | 3 | 4, 5, 6 | LEGACY_ONLY; historical/design evidence |
| docs/migration-scripts/import-csv.js | 8 | 4, 5, 17, 25, 26, 30, 395, 396 | LEGACY_ONLY; historical/design evidence |
| docs/migration-scripts/migrate.js | 7 | 4, 15, 21, 22, 23, 24, 279 | LEGACY_ONLY; historical/design evidence |
| docs/migration-scripts/package.json | 1 | 10 | LEGACY_ONLY; historical/design evidence |
| docs/migration-scripts/README.md | 9 | 3, 7, 12, 13, 33, 35, 36, 75, 81 | LEGACY_ONLY; historical/design evidence |
| docs/migration/API_COMPATIBILITY_MATRIX.md | 586 | 7, 9, 17, 22, 56, 57, 67, 71, 77, 78, 80, 85, 225, 227, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 395, 429, 445, 446, 447, 448, 449, 450, 451, 452, 559, 560, 561, 562, 563, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 991, 992, 993, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1060, 1065, 1066, 1067, 1070, 1071, 1072, 1073, 1077, 1079, 1080, 1081, 1084, 1086, 1087, 1088, 1089, 1093, 1094, 1095, 1118, 1121, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1158, 1159, 1160, 1164, 1165, 1166, 1167, 1173, 1177, 1178, 1184, 1185, 1186, 1187, 1190, 1191, 1196, 1197, 1200, 1201, 1202, 1203, 1217, 1218, 1219, 1226, 1227, 1229, 1236, 1237, 1238, 1244, 1251, 1252, 1253, 1255, 1256, 1257, 1266, 1271, 1272, 1273, 1282, 1288, 1289, 1290, 1305, 1306, 1307, 1308, 1311, 1312, 1313, 1314, 1318, 1320, 1321, 1322, 1325, 1326, 1327, 1328, 1329, 1330, 1331, 1332, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1354, 1355, 1356, 1359, 1360, 1361, 1399, 1400, 1401, 1418, 1419, 1420, 1421, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433, 1434, 1443, 1459, 1460, 1467, 1468, 1469, 1470, 1471, 1472, 1473, 1474, 1475, 1476, 1477, 1478, 1479, 1480, 1481, 1482, 1483, 1484, 1485, 1486, 1487, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1513, 1514, 1515, 1516, 1517, 1518, 1519, 1520, 1521, 1522, 1523, 1524, 1525, 1526, 1527, 1528, 1529, 1530, 1531, 1532, 1533, 1534, 1535, 1536, 1537, 1538, 1539, 1540, 1541, 1542, 1543, 1544, 1545, 1546, 1547, 1548, 1549, 1550, 1551, 1552, 1553, 1554, 1555, 1556, 1557, 1558, 1559, 1560, 1561, 1562, 1563, 1564, 1565, 1566, 1567, 1568, 1569, 1570, 1571, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1579, 1580, 1581, 1582, 1583, 1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1593, 1594, 1595, 1596, 1597, 1598, 1599, 1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1630, 1631, 1632, 1633, 1634, 1641, 1642, 1643, 1645, 1646, 1647, 1649, 1650, 1651, 1653, 1654 | LEGACY_ONLY; historical/design evidence |
| docs/migration/AUTH_MIGRATION_FEASIBILITY_REPORT.md | 7 | 9, 11, 13, 84, 92, 97, 103 | LEGACY_ONLY; historical/design evidence |
| docs/migration/BACKUP_REPORT.md | 3 | 3, 7, 10 | LEGACY_ONLY; historical/design evidence |
| docs/migration/BACKUP_RESTORE_REPORT.md | 2 | 7, 20 | LEGACY_ONLY; historical/design evidence |
| docs/migration/CANONICAL_SCHEMA.sql | 5 | 5, 6, 1870, 5693, 6007 | LEGACY_ONLY; historical/design evidence |
| docs/migration/CONTRACTS_ACCESS_REPORT.md | 1 | 7 | LEGACY_ONLY; historical/design evidence |
| docs/migration/CONTRACTS_PRIVACY_REPORT.md | 2 | 13, 15 | LEGACY_ONLY; historical/design evidence |
| docs/migration/CREDENTIAL_INCIDENT_REPORT.md | 9 | 9, 15, 41, 49, 51, 56, 58, 64, 90 | LEGACY_ONLY; historical/design evidence |
| docs/migration/CUTOVER_REQUIREMENTS.md | 1 | 7 | LEGACY_ONLY; historical/design evidence |
| docs/migration/DATABASE_OBJECT_MANIFEST.md | 4 | 3, 144, 152, 165 | LEGACY_ONLY; historical/design evidence |
| docs/migration/DATABASE_REPRODUCIBILITY_REPORT.md | 7 | 19, 84, 94, 101, 133, 154, 186 | LEGACY_ONLY; historical/design evidence |
| docs/migration/EDGE_FUNCTION_MAPPING.md | 41 | 7, 9, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 120, 135 | LEGACY_ONLY; historical/design evidence |
| docs/migration/EXTERNAL_STORAGE_RECOVERY_REPORT.md | 3 | 5, 9, 57 | LEGACY_ONLY; historical/design evidence |
| docs/migration/FINANCIAL_INTEGRITY_BASELINE.md | 15 | 9, 11, 13, 61, 66, 77, 83, 95, 110, 200, 201, 202, 203, 205, 207 | LEGACY_ONLY; historical/design evidence |
| docs/migration/FINANCIAL_RECONCILIATION_REPORT.md | 1 | 9 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/full-schema.sql | 4 | 4, 1455, 1462, 1483 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/MIGRATION-GUIDE.md | 26 | 1, 4, 17, 31, 33, 36, 50, 88, 97, 116, 117, 198, 201, 202, 214, 228, 229, 256, 262, 297, 309, 331, 332, 333, 353, 386 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/migration-scripts/.env.example | 3 | 4, 5, 6 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/migration-scripts/import-csv.js | 8 | 4, 5, 17, 25, 26, 30, 395, 396 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/migration-scripts/migrate.js | 7 | 4, 15, 21, 22, 23, 24, 279 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/migration-scripts/package.json | 1 | 10 | LEGACY_ONLY; historical/design evidence |
| docs/migration/legacy-public-assets/migration-scripts/README.md | 9 | 3, 7, 12, 13, 33, 35, 36, 75, 81 | LEGACY_ONLY; historical/design evidence |
| docs/migration/OFFSITE_BACKUP_REPORT.md | 2 | 13, 21 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1_FINAL_REPORT.md | 3 | 5, 49, 80 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1_SOURCE_BASELINE.md | 6 | 3, 7, 8, 14, 15, 16 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1_VERIFICATION_REPORT.md | 7 | 9, 110, 134, 147, 157, 169, 179 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_AUTHORIZATION_MATRIX.md | 2 | 9, 223 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_EXECUTION_LOG.md | 2 | 3, 21 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_FINAL_REPORT.md | 4 | 3, 33, 61, 103 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_FINANCIAL_PAYMENT_REPORT.md | 8 | 9, 11, 176, 204, 253, 263, 332, 337 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_INDEPENDENT_QA.md | 11 | 17, 19, 21, 69, 90, 156, 196, 200, 215, 261, 262 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1B_OFFHOST_RECOVERY_REPORT.md | 3 | 9, 11, 91 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1C_EXECUTION_LOG.md | 1 | 9 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1C_FINAL_REPORT.md | 1 | 7 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1C_INDEPENDENT_QA.md | 9 | 9, 47, 58, 59, 60, 61, 62, 63, 91 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1D_CREDENTIAL_CLOSURE.md | 3 | 9, 10, 15 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1D_EXECUTION_LOG.md | 1 | 13 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1D_PUBLIC_BUILD.md | 1 | 14 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1D_PUBLIC_ROUTING.md | 2 | 9, 15 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1E_CREDENTIAL_INCIDENT.md | 3 | 9, 17, 19 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1E_DATABASE_REPRODUCTION.md | 1 | 23 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1E_EXECUTION_LOG.md | 1 | 10 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1E_PUBLIC_ROUTING.md | 5 | 10, 24, 26, 28, 29 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_AUTH_SCOPE.md | 2 | 5, 159 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_BACKUP_SCOPE.md | 1 | 3 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_CREDENTIAL_SCOPE.md | 2 | 7, 11 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_DATABASE_SCOPE.md | 38 | 7, 8, 33, 36, 45, 47, 53, 54, 56, 59, 62, 63, 66, 236, 460, 462, 489, 490, 491, 492, 493, 494, 495, 496, 497, 509, 513, 514, 516, 517, 524, 525, 526, 527, 530, 532, 580, 591 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_EXECUTION_LOG.md | 3 | 7, 8, 19 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_FINAL_REPORT.md | 6 | 9, 13, 17, 25, 115, 148 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_FINDING_RECLASSIFICATION.md | 1 | 27 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_FUNCTION_SCOPE.md | 9 | 9, 15, 16, 17, 23, 31, 63, 90, 92 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_INDEPENDENT_QA.md | 7 | 9, 19, 20, 22, 30, 72, 79 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_LEGACY_RECLASSIFICATION.md | 16 | 14, 16, 22, 23, 24, 30, 40, 41, 42, 48, 49, 51, 52, 53, 55, 74 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_PRIVILEGED_API_STATUS.md | 2 | 9, 75 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_PRODUCTION_TOPOLOGY.md | 41 | 9, 19, 30, 32, 34, 35, 36, 37, 38, 40, 42, 60, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 78, 84, 90, 92, 106, 107, 111, 112, 139, 140, 149, 150, 154, 178, 189, 191, 193, 198 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_STORAGE_SCOPE_REPORT.md | 6 | 5, 23, 27, 69, 73, 117 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1F_STORAGE_SCOPE.csv | 251 | 2597, 2598, 2599, 2600, 2601, 2602, 2603, 2604, 2605, 2606, 2607, 2608, 2609, 2610, 2611, 2612, 2613, 2614, 2615, 2616, 2617, 2618, 2619, 2620, 2621, 2622, 2623, 2624, 2625, 2626, 2627, 2628, 2629, 2630, 2631, 2632, 2633, 2634, 2635, 2636, 2637, 2638, 2639, 2640, 2641, 2642, 2643, 2644, 2645, 2646, 2647, 2648, 2649, 2650, 2651, 2652, 2653, 2654, 2655, 2656, 2657, 2658, 2659, 2660, 2661, 2662, 2663, 2664, 2665, 2666, 2667, 2668, 2669, 2670, 2671, 2672, 2673, 2674, 2675, 2676, 2677, 2678, 2679, 2680, 2681, 2682, 2683, 2684, 2685, 2686, 2687, 2688, 2689, 2690, 2691, 2692, 2693, 2694, 2695, 2696, 2697, 2698, 2699, 2700, 2701, 2702, 2703, 2704, 2705, 2706, 2707, 2708, 2709, 2710, 2711, 2712, 2713, 2714, 2715, 2716, 2717, 2718, 2719, 2720, 2721, 2722, 2723, 2724, 2725, 2726, 2727, 2728, 2729, 2730, 2731, 2732, 2733, 2734, 2735, 2736, 2796, 2797, 2798, 2799, 2800, 2801, 2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810, 2811, 2812, 2813, 2814, 2815, 2816, 2817, 2818, 2819, 2820, 2821, 2822, 2823, 2824, 2825, 2826, 2827, 2828, 2829, 2830, 2831, 2832, 2833, 2834, 2835, 2836, 2837, 2838, 2839, 2840, 2841, 2842, 2843, 2844, 2845, 2846, 2847, 2848, 2849, 2850, 2851, 2852, 2853, 2854, 2855, 2856, 2857, 2858, 2859, 2860, 2861, 2862, 2863, 2864, 2865, 2866, 2867, 2868, 2869, 2870, 2871, 2872, 2873, 2874, 2875, 2876, 2877, 2878, 2879, 2880, 2881, 2882, 2883, 2884, 2885, 2886, 2887, 2888, 2889, 2890, 2891, 2892, 2893, 2894, 2895, 2896, 2897, 2898, 2899, 2900, 2901, 2902, 2903, 2904, 2905, 2906 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_AUTH_INCLUSION_CONTRACT.md | 3 | 7, 9, 98 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_DATABASE_EXTRACTION_CONTRACT.md | 87 | 7, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 849, 850, 862 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_EXECUTION_LOG.md | 4 | 11, 12, 13, 14 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_FINAL_REPORT.md | 2 | 12, 20 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_INDEPENDENT_QA.md | 1 | 83 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_PHASE2_BOUNDARY.md | 2 | 14, 17 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_SCOPE_SUMMARY.md | 1 | 15 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE1G_STORAGE_INCLUSION_CONTRACT.md | 7 | 25, 27, 33, 134, 287, 316, 317 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE2_ENVIRONMENT_REPORT.md | 1 | 3 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE2_EXECUTION_LOG.md | 1 | 27 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_AUTHORIZATION_REPORT.md | 1 | 75 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_DOMAIN_MIGRATION_MATRIX.md | 5 | 7, 28, 54, 65, 67 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_EXECUTION_LOG.md | 5 | 11, 13, 17, 19, 21 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_FRONTEND_REGRESSION_REPORT.md | 3 | 5, 30, 32 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_PARITY_MATRIX.md | 5 | 9, 20, 54, 59, 69 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_REALTIME_REPLACEMENT_MATRIX.md | 2 | 7, 9 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_RPC_REPLACEMENT_MATRIX.md | 4 | 7, 64, 72, 73 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_SECURITY_REPORT.md | 5 | 5, 21, 22, 83, 84 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PHASE3_TEST_REPORT.md | 1 | 18 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PRIVILEGED_API_CLOSURE_REPORT.md | 3 | 36, 44, 52 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PRIVILEGED_API_SECURITY_REPORT.md | 17 | 7, 9, 11, 17, 18, 19, 27, 29, 33, 50, 52, 53, 54, 55, 59, 93, 98 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PUBLIC_BUILD_DEPLOYMENT_REPORT.md | 1 | 24 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PUBLIC_BUILD_SECRET_HYGIENE_REPORT.md | 1 | 6 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PUBLIC_ROUTING_CLOSURE_REPORT.md | 6 | 17, 18, 19, 20, 23, 39 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PUBLIC_ROUTING_MAP.md | 3 | 6, 12, 14 | LEGACY_ONLY; historical/design evidence |
| docs/migration/PUBLIC_ROUTING_REPORT.md | 23 | 7, 9, 15, 17, 21, 22, 36, 37, 41, 50, 65, 66, 67, 69, 70, 72, 73, 80, 94, 114, 120, 138, 155 | LEGACY_ONLY; historical/design evidence |
| docs/migration/ROLLBACK_REQUIREMENTS.md | 2 | 5, 80 | LEGACY_ONLY; historical/design evidence |
| docs/migration/SCHEMA_DRIFT_REPORT.md | 9 | 13, 19, 37, 38, 94, 106, 223, 236, 244 | LEGACY_ONLY; historical/design evidence |
| docs/migration/SECURITY_DEFINER_AUDIT.md | 4 | 7, 11, 67, 199 | LEGACY_ONLY; historical/design evidence |
| docs/migration/SECURITY_DEFINER_CLOSURE_REPORT.md | 2 | 7, 21 | LEGACY_ONLY; historical/design evidence |
| docs/migration/SECURITY_FINDINGS.md | 3 | 3, 8, 14 | LEGACY_ONLY; historical/design evidence |
| docs/migration/STORAGE_AUDIT.md | 6 | 52, 53, 57, 71, 73, 83 | LEGACY_ONLY; historical/design evidence |
| docs/migration/STORAGE_BACKUP_VERIFICATION.md | 3 | 7, 28, 38 | LEGACY_ONLY; historical/design evidence |
| docs/migration/STORAGE_MANIFEST.csv | 627 | 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278, 1279, 1280, 1281, 1282, 1283, 1284, 1285, 1286, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310, 1311, 1312, 1313, 1314, 1315, 1316, 1317, 1318, 1319, 1320, 1321, 1322, 1323, 1324, 1325, 1326, 1327, 1328, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1367, 1368, 1369, 1370, 1371, 1372, 1373, 1374, 1375, 1376, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1416, 1417, 1418, 1419, 1420, 1421, 1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433, 1434, 1435, 1436, 1437, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447, 1448, 1449, 1450, 1451, 1452, 1453, 1454, 1455, 1456, 1457, 1458, 1459, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1467, 1468, 1469, 1470, 1471, 1472, 1473, 1474, 1475, 1476, 1477, 1478, 1479, 1480, 1481, 1482, 1483, 1484, 1485, 1486, 1487, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1515, 1516, 1517, 1518, 1519, 1520, 1521, 1523, 1524, 1525, 1526, 1527, 1528, 1529, 1530, 1531, 1532, 1533, 1534 | LEGACY_ONLY; historical/design evidence |
| docs/migration/STORAGE_OWNERSHIP_REPORT.md | 9 | 5, 9, 11, 36, 48, 108, 112, 114, 143 | LEGACY_ONLY; historical/design evidence |
| docs/migration/TEST_STRATEGY.md | 1 | 7 | LEGACY_ONLY; historical/design evidence |
| docs/migration/XENDIT_IDEMPOTENCY_REPORT.md | 3 | 26, 32, 36 | LEGACY_ONLY; historical/design evidence |
| docs/MISSING_CHECKLIST.md | 24 | 26, 27, 67, 68, 69, 70, 73, 74, 77, 82, 83, 84, 85, 86, 109, 116, 117, 122, 149, 160, 161, 166, 187, 192 | LEGACY_ONLY; historical/design evidence |
| docs/PERMISSION_ERROR_SOLUTION.md | 5 | 18, 41, 82, 84, 275 | LEGACY_ONLY; historical/design evidence |
| docs/QUICK_CHECKLIST.md | 7 | 34, 45, 46, 47, 48, 49, 144 | LEGACY_ONLY; historical/design evidence |
| docs/QUICK_FIX_PERMISSION.md | 1 | 14 | LEGACY_ONLY; historical/design evidence |
| docs/QUICK_REFERENCE.txt | 10 | 69, 70, 71, 101, 102, 103, 104, 105, 118, 121 | LEGACY_ONLY; historical/design evidence |
| docs/QUICK_START_DOCKER_MIGRATION.md | 9 | 3, 9, 10, 16, 29, 35, 63, 73, 90 | LEGACY_ONLY; historical/design evidence |
| docs/RANCANGAN_AUTH_VERIFICATION.md | 39 | 8, 49, 108, 113, 236, 240, 303, 332, 337, 374, 413, 645, 690, 702, 816, 834, 847, 906, 1055, 1181, 1182, 1183, 1184, 1185, 1386, 1443, 1517, 1523, 1524, 1525, 1539, 1714, 1715, 1716, 1738, 1745, 1752, 1759, 1766 | LEGACY_ONLY; historical/design evidence |
| docs/README_AUTH_DOCS.md | 8 | 278, 322, 390, 392, 405, 413, 414, 415 | LEGACY_ONLY; historical/design evidence |
| docs/README_FIX_002.md | 18 | 4, 78, 83, 88, 108, 111, 129, 136, 160, 170, 178, 179, 180, 181, 182, 238, 320, 325 | LEGACY_ONLY; historical/design evidence |
| docs/README.md | 5 | 98, 99, 100, 101, 102 | LEGACY_ONLY; historical/design evidence |
| docs/RINGKASAN_AUTH_VERIFICATION.md | 11 | 154, 155, 156, 157, 158, 192, 199, 200, 201, 225, 230 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/.env.example | 2 | 4, 5 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/00-HARDRESET-SOUNDPUB-LOCAL.sql | 2 | 3, 42 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/00-START-HERE.md | 13 | 14, 25, 31, 34, 40, 121, 137, 163, 193, 276, 290, 335, 370 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/01-reset-and-recreate-soundpub.sql | 1 | 12 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/02-initial-seed.sql | 1 | 23 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/28-dashboard-role-stats-rpc.sql | 1 | 2 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger-supabase.sql | 1 | 2 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/42-grant-create-permission-soundpub.sql | 3 | 3, 9, 10 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/43-create-trigger-as-supabase-admin.sql | 4 | 2, 3, 6, 7 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/44-create-trigger-direct-as-admin.sql | 4 | 3, 6, 8, 74 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/46-fix-schema-ownership-comprehensive.sql | 17 | 3, 4, 22, 25, 27, 28, 30, 31, 43, 46, 49, 52, 109, 111, 112, 123, 127 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/backfill-managed-artists-for-royalties.js | 4 | 3, 5, 6, 14 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/EXECUTION-CHECKLIST.md | 25 | 5, 6, 12, 15, 23, 31, 43, 54, 56, 65, 67, 69, 92, 100, 129, 164, 235, 279, 294, 302, 318, 327, 331, 340, 351 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/FINAL-SUMMARY.md | 9 | 15, 24, 54, 127, 133, 155, 171, 172, 184 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/FIX-BALANCE-SYNC.md | 9 | 15, 20, 22, 25, 31, 48, 51, 109, 127 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/FIX-SCHEMA-OWNERSHIP.md | 31 | 5, 15, 23, 32, 34, 39, 45, 46, 52, 54, 56, 68, 83, 88, 90, 96, 98, 104, 106, 108, 131, 132, 156, 204, 222, 226, 233, 259, 264, 281, 310 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/fix-schema-ownership.sh | 7 | 4, 10, 11, 26, 33, 35, 37 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/import-csv-soundpub.js | 4 | 3, 7, 8, 38 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/IMPORT-READY-COMPARISON.md | 6 | 3, 55, 57, 121, 123, 129 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/INDEX.md | 1 | 182 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/package.json | 1 | 13 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/QUICK-FIX.md | 5 | 5, 8, 14, 19, 29 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/README-SOLUTION.md | 18 | 5, 30, 44, 47, 53, 101, 102, 119, 147, 153, 159, 191, 198, 204, 221, 238, 268, 277 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/README.md | 6 | 130, 213, 216, 217, 220, 223 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/run-trigger-via-docker.sh | 3 | 7, 10, 13 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/SUMMARY.md | 15 | 15, 28, 52, 54, 55, 60, 65, 72, 77, 86, 122, 135, 136, 143, 171 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/TASK-COMPLETION-REPORT.md | 15 | 5, 17, 43, 48, 57, 73, 76, 82, 151, 183, 196, 245, 277, 325, 334 | LEGACY_ONLY; historical/design evidence |
| docs/soundpub-local-migration/VISUAL-SUMMARY.txt | 14 | 20, 30, 60, 61, 64, 65, 70, 72, 74, 81, 109, 123, 206, 209 | LEGACY_ONLY; historical/design evidence |
| docs/STEP_BY_STEP_DEPLOYMENT.md | 17 | 14, 21, 192, 193, 196, 199, 216, 219, 220, 221, 222, 223, 229, 235, 249, 251, 278 | LEGACY_ONLY; historical/design evidence |
| docs/SUMMARY.txt | 2 | 263, 270 | LEGACY_ONLY; historical/design evidence |
| docs/TAHAPAN_IMPLEMENTASI.md | 30 | 175, 179, 193, 196, 203, 207, 228, 241, 257, 265, 274, 291, 307, 323, 339, 355, 369, 373, 662, 663, 664, 665, 666, 667, 686, 687, 688, 689, 690, 691 | LEGACY_ONLY; historical/design evidence |
| docs/TIMEOUT_FIX_SUMMARY.md | 17 | 14, 22, 30, 41, 45, 49, 53, 59, 68, 95, 96, 97, 98, 180, 191, 195, 201 | LEGACY_ONLY; historical/design evidence |
| docs/TROUBLESHOOTING.md | 13 | 7, 29, 54, 64, 75, 157, 166, 167, 172, 207, 216, 236, 237 | LEGACY_ONLY; historical/design evidence |
| package-lock.json | 21 | 40, 2125, 2127, 2137, 2139, 2149, 2151, 2155, 2157, 2167, 2169, 2173, 2180, 2182, 2193, 2195, 2199, 2200, 2201, 2202, 2203 | LATER_PHASE |
| package.json | 1 | 43 | LATER_PHASE |
| README.md | 13 | 11, 26, 185, 241, 282, 283, 284, 374, 438, 452, 506, 571, 582 | LEGACY_ONLY |
| scripts/deploy_functions.ps1 | 8 | 4, 22, 23, 24, 25, 26, 30, 66 | LEGACY_ONLY |
| scripts/deploy_functions.sh | 6 | 20, 21, 22, 23, 27, 63 | LEGACY_ONLY |
| scripts/deploy-fixed-functions.ps1 | 3 | 16, 28, 31 | LEGACY_ONLY |
| scripts/phase1-edge-security.test.cjs | 2 | 7, 56 | TEST_ONLY |
| scripts/phase1b-contracts-security.test.cjs | 1 | 5 | TEST_ONLY |
| scripts/phase1b-privileged-api-security.test.cjs | 7 | 24, 117, 119, 120, 128, 132, 162 | TEST_ONLY |
| scripts/phase1c-contracts-roles.test.cjs | 1 | 38 | TEST_ONLY |
| scripts/phase1c-database-reproduction.ps1 | 5 | 15, 18, 24, 25, 57 | LEGACY_ONLY |
| scripts/process-royalty-upload.test.cjs | 2 | 6, 58 | TEST_ONLY |
| scripts/run_migration_docker_ssh.ps1 | 6 | 4, 5, 15, 17, 49, 175 | LEGACY_ONLY |
| scripts/run_migration_docker.ps1 | 5 | 4, 5, 15, 19, 40 | LEGACY_ONLY |
| scripts/run_migration_docker.sh | 4 | 5, 6, 18, 62 | LEGACY_ONLY |
| scripts/run_migration.ps1 | 1 | 8 | LEGACY_ONLY |
| scripts/run_migration.sh | 1 | 8 | LEGACY_ONLY |
| scripts/xendit-idempotency.test.cjs | 2 | 5, 15 | TEST_ONLY |
| scripts/xendit/test-webhook-endpoint.ps1 | 2 | 2, 6 | TEST_ONLY |
| scripts/xendit/trigger-webhook.ps1 | 1 | 9 | LEGACY_ONLY |
| skills-lock.json | 3 | 4, 5, 7 | LEGACY_ONLY |
| src/components/analytics/GA4Provider.tsx | 3 | 3, 20, 46 | LEGACY_ONLY |
| src/components/auth/AuthEnvironmentNotice.tsx | 2 | 3, 45 | LATER_PHASE |
| src/components/layout/AppSidebar.tsx | 3 | 7, 308, 334 | LATER_PHASE / PHASE4_AUTH |
| src/components/layout/DashboardLayout.tsx | 7 | 4, 42, 60, 63, 77, 93, 126 | PHASE4_AUTH / LATER_PHASE |
| src/components/notifications/AnnouncementDialog.tsx | 3 | 2, 41, 55 | LATER_PHASE |
| src/components/notifications/NotificationBell.tsx | 7 | 2, 40, 43, 59, 65, 75, 90 | LATER_PHASE |
| src/components/notifications/NotificationCenter.tsx | 6 | 2, 31, 34, 56, 73, 96 | LEGACY_ONLY |
| src/components/onboarding/ArtistOnboardingDialog.tsx | 3 | 9, 63, 76 | LATER_PHASE |
| src/components/releases/ActivateReleaseModal.tsx | 4 | 2, 59, 103, 116 | LATER_PHASE |
| src/components/releases/ArchiveReleaseDialog.tsx | 2 | 2, 45 | LATER_PHASE |
| src/components/releases/ArtistReleaseFormDialog.tsx | 20 | 4, 138, 207, 275, 289, 295, 321, 341, 350, 363, 379, 400, 441, 461, 501, 520, 524, 534, 549, 570 | LEGACY_ONLY |
| src/components/releases/DeleteReleaseDialog.tsx | 2 | 2, 35 | LATER_PHASE |
| src/components/releases/MediaUploadSection.tsx | 10 | 2, 40, 132, 133, 136, 157, 171, 207, 210, 289 | PHASE4_AUTH / LATER_PHASE |
| src/components/releases/RejectReleaseModal.tsx | 2 | 2, 48 | LATER_PHASE |
| src/components/releases/ReleaseFormDialog.tsx | 26 | 3, 256, 281, 290, 321, 330, 420, 502, 511, 512, 525, 527, 528, 536, 554, 561, 589, 618, 642, 658, 680, 716, 757, 816, 829, 872 | LEGACY_ONLY |
| src/components/releases/ReleaseFormPage.tsx | 31 | 3, 338, 368, 389, 393, 476, 485, 497, 540, 672, 771, 780, 781, 795, 798, 799, 807, 828, 835, 884, 917, 948, 967, 990, 1031, 1054, 1102, 1192, 1212, 1230, 1280 | LATER_PHASE / PHASE4_AUTH |
| src/components/royalty/ComposerRoyaltyUpload.tsx | 2 | 23, 266 | LATER_PHASE |
| src/components/settings/AuthNoticeSettings.tsx | 3 | 3, 21, 27 | LATER_PHASE |
| src/components/settings/EmailNotificationSettings.tsx | 3 | 2, 34, 56 | LATER_PHASE |
| src/components/settings/IccnIntegrationSettings.tsx | 6 | 2, 22, 28, 55, 91, 93 | LATER_PHASE |
| src/components/settings/LabelLogoSettings.tsx | 5 | 2, 61, 67, 72, 107 | LATER_PHASE |
| src/components/settings/PayoutSettings.tsx | 3 | 2, 22, 38 | LATER_PHASE |
| src/components/settings/PricingSettings.tsx | 3 | 2, 46, 80 | LATER_PHASE |
| src/components/settings/StorageSettings.tsx | 13 | 2, 55, 73, 85, 112, 141, 178, 218, 263, 311, 348, 382, 420 | LATER_PHASE |
| src/components/settings/SuperAdminSettings.tsx | 9 | 2, 48, 77, 134, 137, 143, 205, 208, 214 | LATER_PHASE |
| src/components/users/AddUserDialog.tsx | 8 | 2, 117, 127, 200, 217, 239, 268, 276 | LATER_PHASE / PHASE4_AUTH |
| src/components/users/ChangePasswordDialog.tsx | 3 | 2, 54, 56 | PHASE4_AUTH / LATER_PHASE |
| src/components/users/DeleteArtistDialog.tsx | 2 | 2, 43 | LATER_PHASE |
| src/components/users/DeleteUserDialog.tsx | 3 | 2, 41, 43 | PHASE4_AUTH / LATER_PHASE |
| src/components/users/EditArtistDialog.tsx | 2 | 2, 71 | LATER_PHASE |
| src/components/users/EditComposerCodeDialog.tsx | 3 | 2, 51, 75 | LATER_PHASE |
| src/components/users/LabelAddArtistDialog.tsx | 5 | 2, 94, 122, 127, 133 | PHASE4_AUTH / LATER_PHASE |
| src/components/users/RequestDeletionDialog.tsx | 3 | 2, 48, 51 | PHASE4_AUTH / LATER_PHASE |
| src/context/SsoAuthContext.tsx | 11 | 3, 46, 47, 69, 76, 83, 106, 107, 113, 185, 252 | PHASE4_AUTH / LATER_PHASE |
| src/hooks/useAuth.tsx | 11 | 2, 3, 10, 84, 106, 128, 185, 190, 198, 216, 218 | PHASE4_AUTH / LATER_PHASE |
| src/hooks/useExportCsv.ts | 11 | 2, 54, 64, 74, 84, 94, 104, 114, 124, 134, 144 | LATER_PHASE |
| src/hooks/useRoyaltyData.ts | 12 | 2, 10, 31, 48, 66, 83, 97, 119, 140, 164, 191, 218 | LATER_PHASE |
| src/integrations/lovable/index.ts | 2 | 4, 31 | LEGACY_ONLY |
| src/integrations/supabase/client.ts | 6 | 2, 5, 6, 9, 10, 12 | LATER_PHASE |
| src/integrations/supabase/types.ts | 2 | 12, 2135 | LATER_PHASE |
| src/lib/audioClipper.ts | 2 | 4, 18 | LATER_PHASE |
| src/lib/fetchAllRoyalties.ts | 2 | 1, 28 | LATER_PHASE |
| src/lib/sessionLimit.ts | 1 | 1 | PHASE4_AUTH |
| src/lib/xendit.ts | 3 | 1, 27, 43 | LATER_PHASE |
| src/pages/AdminPayouts.tsx | 5 | 4, 100, 111, 146, 149 | LATER_PHASE |
| src/pages/ArtistDeletionRequests.tsx | 2 | 13, 45 | LATER_PHASE |
| src/pages/ArtistProfile.tsx | 17 | 4, 174, 189, 203, 263, 270, 286, 295, 299, 332, 342, 381, 401, 454, 463, 467, 479 | LATER_PHASE |
| src/pages/AuditLogs.tsx | 2 | 4, 96 | LATER_PHASE |
| src/pages/Auth.tsx | 3 | 5, 67, 174 | LATER_PHASE / PHASE4_AUTH |
| src/pages/ComposerRoyalties.tsx | 3 | 3, 72, 97 | LATER_PHASE |
| src/pages/CopyrightAnalytics.tsx | 2 | 5, 103 | LATER_PHASE |
| src/pages/CopyrightDashboard.tsx | 6 | 21, 80, 103, 110, 123, 133 | LATER_PHASE |
| src/pages/CopyrightOnboarding.tsx | 3 | 5, 36, 61 | LATER_PHASE |
| src/pages/CopyrightRegistrationForm.tsx | 4 | 7, 234, 332, 445 | LATER_PHASE |
| src/pages/CopyrightRegistrationReview.tsx | 16 | 5, 148, 188, 215, 226, 247, 263, 276, 293, 297, 328, 345, 385, 392, 405, 409 | LATER_PHASE / PHASE4_AUTH |
| src/pages/CopyrightRegistrationStatus.tsx | 2 | 6, 71 | LATER_PHASE |
| src/pages/CopyrightRoyaltySummary.tsx | 2 | 5, 88 | LATER_PHASE |
| src/pages/CopyrightRoyaltyUpload.tsx | 3 | 29, 135, 184 | LATER_PHASE |
| src/pages/CopyrightRoyaltyUploadHistory.tsx | 3 | 27, 63, 82 | LATER_PHASE |
| src/pages/Dashboard.tsx | 8 | 4, 125, 126, 127, 150, 160, 161, 173 | LATER_PHASE |
| src/pages/ForgotPassword.tsx | 2 | 3, 38 | PHASE4_AUTH / LATER_PHASE |
| src/pages/IccnIframeAuth.tsx | 10 | 3, 9, 23, 24, 42, 43, 55, 76, 77, 85 | PHASE4_AUTH / LATER_PHASE |
| src/pages/ImpersonationCallback.tsx | 2 | 4, 27 | PHASE4_AUTH / LATER_PHASE |
| src/pages/Invoices.tsx | 5 | 4, 52, 63, 64, 105 | LATER_PHASE |
| src/pages/LandingPage.tsx | 2 | 3, 80 | LATER_PHASE |
| src/pages/MediaLibrary.tsx | 10 | 2, 61, 94, 98, 134, 256, 257, 311, 361, 422 | LATER_PHASE |
| src/pages/MyArtists.tsx | 3 | 4, 94, 105 | LATER_PHASE |
| src/pages/NotificationManagement.tsx | 4 | 4, 62, 80, 99 | LATER_PHASE |
| src/pages/Payouts.tsx | 9 | 3, 62, 81, 85, 111, 120, 133, 136, 164 | LATER_PHASE |
| src/pages/ReleaseDetail.tsx | 8 | 4, 217, 235, 247, 258, 272, 280, 294 | LATER_PHASE |
| src/pages/ReleaseEdit.tsx | 3 | 8, 36, 48 | LATER_PHASE |
| src/pages/Releases.tsx | 9 | 4, 120, 136, 152, 199, 349, 379, 408, 411 | LATER_PHASE |
| src/pages/ResetPassword.tsx | 4 | 3, 37, 80, 86 | PHASE4_AUTH / LATER_PHASE |
| src/pages/Royalties.tsx | 1 | 2 | LEGACY_ONLY / LATER_PHASE |
| src/pages/Settings.tsx | 7 | 3, 49, 101, 147, 152, 157, 178 | LATER_PHASE / PHASE4_AUTH |
| src/pages/Takedown.tsx | 16 | 5, 82, 83, 102, 105, 143, 145, 146, 150, 151, 153, 154, 171, 172, 173, 185 | LATER_PHASE |
| src/pages/TakedownDetail.tsx | 7 | 5, 38, 41, 61, 63, 79, 91 | LATER_PHASE |
| src/pages/Tracks.tsx | 4 | 2, 92, 97, 109 | LATER_PHASE |
| src/pages/UploadRoyalty.tsx | 8 | 4, 259, 469, 474, 479, 673, 682, 791 | LATER_PHASE / PHASE4_AUTH |
| src/pages/UserOrphanAudit.tsx | 3 | 17, 136, 194 | LATER_PHASE |
| src/pages/Users.tsx | 7 | 4, 188, 190, 708, 743, 745, 782 | PHASE4_AUTH / LATER_PHASE |
| src/pages/VerifyEmail.tsx | 3 | 3, 19, 27 | PHASE4_AUTH / LATER_PHASE |
| src/pages/VerifyEmailRequired.tsx | 2 | 4, 49 | PHASE4_AUTH / LATER_PHASE |
| src/pages/WhitelabelDashboard.tsx | 6 | 4, 122, 132, 155, 161, 225 | LEGACY_ONLY |
| src/services/users.ts | 12 | 3, 18, 19, 33, 34, 57, 58, 77, 82, 88, 91, 92 | LATER_PHASE |
| SUPABASE_MIGRATION_AUDIT.md | 32 | 1, 7, 9, 11, 15, 16, 17, 19, 23, 25, 29, 42, 44, 46, 48, 54, 56, 57, 60, 62, 68, 72, 78, 80, 96, 100, 115, 121, 122, 127, 128, 171 | LEGACY_ONLY |
| supabase/config.toml | 1 | 67 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/_shared/cors.ts | 1 | 4 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/_shared/privileged-api.ts | 12 | 1, 32, 33, 39, 40, 54, 57, 59, 63, 67, 107, 116 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/backup-storage-to-drive/index.ts | 12 | 71, 78, 114, 119, 122, 171, 182, 200, 201, 220, 238, 252 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/change-own-password/index.ts | 18 | 1, 2, 4, 6, 16, 38, 39, 40, 41, 46, 72, 73, 74, 78, 92, 98, 104, 111 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/create-copyright-invoice/index.ts | 5 | 1, 3, 13, 14, 15 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/create-user/index.ts | 19 | 1, 4, 6, 8, 62, 63, 64, 73, 78, 79, 80, 84, 95, 172, 196, 223, 235, 253, 261 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/create-whitelabel-artist/index.ts | 14 | 2, 3, 5, 7, 30, 31, 32, 46, 53, 78, 98, 115, 124, 136 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/create-xendit-invoice/index.ts | 28 | 1, 3, 5, 7, 16, 61, 62, 63, 66, 67, 74, 77, 94, 97, 131, 140, 155, 168, 182, 202, 209, 217, 238, 249, 293, 305, 377, 396 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/delete-royalty-upload/index.ts | 6 | 1, 6, 56, 57, 58, 59 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/delete-user/index.ts | 17 | 1, 3, 5, 7, 32, 33, 34, 43, 49, 75, 76, 77, 87, 98, 105, 112, 119 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/download-release-invoice/index.ts | 6 | 2, 4, 64, 65, 66, 67 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/gcs-manage/index.ts | 9 | 5, 9, 13, 15, 17, 29, 42, 45, 52 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/gcs-upload/index.ts | 9 | 5, 9, 17, 19, 21, 33, 47, 50, 57 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/get-catalog-tracks/index.ts | 10 | 2, 3, 5, 7, 17, 28, 29, 30, 42, 94 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/get-ga4-config/index.ts | 8 | 2, 3, 5, 7, 25, 26, 27, 30 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/info-soundpub/index.ts | 8 | 2, 3, 5, 7, 25, 26, 27, 29 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/process-royalty-upload/index.ts | 6 | 1, 6, 148, 149, 150, 151 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/README_BEST_PRACTICES.md | 9 | 8, 15, 66, 69, 79, 80, 89, 103, 110 | LEGACY_ONLY; retained legacy server implementation |
| supabase/functions/remove-artist-from-label/index.ts | 18 | 1, 2, 4, 6, 36, 37, 38, 42, 50, 51, 52, 57, 92, 115, 136, 144, 156, 170 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/reset-password/index.ts | 9 | 1, 25, 26, 28, 49, 71, 85, 94, 103 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/send-app-email/index.ts | 12 | 261, 270, 285, 293, 309, 325, 334, 343, 355, 376, 390, 402 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/send-app-email/TEMPLATE_ADDITIONS.ts | 4 | 5, 102, 112, 115 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/send-password-reset/index.ts | 17 | 1, 4, 6, 8, 43, 44, 46, 60, 69, 85, 93, 108, 116, 123, 133, 138, 149 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/send-royalty-notification/index.ts | 13 | 1, 2, 4, 6, 98, 99, 101, 102, 107, 116, 129, 148, 159 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/send-verification-email/index.ts | 9 | 1, 24, 25, 27, 40, 60, 78, 89, 103 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/set-artist-password/index.ts | 14 | 2, 3, 5, 7, 30, 31, 32, 46, 53, 79, 94, 110, 121, 131 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/spotify-fetch-artist/index.ts | 8 | 1, 3, 5, 7, 79, 80, 81, 85 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/sso-login/index.ts | 34 | 1, 2, 4, 6, 17, 146, 152, 164, 168, 178, 192, 195, 202, 210, 214, 222, 237, 250, 360, 361, 363, 371, 376, 380, 407, 410, 411, 415, 432, 441, 455, 460, 464, 478 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/start-user-impersonation/index.ts | 9 | 1, 6, 28, 29, 30, 37, 39, 51, 52 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/test-gcs/index.ts | 10 | 2, 3, 5, 7, 25, 26, 27, 36, 43, 140 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/transfer-artist-label/index.ts | 24 | 1, 3, 5, 7, 39, 40, 41, 45, 53, 54, 55, 83, 101, 115, 136, 153, 168, 169, 170, 173, 181, 190, 198, 205 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/update-app-settings/index.ts | 11 | 2, 3, 5, 7, 29, 30, 31, 39, 46, 78, 95 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/update-user-password/index.ts | 19 | 1, 2, 4, 6, 16, 38, 39, 40, 49, 55, 82, 99, 111, 112, 113, 123, 133, 140, 147 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/update-user-role/index.ts | 14 | 3, 6, 29, 30, 31, 40, 43, 73, 74, 75, 80, 94, 102, 109 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/update-user-status/index.ts | 19 | 1, 3, 5, 7, 33, 34, 35, 44, 50, 81, 82, 83, 93, 104, 117, 128, 133, 139, 146 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/verify-email/index.ts | 8 | 1, 24, 25, 26, 38, 72, 82, 87 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/verify-password-reset-token/index.ts | 5 | 1, 24, 25, 26, 38 | LATER_PHASE; retained legacy server implementation |
| supabase/functions/xendit-webhook/index.ts | 23 | 1, 2, 4, 6, 75, 76, 78, 79, 82, 84, 100, 104, 110, 142, 160, 173, 184, 200, 207, 226, 232, 257, 266 | LATER_PHASE; retained legacy server implementation |
| supabase/migrations/20260817_harden_soundpub_auth_events_and_role_functions.sql | 1 | 19 | LATER_PHASE; retained legacy server implementation |
| supabase/migrations/20260910_assign_artist_role_on_soundpub_signup.sql | 4 | 1, 84, 85, 88 | LATER_PHASE; retained legacy server implementation |
| supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql | 1 | 240 | LATER_PHASE; retained legacy server implementation |

## Runnable read-only check

Run from repository root using installed Node.js. No output files, application mutation or network access. Checks authoritative exact counts, record taxonomies/row completeness and pinned source fingerprint. New source changes intentionally fail fingerprint check; refresh inventory instead of silently reusing counts. This verifies inventory consistency, not API/browser/parity/security acceptance.

```javascript
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : /\.[cm]?[jt]sx?$/.test(p) ? [p] : [];
});
const source = walk("src").map(p => [p.split(path.sep).join("/"), fs.readFileSync(p,"utf8")])
  .sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0);
const patterns = ["supabase.from(","supabase.rpc(","supabase.functions.invoke(","supabase.storage","supabase.auth","postgres_changes"];
const counts = patterns.map(p => source.filter(([f]) => !f.endsWith("/types.ts"))
  .reduce((n,[,s]) => n + s.split(p).length - 1, 0));
assert.deepEqual(counts, [45,24,36,36,36,4]);
assert.equal(counts.filter((_,i)=>i!==4).reduce((a,b)=>a+b,0),145);
assert.equal(counts[4],36);
const doc = fs.readFileSync("docs/migration/PHASE3_FRONTEND_SUPABASE_INVENTORY.md","utf8");
const rows = doc.split("\n").filter(l => /^\| [DI]\d{3} \|/.test(l));
assert.equal(rows.filter(l => /^\| D/.test(l)).length,409);
assert.equal(rows.filter(l => /^\| I/.test(l)).length,165);
const allowed = new Set(["MIGRATED","PHASE4_AUTH","LATER_PHASE","LEGACY_ONLY","TEST_ONLY","UNEXPECTED"]);
for (const row of rows) {
  const cells = row.split("|").slice(1,-1).map(s=>s.trim());
  const kind = cells[0][0];
  const classification = kind === "D" ? cells[11] : cells[7];
  assert(allowed.has(classification),row);
  assert(!["MIGRATED","UNEXPECTED"].includes(classification),row);
}
const hash = crypto.createHash("sha256");
for (const [f,s] of source) hash.update(f+"\0"+s+"\0");
assert.equal(hash.digest("hex"),"ba39acf6a2fd544e87c7ac65e901e61e7efaf9f2ac8872ed69b4fc50228f4e65");
console.log("PASS: 145 business + 36 Auth exact hits; 409 source + 165 import records; overall BLOCKED");
```

Agent B changed only PHASE3_FRONTEND_SUPABASE_INVENTORY.md and PHASE3_REMAINING_SUPABASE_REFERENCES.md. Existing dirty worktree and concurrent frontend/backend changes belong to their owners and were preserved.
