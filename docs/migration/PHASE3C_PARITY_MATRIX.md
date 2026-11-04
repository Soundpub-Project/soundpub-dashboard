# Phase 3C parity matrix

Date: 2026-10-28. Agent F independent local source review. Concurrent implementation snapshot; not a frozen release. No production access, deployment, provider calls, secrets, database operations, browser execution or runtime tests. PROVEN_SOURCE means inspected code only; BLOCKER means acceptance gap; DEFERRED means separate scope requiring explicit retention, never PASS.

| Workflow | Evidence / gap | Status |
| --- | --- | --- |
| Release list/detail | New service/repository and frontend adapters inspected; route registration not yet observed; DTO missing custom-distribution fields and display joins | BLOCKER acceptance |
| Track list/detail | Frontend /api/v1/tracks?limit=100&cursor=...&release_id=... expects nextCursor; service list takes required releaseId and returns release_version | BLOCKER integration contract |
| Release create/edit/draft | Service exists; frontend explicitly disables workflow in backend mode; compilation rejected by contract; custom metadata absent | BLOCKER full parity |
| Track create/edit/reorder | Transaction and parent version checks present; Track title 300 validation vs 200 SQL bound; fields artists/contributors/media omitted | PROVEN_SOURCE partial; BLOCKER parity |
| Rejection/resubmission | Release graph and reason checks present; UI workflow disabled; legacy pending editing broader than Track draft/rejected policy | BLOCKER frontend/behavior |
| UPC/ISRC activation | Active transition deliberately blocked pending transactional Track validation | BLOCKER; denial is not successful activation |
| Archive/restore/bulk | Legacy restore writes pending, archive inactive; service admin-only archive and version semantics need frontend acceptance | BLOCKER |
| Delete/refund | Legacy RPC financial atomicity; new Release delete 409, Track delete requires dependency callback | BLOCKER full parity; fail-closed intentional |
| Upload/playback/clip/covers | TUS up to 500 MiB vs generic backend 10 MiB; private signed URLs/public clips, persisted links and cleanup absent | BLOCKER media |
| Pricing/custom Label | Legacy eligibility trigger + RPC and pricing snapshots; backend contract lacks fields | BLOCKER |
| Payments/invoices/callback | Real provider DEFERRED; fixture adapter and local deterministic replacement not accepted | BLOCKER paid workflow |
| Catalog / dashboards / exports / takedown / MediaLibrary / royalty lookup | Exact indirect table callers remain in dependency inventory | BLOCKER closure; financial implementation may be DEFERRED |
| Artist/Label regression | Historical ownership lock contract inspected; Phase3B recorded PASS is not Phase3C regression proof | NOT RUN |
| Restricted-login SQL | Migration excludes version in INSERT/UPDATE grants while both repositories explicitly write version; trigger increments too | BLOCKER source mismatch pending fix/restricted-login execution |
| Browser states / responsive / errors | No Phase3C browser results inspected; loading, empty, validation, 401/403/404/409/500, network and recovery required at mobile/tablet/desktop | NOT RUN |
| Source isolation | No production operation performed by Agent F | PROVEN_ACTION scope only; no deployment readiness claim |

No functional PASS assigned. Acceptance requires reproducible isolated runtime commands, exit codes, zero hidden skips, fixture provenance, DB role, artifact paths/hashes, request interception evidence and persisted SQL results. Build/typecheck success alone cannot establish parity.

Concurrent correction: latest Track repository removed explicit version assignments in favor of DB trigger increments. Restricted-login mismatch row now applies to unchanged Release repository create/update; Track correction remains unexecuted. New fake-client Release/Track unit tests appeared and were inspected read-only, not executed or accepted as PostgreSQL/browser evidence.
