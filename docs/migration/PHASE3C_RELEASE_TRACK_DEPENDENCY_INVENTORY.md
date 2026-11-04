# Phase 3C Release / Track dependency inventory

Date: 2026-10-28. Agent F independent local source review. Concurrent implementation snapshot; not a frozen release. No production access, deployment, provider calls, secrets, database operations, browser execution or runtime tests. PROVEN_SOURCE means inspected code only; BLOCKER means acceptance gap; DEFERRED means separate scope requiring explicit retention, never PASS.

## Exact direct table caller scan

Literal `.from` scan over all local TypeScript/TSX frontend and Edge source; excludes generated types, includes inactive legacy branches. Lines describe this scan only. Nested joins, computed names, SQL, shared helpers and external consumers need separate rows below; this is not a runtime request count.

| Source | Table:line |
| --- | --- |
| `src/components/releases/ActivateReleaseModal.tsx` | `tracks`:61; `releases`:105; `tracks`:118 |
| `src/components/releases/ArchiveReleaseDialog.tsx` | `releases`:47 |
| `src/components/releases/ArtistReleaseFormDialog.tsx` | `tracks`:209; `releases`:323; `tracks`:343; `tracks`:352; `tracks`:364; `releases`:381; `tracks`:401; `releases`:443; `tracks`:462; `releases`:503; `tracks`:521; `tracks`:525; `tracks`:535; `releases`:551; `tracks`:571 |
| `src/components/releases/RejectReleaseModal.tsx` | `releases`:50 |
| `src/components/releases/ReleaseFormDialog.tsx` | `tracks`:422; `tracks`:591; `releases`:620; `tracks`:644; `tracks`:660; `tracks`:681; `releases`:718; `tracks`:759; `releases`:817; `releases`:831; `tracks`:873 |
| `src/components/releases/ReleaseFormPage.tsx` | `tracks`:674; `tracks`:886; `releases`:919; `tracks`:950; `tracks`:969; `tracks`:991; `releases`:1033; `releases`:1056; `tracks`:1104; `releases`:1194; `releases`:1214; `releases`:1232; `tracks`:1282 |
| `src/hooks/useExportCsv.ts` | `releases`:74; `tracks`:84 |
| `src/pages/Dashboard.tsx` | `releases`:125; `releases`:126; `releases`:128; `tracks`:150 |
| `src/pages/Invoices.tsx` | `release_payments`:53; `releases`:63 |
| `src/pages/MediaLibrary.tsx` | `releases`:256; `tracks`:257 |
| `src/pages/ReleaseDetail.tsx` | `releases`:228; `tracks`:305 |
| `src/pages/ReleaseEdit.tsx` | `releases`:39 |
| `src/pages/Releases.tsx` | `releases`:129; `releases`:220; `releases`:377; `releases`:408; `tracks`:437; `releases`:441 |
| `src/pages/Takedown.tsx` | `releases`:82; `tracks`:105 |
| `src/pages/TakedownDetail.tsx` | `tracks`:41 |
| `src/pages/Tracks.tsx` | `tracks`:103; `releases`:107 |
| `src/pages/UploadRoyalty.tsx` | `releases`:470; `tracks`:475 |
| `src/pages/WhitelabelDashboard.tsx` | `releases`:159 |
| `supabase/functions/create-xendit-invoice/index.ts` | `release_payments`:98; `release_payments`:132; `releases`:141; `release_payments`:156; `releases`:169; `tracks`:239; `releases`:294; `release_payments`:378 |
| `supabase/functions/download-release-invoice/index.ts` | `release_payments`:79; `releases`:86; `release_payments`:92 |
| `supabase/functions/get-catalog-tracks/index.ts` | `releases`:43; `releases`:95 |
| `supabase/functions/remove-artist-from-label/index.ts` | `releases`:116 |
| `supabase/functions/transfer-artist-label/index.ts` | `releases`:168; `tracks`:169 |
| `supabase/functions/xendit-webhook/index.ts` | `release_payments`:111; `release_payments`:143; `releases`:161 |

## Indirect dependency closure

