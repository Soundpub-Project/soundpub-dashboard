import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { guardTarget, recover, type DisposableTarget } from '../src/recovery/apply.js';
import { digest, kinds, planRecovery, snapshotRecoverySource } from '../src/recovery/index.js';
import { rehearseRecovery } from '../src/recovery/rehearsal.js';

const enabled = process.env.RUN_RECOVERY_REHEARSAL === '1';
type Action = 'up' | 'port' | 'ps' | 'rm';
type Execute = (args: string[], input?: string) => Promise<string>;

function composeCommand(service: string, action: Action): string[] {
  assert.match(service, /^recovery-postgres-[a-f0-9]{32}$/);
  const tail = action === 'up' ? ['up', '-d', '--no-deps', service]
    : action === 'port' ? ['port', service, '5432']
    : action === 'ps' ? ['ps', '--all', '-q', service]
    : ['rm', '--stop', '--force', '--volumes', service];
  return ['--context', 'desktop-linux', 'compose', '-p', 'dashboard-sounpub-dev',
    '--env-file', process.platform === 'win32' ? 'NUL' : '/dev/null', '-f', '-', ...tail];
}

const executeDocker: Execute = (args, input) => new Promise((resolve, reject) => {
  const child = execFile('docker', args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_REMOVE_ORPHANS: 'false',
      COMPOSE_IGNORE_ORPHANS: 'true', COMPOSE_PROFILES: '' } }, (error, stdout) => {
    // Never echo Compose stdin, environment, passwords or provider output in failures.
    if (error) reject(new Error(`Owned recovery Docker command failed (${error.code ?? 'unknown'})`));
    else resolve(stdout.trim());
  });
  child.stdin?.on('error', () => { /* execFile reports process failure */ });
  child.stdin?.end(input);
});

function fixtureResource(port: number, execute: Execute = executeDocker, optIn = enabled) {
  assert.ok(optIn, 'RUN_RECOVERY_REHEARSAL=1 required');
  assert.ok(Number.isInteger(port) && port >= 32768 && port <= 65535 && port !== 55433,
    'High loopback fixture port, separate from development PostgreSQL, required');
  const id = randomUUID().replaceAll('-', '');
  const service = `recovery-postgres-${id}`;
  const database = `soundpub_recovery_test_${id}`;
  const password = randomUUID();
  const input = JSON.stringify({ services: { [service]: {
    image: 'postgres:17-alpine', network_mode: 'bridge', restart: 'no',
    environment: { POSTGRES_DB: database, POSTGRES_PASSWORD: password },
    ports: [`127.0.0.1:${port}:5432`], tmpfs: ['/var/lib/postgresql/data'],
    labels: { 'soundpub.recovery.fixture': id },
  } } });
  let closed = false;
  const command = (action: Action) => execute(composeCommand(service, action), input);
  return { database, password, service, input,
    async start() {
      const endpoint = await execute(['context', 'inspect', 'desktop-linux', '--format', '{{.Endpoints.docker.Host}}']);
      assert.match(endpoint, /^(npipe:\/\/|unix:\/\/\/)/, 'Local Docker endpoint required');
      try {
        await command('up');
        assert.equal(await command('port'), `127.0.0.1:${port}`);
        const container = await command('ps');
        assert.match(container, /^[a-f0-9]{12,64}$/, 'Exactly one owned container required');
        const state = JSON.parse(await execute(['--context', 'desktop-linux', 'inspect', container, '--format',
          '{"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}}}']));
        assert.equal(state.labels['com.docker.compose.project'], 'dashboard-sounpub-dev');
        assert.equal(state.labels['com.docker.compose.service'], service);
        assert.equal(state.labels['soundpub.recovery.fixture'], id);
        assert.equal(state.network, 'bridge');
        assert.deepEqual(state.ports, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(port) }] });
        assert.deepEqual(state.tmpfs, { '/var/lib/postgresql/data': '' });
        assert.ok(state.mounts.every((mount: { Type: string; Destination: string }) =>
          mount.Type === 'tmpfs' && mount.Destination === '/var/lib/postgresql/data'), 'Persistent mounts prohibited');
      } catch (error) {
        await this.close();
        throw error;
      }
    },
    async close() {
      if (!closed) {
        await command('rm');
        assert.equal(await command('ps'), '', 'Owned fixture survived cleanup');
        closed = true;
      }
    },
  };
}

