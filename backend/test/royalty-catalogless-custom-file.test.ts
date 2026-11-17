import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { databasePayoutPolicy } from '../src/payouts/policy.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const principal = (id: string): Principal => ({ id, status: 'active', roles: ['admin'] });

test('catalogless Label Custom file import holds owner at PIC and rejects archived unit',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const ids = { uploader: randomUUID(), reviewer: randomUUID(), pic: randomUUID(), unit: randomUUID(),
      artist: randomUUID(), session: randomUUID() };
    const csv = `period,isrc,upc,title,artist,label_name,platform,country,sales_unit,net_revenue
2026-11,IDA010000006,,Uncatalogued Song,Unit Artist,Custom PIC,Spotify,ID,10,100.00`;
    const checksum = createHash('sha256').update(csv).digest('hex');
    const store: RoyaltyImportObjectStore = {
      bucket: 'synthetic-private', key: id => `royalty-imports/objects/${id}`,
      request: async (ownerId, input) => ({
        metadata: { id: ids.session, ownerId, mimeType: input.mime_type, size: input.size,
          checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
        url: `http://127.0.0.1:9100/synthetic-private/${ids.session}`,
        method: 'PUT', headers: { 'content-type': 'text/csv' },
      }),
      requestForId: async () => { throw new Error('unused'); },
      verify: async () => undefined,
      open: async () => (async function *() { yield Buffer.from(csv); })(),
      download: async () => '', remove: async () => undefined, isReady: async () => true,
      close: () => undefined,
    };
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
        ($1,'active'),($2,'active'),($3,'active')`, [ids.uploader,ids.reviewer,ids.pic]);
      await database.owner.query(`UPDATE soundpub.backend_users SET email_verified_at=now() WHERE id=$1`, [ids.pic]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Custom PIC')`, [ids.pic]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
        ($1,'admin',now()),($2,'admin',now()),($3,'label_custom',now())`,
      [ids.uploader,ids.reviewer,ids.pic]);
      await database.owner.query(`INSERT INTO soundpub.label_custom_units(id,owner_user_id,unit_code,name)
        VALUES($1,$2,'file-custom-unit','Custom Unit')`, [ids.unit,ids.pic]);
      await database.owner.query(`INSERT INTO soundpub.artists
        (id,label_id,label_custom_unit_id,management_mode,name,contact_email,contact_phone,verified_at)
        VALUES($1,$2,$3,'LABEL_CUSTOM_MANAGED','Unit Artist','unit@example.test','+628120000000',now())`,
      [ids.artist,ids.pic,ids.unit]);
      await database.owner.query(`INSERT INTO soundpub.artist_profiles(artist_id,artist_name)
        VALUES($1,'Unit Artist')`, [ids.artist]);
      const service = createRoyaltiesService(database.runtime, store, database.reconciler);
      const settings = createAuditSettingsService(database.runtime);
      const initial = await settings.adminSettings(principal(ids.uploader));
      await settings.updateAdminSettings(principal(ids.uploader), {
        version: initial.version, settings: { min_payout_amount: '50.00' },
      }, 'custom-file-minimum');
      const payouts = createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy));
      const pic: Principal = { id: ids.pic, status: 'active', roles: ['label_custom'] };
      await service.requestFileUpload(principal(ids.uploader), { source: 'custom-file', filename: 'pic.csv',
        mime_type: 'text/csv', size: Buffer.byteLength(csv), checksum }, 'request');
      await service.completeFileUpload(principal(ids.uploader), ids.session, 'complete');
      assert.equal(await createRoyaltyImportJobProcessor(database.runtime, store, 'custom-worker').poll(), 'processed');
      const preview = await service.fileSession(principal(ids.uploader), ids.session);
      assert.equal(preview.status, 'PREVIEW_READY', JSON.stringify(preview));
      const rows = await service.fileSessionRows(principal(ids.uploader), ids.session);
      assert.equal(rows.items[0].artist_id, ids.artist);
      assert.equal(rows.items[0].financial_owner_user_id, ids.pic);
      assert.equal(rows.items[0].label_owner_user_id, ids.pic);
      await service.approveFileSession(principal(ids.reviewer), ids.session,
        { expected_checksum: preview.preview_checksum, evidence: 'Custom roster and PIC owner reviewed' }, 'approve');
      await database.owner.query("UPDATE soundpub.label_custom_units SET status='archived' WHERE id=$1", [ids.unit]);
      await assert.rejects(service.commitFileSession(principal(ids.uploader), ids.session, 'archived-unit'),
        { code: 'ROYALTY_PREVIEW_STALE' });
      await database.owner.query("UPDATE soundpub.label_custom_units SET status='active' WHERE id=$1", [ids.unit]);
      const committed = await service.commitFileSession(principal(ids.uploader), ids.session, 'commit');
      assert.equal(committed.replayed, false);
      assert.deepEqual((await database.owner.query(`SELECT artist_id,financial_owner_user_id,label_owner_user_id,
        release_id,track_id FROM soundpub.royalty_import_entries WHERE batch_id=$1`, [committed.id])).rows[0],
      { artist_id: ids.artist, financial_owner_user_id: ids.pic, label_owner_user_id: ids.pic,
        release_id: null, track_id: null });
      assert.deepEqual((await database.owner.query(`SELECT component,owner_id,amount::text
        FROM soundpub.royalty_import_allocations allocation JOIN soundpub.royalty_import_entries entry
        ON entry.id=allocation.entry_id WHERE entry.batch_id=$1 ORDER BY component`, [committed.id])).rows,
      [{ component: 'ARTIST', owner_id: ids.pic, amount: '70.00' },
        { component: 'LABEL', owner_id: ids.pic, amount: '21.00' },
        { component: 'SOUNDPUB', owner_id: null, amount: '9.00' }]);
      assert.deepEqual((await database.owner.query(`SELECT owner_id,amount_minor::text FROM soundpub.finance_events
        WHERE business_reference=$1`, [`royalty:${committed.id}`])).rows,
      [{ owner_id: ids.pic, amount_minor: '9100' }]);
      assert.equal((await service.report(pic)).items[0].owner_revenue, '91.00');
      const closed = await payouts.eligibility(pic);
      assert.equal(closed.eligible, false);
      assert.ok(closed.reasons.includes('RECONCILIATION_REQUIRED'));
      const destination = (await payouts.updateDestination(pic, { bank_name: 'Synthetic Bank',
        account_number: '12345678', account_holder_name: 'Custom PIC' })).destination;
      await payouts.reviewReadiness(principal(ids.uploader), ids.pic, {
        action: 'verify_destination', destination_id: destination.id, evidence: 'Verified synthetic account',
      }, 'verify-destination');
      const reconciliation = await service.reconciliation(principal(ids.reviewer), committed.id);
      assert.equal(reconciliation.matched, true);
      await service.reconcile(principal(ids.reviewer), committed.id, {
        expected_checksum: reconciliation.snapshot.batch.checksum, evidence: 'Verified synthetic PIC allocations',
      }, 'reconcile-catalogless');
      await payouts.reviewReadiness(principal(ids.uploader), ids.pic, {
        action: 'approve_reconciliation', evidence: 'Verified synthetic PIC ledger',
      }, 'approve-catalogless');
      assert.deepEqual(await payouts.eligibility(pic), { eligible: true, reasons: [],
        available: '91.00', minimum: '50.00', currency: 'IDR' });
      const payout = await payouts.request(pic, { bank_name: 'Synthetic Bank',
        account_number: '12345678', account_holder_name: 'Custom PIC',
        amount: '60.00', currency: 'IDR' }, 'catalogless-pic-payout');
      assert.equal(payout.user_id, ids.pic);
      assert.deepEqual((await database.owner.query(`SELECT owner_id,amount::text FROM soundpub.payout_allocations
        WHERE payout_id=$1`, [payout.id])).rows, [{ owner_id: ids.pic, amount: '60.00' }]);
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.backend_users
        WHERE account_kind='MANAGED_ARTIST'`)).rows[0].count, 0);
    } finally { await database.close(); }
  });
