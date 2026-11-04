import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRoyaltyImportCleanupProcessor } from '../src/royalties/jobs.js';
import type { RoyaltyImportObjectStore } from '../src/royalties/store.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('royalty cleanup deletes only expired transient files and preserves committed-ready originals', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const requester = randomUUID(), expired = randomUUID(), retained = randomUUID();
  const removed: string[] = [];
  try {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [requester]);
    await database.owner.query(`INSERT INTO soundpub.royalty_import_sessions
      (id,requester_id,source,filename,bucket,object_key,size_bytes,source_checksum,status,phase,
       processed_rows,total_rows,preview_checksum,preview_result,upload_expires_at,cleanup_after)
      VALUES ($1,$3,'provider','expired.csv','private',$4,10,$5,'FAILED','PARSE',0,NULL,NULL,NULL,now()-interval '2 days',now()-interval '1 day'),
      ($2,$3,'provider','retained.csv','private',$6,10,$5,'PREVIEW_READY','PREVIEW',0,0,$5,'{}'::jsonb,now()-interval '2 days',now()-interval '1 day')`,
    [expired,retained,requester,`royalty-imports/objects/${expired}`,'a'.repeat(64),`royalty-imports/objects/${retained}`]);
    await database.owner.query(`INSERT INTO soundpub.royalty_import_session_rows
      (session_id,source_row_number,source_row_id,row_status,issue)
      VALUES ($1,2,$2,'INVALID',$3::jsonb)`,
    [expired,`${'a'.repeat(64)}:2`,JSON.stringify({ row: 2, field: 'period', code: 'INVALID_PERIOD', message: 'invalid' })]);
    const store: RoyaltyImportObjectStore = {
      bucket: 'private', key: id => `royalty-imports/objects/${id}`,
      request: async () => { throw new Error('unused'); }, verify: async () => undefined,
      open: async () => (async function *() {})(),
      read: async () => '', download: async () => '', remove: async row => { removed.push(row.id); },
      isReady: async () => true, close: () => undefined,
    };
    const cleanup = createRoyaltyImportCleanupProcessor(database.runtime, store, 'cleanup-worker');
    assert.equal(await cleanup.poll(), 'processed');
    assert.deepEqual(removed, [expired]);
    assert.equal((await database.owner.query('SELECT status FROM soundpub.royalty_import_sessions WHERE id=$1', [expired])).rows[0].status, 'DELETED');
    assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.royalty_import_session_rows WHERE session_id=$1', [expired])).rows[0].count, 0);
    assert.equal((await database.owner.query('SELECT status FROM soundpub.royalty_import_sessions WHERE id=$1', [retained])).rows[0].status, 'PREVIEW_READY');
    assert.equal(await cleanup.poll(), 'idle');
  } finally { await database.close(); }
});

test('royalty cleanup retries idempotent object deletion after transient storage failure', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const requester = randomUUID(), expired = randomUUID();
  try {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [requester]);
    await database.owner.query(`INSERT INTO soundpub.royalty_import_sessions
      (id,requester_id,source,filename,bucket,object_key,size_bytes,source_checksum,status,phase,upload_expires_at,cleanup_after)
      VALUES ($1,$2,'provider','expired.csv','private',$3,10,$4,'FAILED','PARSE',now()-interval '2 days',now()-interval '1 day')`,
    [expired,requester,`royalty-imports/objects/${expired}`,'b'.repeat(64)]);
    let attempts = 0;
    const store: RoyaltyImportObjectStore = {
      bucket: 'private', key: id => `royalty-imports/objects/${id}`,
      request: async () => { throw new Error('unused'); }, verify: async () => undefined,
      open: async () => (async function *() {})(),
      read: async () => '', download: async () => '', remove: async () => { attempts++; throw new Error('temporary'); },
      isReady: async () => true, close: () => undefined,
    };
    const cleanup = createRoyaltyImportCleanupProcessor(database.runtime, store, 'cleanup-worker');
    assert.equal(await cleanup.poll(), 'retry');
    const row = (await database.owner.query('SELECT status,error_code,next_attempt_at FROM soundpub.royalty_import_sessions WHERE id=$1', [expired])).rows[0];
    assert.equal(row.status, 'CLEANING');
    assert.equal(row.error_code, 'ROYALTY_CLEANUP_RETRY');
    assert.ok(row.next_attempt_at);
    assert.equal(attempts, 1);
  } finally { await database.close(); }
});
