# Phase 2 test strategy

Status: acceptance plan, not executed runtime results. Implementation agents self-test; independent Agent H reruns behavior. Coordinator may declare Phase 2 PASS only after all mandatory gates have evidence.

## Isolation and sequence

Use synthetic identities, relationships, invoices, events and files in dedicated PostgreSQL 17/test database and RustFS/S3-compatible object storage. Network/provider mocks must not fall through to real endpoints. No production contact, credential dependency, data import, source mutation or gallery activation. Test environment/reset guards fail before opening an unapproved connection or deleting state.

Each owner follows implementation, unit tests, integration tests, negative tests and regression tests. Prefer built-in Node.js test/assert and existing tooling; no extra framework required. Tests must exercise behavior at trust boundaries rather than mirror implementation. A mocked repository/API test cannot prove PostgreSQL/RLS, object-store byte behavior, worker process or Docker runtime.

## Coverage matrix

| Area | Required evidence |
| --- | --- |
| Config/isolation | Missing/invalid config fails before boot; remote/unapproved target and non-dev mock identity denied; no inherited root production environment |
| Migrations | Blank DB apply, schema assertions, guarded destruction, second blank DB apply, identical expected schema/history/checksums; duplicate/drift/failure rejection |
| DB access | Parameterized queries, commit/rollback, same-client service transaction behavior, pool release; explicit nested behavior; runtime cannot DDL/bypass required RLS |
| Typed references | Deferred/excluded synthetic UUID stays outside users/profiles/roles/identities; historical child remains meaningful through reference; invalid XOR/FK/delete rejected; reference cannot log in/claim ownership |
| Identity | Anonymous/unknown/unverified binding denied; trusted synthetic identity resolves via repository; provider collision and email-only linking denied; no client role/actor injection |
| Authorization | Anonymous, user, owner, other owner, artist, label, admin, superadmin, inactive and suspended; unknown policies/roles deny; target hierarchy and status freshness tested through routes |
| API | Boot, `/health`, `/ready`, DB-backed `/api/v1/me`, admin slice; params/body/query/header negatives, malformed/large JSON, request IDs, safe errors and 404 behavior |
| OpenAPI | All registered documented routes/verbs, path params, bodies, response/error schemas and correct bearer/webhook security; compare actual responses |
| Storage | Real RustFS/S3-compatible object storage upload/download/missing/delete; verified MIME/max size/checksum; pending-object denial; owner/non-owner/admin/status cases; private bytes and actual signed URL expiry/tampering |
| Idempotency | Same request replay returns stable result, same key/different hash conflicts, concurrent claim applies once, failed transaction retry safe, retention scope verified |
| Outbox | Domain/audit/event same commit; rollback leaves no event; concurrent workers claim separately; lock release on crash, or lease reclaim/fencing if lease model is implemented; unknown event dead-letter |
| Worker | Separate process boot, deterministic transient retry/backoff, max attempts/permanent failure, dead-letter state, shutdown/restart and mock-provider deduplication |
| Webhook | Exact raw-byte authentication, missing/invalid signature, malformed schema, stale/future timestamp, duplicate/concurrent event and conflicting payload; durable acceptance before success |
| Providers | Local mocks only; deterministic success/failure/unsupported outcomes; timeout/retry classification; no production callbacks or real mail/payment/OAuth |
| Observability/audit | Request route/duration/status/correlation, worker outcome/queue signals, readiness failure; captured synthetic secret markers absent; privileged transaction audit actor server-derived |
| Rate limit | Auth-sensitive/webhook/admin/general policy distinction; 429/Retry-After, spoofed forwarding header negative and bounded key lifecycle |
| Docker | Image builds, API/worker non-root as practical, healthchecks, private network, loopback exposure, persistence/restart and no secrets baked into image |

The explicit role matrix and controlled inactive behavior are defined in [authorization model](AUTHORIZATION_MODEL.md). Compatibility `copyright`/`whitelabel` roles retain representation and deny undocumented capabilities; test that neither is silently promoted.

## Representative end-to-end slices

1. Current user: verified mock evidence, local external binding, principal/status/roles, authorization, service, repository, PostgreSQL, `/api/v1/me` response. Unknown/inactive/suspended cases deny without data leakage.
2. Admin: synthetic ordinary target suspension through authenticated admin/superadmin policy, local update and audit. User/artist/label, privileged-target escalation, client actor override and stale status deny.
3. Storage: authorized upload intent, synthetic bytes, metadata finalization, owner download/signed URL, unrelated owner deny, real expiry and safe delete/cleanup.
4. Async: API transaction commits domain/audit/outbox, worker process calls mock, durable outcome recorded; rollback, retry, crash and duplicate delivery remain safe.

Mock callbacks or direct unit calls do not substitute for missing composition. Test each assembled path with actual dependency injection and restricted DB credentials. Record partial transport/service coverage honestly.

## Acceptance gates and evidence ownership

All following gates are mandatory, individually PASS only with actual execution:

| Group | Gates |
| --- | --- |
| Runtime/database | Dedicated PostgreSQL; backend API boot; worker boot; database migrations; migration repeatability |
| Identity/policy | Auth abstraction; authorization default deny; complete role matrix |
| Storage/async | Storage abstraction; Storage security tests; outbox; worker retry; idempotency foundation; webhook foundation; provider mocks |
| Operations | Structured logging; health; readiness; OpenAPI; Docker build; Docker runtime |
| Verification | Unit tests; integration tests; security negative tests; representative user/admin/Storage/async slices |
| Safety/review | No production credentials; no production data; no shared production mutation; independent QA |

Implementation owners provide command, commit/workspace reference, environment versions, pass/fail counts and sanitized output for each gate. Coordinator reconciles schema/API/policy composition; Agent H independently executes tests and challenges overclaims. Agent-authored status text and Phase1G's PASS are not Phase2 runtime evidence.

Store execution/environment/database/Auth/authorization/Storage/worker/security/test/independent-QA/final reports in the Phase 2 migration report set owned by coordinator/QA. This documentation-only assignment does not write those reports or mark their gates. Docker unavailable, test skipped, missing fixture or unavailable dependency remains unverified, never PASS.

Full domain migration, source financial reconciliation, real identity/session transition, media recovery/rights, production recovery and cutover remain later gates. Phase 2 success recommends Phase 3 only; it never authorizes production import/callback/routing changes.

## Runnable documentation check

Run this Python 3 block from repository root. It reads only these 12 Markdown files and local link targets. It checks document completeness/link integrity, not backend runtime acceptance.

```python
from pathlib import Path
import re

base = Path('docs/backend')
expected = {
    'ARCHITECTURE.md', 'MODULE_BOUNDARIES.md', 'DATABASE_DESIGN.md',
    'AUTH_DESIGN.md', 'AUTHORIZATION_MODEL.md', 'STORAGE_DESIGN.md',
    'WORKER_OUTBOX_DESIGN.md', 'PROVIDER_ADAPTERS.md', 'API_CONVENTIONS.md',
    'OBSERVABILITY.md', 'LOCAL_DEVELOPMENT.md', 'PHASE2_TEST_STRATEGY.md',
}
assert {p.name for p in base.glob('*.md')} == expected
for name in expected:
    path = base / name
    content = path.read_text(encoding='utf-8-sig')
    assert content.startswith('# '), name
    assert 'Status:' in content, name
    assert content.count(chr(96) * 3) % 2 == 0, name
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if '://' not in target and not target.startswith('#'):
            assert (path.parent / target.split('#', 1)[0]).is_file(), (name, target)
print('PASS: 12 backend design documents and local links; runtime QA not assessed')
```

