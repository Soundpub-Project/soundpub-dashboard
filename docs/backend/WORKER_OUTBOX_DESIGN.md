# Worker, outbox and idempotency

Status: Phase 2 design contract. Separate worker process uses the same TypeScript application model and dedicated PostgreSQL. Provider effects are local mocks only.

## Atomic intent

Service opens one transaction and writes domain change, audit event and outbox event using the same database client. Commit makes intent visible; rollback leaves none of those writes. Never publish an event before commit or send email/payment inside the business transaction.

Physical event fields are UUID, `topic`, `payload`, unique `idempotency_key`, status, attempts, `available_at`, timestamps and safe `last_error`. Aggregate identity, schema version and request correlation belong in the explicit safe event payload where needed. Payload includes only data needed by the handler, not credentials, token, raw private webhook body or unrestricted user snapshot.

## Claim, dispatch and recovery

Use PostgreSQL row locking with `FOR UPDATE SKIP LOCKED` so concurrent workers claim disjoint eligible events. Physical status labels are `pending`, `processing`, `processed` and `dead`; current poller selects eligible `pending` rows and records `processed` or another pending attempt/dead outcome.

Current `pollOutbox` keeps one transaction/row lock through its short local mock handler and uses a `delivery` savepoint. `integration_effects` guard and successful local handler DB changes commit with processed state; failure rolls those effects back to the savepoint before recording retry. This consumes one pool connection/lock for handler duration, so handlers must be bounded and foundation-local. Connection-loss rollback releases the row for a future poll. Although schema reserves processing/lock fields, current poller does not implement lease recovery for externally inserted processing rows.

Before moving to long external I/O outside the transaction, add lease expiry and claim token/version, fenced completion/failure updates, and reclaim tests. No committed processing state may become permanently stranded after crash; do not combine both designs halfway.

Handler calls a mock provider using stable event/operation idempotency identity. Current default is five attempts, base delay 1,000 ms and cap 300,000 ms, deterministic exponential backoff without jitter. Success increments attempts and records processed timestamp. Failure retries until the limit, then dead-letters with sanitized `Delivery failed`; missing handlers follow failure handling. Immediate permanent-error classification/jitter are extension points, not claimed behavior.

Worker delivery is at least once. A crash after provider success but before completion may repeat dispatch. Durable provider-side idempotency or reconciliation is required for effective single application of financial side effects later. In-memory mock deduplication proves only that mock's lifetime, not durable restart safety.

## Idempotency contract

Scope keys by authenticated principal/tenant and operation, or verified provider and event ID for webhooks. Persist unique scope/key, request hash, in-progress/completed state, stable result/reference and retention expiry. Compute hash from defined canonical business input or exact verified event bytes, with an explicit hashing convention.

| Existing key | Required behavior |
| --- | --- |
| Absent | Atomically claim once; competing inserts cannot both own operation |
| Same hash, completed | Return original stable result/reference; no repeated state change |
| Same hash, running | Controlled in-progress/retry response; no second side effect |
| Different hash | Conflict; never overwrite prior operation/request hash |
| Expired | Reuse only under documented retention/reconciliation rules; no blind deletion of payment/webhook protection |

Domain result, outbox intent and completion of API idempotency record should commit together where local state is sufficient. External calls use operation identity at the provider boundary. An isolated idempotency helper is not proof that HTTP routes, handlers or provider mocks actually use it.

## Webhook ingress

`POST /api/v1/webhooks/events` is the local fake-provider foundation route. Validate signature/authentication against exact raw bytes before trusting parsed fields. Enforce body limit, schema, trusted event ID and bounded timestamp/replay policy; use Node.js established crypto helpers if fake-event HMAC is required. Do not implement a production Xendit verifier from a mock convention.

Current `receiveWebhook` verifies fake HMAC-SHA256 over `timestamp.eventId.` followed by exact raw bytes, using timing-safe comparison. Default freshness tolerance is 300 seconds; default body limit is 1 MiB. Provider/event identity are bounded, signature is 64 hex characters, and timestamps are decimal seconds. This helper takes provider/event ID/timestamp explicitly; HTTP composition must bind those values to the signed envelope without inventing trusted client membership.

Within one transaction persist `webhook_events` provider/event identity and body digest, invoke the local handler on the same client, and mark processed. Current helper does not persist raw payload by default; handler can insert validated safe outbox intent in that transaction. Return success only after durable acceptance. Same event replay succeeds without another mutation/event; conflicting payload for the same identity fails. Missing/bad signature, stale/future timestamp, malformed content or unauthenticated event must leave no business/outbox state.

A header-presence check is insufficient provider authentication. Concurrent deliveries, rollback, response loss and worker crash need separate tests. Production callbacks remain untouched.

## Operations and representative slice

API synthetic transaction creates one notification/integration intent. Worker claims it, invokes a local mock and records success; injected transient/permanent errors demonstrate retry/dead-letter. Graceful shutdown stops new claims and drains bounded in-flight work or leaves recoverable leases. Pool/client resources close cleanly.

Manual replay is a future privileged, audited operation; never expose an unauthenticated requeue endpoint. Monitor pending count/age, processing lease age, attempts, dead letters and handler failures. See [observability](OBSERVABILITY.md), [provider adapters](PROVIDER_ADAPTERS.md), and [test strategy](PHASE2_TEST_STRATEGY.md).

