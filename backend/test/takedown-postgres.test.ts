import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createTakedownsService } from '../src/takedowns/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const integration = process.env.RUN_DOCKER_TESTS === '1' ? test : test.skip;
const input = (releaseId: string) => ({
  release_id: releaseId, request_type: 'urgent' as const, reason_category: 'Permintaan pemilik karya',
  reason_detail: 'Distribusi harus dihentikan oleh pemegang hak.', contact_name: 'PIC Label',
  contact_position: 'Owner', contact_phone: '+628123456789', contact_email: 'pic@example.test',
  contact_address: 'Jakarta', declaration_accepted: true as const, declaration_version: 'takedown-tor-v1' as const,
  targets: ['Spotify', 'Apple Music'] as const,
});

integration('takedown submission is scoped, atomic, replayable, and server-derived', async () => {
  const db = await concurrencyPostgres();
  try {
    const labelId = randomUUID(), otherLabelId = randomUUID(), artistId = randomUUID(), otherArtistId = randomUUID();
    const releaseId = randomUUID(), otherReleaseId = randomUUID();
    for (const id of [labelId, otherLabelId, artistId, otherArtistId]) {
      await db.owner.query("INSERT INTO soundpub.backend_users(id,email,status,email_verified_at) VALUES ($1,$2,'active',now())",
        [id, `${id}@example.test`]);
      await db.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)',
        [id, id === artistId || id === otherArtistId ? 'Artist' : 'Label',
          id === artistId ? labelId : id === otherArtistId ? otherLabelId : null]);
    }
    await db.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'label',now()),($2,'label',now()),($3,'artist',now()),($4,'artist',now())`,
    [labelId, otherLabelId, artistId, otherArtistId]);
    await db.owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
      VALUES ($1,$2,'Artist',now()),($3,$4,'Other Artist',now())`,
    [labelId, artistId, otherLabelId, otherArtistId]);
    const catalogByUser = await db.owner.query<{ id: string; artist_user_id: string }>(
      'SELECT id,artist_user_id FROM soundpub.artists WHERE artist_user_id=ANY($1::uuid[])', [[artistId, otherArtistId]]);
    const ownedArtist = catalogByUser.rows.find(row => row.artist_user_id === artistId)!.id;
    const otherArtist = catalogByUser.rows.find(row => row.artist_user_id === otherArtistId)!.id;
    await db.owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,title,artist_name,status,artist_id)
      VALUES ($1,$2,$3,$3,'Owned release','Artist','active',$4),($5,$6,$7,$7,'Other release','Other','active',$8)`,
    [releaseId, labelId, artistId, ownedArtist, otherReleaseId, otherLabelId, otherArtistId, otherArtist]);

    const service = createTakedownsService(db.runtime);
    const label = { id: labelId, status: 'active' as const, roles: ['label'] as const };
    const artist = { id: artistId, status: 'active' as const, roles: ['artist'] as const };
    const created = await service.create(label, input(releaseId), 'label-submit-1', 'request-1') as { id: string; label_id: string; requester_id: string; items: unknown[]; targets: unknown[]; history: unknown[] };
    assert.equal(created.label_id, labelId);
    assert.equal(created.requester_id, labelId);
    assert.equal(created.items.length, 1);
    assert.equal(created.targets.length, 2);
    assert.equal(created.history.length, 1);
    assert.equal((await service.create(label, input(releaseId), 'label-submit-1', 'request-replay') as { id: string }).id, created.id);
    await assert.rejects(service.create(label, { ...input(releaseId), reason_detail: 'Changed payload' }, 'label-submit-1', 'request-conflict'),
      (error: any) => error?.statusCode === 409);
    await assert.rejects(service.create(label, input(otherReleaseId), 'cross-label', 'request-cross'),
      (error: any) => error?.statusCode === 404);
    await db.owner.query("UPDATE soundpub.takedown_requests SET status='COMPLETED' WHERE id=$1", [created.id]);
    const artistCreated = await service.create(artist, input(releaseId), 'artist-submit-1', 'request-artist') as { requester_id: string };
    assert.equal(artistCreated.requester_id, artistId);
    const labelList = await service.list(label, {});
    assert.equal(labelList.items.length, 2);
    const artistList = await service.list(artist, {});
    assert.equal(artistList.items.length, 1);
    assert.equal(artistList.items[0].requester_id, artistId);
    assert.equal((await db.owner.query('SELECT count(*)::int AS count FROM soundpub.takedown_requests')).rows[0].count, 2);
    assert.equal((await db.owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='takedown.submitted'")).rows[0].count, 2);
    assert.equal((await db.owner.query("SELECT count(*)::int AS count FROM soundpub.outbox_events WHERE topic='takedown.submitted'")).rows[0].count, 2);
  } finally { await db.close(); }
});
