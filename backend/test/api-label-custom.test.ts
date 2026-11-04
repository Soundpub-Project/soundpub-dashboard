import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, buildApp, type ApiDependencies, type Principal } from '../src/api/index.js';
import type { LabelCustomService, LabelCustomUnitDto, CustomManagedArtistDto } from '../src/label-custom/index.js';

const ownerId = '00000000-0000-4000-8000-000000000001';
const otherOwnerId = '00000000-0000-4000-8000-000000000002';
const unitId = '00000000-0000-4000-8000-000000000003';
const artistId = '00000000-0000-4000-8000-000000000004';
const timestamp = '2026-11-03T00:00:00.000000Z';
const unit: LabelCustomUnitDto = { id: unitId, owner_user_id: ownerId, unit_code: 'LC-TEST', name: 'Unit',
  status: 'active', created_at: timestamp, updated_at: timestamp };
const artist: CustomManagedArtistDto = { id: artistId, label_id: ownerId, artist_user_id: null,
  label_custom_unit_id: unitId, management_mode: 'LABEL_CUSTOM_MANAGED', name: 'Artist',
  contact_email: 'artist@example.test', contact_phone: '123', status: 'active', verified_at: timestamp,
  created_at: timestamp, updated_at: timestamp };
const artistInput = { name: 'Artist', contact_email: 'artist@example.test', contact_phone: '123' };
const unitUrl = '/api/v1/label-custom/unit';
const artistsUrl = '/api/v1/label-custom/artists';
const cases = [
  { method: 'GET', url: unitUrl, operation: 'getUnit', input: [], result: unit },
  { method: 'POST', url: unitUrl, operation: 'createUnit', payload: { name: 'Unit' }, input: [{ name: 'Unit' }], write: true, result: unit },
  { method: 'PATCH', url: unitUrl, operation: 'updateUnit', payload: { status: 'archived' }, input: [{ status: 'archived' }], write: true, result: { ...unit, status: 'archived' } },
  { method: 'GET', url: artistsUrl, operation: 'listArtists', input: [{}], result: { items: [artist], nextCursor: 'next-page' } },
  { method: 'POST', url: artistsUrl, operation: 'createArtist', payload: artistInput, input: [artistInput], write: true, result: artist },
  { method: 'GET', url: `${artistsUrl}/${artistId}`, operation: 'getArtist', input: [artistId], result: artist },
  { method: 'PATCH', url: `${artistsUrl}/${artistId}`, operation: 'updateArtist', payload: { name: 'Renamed' }, input: [artistId, { name: 'Renamed' }], write: true, result: { ...artist, name: 'Renamed' } },
  { method: 'DELETE', url: `${artistsUrl}/${artistId}`, operation: 'archiveArtist', input: [artistId], write: true, result: { ...artist, status: 'archived', verified_at: null } },
] as const;

function setup(enabled = true) {
  const calls: { method: string; args: unknown[] }[] = [];
  let failure: Error | undefined;
  const record = <T>(method: string, result: T) => async (...args: unknown[]): Promise<T> => {
    calls.push({ method, args });
    if (failure) throw failure;
    return result;
  };
  const labelCustom: LabelCustomService = {
    getUnit: record('getUnit', unit), createUnit: record('createUnit', unit),
    updateUnit: record('updateUnit', { ...unit, status: 'archived' }),
    listArtists: record('listArtists', { items: [artist], nextCursor: 'next-page' }),
    getArtist: record('getArtist', artist), createArtist: record('createArtist', artist),
    updateArtist: record('updateArtist', { ...artist, name: 'Renamed' }),
    archiveArtist: record('archiveArtist', { ...artist, status: 'archived', verified_at: null }),
  };
  const principals: Record<string, Principal> = {};
  for (const role of ['label_custom', 'admin', 'superadmin', 'user', 'artist', 'label', 'copyright', 'whitelabel'] as const) {
    principals[role] = { id: role === 'label_custom' ? ownerId : otherOwnerId, roles: [role], status: 'active' };
  }
  for (const status of ['inactive', 'suspended'] as const) {
    principals[status] = { id: ownerId, roles: ['label_custom'], status };
  }
  principals.roleless = { id: ownerId, roles: [], status: 'active' };
  const deps: ApiDependencies = {
    ...(enabled ? { labelCustom } : {}),
    auth: { authenticate: async token => principals[token] ?? null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false },
  };
  const app = buildApp(deps);
  const request = (entry: typeof cases[number], token: string | null = 'label_custom', query = '') => app.inject({
    method: entry.method, url: entry.url + query,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    ...('payload' in entry ? { payload: entry.payload } : {}),
  });
  return { app, calls, principals, request, fail: (error: Error) => { failure = error; } };
}

function assertError(response: { statusCode: number; headers: Record<string, unknown>; json(): unknown }, status: number, code: string) {
  assert.equal(response.statusCode, status);
  const body = response.json() as { error: { code: string; message: string; requestId: string } };
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(body.error.code, code);
  assert.ok(body.error.message);
  assert.equal(body.error.requestId, response.headers['x-request-id']);
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
}

