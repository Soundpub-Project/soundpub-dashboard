# Phase 3B Final Browser Matrix

Date: 2026-10-28 (Asia/Bangkok). Stack: Chromium -> Vite local proxy -> real Fastify Soundpub backend -> owned disposable PostgreSQL 17.

| Check | Mobile 390x844 | Tablet 768x1024 | Desktop 1440x900 |
| --- | --- | --- | --- |
| Label list success | PASS | PASS | PASS |
| Label detail success | PASS | PASS | PASS |
| Label validation error | PASS | PASS | PASS |
| Label 401 | PASS | PASS | PASS |
| Label 403 | PASS | PASS | PASS |
| Label 404 | PASS | PASS | PASS |
| Label 409 | PASS | PASS | PASS |
| Label 500 | PASS | PASS | PASS |
| Label network failure | PASS | PASS | PASS |
| Artist detail success | PASS | PASS | PASS |
| Artist detail 404 | PASS | PASS | PASS |
| Artist detail authorization error | PASS | PASS | PASS |
| Artist detail server error | PASS | PASS | PASS |
| Artist detail network failure | PASS | PASS | PASS |
| persisted reload | PASS | PASS | PASS |
| Result | PASS | PASS | PASS |

## Error evidence

- 400: destination selected in Label transfer UI, then destination Label role invalidated; visible `VALIDATION_ERROR`, dialog retained, parent row unchanged.
- 401: Label transfer and Artist detail requests after verified identity removal; visible error, retained/recoverable UI, no mutation.
- 403: admin authority removed after Label transfer dialog loaded; visible `FORBIDDEN`, no privilege leak, DB parent unchanged.
- 404: missing Artist route plus missing management Label on full Artist detail; recoverable page and no stale Label display.
- 409: competing real detach before stale UI transfer; visible `CONFLICT`, dialog retained, DB remains detached.
- 500: controlled backend exceptions on Label roster and Artist detail; stable request count for 1.2 seconds, then manual recovery.
- Network: browser connection aborts for Label roster and Artist detail; no fulfilled mock response, useful error and manual recovery.

## Persistence and trace

All successful create/edit/assign/transfer/detach/full-detail changes were queried independently in PostgreSQL and then verified after browser reload. Each recorded Artist/Label backend response includes an `x-request-id`; missing request IDs: 0. Direct Supabase Artist/Label business requests observed: 0.

Evidence: `docs/migration/phase3b-final-browser/results.json`.