async function unusedHighPort(): Promise<number> {
  // Choose before binding: never even probe/listen on the permanent dev port.
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = randomInt(56000, 65536);
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
      throw error;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
  }
  throw new Error('No free high loopback recovery fixture port');
}

async function postgresFixture() {
  const port = await unusedHighPort();
  const resource = fixtureResource(port);
  const target: DisposableTarget = { databaseUrl:
    `postgresql://soundpub_recovery:${resource.password}@127.0.0.1:${port}/${resource.database}`,
  confirmDisposableDatabase: resource.database, expectedPort: port };
  const options = { host: '127.0.0.1', port, database: resource.database, password: resource.password,
    connectionTimeoutMillis: 1000, options: '-c statement_timeout=10000 -c lock_timeout=3000', ssl: false as const };
  let admin: pg.Pool | undefined;
  let observer: pg.Pool | undefined;
  try {
    await resource.start();
    admin = new pg.Pool({ ...options, user: 'postgres' });
    const deadline = Date.now() + 30_000;
    for (;;) {
      try { await admin.query('SELECT 1'); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await delay(100); }
    }
    // Generated identifiers/passwords only. Recovery connection is a nonsuperuser.
    assert.match(resource.password, /^[a-f0-9-]{36}$/);
    assert.match(resource.database, /^soundpub_recovery_test_[a-f0-9]{32}$/);
    await admin.query(`CREATE ROLE soundpub_recovery LOGIN PASSWORD '${resource.password}';
      ALTER DATABASE ${resource.database} OWNER TO soundpub_recovery`);
    observer = new pg.Pool({ ...options, user: 'soundpub_recovery' });
    assert.equal((await observer.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper, false);
    await admin.end(); admin = undefined;
    return { target, observer, async close() {
      try { await observer!.end(); } finally { await resource.close(); }
    } };
  } catch (error) {
    try { await Promise.all([admin?.end(), observer?.end()]); } finally { await resource.close(); }
    throw error;
  }
}

async function syntheticSource() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundpub-recovery-rehearsal-'));
  const close = async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^soundpub-recovery-rehearsal-[A-Za-z0-9]+$/);
    await rm(directory, { recursive: true, force: true });
  };
  const rows: Record<string, unknown[]> = {
    users: [{ id: 'pic', name: 'Synthetic PIC', email: 'pic@example.invalid' }],
    units: [{ id: 'unit', ownerId: 'pic', name: 'Synthetic Unit' }],
    artists: [{ id: 'artist-a', unitId: 'unit', name: 'Synthetic A', email: 'a@example.invalid', phone: '000001' },
      { id: 'artist-b', unitId: 'unit', name: 'Synthetic B', email: 'b@example.invalid', phone: '000002' }],
    releases: [{ id: 'release-a', artistId: 'artist-a', title: 'Synthetic Release A' },
      { id: 'release-b', artistId: 'artist-b', title: 'Synthetic Release B' }],
    tracks: [{ id: 'track-a', releaseId: 'release-a', title: 'Synthetic Track A' },
      { id: 'track-b', releaseId: 'release-b', title: 'Synthetic Track B' }],
    royalties: [{ id: 'royalty-a', trackId: 'track-a', currency: 'IDR', amountMinor: '9007199254740993' },
      { id: 'royalty-b', trackId: 'track-b', currency: 'IDR', amountMinor: '-93' }],
  };
  const save = async () => {
    const files = [];
    for (const kind of kinds) {
      const content = JSON.stringify(rows[kind]);
      await writeFile(path.join(directory, `${kind}.json`), content);
      files.push({ kind, file: `${kind}.json`, sha256: digest(content), rows: rows[kind]!.length });
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, namespace: 'synthetic-rehearsal-v1', files }));
  };
  try { await save(); } catch (error) { await close(); throw error; }
  return { directory, rows, save, close };
}