test('label-custom API rejects missing/invalid authentication, inactive principals and unrelated roles on every route', async t => {
  const f = setup();
  t.after(() => f.app.close());
  for (const entry of cases) {
    for (const token of [null, 'invalid']) assertError(await f.request(entry, token), 401, 'UNAUTHORIZED');
    for (const token of ['inactive', 'suspended', 'roleless', 'user', 'artist', 'label', 'copyright', 'whitelabel']) {
      assertError(await f.request(entry, token), 403, 'FORBIDDEN');
    }
  }
  assert.equal(f.calls.length, 0);
});

test('label-custom API delegates all CRUD operations with actor, payload, request ID and separate owner scope', async t => {
  const f = setup();
  t.after(() => f.app.close());
  for (const token of ['label_custom', 'admin', 'superadmin']) {
    for (const query of token === 'label_custom' ? ['', `?owner_user_id=${ownerId}`] : [`?owner_user_id=${ownerId}`]) {
      for (const entry of cases) {
        const response = await f.request(entry, token, query);
        assert.equal(response.statusCode, 200, response.body);
        assert.deepEqual(response.json(), entry.result);
        assert.deepEqual(f.calls.at(-1), { method: entry.operation, args: [
          f.principals[token], ...entry.input,
          ...('write' in entry ? [response.headers['x-request-id']] : []),
          ...(query ? [{ owner_user_id: ownerId }] : [{}]),
        ] });
      }
    }
  }
});

test('label-custom API rejects foreign owner scopes and requires explicit admin owner before delegation', async t => {
  const f = setup();
  t.after(() => f.app.close());
  for (const entry of cases) {
    assertError(await f.request(entry, 'label_custom', `?owner_user_id=${otherOwnerId}`), 403, 'FORBIDDEN');
    for (const token of ['admin', 'superadmin']) assertError(await f.request(entry, token), 400, 'BAD_REQUEST');
    for (const query of ['?owner_user_id=bad', '?owner_user_id=', `?owner_user_id=${ownerId}&owner_user_id=${otherOwnerId}`,
      `?owner_user_id=${ownerId}&tenantId=${otherOwnerId}`, '?unit_id=forged']) {
      assertError(await f.request(entry, 'admin', query), 400, 'BAD_REQUEST');
    }
  }
  assert.equal(f.calls.length, 0);
});

test('label-custom artist list separates pagination/filter query from owner scope', async t => {
  const f = setup();
  t.after(() => f.app.close());
  const response = await f.request(cases[3], 'admin',
    `?owner_user_id=${ownerId}&limit=2&cursor=opaque-cursor&search=%20Artist%20&status=archived`);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(f.calls, [{ method: 'listArtists', args: [f.principals.admin,
    { limit: '2', cursor: 'opaque-cursor', search: 'Artist', status: 'archived' }, { owner_user_id: ownerId }] }]);
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=01', 'limit=2&limit=3', 'cursor=',
    'search=%20', 'status=deleted', 'ownerId=forged']) {
    assertError(await f.request(cases[3], 'label_custom', `?${query}`), 400, 'BAD_REQUEST');
  }
  assert.equal(f.calls.length, 1);
});

test('label-custom API enforces strict contract bodies, nonempty patches, trimmed values and UUID paths', async t => {
  const f = setup();
  t.after(() => f.app.close());
  const headers = { authorization: 'Bearer label_custom' };
  for (const [method, url, payload] of [
    ['POST', unitUrl, {}], ['POST', unitUrl, { name: ' ' }], ['POST', unitUrl, { name: 'x'.repeat(201) }],
    ['POST', unitUrl, { name: 'Unit', owner_user_id: otherOwnerId }],
    ['POST', unitUrl, { name: 'Unit', unit_code: 'FORGED' }],
    ['PATCH', unitUrl, {}], ['PATCH', unitUrl, { status: 'inactive' }],
    ['POST', artistsUrl, { name: 'Artist' }], ['POST', artistsUrl, { ...artistInput, contact_email: 'bad' }],
    ['POST', artistsUrl, { ...artistInput, contact_phone: ' ' }],
    ['PATCH', `${artistsUrl}/${artistId}`, {}], ['PATCH', `${artistsUrl}/${artistId}`, { name: null }],
  ] as const) {
    assertError(await f.app.inject({ method, url, headers, payload }), 400, 'BAD_REQUEST');
  }
  for (const field of ['id', 'label_id', 'label_custom_unit_id', 'owner_user_id', 'artist_user_id',
    'management_mode', 'status', 'verified_at', 'roles', 'password', 'email', 'balance']) {
    for (const method of ['POST', 'PATCH'] as const) {
      assertError(await f.app.inject({ method, url: method === 'POST' ? artistsUrl : `${artistsUrl}/${artistId}`,
        headers, payload: { ...(method === 'POST' ? artistInput : { name: 'Renamed' }), [field]: otherOwnerId } }), 400, 'BAD_REQUEST');
    }
  }
  for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
    assertError(await f.app.inject({ method, url: `${artistsUrl}/invalid`, headers,
      ...(method === 'PATCH' ? { payload: { name: 'Renamed' } } : {}) }), 400, 'BAD_REQUEST');
  }
  assert.equal(f.calls.length, 0);
  assertError(await f.app.inject({ method: 'POST', url: artistsUrl,
    headers: { ...headers, 'idempotency-key': 'short' }, payload: artistInput }), 400, 'BAD_REQUEST');
  assert.equal(f.calls.length, 0);
  const response = await f.app.inject({ method: 'POST', url: artistsUrl, headers: { ...headers, 'idempotency-key': 'artist-create-test' },
    payload: { name: ' Artist ', contact_email: ' artist@example.test ', contact_phone: ' 123 ' } });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(f.calls[0]?.args[1], artistInput);
  assert.equal(f.calls[0]?.args[2], 'artist-create-test');
});

