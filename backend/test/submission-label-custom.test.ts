import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ApiError } from '../src/api/types.js';
import type { Principal } from '../src/auth/index.js';
import { createLabelCustomService } from '../src/label-custom/index.js';
import { createReleasesService } from '../src/releases/index.js';
import { createTracksService } from '../src/tracks/index.js';
import { createSubmissionService, MockSubmissionProvider, type SubmissionDependencies } from '../src/submissions/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const satisfied: SubmissionDependencies = {
  media: { check: async () => ({ cover: true, audio: true }) },
  payment: { isReleasePaymentSatisfied: async () => true },
  provider: new MockSubmissionProvider(),
};
const denied = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('Label Custom canonical artist can pass readiness and submit without artist login', {
  skip: dockerTestsEnabled ? false : 'Set RUN_DOCKER_TESTS=1 for disposable PostgreSQL integration',
  timeout: 180_000,
}, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const pic: Principal = { id: randomUUID(), roles: ['label_custom'], status: 'active' };
  const otherPic: Principal = { id: randomUUID(), roles: ['label_custom'], status: 'active' };
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
  for (const actor of [pic, otherPic, admin]) {
    await database.owner.query(`INSERT INTO soundpub.backend_users(id,status,email_verified_at)
      VALUES ($1,'active',now())`, [actor.id]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [actor.id, `Synthetic ${actor.roles[0]}`]);
    await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [actor.id, actor.roles[0]]);
  }

  const catalog = createLabelCustomService(database.runtime);
  const releases = createReleasesService(database.runtime);
  const tracks = createTracksService(database.runtime);
  const submissions = createSubmissionService(database.runtime, satisfied);
  await catalog.createUnit(pic, { name: 'Submission Unit' }, 'submission-unit');
  const artist = await catalog.createArtist(pic, {
    name: 'Managed Submission Artist', contact_email: 'submission@example.invalid', contact_phone: '+62 000 0000',
  }, 'submission-artist');
  const release = await releases.create(pic, {
    artist_id: artist.id, title: 'Managed Submission Release', artist_name: artist.name,
    release_type: 'single', genre: 'Pop', release_date: '2026-12-01',
  }, 'submission-release');
  await tracks.create(pic, release.id, {
    release_version: release.version, title: 'Managed Track', artist_name: artist.name,
  }, 'submission-track');
  const current = await releases.get(pic, release.id);

  assert.equal(current.artist_user_id, null);
  assert.equal((await submissions.readiness(pic, release.id)).ready, true);
  await assert.rejects(submissions.readiness(otherPic, release.id), denied('NOT_FOUND'));

  await database.owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [admin.id]);
  await assert.rejects(submissions.readiness(admin, release.id), denied('FORBIDDEN'));
  await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [admin.id]);

  const submitted = await submissions.submit(pic, release.id, { version: current.version }, 'submission-label-custom');
  assert.equal(submitted.status, 'pending_paid');
  assert.equal(submitted.artist_id, artist.id);
  assert.equal(submitted.artist_user_id, null);
  assert.equal((await database.owner.query(`SELECT count(*)::int count FROM soundpub.audit_logs
    WHERE action='release.submitted' AND resource_id=$1`, [release.id])).rows[0].count, 1);
});
