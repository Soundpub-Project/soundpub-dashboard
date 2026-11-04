import assert from 'node:assert/strict';
import { dockerTestsEnabled, testComposeResource, testComposeCommand } from './support/concurrency-postgres.js';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPool, migrate } from '../src/db/index.js';
import { repairOrphans, validateOrphanTarget } from '../src/artists/orphan-repair.js';

test('orphan target guard rejects shared, production and overridden connections', () => {
  for (const value of ['postgres://u:p@20.20.20.3/soundpub_test_orphan_x',
    'postgres://u:p@20.20.20.173/soundpub_test_orphan_x', 'postgres://u:p@localhost/soundpub_test_orphan_x',
    'postgres://u:p@127.0.0.1/soundpub_dev', 'postgres://u:p@127.0.0.1/soundpub_test_artists',
    'postgres://u:p@127.0.0.1/soundpub_test_orphan_x?host=20.20.20.3']) {
    assert.throws(() => validateOrphanTarget(value), /ISOLATED_SYNTHETIC_TARGET_REQUIRED/);
  }
});

test('owned fresh PostgreSQL: scan, dry run, repair, ambiguity, atomic audit, idempotency and rollback', { skip: !dockerTestsEnabled }, async context => {
  const suffix = randomUUID().replaceAll('-', '');

  const database = `soundpub_test_orphan_${suffix}`;
  const password = randomUUID();
  const resource = testComposeResource('test-postgres', { POSTGRES_PASSWORD: password, POSTGRES_DB: database });
  let owner: ReturnType<typeof createPool> | undefined;
  try {
    const port = resource.start().split(':')[1]!;
    const databaseUrl = `postgres://postgres:${password}@127.0.0.1:${port}/${database}`;
    owner = createPool({ connectionString: databaseUrl });
    for (let attempt = 0; ; attempt++) {
      try { await owner.query('SELECT 1'); break; }
      catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    await owner.query('CREATE ROLE soundpub_app');
    await owner.query('CREATE ROLE soundpub_owner');
    await migrate(owner);
    await assert.rejects(repairOrphans({ databaseUrl }), /DISPOSABLE_MARKER_REQUIRED/);
    await owner.query(`COMMENT ON DATABASE ${database} IS 'soundpub synthetic orphan repair'`);
    const artist = randomUUID();
    const label = randomUUID();
    const base = { databaseUrl, actor: 'synthetic-migration-test', reason: 'repair synthetic fixture' };
    const seed = async () => {
      await owner!.query(`DELETE FROM soundpub.audit_logs; DELETE FROM soundpub.artists;
        DELETE FROM soundpub.artist_profiles; DELETE FROM soundpub.user_roles; DELETE FROM soundpub.profiles;
        DELETE FROM soundpub.backend_users`);
      await owner!.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active'),($2,'active')", [artist, label]);
      await owner!.query('INSERT INTO soundpub.profiles(id,parent_label_id) VALUES ($1,$2),($2,NULL)', [artist, label]);
      await owner!.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now()),($2,'label',now())", [artist, label]);
      await owner!.query("INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,'Synthetic Artist')", [artist]);
    };
    await context.test('clean dataset', async () => {
      assert.deepEqual((await repairOrphans(base)).issues, []);
    });
    await context.test('dry run has no writes; explicit apply requires actor and reason', async () => {
      await seed();
      const result = await repairOrphans(base);
      assert.equal(result.mode, 'dry-run');
      assert.deepEqual(result.issues.map(issue => issue.type), ['MISSING_CURRENT_MEMBERSHIP']);
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.artists')).rows[0].n, 0);
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.audit_logs')).rows[0].n, 0);
      await assert.rejects(repairOrphans({ databaseUrl, apply: true }), /ACTOR_AND_REASON_REQUIRED/);
    });
    let batch: string;
    await context.test('deterministic repair and repeat are idempotent; audit contains before/after and process actor', async () => {
      const result = await repairOrphans({ ...base, apply: true });
      batch = result.batch;
      assert.equal('applied' in result && result.applied, 1);
      const audit = (await owner!.query('SELECT * FROM soundpub.audit_logs')).rows[0];
      assert.equal(audit.metadata.processActor, base.actor);
      assert.equal(audit.metadata.reason, base.reason);
      assert.equal(audit.metadata.oldState, null);
      assert.equal(audit.metadata.newState.artist_user_id, artist);
      assert.ok(audit.created_at);
      assert.deepEqual((await repairOrphans({ ...base, apply: true })).issues, []);
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.audit_logs')).rows[0].n, 1);
    });
    await context.test('guarded rollback dry run, conflict, success and repeat', async () => {
      await repairOrphans({ ...base, rollbackBatch: batch! });
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.artists')).rows[0].n, 1);
      await owner!.query("UPDATE soundpub.artists SET name='Changed'");
      await assert.rejects(repairOrphans({ ...base, apply: true, rollbackBatch: batch! }), /ROLLBACK_CONFLICT/);
      await owner!.query("UPDATE soundpub.artists SET name='Synthetic Artist'");
      assert.equal((await repairOrphans({ ...base, apply: true, rollbackBatch: batch! })).rolledBack, 1);
      assert.equal((await repairOrphans({ ...base, apply: true, rollbackBatch: batch! })).rolledBack, 0);
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.artists')).rows[0].n, 0);
    });
    await context.test('audit insertion failure rolls back membership', async () => {
      await owner!.query("ALTER TABLE soundpub.audit_logs ADD CONSTRAINT synthetic_audit_failure CHECK (action <> 'orphan.membership_restored') NOT VALID");
      try {
        await assert.rejects(repairOrphans({ ...base, apply: true }), /synthetic_audit_failure/);
        assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.artists')).rows[0].n, 0);
      } finally { await owner!.query('ALTER TABLE soundpub.audit_logs DROP CONSTRAINT synthetic_audit_failure'); }
    });
    await context.test('multiple orphan types and conflicting owners reject whole apply', async () => {
      await seed();
      await owner!.query('ALTER TABLE soundpub.artists DROP CONSTRAINT artists_artist_user_id_key');
      await owner!.query("SET session_replication_role='replica'");
      try {
        const missing = randomUUID();
        await owner!.query("INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,'No owner')", [missing]);
        await owner!.query(`INSERT INTO soundpub.artists(artist_user_id,label_id,name) VALUES
          ($1,$2,'Missing'),($1,$2,'Duplicate')`, [missing, randomUUID()]);
        await owner!.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [randomUUID(), label]);
      } finally { await owner!.query("SET session_replication_role='origin'"); }
      const result = await repairOrphans({ ...base, apply: true });
      assert.ok('status' in result && 'applied' in result);
      assert.equal(result.status, 'AMBIGUOUS_REPAIR');
      assert.equal(result.applied, 0);
      assert.equal(result.repairs.length, 1);
      for (const type of ['MISSING_ARTIST_OWNER', 'MISSING_LABEL', 'MEMBERSHIP_MISSING_USER',
        'RELATION_MISSING_ARTIST', 'INVALID_CURRENT_PARENT', 'CONFLICTING_CURRENT_OWNERSHIP']) {
        assert.ok(result.issues.some(issue => issue.type === type), type);
      }
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.audit_logs')).rows[0].n, 0);
      assert.equal((await owner!.query('SELECT count(*)::int AS n FROM soundpub.artists WHERE artist_user_id=$1', [artist])).rows[0].n, 0);
    });
  } finally {
    try { await owner?.end(); } finally { resource.close(); }
  }
});

