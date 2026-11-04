import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, buildApp, type ApiDependencies } from '../src/api/index.js';

test('API boundaries, safe failures, validation, raw webhook and OpenAPI', async () => {
  let ready = true;
  let denied = false;
  let crash = false;
  let suspended = 0;
  let raw = '';
  const deps: ApiDependencies = {
    auth: { authenticate: async token => {
      if (crash) throw new Error('secret database password');
      return token === 'invalid' ? null : { id: 'user-1', status: 'active', roles: token === 'admin' ? ['admin'] : ['user'] };
    } },
    readiness: { check: async () => ready },
    admin: { suspendUser: async input => { assert.equal(input.actor.id, 'user-1'); suspended++; } },
    webhooks: { receive: async input => { raw = input.body.toString(); return input.signature === 'valid'; } },
    rateLimiter: { consume: async () => ({ allowed: !denied, retryAfterSeconds: 3 }) },
  };
  const app = buildApp(deps);
  try {
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.equal((await app.inject('/ready')).statusCode, 200);
    ready = false;
    assert.equal((await app.inject('/ready')).statusCode, 503);
    const missing = await app.inject('/api/v1/me');
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.json().error.requestId, missing.headers['x-request-id']);
    const me = await app.inject({ url: '/api/v1/me', headers: { authorization: 'Bearer user', 'x-request-id': 'forged' } });
    assert.deepEqual(me.json(), { id: 'user-1', roles: ['user'] });
    assert.notEqual(me.headers['x-request-id'], 'forged');
    for (const origin of [
      'http://localhost:8181', 'http://127.0.0.1:8181',
      'http://localhost:8281', 'http://127.0.0.1:8281',
    ]) {
      const preflight = await app.inject({ method: 'OPTIONS', url: '/api/v1/me', headers: {
        origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization',
      } });
      assert.equal(preflight.statusCode, 204);
      assert.equal(preflight.headers['access-control-allow-origin'], origin);
      assert.match(String(preflight.headers['access-control-allow-headers']), /Authorization/);
      assert.match(String(preflight.headers['access-control-allow-headers']), /X-CSRF-Token/);
      assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
      const allowed = await app.inject({ url: '/api/v1/me', headers: { origin, authorization: 'Bearer user' } });
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.headers['access-control-allow-origin'], origin);
    }
    for (const method of ['OPTIONS', 'GET'] as const) {
      const rejected = await app.inject({ method, url: '/api/v1/me', headers: {
        origin: 'https://untrusted.example', authorization: 'Bearer user',
      } });
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.headers['access-control-allow-origin'], undefined);
      assert.equal(rejected.headers['access-control-allow-credentials'], undefined);
    }
    assert.equal((await app.inject({ url: '/api/v1/me', headers: { authorization: 'Bearer invalid' } })).statusCode, 401);
    const action = (token: string, body: unknown) => app.inject({ method: 'POST', url: '/api/v1/admin/users/00000000-0000-4000-8000-000000000099/suspend', headers: { authorization: `Bearer ${token}` }, payload: body as Record<string, unknown> });
    assert.equal((await action('user', { reason: 'abuse' })).statusCode, 403);
    assert.equal((await action('admin', { reason: ' ' })).statusCode, 400);
    assert.equal((await action('admin', { reason: 'abuse', extra: true })).statusCode, 400);
    assert.equal((await action('admin', { reason: 12 })).statusCode, 400);
    assert.equal((await action('admin', { reason: 'abuse' })).statusCode, 200);
    assert.equal(suspended, 1);
    const payload = '{ "event": "created" }\n';
    const webhook = (signature?: string) => app.inject({ method: 'POST', url: '/api/v1/webhooks/events', headers: { 'content-type': 'application/json', ...(signature ? { 'x-webhook-signature': signature } : {}) }, payload });
    assert.equal((await webhook()).statusCode, 401);
    assert.equal((await webhook('bad')).statusCode, 401);
    assert.equal((await webhook('valid')).statusCode, 200);
    assert.equal(raw, payload);
    denied = true;
    const throttled = await app.inject('/api/v1/me');
    assert.equal(throttled.statusCode, 429);
    assert.equal(throttled.headers['retry-after'], '3');
    assert.equal((await webhook('valid')).statusCode, 429);
    assert.equal((await app.inject('/health')).statusCode, 200);
    denied = false;
    crash = true;
    const failed = await app.inject({ url: '/api/v1/me', headers: { authorization: 'Bearer user' } });
    assert.equal(failed.statusCode, 500);
    assert.ok(!failed.body.includes('secret'));
    assert.equal(failed.json().error.code, 'INTERNAL_ERROR');
    assert.equal((await app.inject('/missing')).json().error.code, 'NOT_FOUND');
    const spec = (await app.inject('/openapi.json')).json();
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.paths['/api/v1/admin/users/{userId}/suspend'].post.security[0].bearerAuth.length, 0);
    assert.ok(spec.paths['/api/v1/webhooks/events'].post);
  } finally { await app.close(); }
});

