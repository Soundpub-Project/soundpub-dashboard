import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../infra/postgres/provision-runtime-roles.sh', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker-main.ts', import.meta.url), 'utf8');

test('dev role provisioning upgrades existing volumes before migrations', () => {
  assert.match(script, /Development database required/);
  assert.match(script, /IF NOT EXISTS .*soundpub_reconciler/s);
  assert.match(script, /IF NOT EXISTS .*soundpub_auditor/s);
  assert.match(script, /ALTER ROLE soundpub_reconciler WITH LOGIN PASSWORD/);
  assert.match(script, /ALTER ROLE soundpub_auditor WITH LOGIN PASSWORD/);
  assert.match(script, /REVOKE soundpub_app FROM soundpub_reconciler/);
  assert.match(compose, /provision-runtime-roles:[\s\S]*service_completed_successfully/);
  assert.match(compose, /migrate:[\s\S]*provision-runtime-roles: \{ condition: service_completed_successfully \}/);
});

test('finance reconciliation schedule cannot be starved by active queues', () => {
  assert.match(worker, /if \(Date\.now\(\) >= nextFinanceReconciliationAt\)/);
  assert.doesNotMatch(worker, /royaltyOutcome === 'idle'.*nextFinanceReconciliationAt/);
});
