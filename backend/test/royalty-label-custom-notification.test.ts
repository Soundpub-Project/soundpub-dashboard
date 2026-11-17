import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { withTransaction } from '../src/db/pool.js';
import { createLabelCustomService } from '../src/label-custom/index.js';
import { createReleasesService } from '../src/releases/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { notifyRoyaltyOwnersAfterReconciliation } from '../src/royalties/notification-handler.js';
import { createTracksService } from '../src/tracks/index.js';
import { once, type OutboxEvent } from '../src/worker/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('Label Custom royalty reconciliation notifies PIC only, never login-free artist', {
  skip: dockerTestsEnabled ? false : 'Set RUN_DOCKER_TESTS=1 for disposable Docker integration',
  timeout: 120_000,
}, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const { owner, runtime, reconciler } = database;
  const pic: Principal = { id: randomUUID(), roles: ['label_custom'], status: 'active' };
  const importer: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  const reviewer: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  for (const [actor, name] of [[pic, 'Synthetic PIC'], [importer, 'Synthetic Importer'],
    [reviewer, 'Synthetic Reviewer']] as const) {
    await owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [actor.id]);
    await owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES($1,$2)', [actor.id,name]);
    await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())',
      [actor.id,actor.roles[0]]);
  }
  const catalog = createLabelCustomService(runtime);
  const unit = await catalog.createUnit(pic, { name: 'Synthetic notification unit' }, 'royalty-notification-unit');
  const artist = await catalog.createArtist(pic, { name: 'Synthetic managed artist',
    contact_email: 'managed@example.invalid', contact_phone: '+62 000 11112222' }, 'royalty-notification-artist');
  const release = await createReleasesService(runtime).create(pic, {
    artist_id: artist.id, title: 'Synthetic notification release', artist_name: artist.name,
    release_type: 'single', genre: 'Pop', release_date: '2026-12-01', upc: '1234567890123',
  }, 'royalty-notification-release');
  const { track } = await createTracksService(runtime).create(pic, release.id, {
    release_version: release.version, title: 'Synthetic notification track', artist_name: artist.name,
    isrc: 'FRX762598330',
  }, 'royalty-notification-track');
  assert.equal(artist.artist_user_id, null);
  assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.backend_users WHERE id=$1',
    [artist.id])).rows[0].count, 0);

  const royalties = createRoyaltiesService(runtime, undefined, reconciler);
  const csv = [
    'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue',
    '2026-10,FRX762598330,1234567890123,Synthetic notification track,Synthetic managed artist,Synthetic PIC,Spotify,ID,stream,1,1000.00',
  ].join('\n');
  const preview = await royalties.previewCsv(importer, { csv });
  assert.equal(preview.valid_rows, 1);
  assert.equal(preview.sample_rows[0]?.track_id, track.id);
  assert.equal(preview.sample_rows[0]?.artist_owner_user_id, pic.id);
  const batch = await royalties.commitCsv(importer, { csv, source: 'synthetic-label-custom',
    filename: 'synthetic-label-custom.csv', expected_checksum: preview.checksum! }, 'royalty-notification-import');
  assert.equal((await runtime.query('SELECT count(*)::int AS count FROM soundpub.notifications')).rows[0].count, 0);
  const report = await royalties.reconciliation(reviewer, batch.id);
  const approval = await royalties.reconcile(reviewer, batch.id, {
    expected_checksum: report.snapshot.batch.checksum, evidence: 'Synthetic owner allocation checked',
  }, 'royalty-notification-reconcile');
  assert.equal(approval.matched, true);
  const event = (await owner.query<OutboxEvent>(`SELECT id,topic,payload,idempotency_key,attempts
    FROM soundpub.outbox_events WHERE idempotency_key=$1`, [`royalty.reconciled:${batch.id}`])).rows[0]!;
  assert.equal(await withTransaction(runtime, db => once(db, 'outbox', event.idempotency_key,
    () => notifyRoyaltyOwnersAfterReconciliation(event, db))), true);
  const notices = (await runtime.query<{ recipient_user_id: string; body: string; metadata_safe: Record<string, unknown> }>(
    'SELECT recipient_user_id,body,metadata_safe FROM soundpub.notifications ORDER BY recipient_user_id')).rows;
  assert.deepEqual(notices.map(notice => notice.recipient_user_id).sort(), [pic.id,importer.id,reviewer.id].sort());
  assert.match(notices.find(notice => notice.recipient_user_id === pic.id)!.body, /910\.00/);
  assert.equal(notices.find(notice => notice.recipient_user_id === importer.id)!.metadata_safe.amount, undefined);
  assert.equal((await runtime.query('SELECT count(*)::int AS count FROM soundpub.notifications WHERE recipient_user_id=$1',
    [artist.id])).rows[0].count, 0);
  assert.equal(await withTransaction(runtime, db => once(db, 'outbox', event.idempotency_key,
    () => notifyRoyaltyOwnersAfterReconciliation(event, db))), false);
  assert.equal((await runtime.query('SELECT count(*)::int AS count FROM soundpub.notifications')).rows[0].count, 3);
  assert.equal(unit.owner_user_id, pic.id);
});