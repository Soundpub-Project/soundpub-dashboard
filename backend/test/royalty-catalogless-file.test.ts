import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const admin = (id: string): Principal => ({ id, roles: ['admin'], status: 'active' });

test('catalogless file preview creates one managed artist at commit and posts exact ledger amounts',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const ids = { uploader: randomUUID(), reviewer: randomUUID(), label: randomUUID(), session: randomUUID() };
    const csv = [
      'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
      '2026-11,IDA010000002,,First Song,New Managed Artist,Synthetic Label,Spotify,ID,stream,1,100.00',
      '2026-11,IDA010000003,,Second Song,New Managed Artist,Synthetic Label,Spotify,ID,stream,1,200.00',
    ].join('\n');
    const replacementCsv = csv.replace('100.00', '150.00').replace('200.00', '250.00');
    const checksum = createHash('sha256').update(csv).digest('hex');
    let opened = 0;
    const store: RoyaltyImportObjectStore = {
      bucket: 'synthetic-private', key: id => `royalty-imports/objects/${id}`,
      request: async (ownerId, input) => ({
        metadata: { id: ids.session, ownerId, mimeType: input.mime_type, size: input.size,
          checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
        url: `http://127.0.0.1:9100/synthetic-private/${ids.session}`,
        method: 'PUT', headers: { 'content-type': 'text/csv' },
      }),
      requestForId: async (ownerId, id, input) => ({
        metadata: { id, ownerId, mimeType: input.mime_type, size: input.size,
          checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
        url: `http://127.0.0.1:9100/synthetic-private/${id}`,
        method: 'PUT', headers: { 'content-type': 'text/csv' },
      }),
      verify: async () => undefined,
      open: async row => { opened++; return (async function *() {
        yield Buffer.from(row.id === ids.session ? csv : replacementCsv);
      })(); },
      download: async () => '', remove: async () => undefined, isReady: async () => true,
      close: () => undefined,
    };
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
        ($1,'active'),($2,'active'),($3,'active')`, [ids.uploader,ids.reviewer,ids.label]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic Label')`, [ids.label]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
        ($1,'admin',now()),($2,'admin',now()),($3,'label',now())`, [ids.uploader,ids.reviewer,ids.label]);
      const service = createRoyaltiesService(database.runtime, store);
      await service.requestFileUpload(admin(ids.uploader), { source: 'synthetic-catalogless', filename: 'new.csv',
        mime_type: 'text/csv', size: Buffer.byteLength(csv), checksum }, 'request');
      await service.completeFileUpload(admin(ids.uploader), ids.session, 'complete');
      assert.equal(await createRoyaltyImportJobProcessor(database.runtime, store, 'worker').poll(), 'processed');
      const preview = await service.fileSession(admin(ids.uploader), ids.session);
      assert.equal(preview.status, 'PREVIEW_READY', JSON.stringify(preview));
      assert.equal(preview.total_rows, 2);
      const staged = await service.fileSessionRows(admin(ids.uploader), ids.session);
      assert.equal(staged.total, 2);
      assert.ok(staged.items.every(row => row.row_status === 'MATCHED' && row.artist_id === null && row.track_id === null));
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 0);
      await service.approveFileSession(admin(ids.reviewer), ids.session, {
        expected_checksum: preview.preview_checksum, evidence: 'Synthetic catalogless identity reviewed',
      }, 'approval');
      await database.owner.query(`UPDATE soundpub.profiles SET full_name='Changed Label'
        WHERE id=$1`, [ids.label]);
      await assert.rejects(service.commitFileSession(admin(ids.uploader), ids.session, 'stale-label'),
        { code: 'ROYALTY_PREVIEW_STALE' });
      await database.owner.query(`UPDATE soundpub.profiles SET full_name='Synthetic Label'
        WHERE id=$1`, [ids.label]);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 0);
      await database.owner.query(`CREATE FUNCTION soundpub.reject_catalogless_outbox() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$;
        CREATE TRIGGER reject_catalogless_outbox BEFORE INSERT ON soundpub.outbox_events
        FOR EACH ROW EXECUTE FUNCTION soundpub.reject_catalogless_outbox()`);
      await assert.rejects(service.commitFileSession(admin(ids.uploader), ids.session, 'failed-commit'),
        /synthetic outbox failure/);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 0);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.royalty_import_batches
        WHERE source='synthetic-catalogless'`)).rows[0].count, 0);
      await database.owner.query(`DROP TRIGGER reject_catalogless_outbox ON soundpub.outbox_events;
        DROP FUNCTION soundpub.reject_catalogless_outbox()`);
      const committed = await service.commitFileSession(admin(ids.uploader), ids.session, 'commit');
      assert.equal(committed.replayed, false);
      assert.equal(opened, 1);
      const entries = (await database.owner.query(`SELECT artist_id,financial_owner_user_id,label_owner_user_id,
        source_title,source_artist,source_label,release_id,track_id FROM soundpub.royalty_import_entries
        WHERE batch_id=$1 ORDER BY source_row_number`, [committed.id])).rows;
      assert.equal(entries.length, 2);
      assert.equal(entries[0].artist_id, entries[1].artist_id);
      assert.equal(entries[0].financial_owner_user_id, entries[1].financial_owner_user_id);
      assert.equal(entries[0].label_owner_user_id, ids.label);
      assert.equal(entries[0].release_id, null);
      assert.equal(entries[0].track_id, null);
      assert.equal(entries[0].source_title, 'First Song');
      assert.equal(entries[1].source_title, 'Second Song');
      assert.equal(entries[0].source_artist, 'New Managed Artist');
      assert.equal(entries[0].source_label, 'Synthetic Label');
      const report = await service.report(admin(ids.uploader), { period: '2026-11', limit: 10 });
      assert.equal(report.total, 2);
      assert.equal(report.items[0].release_title, null);
      assert.equal(report.items[0].track_title, 'First Song');
      assert.equal(report.items[0].artist_name, 'New Managed Artist');
      assert.equal(report.items[0].label_name, 'Synthetic Label');
      const managed = entries[0].financial_owner_user_id;
      assert.deepEqual((await database.owner.query(`SELECT account_kind,status FROM soundpub.backend_users
        WHERE id=$1`, [managed])).rows[0], { account_kind: 'MANAGED_ARTIST', status: 'active' });
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.local_auth_credentials
        WHERE user_id=$1`, [managed])).rows[0].count, 0);
      assert.deepEqual((await database.owner.query(`SELECT component,owner_id,sum(amount)::text AS amount
        FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry
        ON entry.id=allocation.entry_id WHERE entry.batch_id=$1
        GROUP BY component,owner_id ORDER BY component`, [committed.id])).rows, [
        { component: 'ARTIST', owner_id: managed, amount: '210.00' },
        { component: 'LABEL', owner_id: ids.label, amount: '63.00' },
        { component: 'SOUNDPUB', owner_id: null, amount: '27.00' },
      ]);
      assert.deepEqual((await database.owner.query(`SELECT owner_id,kind,sum(amount_minor)::text AS amount
        FROM soundpub.finance_events WHERE business_reference=$1 GROUP BY owner_id,kind ORDER BY owner_id`,
      [`royalty:${committed.id}`])).rows.map(row => row.amount).sort(), ['21000','6300']);
      assert.deepEqual(await service.commitFileSession(admin(ids.uploader), ids.session, 'replay'),
        { id: committed.id, replayed: true });
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 1);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.finance_events
        WHERE business_reference=$1`, [`royalty:${committed.id}`])).rows[0].count, 2);
      const replacement = await service.requestReplacementFileUpload(admin(ids.uploader), committed.id, {
        filename: 'new.csv', mime_type: 'text/csv', size: Buffer.byteLength(replacementCsv),
        checksum: createHash('sha256').update(replacementCsv).digest('hex'), reason: 'Corrected synthetic revenue',
      }, 'catalogless-replacement', 'replacement-request');
      await service.completeFileUpload(admin(ids.uploader), replacement.session.id, 'replacement-complete');
      assert.equal(await createRoyaltyImportJobProcessor(database.runtime, store, 'replacement-worker').poll(), 'processed');
      const replacementPreview = await service.fileSession(admin(ids.uploader), replacement.session.id);
      assert.equal(replacementPreview.status, 'PREVIEW_READY', JSON.stringify(replacementPreview));
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 1);
      await service.approveFileSession(admin(ids.reviewer), replacement.session.id, {
        expected_checksum: replacementPreview.preview_checksum, evidence: 'Corrected amounts and ownership reviewed',
      }, 'replacement-approval');
      const replaced = await service.commitFileSession(admin(ids.uploader), replacement.session.id, 'replacement-commit');
      assert.equal(replaced.replaced_id, committed.id);
      assert.equal(opened, 2);
      assert.deepEqual(await service.commitFileSession(admin(ids.uploader), replacement.session.id, 'replacement-replay'),
        { id: replaced.id, replayed: true });
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 1);
      assert.deepEqual((await database.owner.query(`SELECT owner_id,sum(amount_minor)::text AS amount
        FROM soundpub.finance_events WHERE owner_id=ANY($1::uuid[])
          AND kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT')
        GROUP BY owner_id ORDER BY owner_id`, [[managed,ids.label]])).rows.map(row => row.amount).sort(),
      ['28000','8400']);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.royalty_import_corrections
        WHERE batch_id=$1`, [committed.id])).rows[0].count, 1);
    } finally { await database.close(); }
  });