| Caller chain | Dependency / acceptance consequence | State |
| --- | --- | --- |
| App routes -> ReleaseCreate / ReleaseEdit -> ReleaseFormPage | Profile/onboarding, selected Label roster, user_roles, artist_profiles, ArtistSelector / ContributorSelector; preserve registered Artist eligibility and distinguish catalog UUID from login UUID | BLOCKER full workflow |
| Releases / ReleaseDetail -> ActivateReleaseModal | UPC, every Track ISRC, processing -> active; atomic release/track update required | BLOCKER; activation deliberately rejected by current service |
| Releases -> RejectReleaseModal / ArchiveReleaseDialog / DeleteReleaseDialog | Rejection reason; inactive archive and pending restore; transactional refund RPC | BLOCKER full workflow |
| Releases bulk operations | Status, archive/restore, direct Track then Release deletion: must not bypass refund/dependency checks | BLOCKER |
| ReleaseFormPage / ReleaseFormDialog / ArtistReleaseFormDialog -> createXenditInvoice -> src/lib/xendit.ts | create-xendit-invoice; draft/pending persistence and track replacement before payment; failure/rollback/retry must be specified | BLOCKER |
| Forms -> MediaUploadSection -> AudioClipCutterDialog / storagePaths | TUS session token, resumable uploads, track-audio (500 MiB), audio-clips (20 MiB), public clips and private signed full audio; release-covers private signed artwork | BLOCKER media parity; generic backend upload limit 10 MiB does not cover full audio |
| LandingPage -> get-catalog-tracks | Anonymous active releases, nested tracks, Label display and filters/counts; protected API client cannot replace anonymous projection | BLOCKER public catalog closure |
| Dashboard / WhitelabelDashboard | Counts scoped by role, Release/Track totals; Dashboard get_dashboard_role_stats RPC also requires review | BLOCKER indirect caller |
| Export -> useExportCsv | Full release/track datasets, CSV columns, authorization and pagination | BLOCKER indirect caller |
| Invoices -> release_payments + releases -> download-release-invoice | Payment ownership, invoice generation, private release-invoices PDF/signing and cached metadata | BLOCKER; provider settlement may be separately deferred |
| PaymentCallback -> navigation / user payment result | Callback page cannot establish trusted paid state; xendit-webhook owns settlement | DEFERRED provider; BLOCKER if claiming paid workflow |
| MediaLibrary -> release cover / track audio, clip references -> storage removal | Orphan detection must include all references before delete; missing inventory cannot mean unused | BLOCKER destructive cleanup |
| Takedown -> releases / tracks; TakedownDetail -> tracks | Downstream read compatibility, ownership and metadata | BLOCKER indirect caller |
| UploadRoyalty -> releases / tracks -> process-royalty-upload | Import resolution and historical attribution; royalty name/ISRC matching is not Track ownership proof | DEFERRED financial implementation; BLOCKER if existing caller remains enabled |
| Legacy transfer-artist-label / remove-artist-from-label | Release/Track history dependency checks and optional rewrites in legacy source; Phase3B local transfer must not rewrite historical owners | BLOCKER consistency review |
| backend Artists lifecycle / orphan repair | Phase3B historical dependency inventory contract; new table existence must not relax delete/repair when unknown downstream domains remain | BLOCKER regression evidence |
| backend Release / Track modules -> usersRepository / artistsRepository / withTransaction | Current status, roles, management locks, immutable historical IDs, audit and row version; compare both authorization models | PROVEN_SOURCE, runtime unverified |

## Data contracts

`backend/migrations/0008_release_tracks.sql` adds private tables, immutable historical owner triggers and restricted grants. Release contract currently omits `compilation`, distribution_service, custom_label_name, custom_record_name and payment snapshots even though migration supports them. Track contract/repository omit artists, contributors, artist_user_id, audio_url, clip_url and video_url from DTO. Frontend API aliases generated Supabase row types: TypeScript assertions do not prove returned fields exist. Migration allows Track title length 200 while service validation permits 300.

Current frontend adapter is dev-only (`src/api/routing.ts`); enabling a domain is not production cutover. Legacy branches remain dependencies until proved unreachable in accepted mode. No literal caller found is not proof of no SQL trigger, shared service, scheduler or external consumer.

Previous reports inspected: PHASE3_RPC_REPLACEMENT_MATRIX.md; PHASE3_EDGE_FUNCTION_REPLACEMENT_MATRIX.md; PHASE3B_FINAL_INDEPENDENT_QA.md; PHASE3B_FINAL_CLOSEOUT_REPORT.md; PHASE3B_HISTORICAL_OWNERSHIP_REPORT.md. Phase3B PASS applies to its own scope, never Release/Track acceptance. Earlier Phase3 matrices predate concurrent replacements and are historical baselines, not current verdicts.

Later read-only evidence: PHASE3C_DATABASE_MODEL.md and PHASE3C_RELEASE_STATE_MACHINE.md appeared during review. Database contract establishes immutable historical-owner authorization for existing resources and trigger-managed versions. Track implementation changed during review; inventory table is literal-call snapshot, not proof of final enabled-mode requests.