test('recovery fixture commands have no env files, persistent mounts, shared services or broad cleanup', () => {
  const resource = fixtureResource(55321, async () => '', true);
  const spec = JSON.parse(resource.input);
  assert.deepEqual(Object.keys(spec), ['services']);
  assert.deepEqual(Object.keys(spec.services), [resource.service]);
  const service = spec.services[resource.service];
  assert.deepEqual(service.tmpfs, ['/var/lib/postgresql/data']);
  assert.equal(service.network_mode, 'bridge');
  assert.deepEqual(service.ports, ['127.0.0.1:55321:5432']);
  assert.equal(service.volumes, undefined);
  assert.equal(service.env_file, undefined);
  assert.equal(service.extends, undefined);
  for (const action of ['up', 'port', 'ps', 'rm'] as const) {
    const command = composeCommand(resource.service, action);
    assert.deepEqual(command.slice(0, 5), ['--context', 'desktop-linux', 'compose', '-p', 'dashboard-sounpub-dev']);
    assert.deepEqual(command.slice(5, 9), ['--env-file', process.platform === 'win32' ? 'NUL' : '/dev/null', '-f', '-']);
    assert.ok(command.includes(resource.service));
    assert.ok(!command.some(value => ['down', 'prune', '--remove-orphans'].includes(value)));
  }
  assert.throws(() => fixtureResource(55321, async () => '', false), /RUN_RECOVERY_REHEARSAL/);
  for (const port of [8181, 5432, 55433, 0, 65536]) assert.throws(() => fixtureResource(port, async () => '', true));
  assert.throws(() => composeCommand('test-postgres', 'rm'));
});

test('recovery startup failure cleans only its owned service; cleanup errors surface', async () => {
  const calls: string[][] = [];
  const resource = fixtureResource(55321, async args => {
    calls.push(args);
    if (args[0] === 'context') return 'npipe:////./pipe/dockerDesktopLinuxEngine';
    if (args.includes('up')) throw new Error('synthetic startup failure');
    return '';
  }, true);
  await assert.rejects(resource.start(), /synthetic startup failure/);
  await resource.close();
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2]!.slice(-5), ['rm', '--stop', '--force', '--volumes', resource.service]);
  assert.deepEqual(calls[3]!.slice(-4), ['ps', '--all', '-q', resource.service]);
  const failedCleanup = fixtureResource(55321, async () => { throw new Error('synthetic cleanup failure'); }, true);
  await assert.rejects(failedCleanup.close(), /synthetic cleanup failure/);
});

test('recovery high port guard requires explicit matching expectation and denies unsafe endpoints', () => {
  const target = { databaseUrl: 'postgresql://soundpub_recovery:synthetic@127.0.0.1:55321/soundpub_recovery_test_fixture',
    confirmDisposableDatabase: 'soundpub_recovery_test_fixture', expectedPort: 55321 };
  assert.equal(guardTarget(target).port, '55321');
  const { expectedPort: _port, ...withoutPort } = target;
  assert.throws(() => guardTarget(withoutPort));
  for (const expectedPort of [8181, 5432, 0, 65536, 55322, NaN]) assert.throws(() => guardTarget({ ...target, expectedPort }));
  for (const databaseUrl of [target.databaseUrl.replace('127.0.0.1', 'remote.invalid'),
    `${target.databaseUrl}?host=remote.invalid`, target.databaseUrl.replace('soundpub_recovery_test_fixture', 'soundpub_dev')]) {
    assert.throws(() => guardTarget({ ...target, databaseUrl }));
  }
});

