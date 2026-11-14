import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionDeliveryHandler, createSubmissionService, MockSubmissionProvider } from '../src/submissions/index.js';
import { pollOutbox } from '../src/worker/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('release submission commits local state before durable outbox delivery', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
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
  const receiptCount = async () => Number((await database.owner.query(
    "SELECT count(*) FROM soundpub.audit_logs WHERE action='submission.mock_accepted'")).rows[0].count);
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

    await database.owner.query(`CREATE FUNCTION soundpub.reject_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='release.submitted' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await database.owner.query('CREATE TRIGGER reject_submission_audit BEFORE INSERT ON soundpub.audit_logs FOR EACH ROW EXECUTE FUNCTION soundpub.reject_submission_audit()');
    await assert.rejects(service.submit(actor, releaseId, { version }, 'rollback'), /synthetic audit failure/);
    assert.deepEqual(await releaseState(), { status: 'draft', version });
    assert.equal((await database.owner.query("SELECT count(*) FROM soundpub.outbox_events WHERE topic='release.submission.requested'")).rows[0].count, '0');
    await database.owner.query('DROP TRIGGER reject_submission_audit ON soundpub.audit_logs');

    const outcomes = await Promise.allSettled([
      service.submit(actor, releaseId, { version }, 'first'),
      service.submit(actor, releaseId, { version }, 'second'),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.deepEqual(await releaseState(), { status: 'pending_paid', version: version + 1 });
    assert.equal(await receiptCount(), 0);
    const pending = await database.owner.query<{ payload: { release_id: string; version: number }; idempotency_key: string }>(
      "SELECT payload,idempotency_key FROM soundpub.outbox_events WHERE topic='release.submission.requested'");
    assert.equal(pending.rowCount, 1);
    assert.deepEqual(pending.rows[0]!.payload, { release_id: releaseId, version, requested_by: ownerId });
    assert.equal(pending.rows[0]!.idempotency_key, `release-submission:${releaseId}:${version}`);

    const handlers = { 'release.submission.requested': createSubmissionDeliveryHandler(provider) };
    assert.equal(await pollOutbox(database.runtime, handlers), 'processed');
    assert.equal(await receiptCount(), 1);
    assert.equal((await database.owner.query("SELECT count(*) FROM soundpub.audit_logs WHERE action='release.submission.dispatched'")).rows[0].count, '1');
    assert.equal((await database.owner.query("SELECT status FROM soundpub.outbox_events WHERE topic='release.submission.requested'")).rows[0].status, 'processed');
    assert.equal(await pollOutbox(database.runtime, handlers), 'idle');
  } finally { await database.close(); }
});
