# API conventions

Status: Phase 2 HTTP contract implemented and covered by local unit/integration/runtime checks. Source route schemas and generated `/openapi.json` define transport; OpenAPI includes storage bodies/success responses, `Idempotency-Key`, and common error responses.

## Routes

| Method and path | Authentication | Contract |
| --- | --- | --- |
| `GET /health` | Public local probe | Process liveness; 200 `{"status":"ok"}` without dependency check |
| `GET /ready` | Public local probe | 200 `{"status":"ready"}` only after required config/DB readiness; otherwise 503 |
| `GET /api/v1/me` | Bearer evidence mapped to local identity | 200 `{"id":"<synthetic-application-uuid>","roles":["user"]}`; service must load current local membership |
| `GET /api/v1/profile` | Active local membership | Current explicit profile DTO and current verified roles; no DB model leakage |
| `PATCH /api/v1/profile` | Active local membership | Allowlisted self-profile fields only; server-derived actor and audited write |
| `GET /api/v1/admin/users` | Current active admin/superadmin | Bounded filters plus opaque cursor pagination; hierarchy remains server-enforced |
| `PATCH /api/v1/admin/users/{id}/status` | Current active admin/superadmin | Validated status transition, target hierarchy checks and audit in one transaction |
| `PUT /api/v1/admin/users/{id}/roles` | Current active admin/superadmin | Complete role replacement with self/promotion hierarchy denial; label transfer parity remains blocked |
| `POST /api/v1/admin/users/{userId}/suspend` | Current active admin/superadmin plus target hierarchy policy | JSON body `{"reason":"synthetic test reason"}`; 200 `{"status":"suspended"}` only after local transaction/audit |
| `POST /api/v1/webhooks/events` | Verified fake-provider `x-webhook-signature`; not browser bearer membership | Raw JSON bytes verified, event/replay/schema validated and durably deduplicated; 200 `{"status":"accepted"}` after durable acceptance |
| `POST /api/v1/storage/objects` | Bearer plus Storage authorization; registered only with Storage dependency | JSON `dataBase64`, `mimeType`, SHA-256 `checksum`; response from adapter includes asset `id` |
| `GET /api/v1/storage/objects/{objectId}/url` | Bearer plus object authorization; registered only with Storage dependency | 200 `{"url":"<transient-signed-download-url>"}` with 300-second requested lifetime |
| `POST /api/v1/actions/notification` | Bearer plus active local membership; registered only with async dependency | Required `Idempotency-Key`, 8–200 allowlisted characters; 200 event ID and `status: "queued"` after durable enqueue |
| `GET /openapi.json` | Local documentation access | Generated OpenAPI 3.0.3 route/security/schema document; no runtime secret/config values |

Route set is representative foundation, not a full user management or domain API. Conditional routes require bootstrap wiring and generated OpenAPI coverage before acceptance; adding them to this table does not claim a running endpoint. Storage/async services still require DB, policy, idempotency and rate-limit integration. No production frontend API-base switch.

## Input validation and identity

All bodies, params, query and required headers are schema-validated. Reject additional mutation fields, wrong JSON types, malformed/oversize bodies and unsupported media types. Disable coercion/removal/defaulting that would silently transform invalid requests. Treat reason as bounded nonblank text; target application IDs use UUID validation at the API or validated service boundary before SQL.

Authentication accepts a well-formed single Bearer credential only through the injected verifier/resolver. Neither raw token text nor a claimed role/user header is principal identity. Fake-provider signature receives exact raw body bytes; parsing/reserializing before verification changes signed content. Never accept client actor, role, ownership or tenant context as authoritative.

Foundation global JSON body ceiling is 1 MiB in current route design; Storage has its own explicit byte/type limits. Keep raw-body parsing scoped to webhook routes. No wildcard CORS or trusted-forwarded-IP assumption by default; enable only explicit development origins/proxy configuration when needed.

## Responses and errors

Success payloads are direct typed JSON objects; no redundant success envelope. Errors use one shape:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied",
    "requestId": "<server-generated-request-id>"
  }
}
```

| HTTP | Category/code |
| --- | --- |
| 400 | Validation: `BAD_REQUEST` |
| 401 | Missing/invalid authentication: `UNAUTHORIZED` |
| 403 | Authenticated policy denial: `FORBIDDEN` |
| 404 | Missing route/resource, or consistent private-resource masking: `NOT_FOUND` |
| 409 | State/idempotency conflict: `CONFLICT` |
| 413 / 415 | Payload/media-type rejection; same safe error schema |
| 429 | Rate limit: `RATE_LIMITED`, with bounded `Retry-After` |
| 503 | Required dependency/provider temporarily unavailable; readiness uses `NOT_READY` |
| 500 | Unexpected internal failure: `INTERNAL_ERROR` |

Provider/database failures map to controlled public categories; detailed SQL, stacks, hostnames, credentials and provider internals stay out of response. Validation details must not echo private fields. Typed service errors must be mapped centrally, including Auth-layer errors; plain framework status alone must not turn authorization failures into misleading validation errors.

Every response carries server-generated `x-request-id`, also used by error body and safe logs. Ignore untrusted request ID as authoritative; if external trace correlation is later accepted, validate it separately. Unknown routes follow the same error envelope.

## Collections and mutation conventions

No collection endpoint is required by the initial route set. Future collection contract uses bounded `limit`, opaque `cursor`, deterministic ordering plus unique tie-breaker, and `{items,nextCursor}` response. Filters/sort fields are explicit allowlists; never interpolate client SQL identifiers or accept tenant filters as authorization. Exact defaults/maxima must appear in each route schema before release.

Future retryable mutations require scoped `Idempotency-Key` or verified provider event identity; same-key/different-input is conflict. Do not claim that every foundation POST already implements HTTP idempotency merely because the DB helper exists. See [worker design](WORKER_OUTBOX_DESIGN.md).

Rate-limit categories are auth-sensitive, webhook, privileged admin and general API. Enforce limits server-side before costly work, avoid trusting spoofed forwarding headers, and cap key memory/cardinality. In-memory limiter is acceptable for isolated single-process dev only; shared deployment requires coordinated enforcement.

## OpenAPI and contract tests

Generate path parameters, request/response/error schemas and security from route definitions. Document webhook signature header separately from bearer authentication. Probes/docs need explicit unauthenticated intent. Verify route-spec parity and actual positive/negative responses; a JSON endpoint with incomplete security/validation documentation is not acceptance evidence.

See [authorization](AUTHORIZATION_MODEL.md), [observability](OBSERVABILITY.md), and [test strategy](PHASE2_TEST_STRATEGY.md).


