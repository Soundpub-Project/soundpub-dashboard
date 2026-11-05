import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const principal = (id: string): Principal => ({ id, status: 'active', roles: ['admin'] });

test('private replacement file session is idempotent, requester-bound and commits provenance atomically', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const ids = { admin: randomUUID(), otherAdmin: randomUUID(), label: randomUUID(), artistUser: randomUUID(),
    artist: randomUUID(), release: randomUUID(), track: randomUUID() };
  const replacementCsv = [
    'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
    '2026-10,FRX762598330,1234567890123,Replacement Track,Replacement Artist,Replacement Label,Spotify,ID,stream,10,150.00',
  ].join('\n');
  let requestedId = '';
  const store: RoyaltyImportObjectStore = {
    bucket: 'synthetic-private',
    key: id => `royalty-imports/objects/${id}`,
    request: async () => { throw new Error('not used'); },
    requestForId: async (ownerId, id, input) => {
      requestedId = id;
      return { metadata: { id, ownerId, mimeType: input.mime_type, size: input.size, checksum: input.checksum,
        visibility: 'private', createdAt: new Date().toISOString() },
      url: `http://127.0.0.1:9100/synthetic-private/royalty-imports/staging/${id}`,
      method: 'PUT', headers: { 'content-type': 'text/csv' } };
    },
    verify: async row => { assert.equal(row.id, requestedId); },
    open: async row => { assert.equal(row.id, requestedId); return (async function *() { yield replacementCsv; })(); },
    download: async row => `http://127.0.0.1:9100/download/${row.id}`,
    remove: async () => undefined,
    isReady: async () => true,
    close: () => undefined,
  };
  try {
    await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES
      ($1,'active'),($2,'active'),($3,'active'),($4,'active')`,
    [ids.admin,ids.otherAdmin,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES
      ($1,'Replacement Label',NULL),($2,'Replacement Artist',$1)`, [ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'admin',now()),($2,'admin',now()),($3,'label',now()),($4,'artist',now())`,
    [ids.admin,ids.otherAdmin,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name)
      VALUES($1,$2,$3,'Replacement Artist')`, [ids.artist,ids.label,ids.artistUser]);
    await database.owner.query(`INSERT INTO soundpub.releases
      (id,label_id,artist_user_id,created_by,artist_id,title,artist_name,upc,status)
      VALUES($1,$2,$3,$2,$4,'Replacement Release','Replacement Artist','1234567890123','draft')`,
    [ids.release,ids.label,ids.artistUser,ids.artist]);
    await database.owner.query(`INSERT INTO soundpub.tracks
      (id,release_id,artist_user_id,artist_id,title,artist_name,isrc,position)
      VALUES($1,$2,$3,$4,'Replacement Track','Replacement Artist','FRX762598330',1)`,
    [ids.track,ids.release,ids.artistUser,ids.artist]);

    const service = createRoyaltiesService(database.runtime, store);
    const originalCsv = replacementCsv.replace('150.00', '100.00');
    const originalPreview = await service.previewCsv(principal(ids.admin), { csv: originalCsv });
    const original = await service.commitCsv(principal(ids.admin), { csv: originalCsv, source: 'replacement-session',
      filename: 'original.csv', expected_checksum: originalPreview.checksum! }, 'original');
    const checksum = createHash('sha256').update(replacementCsv).digest('hex');
    const body = { filename: 'replacement.csv', mime_type: 'text/csv' as const,
      size: Buffer.byteLength(replacementCsv), checksum, reason: 'corrected provider statement' };
    const requested = await service.requestReplacementFileUpload(principal(ids.admin), original.id, body,
      'replacement-session-key', 'request');
    assert.equal(requested.session.operation_kind, 'REPLACEMENT');
    assert.equal(requested.session.replaces_batch_id, original.id);
    assert.equal(requested.session.replacement_reason, body.reason);
    assert.equal((await service.requestReplacementFileUpload(principal(ids.admin), original.id, body,
      'replacement-session-key', 'request-replay')).session.id, requested.session.id);
    await assert.rejects(service.requestReplacementFileUpload(principal(ids.admin), original.id,
      { ...body, reason: 'different' }, 'replacement-session-key', 'request-conflict'),
    { code: 'ROYALTY_FILE_REQUEST_CONFLICT' });

    await service.completeFileUpload(principal(ids.admin), requested.session.id, 'complete');
    assert.equal(await createRoyaltyImportJobProcessor(database.runtime, store, 'replacement-worker').poll(), 'processed');
    assert.equal((await service.fileSession(principal(ids.admin), requested.session.id)).status, 'PREVIEW_READY');
    await assert.rejects(service.commitFileSession(principal(ids.otherAdmin), requested.session.id, 'foreign-commit'),
      { code: 'NOT_FOUND' });
    await assert.rejects(service.fileDownload(principal(ids.otherAdmin), requested.session.id), { code: 'NOT_FOUND' });
    const preview = await service.fileSession(principal(ids.admin), requested.session.id);
    await service.approveFileSession(principal(ids.otherAdmin), requested.session.id, {
      expected_checksum: preview.preview_checksum, evidence: 'Replacement ownership and totals reviewed',
    }, 'replacement-approve');
    const committed = await service.commitFileSession(principal(ids.admin), requested.session.id, 'commit');
    assert.equal(committed.replaced_id, original.id);
    assert.equal((await service.fileSession(principal(ids.admin), requested.session.id)).status, 'COMMITTED');
    assert.deepEqual((await database.owner.query(`SELECT old_batch_id,new_batch_id,session_id
      FROM soundpub.royalty_import_replacements WHERE old_batch_id=$1`, [original.id])).rows,
    [{ old_batch_id: original.id, new_batch_id: committed.id, session_id: requested.session.id }]);
    assert.deepEqual(await service.commitFileSession(principal(ids.admin), requested.session.id, 'commit-replay'),
      { id: committed.id, replayed: true });
  } finally { await database.close(); }
});
