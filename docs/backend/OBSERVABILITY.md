# Observability and operational health

Status: Phase 2 instrumentation implemented and locally verified. API logs request ID, route template, status and duration, plus 30-second aggregate response/latency and DB-pool snapshots. Worker logs delivery outcomes, retries/errors, poll duration, bounded queue samples and DB-pool snapshots. No external metrics exporter or distributed tracing backend is configured.

## Logs and correlation

Use structured JSON logs with request/event ID, method, route template, duration, status, safe outcome and safe local user reference where useful. Generate request IDs server-side and return `x-request-id`; do not trust arbitrary incoming IDs. Use route template rather than raw path/query to avoid private identifiers and unbounded metric labels.

Propagate request correlation into audit/outbox metadata and worker logs. Worker includes event ID/type, attempt, safe result/failure code and duration. Use monotonic timing for durations. Process startup/shutdown logs disclose service/environment/version and dependency health categories, never config dumps.

Do not log Authorization/Cookie/Set-Cookie headers, refresh/access tokens, webhook secrets/signatures, passwords, DB connection strings, SMTP/provider credentials, signed URL queries, private file bodies or raw webhook payloads. Redact known secret fields centrally and avoid passing arbitrary error/provider objects to logger. Unknown errors get safe public messages and sanitized diagnostic categories.

## Metrics

| Signal | Required semantics | Safe labels |
| --- | --- | --- |
| Request count | Completed requests and response class/status | Method, route template, status |
| Request latency | Duration distribution, seconds or explicitly documented unit | Method, route template |
| Error rate | Derived failures divided by relevant request count | Route/status class |
| DB pool | Total, idle, waiting connections; dependency failure count | Runtime role/service |
| Queue | Pending/processing/dead counts and oldest eligible event age | Event family, bounded status |
| Worker retry | Attempt/retry/failure count and handler duration | Handler name, safe failure category |
| Webhook failure | Authentication, replay, validation and persistence failures | Fixed reason category |
| Storage operations | Success/failure/latency without private keys | Operation, bounded provider name |

No email, user UUID, token, object key, arbitrary exception message or request ID in metric labels. Lightweight local counters/snapshots are enough for foundation if inspectable and tested; no mandatory collector/Redis dependency. If `/metrics` or an exporter is added, keep it on restricted management access and document it in runtime configuration; do not assume such a route exists.

Trace preparation means consistent correlation through API, transaction, outbox and worker. Full OpenTelemetry deployment is optional until there is a consumer. Correlation IDs alone must not be reported as distributed tracing instrumentation.

## Health, readiness and shutdown

`GET /health` reports running HTTP process without DB/provider round trip. `GET /ready` fails with 503 if mandatory typed configuration is invalid, DB is unavailable or required schema is unusable. Required config should fail startup before binding. Use bounded DB timeout and a cheap query; a socket connection alone cannot prove migrations are applied. If Storage is mandatory for the runtime, readiness includes local S3-compatible object storage; otherwise disclose optional degraded state internally.

Probe bodies stay minimal, excluding hosts, credentials, SQL errors and stack traces. Worker needs its own progress/health evidence; an API probe does not prove worker is polling. Compose checks and tests must distinguish process alive, dependencies ready and job progress.

Shutdown marks API unready, stops accepting work, drains bounded requests/claims and closes pools. Worker stops new claims and completes or leaves recoverable leased work. Forced shutdown must not mark a job successful before its provider result is known.

## Audit

Audit events are durable application data, separate from operational logs. Record identity linkage, privileged actions, role/status changes and sensitive Storage operations, plus later payout/impersonation events. Actor comes from authenticated server context or explicit worker service identity; never request body. Record target/resource, action, outcome, timestamp and request/event correlation with allowlisted metadata.

Successful privileged state change, audit and outbox intent share a transaction. Denied actions need safe security logging or separately durable audit as appropriate, without granting access or persisting private request bodies. Runtime must not update/delete existing audit history; retention and administrative access require explicit policy.

## Failure and recovery evidence

Demonstrate unavailable DB causes unready response, failed webhook leaves safe evidence without secret leakage, worker retries/dead-letter are visible, and request IDs match response/log/event chain. Scan captured logs using synthetic secret markers; ensure duration/status fields exist. Backup-friendly volumes and scoped local restore practice do not constitute verified production disaster recovery.

See [local development](LOCAL_DEVELOPMENT.md), [worker design](WORKER_OUTBOX_DESIGN.md), and [test strategy](PHASE2_TEST_STRATEGY.md).