test('synthetic source hashes and unresolved-owner reports are deterministic; session/refresh fields rejected', async () => {
  const source = await syntheticSource();
  try {
    const before = await snapshotRecoverySource(source.directory);
    assert.equal(Object.keys(before).length, 7);
    assert.deepEqual(await planRecovery(source.directory), await planRecovery(source.directory));
    assert.deepEqual(await snapshotRecoverySource(source.directory), before);
    source.rows.units = [{ id: 'unit', ownerId: 'missing-owner', name: 'Synthetic Unit' }];
    await source.save();
    const report = await planRecovery(source.directory);
    assert.deepEqual(report, await planRecovery(source.directory));
    assert.deepEqual(report.orphan[0], { kind: 'units', row: 1, reason: 'UNRESOLVED_OWNER' });
    assert.equal(report.orphan.length, 9);
    assert.equal(report.accepted.length, 1);
    assert.deepEqual(report.reconciliation.royaltyMinorByCurrency, {});
    for (const field of ['sessions', 'refresh_token', 'refresh_tokens', 'password_hash', 'provider_identity']) {
      source.rows.users = [{ id: 'pic', name: 'Synthetic PIC', email: 'pic@example.invalid', [field]: 'SYNTHETIC_FORBIDDEN_VALUE' }];
      await source.save();
      const rejected = await planRecovery(source.directory);
      assert.deepEqual(rejected.rejected, [{ kind: 'users', row: 1, reason: 'INVALID_OR_FORBIDDEN_FIELDS' }]);
      assert.equal(rejected.accepted.length, 0);
      assert.ok(!JSON.stringify(rejected).includes('SYNTHETIC_FORBIDDEN_VALUE'));
    }
  } finally { await source.close(); }
});

