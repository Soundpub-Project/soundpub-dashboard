import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleasesService } from '../src/releases/index.js';
import { aggregateCreate, aggregatePatch } from '../src/releases/aggregate-contracts.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const label = '00000000-0000-4000-8000-000000000501';
const artist = '00000000-0000-4000-8000-000000000502';
const foreign = '00000000-0000-4000-8000-000000000503';
const actor = { id: label, roles: ['label'] as const, status: 'active' as const };
const track = (title: string) => ({ title, artist_name: 'Synthetic Artist' });
const input = { title: 'Synthetic Aggregate', artist_name: 'Synthetic Artist', release_type: 'album' as const,
  artist_user_id: artist, tracks: [track('One'), track('Two'), track('Three')] };
const conflict = (error: unknown) => (error as { statusCode?: number }).statusCode === 409;

test('aggregate strict inputs reject browser authority and partial track identities', () => {
  assert.equal(aggregateCreate.safeParse({ ...input, label_id: label }).success, false);
  assert.equal(aggregateCreate.safeParse({ ...input, tracks: [{ ...track('One'), position: 1 }] }).success, false);
  assert.equal(aggregatePatch.safeParse({ version: 1, tracks: [{ ...track('One'), id: foreign }] }).success, false);
  assert.equal(aggregatePatch.safeParse({ version: 1, tracks: [], status: 'pending' }).success, false);
});

test('synthetic PostgreSQL aggregate atomicity, diff, audit, stale authority and concurrent writes', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const service = createReleasesService(database.runtime);
  const counts = async () => (await database.owner.query(`SELECT
    (SELECT count(*)::int FROM soundpub.releases) AS releases,
    (SELECT count(*)::int FROM soundpub.tracks) AS tracks,
    (SELECT count(*)::int FROM soundpub.audit_logs) AS audits`)).rows[0];
  try {
    for (const [id, role] of [[label, 'label'], [artist, 'artist']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)',
        [id, role, id === artist ? label : null]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    }
    await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())',
      [label, artist, 'Synthetic Artist']);
    await database.owner.query(`CREATE FUNCTION soundpub.aggregate_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.title='FAIL' THEN RAISE EXCEPTION 'synthetic track failure'; END IF; RETURN NEW; END $$`);
    await database.owner.query(`CREATE TRIGGER aggregate_test_failure BEFORE INSERT OR UPDATE ON soundpub.tracks
      FOR EACH ROW EXECUTE FUNCTION soundpub.aggregate_test_failure()`);
    const before = await counts();
    await assert.rejects(service.createAggregate(actor, { ...input, tracks: [track('Inserted'), track('FAIL')] }, 'create-fail'),
      /synthetic track failure/);
    assert.deepEqual(await counts(), before);
    const created = await service.createAggregate(actor, input, 'create-ok');
    assert.equal(created.release.version, 1);
    assert.deepEqual(created.tracks.map(item => item.position), [1, 2, 3]);
    assert.equal(created.release.label_id, label);
    const [first, second, third] = created.tracks;
    const snapshot = { version: 1, title: 'Edited', tracks: [
      { ...track('One'), id: first!.id, version: first!.version },
      { ...track('Changed'), id: third!.id, version: third!.version }, track('New'),
    ] };
    const edited = await service.updateAggregate(actor, created.release.id, snapshot, 'edit-ok');
    assert.equal(edited.release.version, 2);
    assert.deepEqual(edited.tracks.map(item => item.title), ['One', 'Changed', 'New']);
    assert.equal(edited.tracks[0]!.version, first!.version);
    assert.equal(edited.tracks[1]!.version, third!.version + 1);
    const audit = (await database.owner.query('SELECT metadata FROM soundpub.audit_logs WHERE request_id=$1', ['edit-ok'])).rows[0].metadata;
    assert.deepEqual(audit.diff.UNCHANGED, [first!.id]);
    assert.deepEqual(audit.diff.REMOVE, [second!.id]);
    assert.deepEqual(audit.diff.UPDATE, [third!.id]);
    assert.equal(audit.diff.CREATE.length, 1);
    const savedCounts = await counts();
    await assert.rejects(service.updateAggregate(actor, created.release.id, { version: 2, title: 'Rollback', tracks: [track('FAIL')] }, 'edit-fail'),
      /synthetic track failure/);
    assert.deepEqual(await counts(), savedCounts);
    assert.equal((await service.get(actor, created.release.id)).title, 'Edited');
    for (const tracks of [[{ ...track('Foreign'), id: foreign, version: 1 }],
      [{ ...track('Stale'), id: first!.id, version: 99 }],
      [1, 2].map(() => ({ ...track('Duplicate'), id: first!.id, version: first!.version }))]) {
      await assert.rejects(service.updateAggregate(actor, created.release.id, { version: 2, tracks }, 'structure-fail'), conflict);
    }
    await assert.rejects(service.updateAggregate(actor, created.release.id, snapshot, 'stale'), conflict);
    const empty = await service.createAggregate(actor, { ...input, tracks: [] }, 'empty-draft');
    assert.equal(empty.tracks.length, 0);
    const noOp = await service.updateAggregate(actor, empty.release.id, { version: 1, tracks: [] }, 'no-op');
    assert.equal(noOp.release.version, 2);
    const metadataNoOp = await service.updateAggregate(actor, empty.release.id,
      { version: 2, title: empty.release.title, tracks: [] }, 'metadata-no-op');
    assert.equal(metadataNoOp.release.version, 3);
    await database.owner.query(`CREATE FUNCTION soundpub.aggregate_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.request_id='audit-fail' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await database.owner.query(`CREATE TRIGGER aggregate_audit_failure BEFORE INSERT ON soundpub.audit_logs
      FOR EACH ROW EXECUTE FUNCTION soundpub.aggregate_audit_failure()`);
    const beforeAudit = await counts();
    await assert.rejects(service.createAggregate(actor, input, 'audit-fail'), /synthetic audit failure/);
    await assert.rejects(service.updateAggregate(actor, created.release.id,
      { version: 2, title: 'Audit rollback', tracks: [track('Replacement')] }, 'audit-fail'), /synthetic audit failure/);
    assert.deepEqual(await counts(), beforeAudit);
    assert.equal((await service.get(actor, created.release.id)).title, 'Edited');
    assert.deepEqual((await database.owner.query('SELECT title FROM soundpub.tracks WHERE release_id=$1 ORDER BY position',
      [created.release.id])).rows.map(item => item.title), ['One', 'Changed', 'New']);
    const races = await Promise.allSettled(['Winner A', 'Winner B'].map(title => service.updateAggregate(actor,
      created.release.id, { version: 2, title, tracks: edited.tracks.map(item => ({ ...track(item.title), id: item.id, version: item.version })) }, title)));
    assert.equal(races.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(races.some(result => result.status === 'rejected' && conflict(result.reason)));
    await database.owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='artist' AND tenant_id IS NULL", [artist]);
    await assert.rejects(service.updateAggregate(actor, created.release.id, { version: 3, tracks: [] }, 'authority-fail'),
      error => (error as { statusCode?: number }).statusCode === 404);
  } finally { await database.close(); }
});
