import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

const data = Buffer.from('synthetic-object');
const objectId = '00000000-0000-4000-8000-000000000099';

test('synthetic storage and async slices enforce auth, validate input and document routes', async () => {
  let uploads = 0;
  let enqueueCount = 0;
  const deps: ApiDependencies = {
    auth: { authenticate: async token => token === 'owner' ? { id: 'owner', status: 'active', roles: ['user'] } : null },
    readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: true }) },
    storage: {
      upload: async (actor, input) => { assert.equal(actor.id, 'owner'); assert.deepEqual(input.data, data); uploads++; return { id: objectId }; },
      signedUrl: async actor => { assert.equal(actor.id, 'owner'); return 'http://127.0.0.1:9000/signed'; },
      signedUploadUrl: async actor => { assert.equal(actor.id, 'owner'); return { metadata: { id: objectId }, url: 'http://127.0.0.1:9000/upload', method: 'PUT', headers: {} }; },
      completeUpload: async (actor, id) => { assert.equal(actor.id, 'owner'); return { id }; },
    },
    asyncActions: { enqueue: async (actor, key) => { assert.equal(actor.id, 'owner'); assert.equal(key, 'unique-key-00001'); enqueueCount++; return 'event-id'; } },
  };
  const app = buildApp(deps);
  try {
    const payload = { mimeType: 'text/plain', dataBase64: data.toString('base64'), checksum: createHash('sha256').update(data).digest('hex') };
    const upload = (token: string, body: unknown) => app.inject({ url: '/api/v1/storage/objects', method: 'POST', headers: { authorization: `Bearer ${token}` }, payload: body as object });
    assert.equal((await upload('bad', payload)).statusCode, 401);
    assert.equal((await upload('owner', { ...payload, ownerId: 'forged' })).statusCode, 400);
    assert.equal((await upload('owner', { ...payload, dataBase64: '???' })).statusCode, 400);
    assert.equal((await upload('owner', payload)).json().id, objectId);
    assert.equal(uploads, 1);
    assert.equal((await app.inject({ url: `/api/v1/storage/objects/${objectId}/url` })).statusCode, 401);
    assert.equal((await app.inject({ url: `/api/v1/storage/objects/${objectId}/url`, headers: { authorization: 'Bearer owner' } })).statusCode, 200);
    const intent = await app.inject({ url: '/api/v1/storage/uploads', method: 'POST', headers: { authorization: 'Bearer owner' }, payload: { mimeType: 'text/plain', size: data.length, checksum: payload.checksum } });
    assert.equal(intent.statusCode, 200);
    assert.equal((await app.inject({ url: `/api/v1/storage/uploads/${objectId}/complete`, method: 'POST', headers: { authorization: 'Bearer owner' } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/actions/notification', method: 'POST', headers: { authorization: 'Bearer owner', 'idempotency-key': 'short' } })).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/v1/actions/notification', method: 'POST', headers: { authorization: 'Bearer owner', 'idempotency-key': 'unique-key-00001' } })).json().eventId, 'event-id');
    assert.equal(enqueueCount, 1);
    const paths = (await app.inject('/openapi.json')).json().paths;
    for (const path of ['/api/v1/storage/objects', '/api/v1/storage/uploads', '/api/v1/storage/uploads/{objectId}/complete', '/api/v1/storage/objects/{objectId}/url', '/api/v1/actions/notification']) assert.ok(paths[path]);
  } finally { await app.close(); }
});

