import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

const admin = { id: '00000000-0000-4000-8000-000000000001', status: 'active' as const, roles: ['admin'] as const };
const calls: unknown[][] = [];
function dependencies(): ApiDependencies {
  return {
    financeAdjustments: {
      eligibleOwners: async (...args: unknown[]) => { calls.push(['owners', ...args]); return { items: [] }; },
      list: async (...args: unknown[]) => { calls.push(['list', ...args]); return { items: [] }; },
      request: async (...args: unknown[]) => { calls.push(['request', ...args]); return { id: 'adjustment' }; },
      review: async (...args: unknown[]) => { calls.push(['review', ...args]); return { id: 'adjustment' }; },
    } as never,
    auth: { authenticate: async token => token === 'valid' ? admin : null }, readiness: { check: async () => true },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) },
  };
}

test('finance adjustment admin routes enforce auth, idempotency keys and OpenAPI registration', async () => {
  calls.length = 0;
  const app = buildApp(dependencies());
  try {
    assert.equal((await app.inject('/api/v1/admin/finance/adjustments')).statusCode, 401);
    const headers = { authorization: 'Bearer valid' };
    assert.equal((await app.inject({ url: '/api/v1/admin/finance/adjustments', headers })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/admin/finance/adjustment-owners?search=synthetic', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/finance/adjustments', headers,
      payload: { owner_id: admin.id, amount: '10.00', reason: 'Synthetic correction reason' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/finance/adjustments',
      headers: { ...headers, 'idempotency-key': 'request-1' },
      payload: { owner_id: admin.id, amount: '10.00', reason: 'Synthetic correction reason' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/finance/adjustments/00000000-0000-4000-8000-000000000002/review',
      headers: { ...headers, 'idempotency-key': 'review-1' },
      payload: { version: 1, decision: 'APPROVE', note: 'Synthetic review evidence' } })).statusCode, 200);
    const openapi = (await app.inject('/openapi.json')).json();
    assert.ok(openapi.paths['/api/v1/admin/finance/adjustments']);
    assert.ok(openapi.paths['/api/v1/admin/finance/adjustment-owners']);
    assert.ok(openapi.paths['/api/v1/admin/finance/adjustments/{id}/review']);
    assert.deepEqual(calls.map(call => call[0]), ['list', 'owners', 'request', 'review']);
  } finally { await app.close(); }
});
