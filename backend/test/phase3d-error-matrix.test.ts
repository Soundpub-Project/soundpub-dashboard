import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildApp, type ApiDependencies } from '../src/api/index.js';
import { createMediaObjectStore, createMediaService, validateUpload, type MediaObjectStore } from '../src/media/index.js';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { concurrencyPostgres, dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

test('Phase3D error matrix: real API, disposable PostgreSQL and RustFS', { timeout: 180_000, skip: !dockerTestsEnabled }, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const resource = testComposeResource('test-rustfs');
  t.after(() => resource.close());
  const port = Number(resource.start().split(':')[1]);
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  for (;;) {
    try { if ((await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* Retry bounded local startup. */ }
    assert.ok(Date.now() < deadline, 'RustFS readiness timeout');
    await setTimeout(200);
  }
  const credentials = { accessKeyId: 'synthetic-matrix', secretAccessKey: 'synthetic-matrix-secret' };
  const store = await createMediaObjectStore(database.runtime, { environment: 'test', endpoint, publicEndpoint: endpoint,
    credentials, bucket: 'synthetic-error-matrix', prefix: 'media' });
  t.after(() => store.close());
  const signer = new S3Client({ endpoint, region: 'us-east-1', credentials, forcePathStyle: true, maxAttempts: 1 });
  t.after(() => signer.destroy());
  const actorId = randomUUID();
  await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [actorId]);
  await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic matrix')", [actorId]);
  await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [actorId]);
  const adminId = randomUUID();
  await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [adminId]);
  await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'admin',now())", [adminId]);
  let crash = false;
  const controlledStore: MediaObjectStore = { ...store, verify: async row => {
    if (crash) throw new Error('synthetic-private-provider-secret');
    return store.verify(row);
  } };
  const deps: ApiDependencies = {
    auth: { authenticate: async token => token === 'invalid' ? null : {
      id: token === 'admin' ? adminId : actorId, roles: token === 'admin' ? ['admin'] : ['artist'], status: token === 'suspended' ? 'suspended' : 'active',
    } },
    readiness: { check: async () => true }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) },
    media: createMediaService(database.runtime, controlledStore),
    auditSettings: createAuditSettingsService(database.runtime),
  };
  const app = buildApp(deps);
  t.after(() => app.close());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const bytes = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.write('IHDR', 12);
  const input = { category: 'USER_AVATAR', resource_type: 'user', resource_id: actorId, mime_type: 'image/png',
    filename: 'synthetic.png', variant: 'default', visibility: 'PRIVATE',
    size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') };
  const headers = { authorization: 'Bearer synthetic', 'content-type': 'application/json' };
  const post = (path: string, body: unknown = {}) => fetch(`${address}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const state = async (id: string) => (await database.owner.query('SELECT status FROM soundpub.media_objects WHERE id=$1', [id])).rows[0].status;
  async function error(response: Response, status: number, code: string) {
    assert.equal(response.status, status);
    const body = await response.json() as { error: { code: string; message: string; requestId: string } };
    assert.equal(body.error.code, code);
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    assert.ok(body.error.requestId && body.error.message);
    assert.ok(!JSON.stringify(body).includes('synthetic-private-provider-secret'));
  }
  type Intent = { object: { id: string }; url: string; headers: Record<string, string> };
  async function intent() {
    const response = await post('/api/v1/storage/uploads', input);
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as Intent;
  }
  const complete = (value: Intent) => post(`/api/v1/storage/uploads/${value.object.id}/complete`);
  await t.test('400 validation, 401 authentication, 403 suspended, 404 missing', async () => {
    await error(await post('/api/v1/storage/uploads', { ...input, resource_id: 'invalid' }), 400, 'BAD_REQUEST');
    for (const authorization of ['', 'Bearer invalid']) await error(await fetch(`${address}/api/v1/storage/uploads`, {
      method: 'POST', headers: { ...headers, authorization }, body: JSON.stringify(input),
    }), 401, 'UNAUTHORIZED');
    await error(await fetch(`${address}/api/v1/storage/uploads`, { method: 'POST',
      headers: { ...headers, authorization: 'Bearer suspended' }, body: JSON.stringify(input) }), 403, 'FORBIDDEN');
    await error(await fetch(`${address}/api/v1/storage/objects/${randomUUID()}`, { headers }), 404, 'NOT_FOUND');
    assert.equal((await database.owner.query('SELECT count(*)::int AS n FROM soundpub.media_objects')).rows[0].n, 0);
  });
  await t.test('HTTP applies upload defaults and OpenAPI includes transport errors', async () => {
    const { variant: _variant, visibility: _visibility, ...omitted } = input;
    assert.equal(validateUpload(omitted).variant, 'default');
    assert.equal(validateUpload(omitted).visibility, 'PRIVATE');
    assert.equal((await post('/api/v1/storage/uploads', omitted)).status, 200);
    const spec = await (await fetch(`${address}/openapi.json`)).json() as {
      paths: Record<string, { post: { responses: Record<string, unknown> } }>;
    };
    const responses = spec.paths['/api/v1/storage/uploads']!.post.responses;
    assert.ok(responses['413']);
    assert.ok(responses['415']);
  });
  await t.test('413/415 transport versus 400 domain size/MIME classification', async () => {
    await error(await post('/api/v1/storage/uploads', { ...input, size: 5 * 1024 ** 2 + 1 }), 400, 'MEDIA_SIZE_LIMIT');
    await error(await post('/api/v1/storage/uploads', { ...input, mime_type: 'text/html' }), 400, 'MEDIA_MIME_INVALID');
    await error(await fetch(`${address}/api/v1/storage/uploads`, { method: 'POST',
      headers: { ...headers, 'content-type': 'application/octet-stream' }, body: bytes }), 415, 'BAD_REQUEST');
    const oversized = await app.inject({ method: 'POST', url: '/api/v1/storage/uploads', headers,
      payload: { ...input, filename: 'x'.repeat(1024 * 1024) } });
    assert.equal(oversized.statusCode, 413);
    assert.equal(oversized.json().error.code, 'BAD_REQUEST');
    assert.equal(oversized.json().error.requestId, oversized.headers['x-request-id']);
  });
  await t.test('409 missing bytes and expired intent; controlled 500 leaves pending/unbound', async () => {
    const value = await intent();
    await error(await complete(value), 409, 'MEDIA_BYTES_MISSING');
    crash = true;
    try { await error(await complete(value), 500, 'INTERNAL_ERROR'); } finally { crash = false; }
    assert.equal(await state(value.object.id), 'PENDING');
    assert.equal((await database.owner.query('SELECT avatar_media_id FROM soundpub.profiles WHERE id=$1', [actorId])).rows[0].avatar_media_id, null);
    await database.owner.query("UPDATE soundpub.media_objects SET expires_at=now()-interval '1 minute' WHERE id=$1", [value.object.id]);
    await error(await complete(value), 409, 'MEDIA_UPLOAD_EXPIRED');
  });
  await t.test('interrupted real PUT publishes no object; retry completes', async () => {
    const value = await intent();
    await new Promise<void>((resolve, reject) => {
      const put = request(value.url, { method: 'PUT', headers: { ...value.headers, 'content-length': bytes.length } });
      const timer = globalThis.setTimeout(() => { put.destroy(); reject(new Error('Interrupted PUT timeout')); }, 5000);
      put.on('error', err => { if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err); });
      put.on('close', () => { clearTimeout(timer); resolve(); });
      put.flushHeaders();
      put.write(bytes.subarray(0, 8), () => { globalThis.setTimeout(() => put.destroy(), 100); });
    });
    await assert.rejects(signer.send(new HeadObjectCommand({ Bucket: store.bucket, Key: `media/staging/${value.object.id}` })),
      (err: unknown) => (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);
    await error(await complete(value), 409, 'MEDIA_BYTES_MISSING');
    assert.equal(await state(value.object.id), 'PENDING');
    assert.ok((await fetch(value.url, { method: 'PUT', headers: value.headers, body: bytes })).ok);
    assert.equal((await complete(value)).status, 200);
    assert.equal(await state(value.object.id), 'ACTIVE');
    assert.equal((await complete(value)).status, 200, 'completion is idempotent');
    const response = await fetch(`${address}/api/v1/storage/objects/${value.object.id}/download`, { headers });
    assert.equal(response.status, 200);
    const capability = await response.json() as { url: string };
    for (let i = 0; i < 2; i++) assert.deepEqual(Buffer.from(await (await fetch(capability.url)).arrayBuffer()), bytes);
    const tampered = new URL(capability.url); tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    assert.equal((await fetch(tampered)).status, 403);
    const expired = await getSignedUrl(signer, new GetObjectCommand({ Bucket: store.bucket, Key: store.key(value.object.id) }),
      { expiresIn: 1, signingDate: new Date(Date.now() - 120_000) });
    assert.equal((await fetch(expired)).status, 403);
    assert.ok((await fetch(value.url, { method: 'PUT', headers: value.headers, body: bytes })).ok, 'staging capability reusable until expiry');
    assert.deepEqual(Buffer.from(await (await fetch(capability.url)).arrayBuffer()), bytes, 'replay cannot change active snapshot');
  });
  await t.test('branding upload, anonymous redirect, binding, replacement, and authorization', async () => {
    const adminHeaders = { ...headers, authorization: 'Bearer admin' };
    const key = 'dashboard_logo_dark';
    const url = `/api/v1/settings/public-media/${key}`;
    const publicGet = () => fetch(`${address}${url}`, { redirect: 'manual' });
    await error(await publicGet(), 404, 'NOT_FOUND');
    const body = { ...input, category: 'OTHER', resource_type: 'settings',
      resource_id: '00000000-0000-4000-8000-0000000003d0', variant: 'dark' };
    await error(await post('/api/v1/storage/uploads', body), 404, 'NOT_FOUND');
    const forge = await fetch(`${address}/api/v1/admin/settings`, { method: 'PATCH', headers: adminHeaders,
      body: JSON.stringify({ version: 1, settings: { dashboard_logo_dark: randomUUID() } }) });
    await error(forge, 409, 'MEDIA_REFERENCE_INVALID');
    let previous = '';
    for (let index = 0; index < 2; index++) {
      const result = await fetch(`${address}/api/v1/storage/uploads`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) });
      assert.equal(result.status, 200, await result.clone().text());
      const upload = await result.json() as Intent;
      assert.ok((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes })).ok);
      const completeResponse = await fetch(`${address}/api/v1/storage/uploads/${upload.object.id}/complete`, { method: 'POST', headers: adminHeaders, body: '{}' });
      assert.equal(completeResponse.status, 200, await completeResponse.clone().text());
      const publicResponse = await publicGet();
      assert.equal(publicResponse.status, 302);
      assert.deepEqual(Buffer.from(await (await fetch(publicResponse.headers.get('location')!)).arrayBuffer()), bytes);
      const publicSettings = await (await fetch(`${address}/api/v1/settings/public`)).json() as { settings: Record<string, string> };
      assert.equal(publicSettings.settings[key], upload.object.id);
      if (previous) assert.equal(await state(previous), 'REPLACED');
      previous = upload.object.id;
    }
    await error(await fetch(`${address}/api/v1/settings/public-media/private`), 400, 'BAD_REQUEST');
    await error(await fetch(`${address}/api/v1/storage/objects/${previous}/download`), 401, 'UNAUTHORIZED');
    const active = await database.runtime.query('SELECT status FROM soundpub.media_objects WHERE id=$1', [previous]);
    assert.equal(active.rows[0].status, 'ACTIVE');
  });
  await t.test('network failure is rejected fetch, never HTTP success/error envelope', async () => {
    await app.close();
    await assert.rejects(fetch(`${address}/api/v1/me`, { headers, signal: AbortSignal.timeout(3000) }), TypeError);
  });
});
