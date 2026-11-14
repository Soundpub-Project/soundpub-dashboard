import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

test('financial OpenAPI preserves every method sharing a path', async () => {
  const app = buildApp({
    auth: { authenticate: async () => null }, readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined }, webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    royalties: {} as ApiDependencies['royalties'], payouts: {} as ApiDependencies['payouts'],
    financeReconciliation: {} as ApiDependencies['financeReconciliation'],
  });
  try {
    const paths = (await app.inject('/openapi.json')).json().paths;
    assert.ok(paths['/api/v1/royalties/imports/csv/preview'].post);
    assert.ok(paths['/api/v1/royalties/imports/csv/commit'].post);
    assert.ok(paths['/api/v1/royalties/import-files'].post);
    assert.ok(paths['/api/v1/royalties/imports/{id}/replacement-file-sessions'].post);
    assert.ok(paths['/api/v1/royalties/import-files'].get);
    assert.ok(paths['/api/v1/royalties/import-files/{id}/complete'].post);
    assert.ok(paths['/api/v1/royalties/import-files/{id}'].get);
    assert.ok(paths['/api/v1/royalties/import-files/{id}/rows'].get);
    assert.ok(paths['/api/v1/admin/royalties/import-files/{id}/approve'].post);
    assert.ok(paths['/api/v1/royalties/import-files/{id}/retry'].post);
    assert.ok(paths['/api/v1/royalties/import-files/{id}/commit'].post);
    assert.ok(paths['/api/v1/royalties/import-files/{id}/download'].get);
    assert.ok(paths['/api/v1/royalties/periods'].get);
    assert.ok(paths['/api/v1/royalties/analytics'].get);
    assert.ok(paths['/api/v1/royalties/report'].get);
    assert.ok(paths['/api/v1/royalties/imports/{id}/replacement/csv'].post);
    assert.ok(paths['/api/v1/admin/royalties/imports/{id}/reconciliation'].get);
    assert.ok(paths['/api/v1/admin/royalties/imports/{id}/reconciliation'].post);
    assert.deepEqual(paths['/api/v1/royalties/imports/{id}'].get.parameters.map((parameter: { name: string }) => parameter.name),
      ['limit', 'offset']);
    assert.ok(paths['/api/v1/payouts/destination'].get);
    assert.ok(paths['/api/v1/payouts/destination'].put);
    assert.ok(paths['/api/v1/payouts'].get);
    assert.ok(paths['/api/v1/payouts'].post);
    assert.ok(paths['/api/v1/admin/finance/reconciliation/latest'].get);
    assert.ok(paths['/api/v1/admin/finance/reconciliation/runs'].get);
    const operations = Object.values(paths).flatMap(path => Object.values(path as Record<string, unknown>))
      .filter(value => value && typeof value === 'object' && 'operationId' in value);
    assert.equal(operations.filter(operation => String((operation as { operationId: string }).operationId)
      .match(/Royalty|Payout/)).length, 36);
  } finally { await app.close(); }
});

test('royalty detail route forwards validated pagination input to service', async () => {
  let captured: unknown[] = [];
  const app = buildApp({
    auth: { authenticate: async () => ({ id: '00000000-0000-4000-8000-000000000001', status: 'active', roles: ['admin'] }) },
    readiness: { check: async () => true }, admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) },
    royalties: { detail: async (...args: unknown[]) => { captured = args; return { id: args[1] }; } } as ApiDependencies['royalties'],
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/royalties/imports/00000000-0000-4000-8000-000000000002?limit=25&offset=50',
      headers: { authorization: 'Bearer admin' } });
    assert.equal(response.statusCode, 200);
    assert.equal(captured[1], '00000000-0000-4000-8000-000000000002');
    assert.deepEqual({ ...(captured[2] as Record<string, unknown>) }, { limit: '25', offset: '50' });
  } finally { await app.close(); }
});