test('OpenAPI documents storage fields, success bodies, idempotency and safe failures', async () => {
  const objectId = '00000000-0000-4000-8000-000000000099';
  let denied = false;
  let conflict = false;
  let crash = false;
  const deps: ApiDependencies = {
    auth: { authenticate: async () => ({ id: 'user-1', status: 'active', roles: ['user'] }) },
    readiness: { check: async () => true },
    admin: { suspendUser: async () => undefined },
    webhooks: { receive: async () => false },
    rateLimiter: { consume: async () => ({ allowed: !denied, retryAfterSeconds: 3 }) },
    storage: {
      upload: async () => ({ id: objectId }),
      signedUrl: async () => { throw new ApiError(404, 'NOT_FOUND'); },
      signedUploadUrl: async () => ({ metadata: { id: objectId }, url: 'http://127.0.0.1:9000/upload', method: 'PUT', headers: {} }),
      completeUpload: async () => ({ id: objectId }),
    },
    asyncActions: { enqueue: async () => {
      if (conflict) throw new ApiError(409, 'CONFLICT');
      if (crash) throw new Error('private provider failure');
      return 'event-1';
    } },
  };
  const app = buildApp(deps);
  try {
    const { paths } = (await app.inject('/openapi.json')).json();
    const inline = paths['/api/v1/storage/objects'].post.requestBody.content['application/json'].schema;
    assert.deepEqual(inline.required, ['dataBase64', 'mimeType', 'checksum']);
    assert.equal(inline.additionalProperties, false);
    assert.equal(inline.properties.dataBase64.minLength, 1);
    assert.equal(inline.properties.mimeType.maxLength, 255);
    assert.equal(inline.properties.checksum.pattern, '^[0-9a-f]{64}$');
    const signed = paths['/api/v1/storage/uploads'].post.requestBody.content['application/json'].schema;
    assert.deepEqual(signed.required, ['mimeType', 'size', 'checksum']);
    assert.equal(signed.additionalProperties, false);
    assert.deepEqual([signed.properties.size.type, signed.properties.size.minimum, signed.properties.size.maximum], ['integer', 1, 10485760]);
    const notification = paths['/api/v1/actions/notification'].post;
    const key = notification.parameters.find((parameter: { name: string }) => parameter.name === 'Idempotency-Key');
    assert.equal(key.in, 'header');
    assert.equal(key.required, true);
    assert.deepEqual([key.schema.minLength, key.schema.maxLength, key.schema.pattern], [8, 200, '^[A-Za-z0-9:_-]{8,200}$']);
    for (const [path, method, required] of [
      ['/api/v1/storage/objects', 'post', ['id']],
      ['/api/v1/storage/objects/{objectId}/url', 'get', ['url']],
      ['/api/v1/storage/uploads', 'post', ['metadata', 'url', 'method', 'headers']],
      ['/api/v1/storage/uploads/{objectId}/complete', 'post', ['id']],
      ['/api/v1/actions/notification', 'post', ['eventId', 'status']],
    ] as const) {
      const operation = paths[path][method];
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      const success = operation.responses['200'].content['application/json'].schema;
      assert.deepEqual(success.required, required);
      for (const field of required) assert.ok(success.properties[field].type);
      for (const status of [404, 409, 429, 500]) {
        const error = operation.responses[status].content['application/json'].schema;
        assert.deepEqual(error.properties.error.required, ['code', 'message', 'requestId']);
      }
      assert.equal(operation.responses['429'].headers['Retry-After'].schema.minimum, 1);
      if (path.includes('{objectId}')) assert.equal(operation.parameters[0].schema.pattern, '^[0-9a-f-]{36}$');
    }
    const uploadSuccess = paths['/api/v1/storage/uploads'].post.responses['200'].content['application/json'].schema;
    assert.deepEqual(uploadSuccess.properties.metadata.required, ['id']);
    assert.deepEqual(uploadSuccess.properties.method.enum, ['PUT']);
    assert.equal(uploadSuccess.properties.headers.additionalProperties.type, 'string');
    assert.deepEqual(notification.responses['200'].content['application/json'].schema.properties.status.enum, ['queued']);

    const headers = { authorization: 'Bearer user', 'idempotency-key': 'notification-1' };
    const queue = () => app.inject({ method: 'POST', url: '/api/v1/actions/notification', headers });
    assert.deepEqual((await queue()).json(), { eventId: 'event-1', status: 'queued' });
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/actions/notification', headers: { authorization: headers.authorization } })).statusCode, 400);
    assert.equal((await app.inject({ url: `/api/v1/storage/objects/${objectId}/url`, headers })).statusCode, 404);
    conflict = true;
    assert.equal((await queue()).statusCode, 409);
    conflict = false;
    crash = true;
    const failed = await queue();
    assert.equal(failed.statusCode, 500);
    assert.ok(!failed.body.includes('private provider failure'));
    denied = true;
    const throttled = await queue();
    assert.equal(throttled.statusCode, 429);
    assert.equal(throttled.headers['retry-after'], '3');
  } finally { await app.close(); }

  const { storage, asyncActions, ...base } = deps;
  for (const optionalStorage of [undefined, { upload: storage!.upload, signedUrl: storage!.signedUrl },
    { upload: storage!.upload, signedUrl: storage!.signedUrl, signedUploadUrl: storage!.signedUploadUrl! },
    { upload: storage!.upload, signedUrl: storage!.signedUrl, completeUpload: storage!.completeUpload! }]) {
    const partial = buildApp({ ...base, ...(optionalStorage ? { storage: optionalStorage } : {}) });
    try {
      const paths = (await partial.inject('/openapi.json')).json().paths;
      assert.equal(Boolean(paths['/api/v1/storage/objects']), Boolean(optionalStorage));
      for (const [path, url] of [
        ['/api/v1/storage/uploads', '/api/v1/storage/uploads'],
        ['/api/v1/storage/uploads/{objectId}/complete', '/api/v1/storage/uploads/:objectId/complete'],
      ]) {
        assert.equal(paths[path!], undefined);
        assert.equal(partial.hasRoute({ method: 'POST', url: url! }), false);
      }
      assert.equal(paths['/api/v1/actions/notification'], undefined);
    } finally { await partial.close(); }
  }
});


