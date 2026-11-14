import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createArtistsService } from '../src/artists/index.js';
import { assertArtistCanDetachFromLabel } from '../src/artists/detachment.js';
import { createLabelsService } from '../src/labels/index.js';
import { historicalDatabase, historicalFixture } from './support/historical-ownership.js';

const blockingStatuses = ['pending', 'pending_paid', 'processing', 'revision_submitted', 'active'] as const;
test('artist detach preserves submitted release authority for both APIs', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async suite => {
  const { owner, runtime, close } = await historicalDatabase();
  const labels = createLabelsService(runtime, { assertCanRemove: assertArtistCanDetachFromLabel });
  const artists = createArtistsService(runtime, { assertCanDetach: assertArtistCanDetachFromLabel });
  try {
    for (const route of ['labels', 'artists'] as const) {
      for (const status of blockingStatuses) {
        const legacy = route === 'artists' && status === 'active';
        await suite.test(`${route} detach rejects ${legacy ? 'legacy ' : ''}${status} release`, async () => {
          const fixture = await historicalFixture(owner, runtime);
          const initial = await fixture.current();
          if (legacy) await owner.query('ALTER TABLE soundpub.releases DISABLE TRIGGER releases_canonical_guard');
          try {
            await owner.query(`INSERT INTO soundpub.releases
              (id,label_id,artist_user_id,created_by,title,artist_name,release_type,genre,release_date,status)
              VALUES($1,$2,$3,$4,'Blocked release',$5,'single','Pop','2026-01-01',$6)`,
            [randomUUID(), fixture.labelA, legacy ? null : fixture.artist.id, fixture.artist.id, 'Same synthetic display name', status]);
          } finally { if (legacy) await owner.query('ALTER TABLE soundpub.releases ENABLE TRIGGER releases_canonical_guard'); }
          const requestId = randomUUID();
          if (route === 'labels') {
            await assert.rejects(labels.remove(fixture.admin, fixture.artist.id,
              { expectedParentLabelId: fixture.labelA }, requestId), { statusCode: 409 });
          } else {
            await assert.rejects(artists.removeFromLabel(fixture.admin, fixture.artist.id, requestId), { statusCode: 409 });
          }
          assert.deepEqual(await fixture.current(), initial);
          assert.deepEqual(await fixture.history(), fixture.baseline);
          assert.equal((await owner.query(`SELECT count(*)::int AS count FROM soundpub.audit_logs
            WHERE resource_id=$1 AND action IN ('label.artist_removed','artist.removed_from_label')`, [fixture.artist.id])).rows[0].count, 0);
        });
      }
    }
  } finally { await close(); }
});