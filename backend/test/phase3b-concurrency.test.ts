import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { ApiError } from '../src/api/types.js';
import type { Principal } from '../src/auth/index.js';
import { labelsInTransaction } from '../src/labels/index.js';
import { usersRepository } from '../src/users/repository.js';
import { concurrencyPostgres, waitForBlock } from './support/concurrency-postgres.js';

test('Phase 3B deterministic concurrency on isolated PostgreSQL', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000 }, async suite => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  suite.after(() => database.close());
  const ids = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  const [adminId, artistId, labelA, labelB, labelC] = ids as [string, string, string, string, string];
  const admin: Principal = { id: adminId, roles: ['admin'], status: 'active' };
  const labelActor: Principal = { id: labelA, roles: ['label'], status: 'active' };
  const transfer = (db: PoolClient, destination = labelB, requestId = 'winner') =>
    labelsInTransaction(db).transfer(admin, artistId, { labelId: destination,
      expectedParentLabelId: labelA, confirmationPhrase: 'PINDAH LABEL' }, requestId);
  const remove = (db: PoolClient, requestId = 'winner', actor = admin) =>
    labelsInTransaction(db).remove(actor, artistId, { expectedParentLabelId: labelA }, requestId);
  const assign = (db: PoolClient, requestId: string) => labelsInTransaction(db).assign(admin, artistId,
    { labelId: labelA, expectedParentLabelId: null }, requestId);

  async function fixture(independent = false) {
    await owner.query(`DELETE FROM soundpub.audit_logs; DELETE FROM soundpub.artists;
        DELETE FROM soundpub.artist_profiles; DELETE FROM soundpub.user_roles; DELETE FROM soundpub.profiles;
        DELETE FROM soundpub.backend_users`);
    for (const [index, id] of ids.entries()) {
      await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [id, `Synthetic concurrency ${index}`]);
      await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())',
        [id, index === 0 ? 'admin' : index === 1 ? 'artist' : 'label']);
    }
    await owner.query('INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,$2)', [artistId, 'Synthetic artist']);
    if (!independent) {
      await owner.query('UPDATE soundpub.profiles SET parent_label_id=$2 WHERE id=$1', [artistId, labelA]);
      await owner.query('INSERT INTO soundpub.artists(artist_user_id,label_id,name) VALUES ($1,$2,$3)', [artistId, labelA, 'Synthetic artist']);
    }
  }

  async function state(parent: string | null, requests: string[]) {
    const profile = await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artistId]);
    assert.equal(profile.rows[0].parent_label_id, parent);
    const roster = await owner.query('SELECT label_id FROM soundpub.artists WHERE artist_user_id=$1', [artistId]);
    assert.deepEqual(roster.rows, parent ? [{ label_id: parent }] : []);
    const audits = await owner.query('SELECT request_id, metadata FROM soundpub.audit_logs ORDER BY request_id');
    assert.deepEqual(audits.rows.map(row => row.request_id), requests.sort());
    for (const audit of audits.rows) assert.ok(Object.hasOwn(audit.metadata, 'parentLabelId'));
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.artist_profiles WHERE user_id=$1', [artistId])).rows[0].count, 1);
  }

  async function race(first: (db: PoolClient) => Promise<unknown>, second: (db: PoolClient) => Promise<unknown>,
    expected: { statusCode?: number; code?: string } | null, firstOwner = false, secondOwner = false, commitWinner = true) {
    const winner = await (firstOwner ? owner : runtime).connect();
    const loser = await (secondOwner ? owner : runtime).connect();
    let pending: Promise<{ error?: unknown }> | undefined;
    try {
      await winner.query('BEGIN');
      await loser.query('BEGIN');
      const winnerPid = (await winner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const loserPid = (await loser.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await first(winner);
      pending = second(loser).then(() => ({}), error => ({ error }));
      await waitForBlock(owner, loserPid, winnerPid);
      await winner.query(commitWinner ? 'COMMIT' : 'ROLLBACK');
      const result = await pending;
      if (expected) {
        assert.ok(result.error, 'Competing mutation must reject');
        if (expected.statusCode) assert.ok(result.error instanceof ApiError);
        for (const [key, value] of Object.entries(expected)) assert.equal((result.error as Record<string, unknown>)[key], value);
        await loser.query('ROLLBACK');
      } else {
        assert.equal(result.error, undefined);
        await loser.query('COMMIT');
      }
    } finally {
      await winner.query('ROLLBACK');
      if (pending) await pending;
      await loser.query('ROLLBACK');
      winner.release();
      loser.release();
    }
  }

    await suite.test('transfer vs transfer: blocked loser gets 409; one stable membership and success audit', async () => {
      await fixture();
      const original = (await owner.query('SELECT id FROM soundpub.artists')).rows[0].id;
      await race(db => transfer(db), db => transfer(db, labelC, 'loser'), { statusCode: 409, code: 'CONFLICT' });
      await state(labelB, ['winner']);
      assert.equal((await owner.query('SELECT id FROM soundpub.artists')).rows[0].id, original);
      const audit = (await owner.query('SELECT metadata FROM soundpub.audit_logs')).rows[0].metadata;
      assert.equal(audit.previousParentLabelId, labelA);
      assert.equal(audit.parentLabelId, labelB);
    });
    await suite.test('aborted transfer releases locks: competitor succeeds without phantom success audit', async () => {
      await fixture();
      await race(db => transfer(db), db => transfer(db, labelC, 'second'), null, false, false, false);
      await state(labelC, ['second']);
    });
    await suite.test('transfer vs detach: stale detach gets 409', async () => {
      await fixture();
      await race(db => transfer(db), db => remove(db, 'loser'), { statusCode: 409, code: 'CONFLICT' });
      await state(labelB, ['winner']);
    });
    await suite.test('detach vs transfer: stale transfer gets 409', async () => {
      await fixture();
      await race(db => remove(db), db => transfer(db, labelB, 'loser'), { statusCode: 409, code: 'CONFLICT' });
      await state(null, ['winner']);
    });
    await suite.test('transfer vs physical delete: PostgreSQL FK rejects unsafe delete', async () => {
      await fixture();
      await race(db => transfer(db), db => db.query('DELETE FROM soundpub.backend_users WHERE id=$1', [artistId]),
        { code: '23503' }, false, true);
      await state(labelB, ['winner']);
    });
    await suite.test('transfer vs membership removal by old label: stale owner loses authority', async () => {
      await fixture();
      await race(db => transfer(db), db => remove(db, 'loser', labelActor), { statusCode: 403, code: 'FORBIDDEN' });
      await state(labelB, ['winner']);
    });
    await suite.test('actor role removal vs transfer: advisory trigger blocks stale admin authority', async () => {
      await fixture();
      await race(db => db.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='admin'", [adminId]),
        db => transfer(db, labelB, 'loser'), { statusCode: 403, code: 'FORBIDDEN' }, true);
      await state(labelA, []);
    });
    await suite.test('transfer vs actor role removal: role DELETE waits until authorized transfer commits', async () => {
      await fixture();
      await race(db => transfer(db), db => db.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='admin'", [adminId]),
        null, false, true);
      await state(labelB, ['winner']);
      assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.user_roles WHERE user_id=$1', [adminId])).rows[0].count, 0);
    });
    await suite.test('destination role removal vs transfer: stale destination rejected with 400', async () => {
      await fixture();
      await race(db => db.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label'", [labelB]),
        db => transfer(db, labelB, 'loser'), { statusCode: 400, code: 'BAD_REQUEST' }, true);
      await state(labelA, []);
    });
    await suite.test('membership add vs remove: valid competing removal serializes after add', async () => {
      await fixture(true);
      await race(db => assign(db, 'winner'), db => remove(db, 'second'), null);
      await state(null, ['winner', 'second']);
    });
    await suite.test('label role removal vs roster mutation: cached label principal cannot detach', async () => {
      await fixture();
      await race(db => db.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='label'", [labelA]),
        db => remove(db, 'loser', labelActor), { statusCode: 403, code: 'FORBIDDEN' }, true);
      await state(labelA, []);
    });
    await suite.test('transfer vs deactivation: status mutation waits; current relation stays consistent', async () => {
      await fixture();
      await race(db => transfer(db), async db => {
        await usersRepository(db).lock([artistId], true);
        await usersRepository(db).setStatus(artistId, 'inactive');
      }, null);
      await state(labelB, ['winner']);
      assert.equal((await owner.query('SELECT status FROM soundpub.backend_users WHERE id=$1', [artistId])).rows[0].status, 'inactive');
    });
});
