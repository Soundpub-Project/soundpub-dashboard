# Phase 2 worker report — expiry and bounded metrics

Current worker retains transactional SKIP LOCKED/savepoint delivery guard, five-attempt default, exponential retry 1,000–300,000 ms and sanitized failure/dead-letter updates. Notification scope notification:{actorId} and request hash unchanged. Completed unexpired replay returns original eventId; expired rows now atomically reclaim and clear old response. New claim gets fresh UUID-suffixed outbox key. Claim, enqueue and completion share one transaction; failed completion rolls back. Original expired-key permanent-conflict finding superseded. No real-provider exactly-once guarantee; reusing expired keys intentionally permits new intent.

API main wires instrumentApi before listen: fixed aggregate requests, response-class counts and requestMs count/total, no user/URL labels. API emits cumulative metrics plus DB pool total/idle/waiting every 30 seconds; timer unref and onClose cleanup. No new metrics endpoint or external collector.

Worker increments poll.idle/processed/retry/dead or poll.error, observes pollMs and emits cumulative counters/timing plus DB pool and queue sample at most once per 30-second loop interval. Queue counts pending/processing/dead sample at most 1,000 matching rows, explicitly sampleLimit=1000. Query uses transaction-local statement_timeout=1000ms; failure increments metrics.error and logs safe warning. Pool acquisition timeout still applies separately. Counts are sampled, unordered and not exact large-queue gauges; no queue-age metric or histogram/exporter.

Worker-ready timestamp now refreshed after successful polling; original startup-only-write statement superseded. A health command checking only marker existence would still not prove freshness; no stalled-worker probe in this refresh. Poll duration includes marker write; no claim of handler-only timing.

Latest 33/33 full suite passed, including real PostgreSQL queue sample and reclaim/concurrency/rollback tests; API metric aggregation/privacy test and five worker/provider tests pass. Source wiring verified, not a live assertion that current images emit new telemetry. Four local v2 services observed healthy. No live retry/crash/restart/dead-letter drill or full external-effect reconciliation.

Commands:
```powershell
Get-Content backend/src/worker-main.ts,backend/src/observability/index.ts
rg -n -A 28 'idempotency:|async enqueue' backend/src/db/repositories.ts backend/src/main.ts
docker ps --filter name=soundpub-foundation-v2 --format '{{.Names}} {{.Status}}'
```

Test/typecheck commands and initial transient failure are recorded in PHASE2_TEST_REPORT.md. Providers remain local mocks; no production callback or provider action.


Snapshot: 2026-10-28 approximately 02:00 UTC. Isolation: local code, dedicated local Docker and synthetic soundpub_test only; no production contact, deployment, restart or source edits. Only DATABASE, WORKER and TEST reports updated. Reporting/self-check evidence, not independent QA. Earlier execution log describes historical checks; current facts below supersede conflicting older statements.
