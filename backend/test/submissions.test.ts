import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { ApiError } from '../src/api/types.js';
import { registerSubmissionRoutes } from '../src/api/submissions.js';
import { createSubmissionService, MockSubmissionProvider, blockerOwners, type SubmissionDependencies } from '../src/submissions/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const artistId = '00000000-0000-4000-8000-000000000301';
const labelId = '00000000-0000-4000-8000-000000000302';
const releaseId = '00000000-0000-4000-8000-000000000303';
const trackId = '00000000-0000-4000-8000-000000000304';
const artist = { id: artistId, status: 'active' as const, roles: ['artist'] as const };
const satisfied: SubmissionDependencies = {
  media: { check: async () => ({ cover: true, audio: true }) },
  payment: { isReleasePaymentSatisfied: async () => true },
  provider: new MockSubmissionProvider(),
};

test('submission contract: isolated restricted PostgreSQL, deferred adapters, HTTP and rollback', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const service = createSubmissionService(database.runtime, satisfied);
  const denied = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
  const app = buildApp({ submissions: service,
    auth: { authenticate: async token => token === 'synthetic' ? artist : null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false },
  });
  const defaultApp = buildApp({ submissions: createSubmissionService(database.runtime),
    auth: { authenticate: async token => token === 'synthetic' ? artist : null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false },
  });
  const paths: Record<string, Record<string, unknown>> = {};
  const documentationApp = (await import('fastify')).default();
  registerSubmissionRoutes(documentationApp, service, async request => {
    if (request.headers.authorization !== 'Bearer synthetic') throw new ApiError(401, 'UNAUTHORIZED');
    return artist;
  }, paths, { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' } } } } });
  const call = (method: 'GET' | 'POST', suffix: string, payload?: object) => app.inject({ method,
    url: `/api/v1/releases/${releaseId}/${suffix}`, headers: { authorization: 'Bearer synthetic' },
    ...(payload ? { payload } : {}) });
  const state = async () => (await database.owner.query('SELECT status,version FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0];
  try {
    for (const [id, role] of [[artistId, 'artist'], [labelId, 'label']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [id, 'Synthetic']);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    }
    await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [labelId, artistId]);
    await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [labelId, artistId, 'Synthetic']);
    await database.owner.query(`INSERT INTO soundpub.releases(id,artist_user_id,label_id,created_by,title,artist_name,release_type,genre,release_date)
      VALUES ($1,$2,$3,$2,'Synthetic','Synthetic','single','Pop','2026-12-01')`, [releaseId, artistId, labelId]);
    await database.owner.query(`INSERT INTO soundpub.tracks(id,release_id,title,artist_name,position)
      VALUES ($1,$2,'Synthetic','Synthetic',1)`, [trackId, releaseId]);
    const version = (await state()).version;
    const defaults = createSubmissionService(database.runtime);
    const unavailable = await defaults.readiness(artist, releaseId);
    assert.deepEqual(unavailable.blockers.map(blocker => blocker.code), ['MEDIA_UNAVAILABLE', 'PAYMENT_UNAVAILABLE', 'PROVIDER_UNAVAILABLE']);
    for (const blocker of unavailable.blockers) assert.equal(blocker.owner, blockerOwners[blocker.code]);
    await assert.rejects(defaults.submit(artist, releaseId, { version }, 'blocked'), denied('SUBMISSION_BLOCKED'));
    const defaultReadiness = await defaultApp.inject({ url: `/api/v1/releases/${releaseId}/submission-readiness`,
      headers: { authorization: 'Bearer synthetic' } });
    assert.equal(defaultReadiness.statusCode, 200);
    assert.equal(defaultReadiness.json().ready, false);
    const defaultSubmit = await defaultApp.inject({ method: 'POST', url: `/api/v1/releases/${releaseId}/submit`,
      headers: { authorization: 'Bearer synthetic' }, payload: { version } });
    assert.equal(defaultSubmit.statusCode, 409);
    assert.equal(defaultSubmit.json().error.code, 'SUBMISSION_BLOCKED');
    assert.equal(defaultSubmit.json().error.message, 'Submission prerequisites are not satisfied');
    assert.ok((await defaultApp.inject('/openapi.json')).json().paths['/api/v1/releases/{id}/submit'].post);
    assert.deepEqual(await state(), { status: 'draft', version });
    for (const [dependencies, code] of [
      [{ ...satisfied, media: { check: async () => ({ cover: false, audio: true }) } }, 'COVER_REQUIRED'],
      [{ ...satisfied, media: { check: async () => ({ cover: true, audio: false }) } }, 'AUDIO_REQUIRED'],
      [{ ...satisfied, payment: { isReleasePaymentSatisfied: async () => false } }, 'PAYMENT_REQUIRED'],
      [{ ...satisfied, provider: { providerReady: async () => false } }, 'PROVIDER_METADATA_REQUIRED'],
      [{ ...satisfied, provider: { providerReady: async () => true } }, 'PROVIDER_UNAVAILABLE'],
      [{ ...satisfied, media: { check: async () => { throw new Error('private adapter failure'); } } }, 'MEDIA_UNAVAILABLE'],
      [{ ...satisfied, payment: { isReleasePaymentSatisfied: async () => { throw new Error('private'); } } }, 'PAYMENT_UNAVAILABLE'],
      [{ ...satisfied, provider: { providerReady: async () => { throw new Error('private'); } } }, 'PROVIDER_UNAVAILABLE'],
    ] as const) {
      const blocked = createSubmissionService(database.runtime, dependencies);
      assert.deepEqual((await blocked.readiness(artist, releaseId)).blockers.map(blocker => blocker.code), [code]);
      await assert.rejects(blocked.submit(artist, releaseId, { version }, 'blocked'), denied('SUBMISSION_BLOCKED'));
    }
    assert.equal((await app.inject(`/api/v1/releases/${releaseId}/submission-readiness`)).statusCode, 401);
    assert.equal((await call('POST', 'submit', { version, payment: true })).statusCode, 400);
    assert.equal((await call('POST', 'submit', { version: 0 })).statusCode, 400);
    assert.equal((await call('POST', 'submit', { version: version + 1 })).json().error.code, 'CONFLICT');
    assert.equal((await call('GET', 'submission-readiness')).json().ready, true);
    assert.ok(paths['/api/v1/releases/{id}/submission-readiness']?.get);
    assert.ok(paths['/api/v1/releases/{id}/submit']?.post);
    await database.owner.query("UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1", [artistId]);
    await assert.rejects(service.submit(artist, releaseId, { version }, 'revoked'), denied('FORBIDDEN'));
    await database.owner.query("UPDATE soundpub.backend_users SET status='active' WHERE id=$1", [artistId]);
    await database.owner.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [artistId]);
    await assert.rejects(service.readiness(artist, releaseId), denied('FORBIDDEN'));
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [artistId]);
    const label = { id: labelId, roles: ['label'] as const, status: 'active' as const };
    await database.owner.query('UPDATE soundpub.artists SET verified_at=NULL WHERE artist_user_id=$1', [artistId]);
    await assert.rejects(service.readiness(label, releaseId), denied('NOT_FOUND'));
    await database.owner.query('UPDATE soundpub.artists SET verified_at=now() WHERE artist_user_id=$1', [artistId]);
    await database.owner.query(`CREATE FUNCTION soundpub.reject_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='release.submitted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await database.owner.query('CREATE TRIGGER reject_submission_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_submission_audit()');
    await assert.rejects(service.submit(artist, releaseId, { version }, 'audit-failure'), /synthetic audit failure/);
    assert.deepEqual(await state(), { status: 'draft', version });
    await database.owner.query('DROP TRIGGER reject_submission_audit ON soundpub.audit_logs');
    const outcomes = await Promise.allSettled([
      service.submit(artist, releaseId, { version }, 'concurrent-1'),
      service.submit(artist, releaseId, { version }, 'concurrent-2'),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && denied('CONFLICT')(rejected.reason));
    assert.deepEqual(await state(), { status: 'pending_paid', version: version + 1 });
    assert.equal((await database.owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='release.submitted'")).rows[0].count, 1);
    const invalid = await call('POST', 'submit', { version: version + 1 });
    assert.equal(invalid.statusCode, 409);
    assert.equal(invalid.json().error.code, 'SUBMISSION_BLOCKED');
    await database.owner.query("UPDATE soundpub.releases SET status='rejected', rejection_reason='Synthetic' WHERE id=$1", [releaseId]);
    const revision = await call('POST', 'submit', { version: (await state()).version });
    assert.equal(revision.statusCode, 200, revision.body);
    assert.equal(revision.json().status, 'revision_submitted');
    assert.equal(revision.json().rejection_reason, null);
  } finally { await app.close(); await defaultApp.close(); await documentationApp.close(); await database.close(); }
});
