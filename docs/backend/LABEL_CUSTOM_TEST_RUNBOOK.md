# Label Custom test runbook

Run only from the local SoundPub repository. Never point these commands at production, port `8181`, remote hosts, real backup data, or a Compose project other than `dashboard-sounpub-dev`.

## 1. Backend static and unit coverage

From `backend/`:

```powershell
npm run typecheck
npm run build
npm test
```

Accepted final evidence on 2026-11-04:

```text
227 tests
193 pass
34 skip
0 fail
```

Skipped tests require explicit integration/recovery opt-in. A skip is not production evidence.

## 2. Disposable Docker integration

Prerequisite: Docker Desktop local context and no production context selected. Tests provision synthetic, disposable services and must use the approved project name.

```powershell
$env:RUN_DOCKER_TESTS = '1'
npm run test:docker
Remove-Item Env:RUN_DOCKER_TESTS
```

Accepted final evidence:

```text
274 tests
268 pass
6 skip
0 fail
```

The suite covers PostgreSQL constraints/transactions, media lifecycle, CORS, release/track ownership, royalty/ledger behavior, payout readiness, replay, rollback, and Label Custom end-to-end workflow.

If interrupted, inspect only owned test services:

```powershell
docker ps -a --filter "name=dashboard-sounpub-dev-test-" --format "{{.Names}} {{.Status}}"
```

Do not use project-wide prune, orphan removal, or an unscoped Compose shutdown for test cleanup.

## 3. Recovery rehearsal

Recovery uses a separate opt-in because it creates two independent disposable PostgreSQL targets and validates deterministic import/replay behavior.

```powershell
$env:RUN_RECOVERY_REHEARSAL = '1'
npx tsx --test --test-concurrency=1 test/label-custom-recovery.test.ts test/label-custom-recovery-rehearsal.test.ts
Remove-Item Env:RUN_RECOVERY_REHEARSAL
```

Accepted final evidence:

```text
12 pass
0 skip
0 fail
```

This rehearsal uses generated synthetic staging only. It must not discover, open, decrypt, or mutate `backups/`. It proves parser/importer mechanics, not real production backup recoverability.

## 4. Frontend build and focused contracts

From repository root:

```powershell
npm run build
node src/components/releases/label-custom.test.cjs
node src/components/finance/label-custom-finance.test.cjs
node src/services/label-custom.test.cjs
```

All commands must pass. Current accepted build has a non-blocking Vite chunk-size warning around 2.3 MB.

## 5. Isolated dev deployment verification

From `backend/`:

```powershell
docker compose -p dashboard-sounpub-dev up -d --build
docker compose -p dashboard-sounpub-dev ps --all
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3300/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3300/ready
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8281/auth
docker logs dashboard-sounpub-dev-migrate-1 --tail 50
```

Expected:

- Backend, frontend, PostgreSQL, worker, and object storage are healthy.
- Migration and seed jobs exit `0`.
- Health returns `{"status":"ok"}`.
- Readiness returns `{"status":"ready"}`.
- Frontend returns HTTP `200`.
- Migration rerun reports no pending migration.

## 6. Browser acceptance

Use only a synthetic local account. Validate:

1. Login succeeds and session/profile requests return `200`.
2. Dashboard, users, releases, royalties, payouts, and settings routes render.
3. Label Custom PIC can create/edit/archive managed artists without passwords.
4. Release selection uses canonical managed artist ownership.
5. Royalty reports and CSV export respect server-side authorization.
6. Destination verification, reconciliation approval, revocation, and replacement show current state.
7. No unexpected console error or failed network request occurs.
8. Synthetic account and generated data are removed after acceptance.

## 7. Failure handling

- Stop on any typecheck, build, migration, security, or finance test failure.
- Preserve logs and exact operation key for replay diagnosis; never log credentials, bank details, signed URLs, or tokens.
- Do not “fix” failures by switching to production resources or legacy Supabase writes.
- Re-run focused test first, then complete suite after fix.
- Production rollout requires separate explicit approval even when this runbook passes.