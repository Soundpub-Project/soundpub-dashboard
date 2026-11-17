import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createFinanceAdjustmentsService } from '../src/finance/manual-adjustments.js';
import { reconciliationSnapshot } from '../src/finance/readiness.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('manual finance adjustment requires separate reviewer and posts approved ledger evidence', {
  skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  const requesterId = randomUUID(), reviewerId = randomUUID(), beneficiaryId = randomUUID();
  const requester: Principal = { id: requesterId, roles: ['admin'], status: 'active' };
  const reviewer: Principal = { id: reviewerId, roles: ['admin'], status: 'active' };
  const service = createFinanceAdjustmentsService(runtime);
  try {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active'),($2,'active'),($3,'active')`,
      [requesterId,reviewerId,beneficiaryId]);
    await owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES($1,'Requester'),($2,'Reviewer'),($3,'Artist')`,
      [requesterId,reviewerId,beneficiaryId]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
      VALUES($1,'admin',now()),($2,'admin',now()),($3,'artist',now())`, [requesterId,reviewerId,beneficiaryId]);

    const eligibleOwners = await service.eligibleOwners(requester, { search: 'Artist' }) as { items: Array<{ id: string }> };
    assert.deepEqual(eligibleOwners.items.map(item => item.id), [beneficiaryId]);
    const request = await service.request(requester, { owner_id: beneficiaryId, amount: '125.00',
      reason: 'Synthetic correction evidence' }, 'adjustment-request-1', randomUUID()) as { id: string; status: string };
    assert.equal(request.status, 'PENDING');
    const replayedRequest = await service.request(requester, { owner_id: beneficiaryId, amount: '125.00',
      reason: 'Synthetic correction evidence' }, 'adjustment-request-1', randomUUID()) as { id: string };
    assert.equal(replayedRequest.id, request.id);
    const concurrentRequests = await Promise.all([1, 2].map(() => service.request(requester,
      { owner_id: beneficiaryId, amount: '5.00', reason: 'Concurrent idempotency evidence' },
      'adjustment-request-concurrent', randomUUID()) as Promise<{ id: string }>));
    assert.equal(concurrentRequests[0]?.id, concurrentRequests[1]?.id);
    await assert.rejects(service.review(requester, request.id, { version: 1, decision: 'APPROVE',
      note: 'Requester cannot approve' }, 'self-review', randomUUID()), { code: 'FORBIDDEN' });
    const approved = await service.review(reviewer, request.id, { version: 1, decision: 'APPROVE',
      note: 'Synthetic review evidence' }, 'review-approve-1', randomUUID()) as { status: string; finance_event_id: string };
    assert.equal(approved.status, 'APPROVED');
    assert.ok(approved.finance_event_id);
    const replayed = await service.review(reviewer, request.id, { version: 1, decision: 'APPROVE',
      note: 'Synthetic review evidence' }, 'review-approve-1', randomUUID()) as { status: string };
    assert.equal(replayed.status, 'APPROVED');
    const integrity = await runtime.query('SELECT soundpub.finance_adjustments_intact($1) AS intact', [beneficiaryId]);
    assert.equal(integrity.rows[0]?.intact, true);
    assert.equal((await database.reconciler.query('SELECT soundpub.finance_adjustments_intact($1) AS intact',
      [beneficiaryId])).rows[0]?.intact, true);
    assert.equal((await database.auditor.query('SELECT soundpub.finance_adjustments_intact($1) AS intact',
      [beneficiaryId])).rows[0]?.intact, true);
    const readinessClient = await runtime.connect();
    try { assert.equal((await reconciliationSnapshot(readinessClient, beneficiaryId)).intact, true); }
    finally { readinessClient.release(); }

    const rejectedRequest = await service.request(requester, { owner_id: beneficiaryId, amount: '25.00',
      reason: 'Synthetic rejected adjustment' }, 'adjustment-request-2', randomUUID()) as { id: string };
    const rejected = await service.review(reviewer, rejectedRequest.id, { version: 1, decision: 'REJECT',
      note: 'Synthetic rejection evidence' }, 'review-reject-1', randomUUID()) as { status: string; finance_event_id: string | null };
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.finance_event_id, null);

    const negativeRequest = await service.request(requester, { owner_id: beneficiaryId, amount: '-999.00',
      reason: 'Synthetic negative adjustment' }, 'adjustment-request-3', randomUUID()) as { id: string };
    await assert.rejects(service.review(reviewer, negativeRequest.id, { version: 1, decision: 'APPROVE',
      note: 'Insufficient balance must fail' }, 'review-negative-1', randomUUID()), { code: 'FINANCE_INSUFFICIENT_BALANCE' });
    const remainsPending = await service.list(requester, { status: 'PENDING' }) as { items: Array<{ id: string; status: string }> };
    assert.ok(remainsPending.items.some(item => item.id === negativeRequest.id && item.status === 'PENDING'));
  } finally {
    await database.close();
  }
});