test('label-custom API preserves domain errors and sanitizes unexpected failures', async t => {
  const f = setup();
  t.after(() => f.app.close());
  for (const [status, code] of [[400, 'BAD_REQUEST'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [503, 'NOT_READY']] as const) {
    f.fail(new ApiError(status, code));
    for (const entry of cases) assertError(await f.request(entry), status, code);
  }
  f.fail(new Error('private database detail'));
  const response = await f.request(cases[0]);
  assertError(response, 500, 'INTERNAL_ERROR');
  assert.ok(!response.body.includes('private database detail'));
});

test('label-custom OpenAPI documents all methods, strict schemas, owner query, archive DTO and error envelopes', async t => {
  const f = setup();
  t.after(() => f.app.close());
  const response = await f.app.inject('/openapi.json');
  assert.equal(response.statusCode, 200);
  const paths = response.json().paths;
  assert.deepEqual(Object.keys(paths[unitUrl]).sort(), ['get', 'patch', 'post']);
  assert.deepEqual(Object.keys(paths[artistsUrl]).sort(), ['get', 'post']);
  assert.deepEqual(Object.keys(paths[`${artistsUrl}/{id}`]).sort(), ['delete', 'get', 'patch']);
  const operationIds = new Set<string>();
  for (const entry of cases) {
    const path = entry.url.replace(artistId, '{id}');
    const operation = paths[path][entry.method.toLowerCase()];
    assert.ok(!operationIds.has(operation.operationId));
    operationIds.add(operation.operationId);
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    const owner = operation.parameters.find((parameter: { name: string }) => parameter.name === 'owner_user_id');
    assert.equal(owner.in, 'query');
    assert.equal(owner.required, false);
    assert.equal(owner.schema.format, 'uuid');
    assert.match(owner.description, /admin\/superadmin/);
    for (const status of [400, 401, 403, 404, 409, 413, 415, 429, 500, 503]) {
      const error = operation.responses[status].content['application/json'].schema;
      assert.equal(error.additionalProperties, false);
      assert.deepEqual(error.properties.error.required, ['code', 'message', 'requestId']);
    }
    if ('payload' in entry) {
      assert.equal(operation.requestBody.required, true);
      const body = operation.requestBody.content['application/json'].schema;
      assert.equal(body.additionalProperties, false);
      assert.ok(!body.properties.owner_user_id);
      if (entry.method === 'PATCH') assert.equal(body.minProperties, 1);
    }
    if (path.includes('{id}')) {
      const id = operation.parameters.find((parameter: { name: string }) => parameter.name === 'id');
      assert.equal(id.in, 'path');
      assert.equal(id.required, true);
      assert.equal(id.schema.format, 'uuid');
    }
  }
  const list = paths[artistsUrl].get;
  assert.deepEqual(list.parameters.map((parameter: { name: string }) => parameter.name).sort(),
    ['cursor', 'limit', 'owner_user_id', 'search', 'status']);
  const page = list.responses[200].content['application/json'].schema;
  assert.equal(page.additionalProperties, false);
  assert.deepEqual(page.required, ['items', 'nextCursor']);
  const archive = paths[`${artistsUrl}/{id}`].delete;
  assert.match(archive.description, /Archive/);
  const dto = archive.responses[200].content['application/json'].schema;
  assert.equal(dto.additionalProperties, false);
  assert.deepEqual(dto.properties.status.enum, ['active', 'archived']);
  assert.equal(dto.properties.artist_user_id.nullable, true);
  assert.ok(dto.required.includes('label_custom_unit_id'));
});

test('label-custom routes and OpenAPI stay absent when optional service is not configured', async t => {
  const f = setup(false);
  t.after(() => f.app.close());
  assertError(await f.request(cases[0]), 404, 'NOT_FOUND');
  const paths = (await f.app.inject('/openapi.json')).json().paths;
  assert.ok(!Object.keys(paths).some(path => path.startsWith('/api/v1/label-custom')));
});
