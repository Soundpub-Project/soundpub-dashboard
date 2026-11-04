import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

test('financial OpenAPI preserves every method sharing a path', async () => {
  const app = buildApp({
    auth: { authenticate: async () => null }, readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined }, webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    royalties: {} as ApiDependencies['royalties'], payouts: {} as ApiDependencies['payouts'],
  });
  try {
    const paths = (await app.inject('/openapi.json')).json().paths;
    assert.ok(paths['/api/v1/payouts/destination'].get);
    assert.ok(paths['/api/v1/payouts/destination'].put);
    assert.ok(paths['/api/v1/payouts'].get);
    assert.ok(paths['/api/v1/payouts'].post);
    const operations = Object.values(paths).flatMap(path => Object.values(path as Record<string, unknown>))
      .filter(value => value && typeof value === 'object' && 'operationId' in value);
    assert.equal(operations.filter(operation => String((operation as { operationId: string }).operationId)
      .match(/Royalty|Payout/)).length, 18);
  } finally { await app.close(); }
});
