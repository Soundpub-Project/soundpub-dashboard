import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { migrate } from '../../src/db/migrate.js';

export const dockerTestsEnabled = process.env.RUN_DOCKER_TESTS === '1';
const composeFile = fileURLToPath(new URL('../../docker-compose.test.yml', import.meta.url));
type TestService = 'test-postgres' | 'test-rustfs';
export function testComposeCommand(service: TestService, id: string, action: 'up' | 'port' | 'rm') {
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.ok(service === 'test-postgres' || service === 'test-rustfs');
  const owned = `${service}-${id}`;
  const tail = action === 'up' ? ['up', '-d', '--no-deps', owned]
    : action === 'port' ? ['port', owned, service === 'test-postgres' ? '5432' : '9000']
    : ['rm', '--stop', '--force', '--volumes', owned];
  return ['compose', '-p', 'dashboard-sounpub-dev', '--env-file', process.platform === 'win32' ? 'NUL' : '/dev/null',
    '-f', composeFile, '-f', '-', ...tail];
}
export function testComposeResource(service: TestService, environment: Record<string, string> = {},
  execute = (args: string[], input: string) => {
    const context = JSON.parse(execFileSync('docker', ['context', 'inspect', 'desktop-linux'], {
      encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    assert.match(context[0]?.Endpoints?.docker?.Host ?? '', /^(npipe:\/\/|unix:\/\/\/)/, 'Local Docker endpoint required');
    return execFileSync('docker', args, {
    input, encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DOCKER_CONTEXT: 'desktop-linux', COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_REMOVE_ORPHANS: 'false', COMPOSE_IGNORE_ORPHANS: 'true', COMPOSE_PROFILES: '' },
  }).trim();
  }) {
  if (process.env.RUN_DOCKER_TESTS !== '1') throw new Error('RUN_DOCKER_TESTS=1 required');
  const id = randomUUID();
  const owned = `${service}-${id}`;
  const input = JSON.stringify({ services: { [owned]: {
    extends: { file: composeFile, service }, profiles: [], environment,
  } } });
  const command = (action: 'up' | 'port' | 'rm') => execute(testComposeCommand(service, id, action), input);
  let closed = false;
  return {
    start() { try { command('up'); const address = command('port');
      assert.match(address, /^127\.0\.0\.1:\d+$/);
      const port = Number(address.split(':')[1]);
      assert.ok(port > 0 && port <= 65535 && port !== 8181);
      return address;
      } catch (error) { command('rm'); closed = true; throw error; }
    },
    close() { if (!closed) { command('rm'); closed = true; } },
  };
}

export async function concurrencyPostgres() {
  const resource = testComposeResource('test-postgres');
  let owner: pg.Pool | undefined;
  let runtime: pg.Pool | undefined;
  let reconciler: pg.Pool | undefined;
  let auditor: pg.Pool | undefined;
  try {
    const address = resource.start();
    const config = { host: '127.0.0.1', port: Number(address.split(':')[1]), database: 'soundpub_test',
      connectionTimeoutMillis: 1000,
      options: '-c search_path=soundpub,public -c statement_timeout=15000 -c lock_timeout=10000' };
    owner = new pg.Pool({ ...config, user: 'postgres' });
    const deadline = Date.now() + 30_000;
    for (;;) {
      try { await owner.query('SELECT 1'); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await setTimeout(100); }
    }
    await owner.query('CREATE ROLE soundpub_owner; CREATE ROLE soundpub_app LOGIN; CREATE ROLE soundpub_reconciler LOGIN; CREATE ROLE soundpub_auditor LOGIN');
    await migrate(owner);
    assert.deepEqual(await migrate(owner), []);
    runtime = new pg.Pool({ ...config, user: 'soundpub_app' });
    reconciler = new pg.Pool({ ...config, user: 'soundpub_reconciler' });
    auditor = new pg.Pool({ ...config, user: 'soundpub_auditor' });
    assert.equal((await runtime.query('SELECT current_user')).rows[0].current_user, 'soundpub_app');
    assert.equal((await reconciler.query('SELECT current_user')).rows[0].current_user, 'soundpub_reconciler');
    assert.equal((await auditor.query('SELECT current_user')).rows[0].current_user, 'soundpub_auditor');
    const ownerPool = owner, runtimePool = runtime, reconcilerPool = reconciler, auditorPool = auditor;
    return { owner: ownerPool, runtime: runtimePool, reconciler: reconcilerPool, auditor: auditorPool, async close() {
      try { await Promise.allSettled([auditorPool.end(), reconcilerPool.end(), runtimePool.end(), ownerPool.end()]); }
      finally { resource.close(); }
    } };
  } catch (error) {
    try { await Promise.allSettled([auditor?.end(), reconciler?.end(), runtime?.end(), owner?.end()]); }
    finally { resource.close(); }
    throw error;
  }
}

export async function waitForBlock(observer: pg.Pool, waiter: number, blocker: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await observer.query(`SELECT wait_event_type, pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE pid=$1`, [waiter]);
    const state = result.rows[0];
    if (state?.wait_event_type === 'Lock' && state.blockers.includes(blocker)) return;
    await setTimeout(10);
  }
  assert.fail(`PID ${waiter} did not block on PID ${blocker}`);
}
