# Phase 3C closeout parity matrix

Date: 2026-10-28. Classification is exhaustive for Release/Track workflows. `UNEXPLAINED = 0`.

| Operation | Classification | Evidence / owner |
| --- | --- | --- |
| Authenticated Release list/detail | MIGRATED | Soundpub API service/repository; current authority and historical display tests. |
| Draft Release plus initial Tracks | MIGRATED | `POST /api/v1/releases/aggregate`; one transaction, audit, rollback. |
| Release plus Track aggregate edit | MIGRATED | `PATCH /api/v1/releases/:id/aggregate`; server diff CREATE/UPDATE/REMOVE/UNCHANGED, versions and parent lock. |
| Legacy metadata-only draft create | MIGRATED | Compatibility route retained; frontend closeout form uses aggregate route. |
| Track list/detail/create/edit/reorder/remove | MIGRATED | Existing versioned Soundpub API; aggregate form stages all edits transactionally. |
| Submission readiness | MIGRATED | Structured blockers with one owner each. |
| Draft submission / rejected resubmission | MIGRATED | Dedicated submit route; runtime deferred adapters fail closed; legacy PATCH bypass denied. |
| Storage cover/audio existence and public media URLs | DEFER_PHASE3D_STORAGE | Explicit media adapter; runtime unavailable; public URLs remain null. |
| Artwork/audio upload, playback, clip, cleanup | DEFER_PHASE3D_STORAGE | No storage implementation claimed. |
| Payment satisfied / invoice / callback | DEFER_PHASE3E_PAYMENT | Explicit payment adapter; no production payment call. |
| Delete with refund | DEFER_PHASE3E_PAYMENT | Release delete returns 409; no refund or balance mutation. |
| Payment-confirmed transition | DEFER_PHASE3E_PAYMENT | Browser cannot assert paid state. |
| Provider metadata readiness | DEFER_PROVIDER | Explicit provider adapter and blocker ownership. |
| Activation/distribution | DEFER_PROVIDER | Active transition returns 409; no provider call. |
| Public catalog list/detail metadata | MIGRATED | Anonymous allowlisted API; active/unarchived filter; product list/detail browser controls. |
| Public cover/audio/clip delivery | DEFER_PHASE3D_STORAGE | Catalog suppresses unverified private media. |
| Archive | MIGRATED | Existing guarded versioned transition. |
| Restore inactive Release | DEFER_PHASE3E_PAYMENT | Direct PATCH denied; requires submission/payment revalidation contract before enabling. |
| Admin review/reject | MIGRATED | Existing guarded transitions and rejection reason validation. |
| Existing legacy Supabase implementation outside backend mode | LEGACY_PRODUCTION_ONLY | Retained only for non-backend routing; closeout browser proves no Release/Track PostgREST/RPC/Edge requests in backend mode. |
| Production data import/cutover | LEGACY_PRODUCTION_ONLY | Explicitly not performed in this closeout. |

## Counts

- MIGRATED: 10 workflow groups.
- DEFER_PHASE3D_STORAGE: 3.
- DEFER_PHASE3E_PAYMENT: 4.
- DEFER_PROVIDER: 2.
- LEGACY_PRODUCTION_ONLY: 2.
- UNEXPLAINED: 0.

Deferred means explicit, owned and fail-closed. It does not mean completed.