test('Compose command construction stays scoped without Docker', () => {
  const id = '00000000-0000-4000-8000-000000000000';
  for (const service of ['test-postgres', 'test-rustfs'] as const) {
    for (const action of ['up', 'port', 'rm'] as const) {
      const args = testComposeCommand(service, id, action);
      assert.deepEqual(args.slice(0, 3), ['compose', '-p', 'dashboard-sounpub-dev']);
      assert.match(args[6]!, /backend[\\/]docker-compose\.test\.yml$/);
      assert.deepEqual(args.slice(7, 9), ['-f', '-']);
      assert.ok(args.includes(`${service}-${id}`));
      assert.ok(!args.some(value => ['down', '--remove-orphans', 'prune', 'run'].includes(value)));
    }
  }
  assert.throws(() => testComposeCommand('test-postgres', '../dev', 'rm'));
  if (!dockerTestsEnabled) assert.throws(() => testComposeResource('test-postgres'), /RUN_DOCKER_TESTS=1/);
});

test('Compose fixture cleanup handles failed startup without Docker', () => {
  const previous = process.env.RUN_DOCKER_TESTS;
  process.env.RUN_DOCKER_TESTS = '1';
  try {
    const calls: string[][] = [];
    const resource = testComposeResource('test-postgres', {}, (args, input) => {
      calls.push(args);
      assert.equal(Object.keys(JSON.parse(input).services).length, 1);
      if (args.includes('up')) throw new Error('synthetic startup failure');
      return '';
    });
    assert.throws(() => resource.start(), /synthetic startup failure/);
    resource.close();
    assert.equal(calls.length, 2);
    assert.ok(calls[1]!.includes('rm'));
    assert.equal(calls[0]!.at(-1), calls[1]!.at(-1));
  } finally {
    if (previous === undefined) delete process.env.RUN_DOCKER_TESTS;
    else process.env.RUN_DOCKER_TESTS = previous;
  }
});
