# Phase 2 test report — latest 33/33

Latest full suite: 33/33 passed, 0 failed/skipped/cancelled/todo, approximately 2.46 seconds. Typecheck exit 0; isolation/secret scan exit 0. Initial refresh full run was 32 passed/1 DB failure; isolated DB rerun 1/1 passed; final full rerun 33/33 passed. Initial failure detail was filtered from output and cause not established. Do not infer flake-free execution or concurrent DB contention.

Counts: API 2; API slices 1; auth 4; authorization 2; config 3; observability 4; DB 1; memory storage 6; S3 transport tests 2; webhook 3; worker/provider 5. Real DB test uses all five migrations including runtime grants, concurrent migration/reclaim, stale-response clearing, conflict and rollback behavior, persisted outbox/webhook and bounded queue sample. API runtime metric test checks counts, latency and absence of private request labels. Most API/worker tests inject mocks; S3 SDK transport mocked. MIME/OpenAPI assertions included from shared work; no source edits in report refresh.

## Exact full-suite command

From backend directory; private ignored local owner credential read only in memory. DB_TEST_URL fixed to loopback dedicated soundpub_test; existing test drops only test schema, never soundpub_dev.
```powershell
@'
import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import {spawnSync} from 'node:child_process';
const local=parseEnv(readFileSync('.env','utf8'));if(!local.MIGRATION_DATABASE_PASSWORD)throw Error('Missing local test credential');
const r=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','--test-reporter=spec','test/*.test.ts'],{env:{...process.env,NODE_ENV:'test',DB_TEST_URL:`postgres://soundpub_owner:${encodeURIComponent(local.MIGRATION_DATABASE_PASSWORD)}@127.0.0.1:55432/soundpub_test`},encoding:'utf8'});console.log(r.status?r.stdout:r.stdout.split('\n').filter(x=>x.startsWith('ℹ')).join('\n'));process.exitCode=r.status??1;
'@ | node --input-type=module
npm run typecheck
npm run security:check
```

Isolated rerun used same private environment with tsx --test test/db.test.ts: 1 passed. Final full-suite rerun followed typecheck/scan without source edits. Initial shell's final exit reflected later successful commands; test counts above preserve actual failed run.

Read-only live check confirms 0001 through 0005 history; both owner/app privilege flags false; app schema CREATE false, audit SELECT/INSERT, roles SELECT, no migration-table grants. Four v2 containers healthy. Source shows expiry reclaim and fixed API/worker metrics; latest run tests DB queue sample/API aggregates, not deployed-image telemetry emission.

Earlier real RustFS signed PUT/pending denial/completion/GET and async stable-replay probes remain historical evidence, not rerun this refresh. npm audit zero findings is historical earlier check; not rerun here. Isolation scanner is finite backend pattern scan, not exhaustive image/history secret attestation.

Remaining checks not run: live full admin hierarchy, destructive app DDL denial, two-clean-database comparison, live worker concurrency/crash/retry, expiry/tampering of real storage URLs, new telemetry log delivery, restart persistence and backup restore. Queue sample capped at 1,000; no exact backlog/age/exporter guarantee. Expired idempotency allows intentional re-execution and requires transaction-coupled effects. No independent QA, final acceptance or production cutover verdict.


Snapshot: 2026-10-28 approximately 02:00 UTC. Isolation: local code, dedicated local Docker and synthetic soundpub_test only; no production contact, deployment, restart or source edits. Only DATABASE, WORKER and TEST reports updated. Reporting/self-check evidence, not independent QA. Earlier execution log describes historical checks; current facts below supersede conflicting older statements.


