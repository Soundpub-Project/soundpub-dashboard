import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';
import { createComposerRoyaltiesService } from '../src/composer-royalties/index.js';

const statement = {
  source: 'synthetic', source_batch: 'batch-1', period: '2026-10', currency: 'IDR',
  rows: [{ composer_code: 'CMP001', composer_name: 'Composer One', total_net_royalti: '10.50' }],
};

function dependencies(): ApiDependencies {
  return {
    auth: { authenticate: async token => token === 'missing' ? null : {
      id: '00000000-0000-4000-8000-000000000001', status: 'active',
      roles: token === 'superadmin' ? ['superadmin'] : token === 'admin' ? ['admin'] : ['user'],
    } },
    readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    composerRoyalties: createComposerRoyaltiesService(),
  };
}

test('composer royalty preview permits DB-resolved admin roles and has no write dependencies', async () => {
  const deps = dependencies();
  const app = buildApp(deps);
  try {
    for (const token of ['admin', 'superadmin']) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/copyright/royalties/preview',
        headers: { authorization: `Bearer ${token}` }, payload: statement });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ...statement, total_amount: '10.50', status: 'UNRECONCILED',
        posting_allowed: false, blockers: ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED'] });
    }
    assert.equal('royalties' in deps, false);
    assert.equal('payments' in deps, false);
    assert.equal('asyncActions' in deps, false);
  } finally { await app.close(); }
});

test('composer royalty preview rejects anonymous, non-admin, and posting-shaped input', async () => {
  const app = buildApp(dependencies());
  try {
    const call = (token: string, payload: object = statement) => app.inject({ method: 'POST',
      url: '/api/v1/copyright/royalties/preview', headers: { authorization: `Bearer ${token}` }, payload });
    assert.equal((await call('missing')).statusCode, 401);
    assert.equal((await call('user')).statusCode, 403);
    assert.equal((await call('admin', { ...statement, post: true })).statusCode, 400);
  } finally { await app.close(); }
});

test('composer royalty preview OpenAPI exactly documents request and response', async () => {
  const app = buildApp(dependencies());
  try {
    const operation = (await app.inject('/openapi.json')).json().paths['/api/v1/copyright/royalties/preview'].post;
    assert.equal(operation.operationId, 'previewComposerRoyalties');
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    const request = operation.requestBody.content['application/json'].schema;
    assert.deepEqual(request.required, ['source', 'source_batch', 'period', 'currency', 'rows']);
    assert.equal(request.additionalProperties, false);
    assert.deepEqual(request.properties.currency.enum, ['IDR']);
    assert.equal(request.properties.rows.maxItems, 1000);
    assert.equal(request.properties.rows.items.additionalProperties, false);
    const response = operation.responses['200'].content['application/json'].schema;
    assert.deepEqual(response.required, ['source', 'source_batch', 'period', 'currency', 'rows', 'total_amount',
      'status', 'posting_allowed', 'blockers']);
    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.properties.status.enum, ['UNRECONCILED']);
    assert.deepEqual(response.properties.posting_allowed.enum, [false]);
    assert.deepEqual(response.properties.blockers.items.anyOf.map((item: { enum: string[] }) => item.enum[0]),
      ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED']);
    assert.deepEqual([response.properties.blockers.minItems, response.properties.blockers.maxItems], [2, 2]);
  } finally { await app.close(); }
});