test('two fresh owned PostgreSQL targets: identical restore/replay, unchanged source, no credentials, unresolved owner and rollback', {
  skip: !enabled && 'Set RUN_RECOVERY_REHEARSAL=1 for owned disposable PostgreSQL rehearsal', timeout: 240_000,
}, async context => {
  const source = await syntheticSource();
  const sources = [source];
  const fixtures: Awaited<ReturnType<typeof postgresFixture>>[] = [];
  try {
    fixtures.push(await postgresFixture());
    fixtures.push(await postgresFixture());
    const targets = [fixtures[0]!.target, fixtures[1]!.target] as const;
    await assert.rejects(rehearseRecovery(source.directory, [targets[0], targets[0]]), /Two distinct/);
    const hashes = await snapshotRecoverySource(source.directory);
    const evidence = await rehearseRecovery(source.directory, targets);
    assert.equal(evidence.sourceUnchanged, true);
    assert.equal(evidence.resultsIdentical, true);
    assert.equal(evidence.reconciliation.accepted, 10);
    assert.deepEqual(evidence.reconciliation.royaltyMinorByCurrency, { IDR: '9007199254740900' });
    assert.equal(evidence.targets.length, 2);
    assert.deepEqual(await snapshotRecoverySource(source.directory), hashes);
    for (const fixture of fixtures) {
      const rows = (await fixture.observer.query(`SELECT kind,payload FROM recovery_foundation.records ORDER BY kind`)).rows;
      assert.equal(rows.length, 10);
      assert.ok(rows.filter(row => row.kind === 'users').every(row => row.payload.requiresReauthentication === 'true'));
      assert.ok(rows.filter(row => row.kind === 'artists').every(row => row.payload.artistUserId === 'NULL'
        && row.payload.managementMode === 'LABEL_CUSTOM_MANAGED'));
      assert.ok(!/sessions|refresh_token|password_hash|provider_identity/.test(JSON.stringify(rows)));
      const owner = (await fixture.observer.query(`SELECT canonical_id FROM recovery_foundation.records WHERE kind='users'`)).rows[0].canonical_id;
      assert.ok(rows.filter(row => row.kind !== 'users').every(row => row.payload.ownerId === owner));
    }
    // Refuse to reuse populated targets; never reset a target to make rehearsal pass.
    await assert.rejects(rehearseRecovery(source.directory, targets), /not fresh/);
    const snapshots = await Promise.all(fixtures.map(fixture => fixture.observer.query(
      'SELECT * FROM recovery_foundation.records ORDER BY kind,source_id').then(result => result.rows)));

    // Actual PostgreSQL rollback: add an early row, then conflict with an existing unit.
    const conflict = await syntheticSource(); sources.push(conflict);
    conflict.rows.users!.push({ id: 'pic-added', name: 'Synthetic Added', email: 'added@example.invalid' });
    conflict.rows.units = [{ id: 'unit', ownerId: 'pic', name: 'Changed Synthetic Unit' }];
    await conflict.save();
    for (let index = 0; index < fixtures.length; index++) {
      await assert.rejects(recover(conflict.directory, { apply: true, target: targets[index]! }), /Recovery replay conflict/);
      assert.deepEqual((await fixtures[index]!.observer.query('SELECT * FROM recovery_foundation.records ORDER BY kind,source_id')).rows,
        snapshots[index], 'Partial insert survived rollback');
    }
    // Dirty source remains reportable, but whole apply fails closed on both targets.
    const dirty = await syntheticSource(); sources.push(dirty);
    dirty.rows.units = [{ id: 'unit', ownerId: 'missing-owner', name: 'Synthetic Unit' }];
    await dirty.save();
    const dirtyHashes = await snapshotRecoverySource(dirty.directory);
    const unresolved = await planRecovery(dirty.directory);
    assert.deepEqual(unresolved, await planRecovery(dirty.directory));
    assert.deepEqual(unresolved.orphan[0], { kind: 'units', row: 1, reason: 'UNRESOLVED_OWNER' });
    for (const target of targets) await assert.rejects(recover(dirty.directory, { apply: true, target }), /zero rejected and orphan/);
    assert.deepEqual(await snapshotRecoverySource(dirty.directory), dirtyHashes);
    for (const field of ['sessions', 'refresh_token']) {
      const credentials = await syntheticSource(); sources.push(credentials);
      credentials.rows.users = [{ id: 'pic', name: 'Synthetic PIC', email: 'pic@example.invalid', [field]: 'SYNTHETIC_FORBIDDEN_VALUE' }];
      await credentials.save();
      const credentialHashes = await snapshotRecoverySource(credentials.directory);
      const report = await planRecovery(credentials.directory);
      assert.equal(report.rejected.length, 1);
      assert.ok(!JSON.stringify(report).includes('SYNTHETIC_FORBIDDEN_VALUE'));
      for (const target of targets) await assert.rejects(recover(credentials.directory, { apply: true, target }), /zero rejected and orphan/);
      assert.deepEqual(await snapshotRecoverySource(credentials.directory), credentialHashes);
    }
    assert.deepEqual(await snapshotRecoverySource(source.directory), hashes, 'Original source changed during negative cases');
    for (let index = 0; index < fixtures.length; index++) {
      assert.deepEqual((await fixtures[index]!.observer.query('SELECT * FROM recovery_foundation.records ORDER BY kind,source_id')).rows,
        snapshots[index], 'Rejected input changed target');
    }
    context.diagnostic(JSON.stringify({ ...evidence, unresolvedOwner: unresolved.orphan[0],
      dirtyApplyBlockedOnBoth: true, credentialApplyBlockedOnBoth: true, rollbackVerifiedOnBoth: true }));
  } finally {
    const cleanup = await Promise.allSettled(fixtures.map(fixture => fixture.close()));
    const sourceCleanup = await Promise.allSettled(sources.map(source => source.close()));
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Owned fixture cleanup failed');
    assert.ok(sourceCleanup.every(result => result.status === 'fulfilled'), 'Owned source cleanup failed');
  }
});
