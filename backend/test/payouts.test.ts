import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import Fastify from 'fastify';
import { registerPayoutRoutes } from '../src/payouts/routes.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { money, minor, transitionAllowed, type PayoutFinance } from '../src/payouts/contracts.js';
import type { Principal } from '../src/auth/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('payout input precision and terminal transitions', () => {
  for (const value of [800, '1e3', '-1.00', '0.001', '01.00', '10000000000000000.00']) assert.equal(money.safeParse(value).success, false);
  assert.equal(minor('9999999999999999.99'), 999999999999999999n);
  for (const from of ['paid', 'failed', 'cancelled', 'rejected'] as const)
    for (const to of ['pending', 'approved', 'paid', 'failed', 'cancelled', 'rejected'] as const) assert.equal(transitionAllowed(from, to), false);
});

test('payout PostgreSQL race, replay, rollback, release, settlement and authority', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
  const fixture = await concurrencyPostgres();
  const { owner, runtime } = fixture;
  try {
    const label: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
    const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
    const other: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
    for (const p of [label, admin, other]) {
      await owner.query(`INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())`, [p.id]);
      await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [p.id, p.roles[0]]);
    }
    // Synthetic fixtures exercise actual Agent C ledger and payout adapter.
    const event = async (db: Parameters<PayoutFinance['lock']>[0], ownerId: string, kind: string, amount: string, ref: string, evidence: string | null = null) => {
      await db.query(`INSERT INTO soundpub.finance_events(owner_id,currency,kind,amount_minor,business_reference,idempotency_key,system_actor,evidence)
        VALUES($1,'IDR',$2,$3,$4,$5,'payout-test',$6)`, [ownerId, kind, amount, ref, `${kind}:${ref}`, evidence]);
    };
    await owner.query(`INSERT INTO soundpub.finance_accounts(owner_id,currency) VALUES($1,'IDR')`, [label.id]);
    const seed = await owner.connect();
    try { await event(seed, label.id, 'ROYALTY_EARNING', '100000', 'synthetic-earning'); } finally { seed.release(); }
    const finance = createPgPayoutFinance(async () => ({ minimum: '100.00', destinationReady: true, reconciled: true }));
    const service = createPayoutsService(runtime, finance);
    const input = { amount: '800.00', currency: 'IDR', bank_name: 'Synthetic', account_number: '12345678', account_holder_name: 'Fixture' };
    await assert.rejects(async () => service.request(label, { ...input, user_id: other.id }, 'forged'), { code: 'BAD_REQUEST' });
    await assert.rejects(service.request(label, { ...input, amount: '99.00' }, 'small'), { code: 'BELOW_MINIMUM' });
    await assert.rejects(service.request(label, { ...input, amount: '1001.00' }, 'large'), { code: 'INSUFFICIENT_BALANCE' });
    const zeroMinimum = createPayoutsService(runtime, createPgPayoutFinance(async () => ({ minimum: '0.00', destinationReady: true, reconciled: true })));
    assert.equal((await zeroMinimum.eligibility(label)).eligible, true);
    const blockedPolicy = createPayoutsService(runtime, createPgPayoutFinance(async () => ({ minimum: '100.00', destinationReady: false, reconciled: false })));
    assert.equal((await blockedPolicy.eligibility(label)).eligible, false);
    assert.equal((await blockedPolicy.eligibility(label)).available, null);
    await assert.rejects(blockedPolicy.request(label, input, 'not-ready'), { code: 'PAYOUT_INELIGIBLE' });
    // Deterministic barrier: both requests must be waiting on the same authority row before release.
    const blocker = await owner.connect();
    let concurrent: Promise<PromiseSettledResult<Awaited<ReturnType<typeof service.request>>>[]>;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM soundpub.backend_users WHERE id=$1 FOR UPDATE', [label.id]);
      concurrent = Promise.allSettled([service.request(label, input, 'race-a'), service.request(label, input, 'race-b')]);
      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (Date.now() < deadline) {
        waiting = Number((await owner.query(`SELECT count(*) FROM pg_stat_activity WHERE usename='soundpub_app'
          AND wait_event_type='Lock' AND query LIKE '%SELECT id, status FROM soundpub.backend_users%'`)).rows[0].count);
        if (waiting >= 2) break;
        await setTimeout(10);
      }
      assert.ok(waiting >= 2, 'both payout requests reached DB lock barrier');
      await blocker.query('COMMIT');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    const race = await concurrent!;
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1,
      JSON.stringify(race.map(result => result.status === 'rejected' ? String(result.reason) : 'fulfilled')));
    const result = race.find(r => r.status === 'fulfilled'); assert.ok(result?.status === 'fulfilled');
    const payout = result.value;
    const app = Fastify();
    let httpActor = label;
    registerPayoutRoutes(app, service, async () => httpActor);
    app.setErrorHandler((error: { statusCode?: number; code?: string }, _request, reply) => {
      reply.code(error.statusCode ?? 500).send({ code: error.code ?? 'INTERNAL_ERROR' });
    });
    try {
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/payouts' })).statusCode, 200);
      const detail = await app.inject({ method: 'GET', url: `/api/v1/payouts/${payout.id}` });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().amount, '800.00');
      assert.equal('account_number' in detail.json(), false);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/payouts', payload: input })).statusCode, 400);
      httpActor = admin;
      assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/payouts/${payout.id}/transition`,
        headers: { 'idempotency-key': 'http-forged-paid' }, payload: { status: 'paid', evidence: 'browser' } })).statusCode, 403);
    } finally { await app.close(); }
    const key = race[0]?.status === 'fulfilled' ? 'race-a' : 'race-b';
    assert.equal((await service.request(label, input, key)).id, payout.id);
    const requestNotifications = await owner.query<{ body: string; metadata_safe: Record<string, unknown> }>(
      `SELECT body,metadata_safe FROM soundpub.notifications WHERE recipient_user_id=$1 AND metadata_safe->>'payout_id'=$2`,
      [admin.id, payout.id]);
    assert.equal(requestNotifications.rowCount, 1);
    assert.match(requestNotifications.rows[0]!.body, /IDR 800\.00 ke Synthetic/);
    assert.equal(requestNotifications.rows[0]!.body.includes(input.account_number), false);
    assert.equal(requestNotifications.rows[0]!.metadata_safe.bank_name, 'Synthetic');
    assert.equal('account_number' in requestNotifications.rows[0]!.metadata_safe, false);
    await assert.rejects(service.request(label, { ...input, amount: '700.00' }, key), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(service.detail(other, payout.id), { statusCode: 404 });
    await assert.rejects(service.cancel(other, payout.id, 'foreign'), { statusCode: 404 });
    await assert.rejects(service.transition(label, payout.id, { status: 'approved' }, 'abuse'), { statusCode: 403 });
    await service.cancel(label, payout.id, 'cancel');
    await service.cancel(label, payout.id, 'cancel-again');
    const balanceClient = await owner.connect();
    try { assert.equal((await finance.eligibility(balanceClient, label.id)).available, '1000.00'); }
    finally { balanceClient.release(); }
    assert.equal((await owner.query(`SELECT count(*) FROM soundpub.finance_events WHERE kind='PAYOUT_RELEASE' AND business_reference=$1`, [payout.id])).rows[0].count, '1');
    const second = await service.request(label, input, 'second');
    await service.transition(admin, second.id, { status: 'approved' }, 'approve');
    await assert.rejects(service.cancel(label, second.id, 'too-late'), { code: 'PAYOUT_TRANSITION_CONFLICT' });
    await assert.rejects(service.transition(admin, second.id, { status: 'paid', evidence: 'forged' }, 'forged-paid'), { code: 'TRUSTED_SETTLEMENT_REQUIRED' });
    await assert.rejects(service.settle(label, second.id, { proof_media_id: randomUUID(), evidence: 'forged' }, 'foreign-settle'), { code: 'FORBIDDEN' });
    await assert.rejects(service.settle(admin, second.id, { proof_media_id: randomUUID(), evidence: 'missing' }, 'missing-proof'), { code: 'SETTLEMENT_PROOF_REQUIRED' });
    const invalidProofId = randomUUID();
    await owner.query(`INSERT INTO soundpub.media_objects
      (id,bucket,object_key,owner_user_id,category,resource_type,resource_id,variant,mime_type,size,checksum,status,expires_at,cleanup_after)
      VALUES($1,'synthetic', $2,$3,'PAYOUT_PROOF','payout',$4,'default','application/pdf',8,$5,'ACTIVE',now()+interval '1 day',now()+interval '1 day')`,
    [invalidProofId, `media/objects/${invalidProofId}`, admin.id, randomUUID(), 'b'.repeat(64)]);
    await assert.rejects(service.settle(admin, second.id, { proof_media_id: invalidProofId, evidence: 'mismatch' }, 'mismatch-proof'), { code: 'SETTLEMENT_PROOF_REQUIRED' });
    await assert.rejects(owner.query(`INSERT INTO soundpub.payout_settlement_proofs(payout_id,media_object_id,uploaded_by) VALUES($1,$2,$3)`,
      [second.id,invalidProofId,admin.id]), (error: { code?: string }) => error.code === '23514');
    const proofId = randomUUID();
    await owner.query(`INSERT INTO soundpub.media_objects
      (id,bucket,object_key,owner_user_id,category,resource_type,resource_id,variant,mime_type,size,checksum,status,expires_at,cleanup_after)
      VALUES($1,'synthetic', $2,$3,'PAYOUT_PROOF','payout',$4,'default','application/pdf',8,$5,'ACTIVE',now()+interval '1 day',now()+interval '1 day')`,
    [proofId, `media/objects/${proofId}`, admin.id, second.id, 'a'.repeat(64)]);
    const settled = await service.settle(admin, second.id, { proof_media_id: proofId, evidence: 'synthetic-evidence' }, 'settle');
    assert.equal(settled.status, 'paid');
    assert.equal(settled.proof_media_id, proofId);
    assert.equal((await owner.query('SELECT count(*) FROM soundpub.payout_settlement_proofs WHERE payout_id=$1 AND media_object_id=$2', [second.id,proofId])).rows[0].count, '1');
    assert.equal((await owner.query(`SELECT count(*) FROM soundpub.finance_events WHERE kind='PAYOUT_SETTLEMENT' AND business_reference=$1`, [second.id])).rows[0].count, '1');
    assert.equal((await service.settle(admin, second.id, { proof_media_id: proofId, evidence: 'synthetic-evidence' }, 'settle')).status, 'paid');
    await assert.rejects(owner.query('DELETE FROM soundpub.media_objects WHERE id=$1', [proofId]), (error: { code?: string }) => error.code === '23503');
    await assert.rejects(service.transition(admin, second.id, { status: 'failed' }, 'regress'), { code: 'PAYOUT_TRANSITION_CONFLICT' });
    const third = await service.request(label, { ...input, amount: '100.00' }, 'third');
    await service.transition(admin, third.id, { status: 'failed' }, 'fail');
    // Pool label first, then verified current artist; release original source after transfer.
    const child = randomUUID();
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')`, [child]);
    await owner.query(`INSERT INTO soundpub.profiles(id) VALUES($1) ON CONFLICT DO NOTHING`, [label.id]);
    await owner.query(`INSERT INTO soundpub.profiles(id,parent_label_id) VALUES($1,$2)`, [child,label.id]);
    await owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name) VALUES($1,$2,'Synthetic child')`, [label.id,child]);
    await owner.query(`INSERT INTO soundpub.finance_accounts(owner_id,currency) VALUES($1,'IDR')`, [child]);
    const childClient = await owner.connect();
    try { await event(childClient, child, 'ROYALTY_EARNING', '30000', 'synthetic-child'); } finally { childClient.release(); }
    const pooled = await service.request(label, { ...input, amount: '400.00' }, 'pooled');
    assert.equal((await owner.query('SELECT count(*) FROM soundpub.payout_allocations WHERE payout_id=$1', [pooled.id])).rows[0].count, '2');
    await owner.query('DELETE FROM soundpub.artists WHERE artist_user_id=$1', [child]);
    await owner.query('UPDATE soundpub.profiles SET parent_label_id=NULL WHERE id=$1', [child]);
    await service.cancel(label, pooled.id, 'pooled-cancel');
    assert.equal((await owner.query(`SELECT count(*) FROM soundpub.finance_events WHERE business_reference=$1 AND kind='PAYOUT_RELEASE'`, [pooled.id])).rows[0].count, '2');
    // Force outbox failure after reservation/audit: every business effect must roll back.
    await owner.query(`CREATE FUNCTION soundpub.payout_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.topic='payout.changed' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER payout_test_fail BEFORE INSERT ON soundpub.outbox_events FOR EACH ROW EXECUTE FUNCTION soundpub.payout_test_fail()`);
    const before = (await owner.query(`SELECT (SELECT count(*) FROM soundpub.payout_requests) AS payouts,(SELECT count(*) FROM soundpub.finance_events) AS events,(SELECT count(*) FROM soundpub.audit_logs) AS audits`)).rows[0];
    await assert.rejects(service.request(label, { ...input, amount: '100.00' }, 'rollback'), /synthetic failure/);
    assert.deepEqual((await owner.query(`SELECT (SELECT count(*) FROM soundpub.payout_requests) AS payouts,(SELECT count(*) FROM soundpub.finance_events) AS events,(SELECT count(*) FROM soundpub.audit_logs) AS audits`)).rows[0], before);
    await owner.query('DROP TRIGGER payout_test_fail ON soundpub.outbox_events');
    await owner.query(`DELETE FROM soundpub.user_roles WHERE user_id=$1`, [label.id]);
    await assert.rejects(service.request(label, input, 'removed'), { statusCode: 403 });
    await owner.query(`UPDATE soundpub.backend_users SET status='suspended' WHERE id=$1`, [admin.id]);
    await assert.rejects(service.list(admin, {}, true), { statusCode: 403 });
  } finally { await fixture.close(); }
});


