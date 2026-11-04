import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionService, MockSubmissionProvider, type SubmissionContext } from '../src/submissions/index.js';
import { withTransaction } from '../src/db/pool.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('mock submission: durable business replay, readiness, rollback and dry-run reconciliation', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const ownerId = '00000000-0000-4000-8000-000000000391';
  const releaseId = '00000000-0000-4000-8000-000000000392';
  const labelId = '00000000-0000-4000-8000-000000000393';
  const actor = { id: ownerId, status: 'active' as const, roles: ['artist'] as const };
  const provider = new MockSubmissionProvider();
  const dependencies = { provider, media: { check: async () => ({ cover: true, audio: true }) },
    payment: { isReleasePaymentSatisfied: async () => true } };
  const service = createSubmissionService(database.runtime, dependencies);
  const releaseState = async () => (await database.owner.query('SELECT status,version FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0];
  const receiptCount = async () => (await database.owner.query(
    "SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action='submission.mock_accepted'")).rows[0].count;
  try {
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [ownerId]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [ownerId]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [ownerId, 'Synthetic']);
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [labelId]);
    await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [labelId, 'Synthetic label']);
    await database.owner.query('UPDATE soundpub.profiles SET parent_label_id=$1 WHERE id=$2', [labelId, ownerId]);
    await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [labelId, ownerId, 'Synthetic']);
    await database.owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,title,artist_name,release_type,genre,release_date)
      VALUES ($1,$3,$2,$2,'Synthetic','Synthetic','single','Pop','2026-12-01')`, [releaseId, ownerId, labelId]);
    await database.owner.query(`INSERT INTO soundpub.tracks(release_id,title,artist_name,position)
      VALUES ($1,'Synthetic','Synthetic',1)`, [releaseId]);
    const { version } = await releaseState();
    const unpaid = createSubmissionService(database.runtime, { ...dependencies,
      payment: { isReleasePaymentSatisfied: async () => false } });
    await assert.rejects(unpaid.submit(actor, releaseId, { version }, 'unpaid'), { code: 'SUBMISSION_BLOCKED' });
    const missingMedia = createSubmissionService(database.runtime, { ...dependencies,
      media: { check: async () => ({ cover: false, audio: true }) } });
    await assert.rejects(missingMedia.submit(actor, releaseId, { version }, 'media'), { code: 'SUBMISSION_BLOCKED' });
    assert.equal(await receiptCount(), 0);
    assert.deepEqual(await releaseState(), { status: 'draft', version });
    const unavailable = createSubmissionService(database.runtime, { ...dependencies,
      provider: { providerReady: async () => true, createSubmission: async () => { throw new Error('synthetic provider unavailable'); } } });
    await assert.rejects(unavailable.submit(actor, releaseId, { version }, 'failure'), /synthetic provider unavailable/);
    assert.equal(await receiptCount(), 0);
    const unknown = createSubmissionService(database.runtime, { ...dependencies,
      provider: { providerReady: async () => true, createSubmission: async () => ({ reference: 'synthetic', status: 'UNKNOWN' }) } });
    await assert.rejects(unknown.submit(actor, releaseId, { version }, 'unknown'), { code: 'SUBMISSION_BLOCKED' });
    await database.owner.query(`CREATE FUNCTION soundpub.reject_provider_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='release.submitted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await database.owner.query(`CREATE TRIGGER reject_provider_submission_audit BEFORE INSERT ON soundpub.audit_logs
      FOR EACH ROW EXECUTE FUNCTION soundpub.reject_provider_submission_audit()`);
    await assert.rejects(service.submit(actor, releaseId, { version }, 'rollback'), /synthetic audit failure/);
    assert.equal(await receiptCount(), 0);
    assert.equal((await database.owner.query("SELECT count(*)::int AS count FROM soundpub.integration_effects WHERE consumer='mock-submission'")).rows[0].count, 0);
    await database.owner.query('DROP TRIGGER reject_provider_submission_audit ON soundpub.audit_logs');
    const outcomes = await Promise.allSettled([
      service.submit(actor, releaseId, { version }, 'first'),
      service.submit(actor, releaseId, { version }, 'retry'),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
    assert.deepEqual(await releaseState(), { status: 'pending_paid', version: version + 1 });
    assert.equal(await receiptCount(), 1);
    const local = (await database.owner.query(`SELECT metadata FROM soundpub.audit_logs
      WHERE action='release.submitted' AND resource_id=$1`, [releaseId])).rows[0].metadata.providerSubmission;
    assert.equal(local.reference, `mock-submission:${releaseId}:${version}`);
    await withTransaction(database.runtime, async db => {
      const restarted = new MockSubmissionProvider();
      const receipt = await restarted.getSubmissionStatus(db, releaseId, version);
      assert.equal(receipt?.status, 'ACCEPTED');
      const release = { id: releaseId, version } as SubmissionContext['release'];
      assert.deepEqual(await restarted.createSubmission({ db, release, tracks: [] }), receipt);
      assert.deepEqual(await restarted.reconcileSubmission(db, releaseId, version, receipt),
        { mode: 'DRY_RUN', state: 'MATCHED', reconciled: true });
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version, null)).state, 'PROVIDER_AHEAD');
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version, { ...receipt!, status: 'PENDING' })).state, 'PROVIDER_AHEAD');
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version + 1, receipt)).state, 'MANUAL_REVIEW');
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version, { ...receipt!, status: 'UNKNOWN' })).state, 'MANUAL_REVIEW');
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version, { ...receipt!, reference: 'wrong' })).state, 'MANUAL_REVIEW');
      assert.equal((await restarted.reconcileSubmission(db, releaseId, version + 1, null)).state, 'MANUAL_REVIEW');
      await assert.rejects(restarted.getSubmissionStatus(db, 'invalid', version), { code: 'BAD_REQUEST' });
      class FailedProvider extends MockSubmissionProvider {
        override async getSubmissionStatus(): Promise<null> { throw new Error('synthetic provider unavailable'); }
      }
      assert.equal((await new FailedProvider().reconcileSubmission(db, releaseId, version, receipt)).state, 'MANUAL_REVIEW');
      class UnknownProvider extends MockSubmissionProvider {
        override async getSubmissionStatus() { return { reference: local.reference, status: 'UNKNOWN' }; }
      }
      assert.equal((await new UnknownProvider().reconcileSubmission(db, releaseId, version,
        { reference: local.reference, status: 'UNKNOWN' })).state, 'MANUAL_REVIEW');
    });
    assert.equal(await receiptCount(), 1);
    assert.deepEqual(await releaseState(), { status: 'pending_paid', version: version + 1 });
    await database.owner.query(`INSERT INTO soundpub.audit_logs(action,resource_type,resource_id,request_id,metadata)
      VALUES ('submission.mock_accepted','release',$1,$2,$3::jsonb)`, [releaseId, local.reference, JSON.stringify(local)]);
    await withTransaction(database.runtime, async db => {
      assert.equal((await provider.reconcileSubmission(db, releaseId, version, local)).state, 'MANUAL_REVIEW');
      await assert.rejects(provider.createSubmission({ db, release: { id: releaseId, version } as SubmissionContext['release'], tracks: [] }), { code: 'CONFLICT' });
    });
  } finally { await database.close(); }
});
