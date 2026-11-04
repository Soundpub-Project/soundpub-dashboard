import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createRoyaltyImportJobProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const admin = (id: string): Principal => ({ id, status: 'active', roles: ['admin'] });

test('royalty import file lifecycle persists private intent and refreshed admin authority', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  try {
    const userId = randomUUID();
    const objectId = randomUUID();
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [userId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'admin',now())", [userId]);
    let verified = 0;
    const store: RoyaltyImportObjectStore = {
      bucket: 'synthetic-private',
      key: id => `royalty-imports/objects/${id}`,
      request: async (ownerId, input) => ({ metadata: { id: objectId, ownerId, mimeType: input.mime_type,
        size: input.size, checksum: input.checksum, visibility: 'private', createdAt: new Date().toISOString() },
      url: `http://127.0.0.1:9100/synthetic-private/royalty-imports/staging/${objectId}`,
      method: 'PUT', headers: { 'content-type': 'text/csv' } }),
      verify: async row => { assert.equal(row.id, objectId); verified++; },
      open: async () => (async function *() { yield new TextEncoder().encode('period,isrc,platform,country,sales_unit,net_revenue'); })(),
      read: async () => 'period,isrc,platform,country,sales_unit,net_revenue',
      download: async row => `http://127.0.0.1:9100/download/${row.id}`,
      remove: async () => undefined,
      isReady: async () => true,
      close: () => undefined,
    };
    const service = createRoyaltiesService(database.runtime, store);
    const checksum = 'a'.repeat(64);
    const requested = await service.requestFileUpload(admin(userId), { source: 'provider', filename: 'statement.csv',
      mime_type: 'text/csv', size: 123, checksum }, 'request-file');
    assert.equal(requested.session.id, objectId);
    assert.equal(requested.session.status, 'UPLOAD_PENDING');
    assert.equal(requested.session.source_checksum, checksum);
    assert.equal(requested.method, 'PUT');

    const completed = await service.completeFileUpload(admin(userId), objectId, 'complete-file');
    assert.equal(completed.session.status, 'QUEUED');
    assert.equal(completed.session.phase, 'QUEUED');
    assert.equal(verified, 1);
    assert.equal((await service.completeFileUpload(admin(userId), objectId, 'replay')).session.status, 'QUEUED');
    assert.equal(verified, 1);
    assert.equal((await service.fileSessions(admin(userId))).items[0]?.id, objectId);
    assert.equal(await createRoyaltyImportJobProcessor(database.runtime, store, 'synthetic-worker').poll(), 'processed');
    assert.equal((await service.fileSession(admin(userId), objectId)).status, 'PREVIEW_READY');
    assert.equal((await service.fileSession(admin(userId), objectId)).filename, 'statement.csv');
    assert.match((await service.fileDownload(admin(userId), objectId)).url, new RegExp(objectId));
    assert.equal((await database.owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE resource_type='royalty_import_session' AND resource_id=$1", [objectId])).rows[0].count, 2);

    await database.owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [userId]);
    await assert.rejects(service.fileSession(admin(userId), objectId), { code: 'FORBIDDEN' });
  } finally { await database.close(); }
});


