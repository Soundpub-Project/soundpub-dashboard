# Phase 3C release state contract

Persisted vocabulary remains `draft`, `pending`, `pending_paid`, `processing`, `active`, `rejected`, `revision_submitted`, `inactive`. `READY_FOR_SUBMISSION` and `READY_FOR_ACTIVATION` are derived readiness, not database statuses. Track has no status column. Every write locks the Release, checks expected version, rechecks authority, and audits within the same transaction.

| Source | Destination | Owner | Closeout behavior |
| --- | --- | --- | --- |
| New | draft | Phase 3C | Atomic aggregate creation (metadata and initial Tracks); metadata-only create remains for compatibility. |
| draft | pending | Phase 3C submission service | Requires complete metadata/Tracks, authority, media, payment and provider readiness. Absent adapters return blockers; no PATCH fallback. |
| rejected | revision_submitted | Phase 3C submission service | Same readiness/version checks; clears rejection reason atomically. |
| pending | pending_paid | Phase 3E payment | Browser payment claims denied; production payment integration deferred. |
| pending_paid / revision_submitted | processing | Admin review | Existing role/version guards. |
| processing | rejected | Admin review | Requires rejection reason. |
| processing | active | Later provider/cutover | Deliberately 409 until Track/ISRC validation and provider activation exist. |
| eligible status | inactive | Authorized archive | Existing bounded transition; no refund. |
| inactive | pending | Phase 3C submission + Phase 3E payment | Direct PATCH denied; restore needs full readiness/payment semantics. |
| inactive / paid | delete / refund | Phase 3E payment | Release deletion deliberately 409; no refund claim. |

`PATCH /api/v1/releases/:id` cannot move to `pending` or `revision_submitted` or restore to `pending`, including for admin. `POST /api/v1/releases/:id/submit` is the only submission mutation. `GET /api/v1/releases/:id/submission-readiness` lists blocking code plus exactly one owning phase. Runtime injects no deferred adapters, so submission cannot silently proceed. Test adapters may simulate satisfied dependencies using disposable PostgreSQL.

Aggregate edit is draft/pending/rejected only, requires Release version plus each retained Track version, and atomically classifies CREATE/UPDATE/REMOVE/UNCHANGED. Current locked management authority controls writes; historical `label_id` and `created_by` remain immutable attribution. Phase 3D media, Phase 3E payment/refund and later provider activation remain deferred.
