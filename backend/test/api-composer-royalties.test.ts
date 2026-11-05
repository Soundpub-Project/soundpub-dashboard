import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { buildApp, type ApiDependencies } from '../src/api/index.js';
import { createComposerRoyaltiesService } from '../src/composer-royalties/index.js';

const statement = {
  source: 'synthetic', source_batch: 'batch-1', period: '2026-10', currency: 'IDR',
  rows: [{ composer_code: 'CMP001', composer_name: 'Composer One', total_net_royalti: '10.50' }],
};

function fakePool(): Pool {
  const client = { async query(sql: string) {
    if (sql.includes('FROM soundpub.backend_users')) return { rows: [{ id: '00000000-0000-4000-8000-000000000001', status: 'active' }], rowCount: 1 };
    if (sql.includes('FROM soundpub.user_roles')) return { rows: [{ user_id: '00000000-0000-4000-8000-000000000001', role: 'admin' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release() {} };
  return { connect: async () => client } as unknown as Pool;
}

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
    composerRoyalties: createComposerRoyaltiesService(fakePool()),
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
      assert.deepEqual(response.json(), { ...statement, rows: [{ ...statement.rows[0], beneficiary_id: null,
        canonical_name: null, mapping_id: null, status: 'UNMATCHED' }], total_amount: '10.50',
        checksum: response.json().checksum, status: 'UNRECONCILED',
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
      'checksum', 'status', 'posting_allowed', 'blockers']);
    assert.equal(response.additionalProperties, false);
    assert.deepEqual(response.properties.status.enum, ['UNRECONCILED']);
    assert.deepEqual(response.properties.posting_allowed.enum, [false]);
    assert.deepEqual(response.properties.blockers.items.enum,
      ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED']);
    assert.deepEqual([response.properties.blockers.minItems, response.properties.blockers.maxItems], [1, 2]);
    const paths = (await app.inject('/openapi.json')).json().paths;
    assert.equal(paths['/api/v1/admin/copyright/beneficiary-mappings'].post.operationId, 'createCopyrightBeneficiaryMapping');
    assert.equal(paths['/api/v1/admin/copyright/beneficiary-mappings'].get.operationId, 'listCopyrightBeneficiaryMappings');
    assert.equal(paths['/api/v1/admin/copyright/beneficiary-mappings/{id}/revoke'].post.operationId, 'revokeCopyrightBeneficiaryMapping');
  } finally { await app.close(); }
});

test('mapping APIs pass authenticated actor separately and reject client actor fields', async () => {
  const deps = dependencies();
  const calls: string[] = [];
  const dto = { id: '00000000-0000-4000-8000-000000000003', composer_code: 'CMP001',
    owner_id: '00000000-0000-4000-8000-000000000002', canonical_name: 'Composer One', valid_from: '2026-01',
    valid_through: null, created_by: '00000000-0000-4000-8000-000000000001', created_at: '2026-01-01T00:00:00.000000Z',
    revoked: false, revoked_by: null, revocation_reason: null, revoked_at: null };
  deps.composerRoyalties = {
    preview: async () => ({}),
    createMapping: async (actor, input) => { calls.push(`${actor.id}:create`); return { ...dto, ...(input as object) }; },
    listMappings: async actor => { calls.push(`${actor.id}:list`); return { items: [dto], next_offset: null }; },
    revokeMapping: async (actor, id) => { calls.push(`${actor.id}:revoke:${id}`); return { ...dto, revoked: true,
      revoked_by: actor.id, revocation_reason: 'retired', revoked_at: '2026-11-05T00:00:00.000000Z' }; },
  };
  const app = buildApp(deps);
  const headers = { authorization: 'Bearer admin' };
  try {
    const body = { composer_code: 'CMP001', owner_id: dto.owner_id, canonical_name: 'Composer One', valid_from: '2026-01' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/copyright/beneficiary-mappings', headers, payload: body })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/admin/copyright/beneficiary-mappings?limit=10', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/copyright/beneficiary-mappings/${dto.id}/revoke`, headers,
      payload: { reason: 'retired' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/copyright/beneficiary-mappings', headers,
      payload: { ...body, created_by: dto.created_by } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/copyright/beneficiary-mappings/${dto.id}/revoke`, headers,
      payload: { reason: 'retired', actor_id: dto.created_by } })).statusCode, 400);
    assert.deepEqual(calls, [`${dto.created_by}:create`, `${dto.created_by}:list`, `${dto.created_by}:revoke:${dto.id}`]);
  } finally { await app.close(); }
});
