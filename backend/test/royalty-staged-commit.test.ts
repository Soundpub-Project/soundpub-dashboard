import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const principal = (id: string): Principal => ({ id, status: 'active', roles: ['admin'] });

const rowCount = Number(process.env.ROYALTY_STAGED_ROWS ?? 1200);
const performanceOnly = rowCount > 10_000;

test(`private session commits ${rowCount} staged rows set-wise without rereading object bytes`, {
  skip: !dockerTestsEnabled, timeout: 900_000,
}, async () => {
  const database = await concurrencyPostgres();
  const ids = { admin: randomUUID(), otherAdmin: randomUUID(), label: randomUUID(), artistUser: randomUUID(), artist: randomUUID(),
    release: randomUUID(), track: randomUUID(), session: randomUUID() };
  const lines = Array.from({ length: rowCount }, () =>
    '2026-10,FRX762598330,1234567890123,Staged Track,Staged Artist,Staged Label,Spotify,ID,stream,1,1.00');
  const csv = ['period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue', ...lines].join('\n');
  const checksum = createHash('sha256').update(csv).digest('hex');
  const total = (minorPerRow: bigint) => {
    const value = BigInt(rowCount) * minorPerRow;
    return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
  };
  let openCalls = 0;
  const store: RoyaltyImportObjectStore = {
    bucket: 'synthetic-private', key: id => `royalty-imports/objects/${id}`,
    request: async (ownerId, input) => ({ metadata: { id: ids.session, ownerId, mimeType: input.mime_type,
      size: input.size, checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
    url: `http://127.0.0.1:9100/synthetic-private/royalty-imports/staging/${ids.session}`,
    method: 'PUT', headers: { 'content-type': 'text/csv' } }),
    requestForId: async () => { throw new Error('unused'); }, verify: async () => undefined,
    open: async () => { openCalls++; return (async function *() {
      const bytes = new TextEncoder().encode(csv);
      for (let offset = 0; offset < bytes.length; offset += 257) yield bytes.slice(offset, offset + 257);
    })(); },
    download: async () => '', remove: async () => undefined, isReady: async () => true, close: () => undefined,
  };
  try {
    await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
      ($1,'active'),($2,'active'),($3,'active'),($4,'active')`, [ids.admin,ids.otherAdmin,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES
      ($1,'Staged Label',NULL),($2,'Staged Artist',$1)`, [ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'admin',now()),($3,'label',now()),($4,'artist',now())`,
    [ids.admin,ids.otherAdmin,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name)
      VALUES($1,$2,$3,'Staged Artist')`, [ids.artist,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.releases
      (id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status)
      VALUES($1,$2,$3,$2,$4,'Staged Release','Staged Artist','1234567890123','draft')`,
    [ids.release,ids.label,ids.artistUser,ids.artist]);
    await database.owner.query(`INSERT INTO soundpub.tracks
      (id,release_id,artist_id,artist_user_id,title,artist_name,isrc,position)
      VALUES($1,$2,$3,$4,'Staged Track','Staged Artist','FRX762598330',1)`,
    [ids.track,ids.release,ids.artist,ids.artistUser]);
    const service = createRoyaltiesService(database.runtime, store);
    const requested = await service.requestFileUpload(principal(ids.admin), { source: 'provider', filename: 'large.csv',
      mime_type: 'text/csv', size: Buffer.byteLength(csv), checksum }, 'request');
    assert.equal(requested.session.id, ids.session);
    await service.completeFileUpload(principal(ids.admin), ids.session, 'complete');
    const outcome = await createRoyaltyImportJobProcessor(database.runtime, store, 'worker').poll();
    const jobState = (await database.owner.query('SELECT status,error_code FROM soundpub.royalty_import_sessions WHERE id=$1', [ids.session])).rows[0];
    assert.equal(outcome, 'processed', JSON.stringify(jobState));
    const preview = await service.fileSession(principal(ids.admin), ids.session);
    assert.equal(preview.total_rows, rowCount);
    assert.equal(preview.processed_rows, rowCount);
    if (!performanceOnly) {
      await assert.rejects(service.commitFileSession(principal(ids.otherAdmin), ids.session, 'foreign'), { code: 'NOT_FOUND' });
      assert.equal((await database.owner.query('SELECT error_code FROM soundpub.royalty_import_sessions WHERE id=$1', [ids.session])).rows[0].error_code, null);
      await assert.rejects(database.runtime.query('DELETE FROM soundpub.royalty_import_session_rows WHERE session_id=$1', [ids.session]),
        /ROYALTY_STAGING_FROZEN/);
      await database.owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [ids.artistUser]);
      await assert.rejects(service.commitFileSession(principal(ids.admin), ids.session, 'stale-owner'), { code: 'ROYALTY_PREVIEW_STALE' });
      assert.deepEqual((await database.owner.query('SELECT status,error_code FROM soundpub.royalty_import_sessions WHERE id=$1', [ids.session])).rows[0],
        { status: 'PREVIEW_READY', error_code: 'ROYALTY_PREVIEW_STALE' });
      await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [ids.artistUser]);
      await database.owner.query(`CREATE FUNCTION soundpub.reject_staged_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic staged outbox failure'; END $$;
        CREATE TRIGGER reject_staged_outbox BEFORE INSERT ON soundpub.outbox_events
        FOR EACH ROW EXECUTE FUNCTION soundpub.reject_staged_outbox()`);
      await assert.rejects(service.commitFileSession(principal(ids.admin), ids.session, 'failed-commit'),
        /synthetic staged outbox failure/);
      assert.deepEqual((await database.owner.query(`SELECT
        (SELECT count(*)::int FROM soundpub.royalty_import_batches WHERE source='provider') AS batches,
        (SELECT count(*)::int FROM soundpub.royalty_import_entries entry JOIN soundpub.royalty_import_batches batch ON batch.id=entry.batch_id WHERE batch.source='provider') AS entries,
        (SELECT count(*)::int FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id JOIN soundpub.royalty_import_batches batch ON batch.id=entry.batch_id WHERE batch.source='provider') AS allocations,
        (SELECT count(*)::int FROM soundpub.audit_logs WHERE action='royalty.csv_imported') AS audits,
        (SELECT count(*)::int FROM soundpub.outbox_events WHERE topic='royalty.changed') AS outbox`)).rows[0],
      { batches: 0, entries: 0, allocations: 0, audits: 0, outbox: 0 });
      assert.deepEqual((await database.owner.query('SELECT status,error_code FROM soundpub.royalty_import_sessions WHERE id=$1', [ids.session])).rows[0],
        { status: 'PREVIEW_READY', error_code: 'ROYALTY_COMMIT_RETRY' });
      await database.owner.query(`DROP TRIGGER reject_staged_outbox ON soundpub.outbox_events;
        DROP FUNCTION soundpub.reject_staged_outbox()`);
    }
    const committed = await service.commitFileSession(principal(ids.admin), ids.session, 'commit');
    assert.equal(committed.replayed, false);
    assert.equal(openCalls, 1);
    assert.equal((await database.owner.query('SELECT row_count FROM soundpub.royalty_import_batches WHERE id=$1', [committed.id])).rows[0].row_count, rowCount);
    assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.royalty_import_entries WHERE batch_id=$1', [committed.id])).rows[0].count, rowCount);
    assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.royalty_import_allocations allocation
      JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id WHERE entry.batch_id=$1`, [committed.id])).rows[0].count, rowCount * 3);
    assert.deepEqual((await database.owner.query(`SELECT component,owner_id,sum(amount)::text AS amount
      FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
      WHERE entry.batch_id=$1 GROUP BY component,owner_id ORDER BY component`, [committed.id])).rows, [
      { component: 'ARTIST', owner_id: ids.artistUser, amount: total(70n) },
      { component: 'LABEL', owner_id: ids.label, amount: total(21n) },
      { component: 'SOUNDPUB', owner_id: null, amount: total(9n) },
    ]);
    assert.equal((await database.owner.query('SELECT status,batch_id FROM soundpub.royalty_import_sessions WHERE id=$1', [ids.session])).rows[0].status, 'COMMITTED');
    assert.deepEqual(await service.commitFileSession(principal(ids.admin), ids.session, 'replay'), { id: committed.id, replayed: true });
  } finally { await database.close(); }
});
