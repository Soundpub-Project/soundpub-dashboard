import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Fastify from 'fastify';
import { ApiError } from '../src/api/types.js';
import { registerMediaRoutes } from '../src/api/media.js';
import type { Principal } from '../src/auth/index.js';
import { postEvent } from '../src/finance/index.js';
import { createMediaObjectStore, createMediaService, type MediaObjectStore } from '../src/media/index.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { concurrencyPostgres, dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

test('payout settlement proof stays private through disposable PostgreSQL and RustFS', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const accessKeyId = `synthetic${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const secretAccessKey = randomUUID();
  const resource = testComposeResource('test-rustfs', { RUSTFS_ACCESS_KEY: accessKeyId, RUSTFS_SECRET_KEY: secretAccessKey });
  t.after(() => resource.close());
  const port = Number(resource.start().split(':')[1]);
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  for (;;) {
    try { if ((await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; }
    catch { /* Disposable RustFS may still be starting. */ }
    if (Date.now() > deadline) throw new Error('Disposable RustFS readiness timeout');
    await delay(200);
  }
  let store: MediaObjectStore | undefined;
  const app = Fastify();
  try {
    store = await createMediaObjectStore(database.runtime, { environment: 'test', endpoint, publicEndpoint: endpoint,
      credentials: { accessKeyId, secretAccessKey }, bucket: 'soundpub-synthetic-payout-proof', prefix: 'media' });
    const pic: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
    const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };
    const stranger: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
    for (const [actor, name] of [[pic, 'Synthetic PIC'], [admin, 'Synthetic admin'], [stranger, 'Synthetic stranger']] as const) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [actor.id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES($1,$2)', [actor.id, name]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [actor.id, actor.roles[0]]);
    }
    const client = await database.runtime.connect();
    try {
      await client.query('BEGIN');
      await postEvent(client, { ownerId: pic.id, kind: 'ROYALTY_EARNING', amount: '100.00',
        businessReference: `synthetic-royalty:${pic.id}`, idempotencyKey: `synthetic-royalty:${pic.id}`,
        systemActor: 'payout-proof-live-test' });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const payouts = createPayoutsService(database.runtime, createPgPayoutFinance(async () => ({
      minimum: '50.00', destinationReady: true, reconciled: true,
    })));
    const payout = await payouts.request(pic, { amount: '60.00', currency: 'IDR', bank_name: 'Synthetic Bank',
      account_number: '12345678', account_holder_name: 'Synthetic PIC' }, `request:${pic.id}`);
    await payouts.transition(admin, payout.id, { status: 'approved' }, `approve:${payout.id}`);
    const media = createMediaService(database.runtime, store);
    app.setErrorHandler((error, _request, reply) => reply.code(error instanceof ApiError ? error.statusCode
      : (error as { statusCode?: number }).statusCode ?? 500).send({ code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR' }));
    registerMediaRoutes(app, media, async request => {
      if (request.headers.authorization === 'Bearer admin') return admin;
      if (request.headers.authorization === 'Bearer pic') return pic;
      if (request.headers.authorization === 'Bearer stranger') return stranger;
      throw new ApiError(401, 'UNAUTHORIZED');
    });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const headers = { authorization: 'Bearer admin', 'content-type': 'application/json' };
    const proof = Buffer.from('%PDF-1.7\nSynthetic RustFS payout evidence\n');
    const uploadInput = { category: 'PAYOUT_PROOF', resource_type: 'payout', resource_id: payout.id,
      filename: 'synthetic-transfer.pdf', mime_type: 'application/pdf', size: proof.length,
      checksum: createHash('sha256').update(proof).digest('hex'), visibility: 'PRIVATE' };
    const intentResponse = await fetch(`${address}/api/v1/storage/uploads`, { method: 'POST', headers, body: JSON.stringify(uploadInput) });
    assert.equal(intentResponse.status, 200, await intentResponse.clone().text());
    const intent = await intentResponse.json() as { object: { id: string; status: string; visibility: string }; url: string; headers: Record<string, string> };
    assert.deepEqual({ status: intent.object.status, visibility: intent.object.visibility }, { status: 'PENDING', visibility: 'PRIVATE' });
    assert.equal((await fetch(`${address}/api/v1/storage/uploads`, {
      method: 'POST', headers: { ...headers, authorization: 'Bearer pic' }, body: JSON.stringify(uploadInput),
    })).status, 404, 'PIC cannot upload settlement evidence');
    assert.equal((await fetch(`${address}/api/v1/storage/uploads`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(uploadInput),
    })).status, 401, 'Anonymous upload must fail');
    const forgedPdf = Buffer.from('NOT-A-PDF but a syntactically valid file');
    const forgedIntentResponse = await fetch(`${address}/api/v1/storage/uploads`, { method: 'POST', headers, body: JSON.stringify({
      ...uploadInput, filename: 'forged.pdf', size: forgedPdf.length, checksum: createHash('sha256').update(forgedPdf).digest('hex'),
    }) });
    assert.equal(forgedIntentResponse.status, 200);
    const forgedIntent = await forgedIntentResponse.json() as { object: { id: string }; url: string; headers: Record<string, string> };
    assert.ok((await fetch(forgedIntent.url, { method: 'PUT', headers: forgedIntent.headers, body: forgedPdf })).ok);
    const forgedFinalize = await fetch(`${address}/api/v1/storage/uploads/${forgedIntent.object.id}/complete`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(forgedFinalize.status, 400, await forgedFinalize.clone().text());
    assert.equal((await database.owner.query('SELECT status FROM soundpub.media_objects WHERE id=$1',
      [forgedIntent.object.id])).rows[0].status, 'FAILED');
    const uploaded = await fetch(intent.url, { method: 'PUT', headers: intent.headers, body: proof });
    assert.ok(uploaded.ok, await uploaded.text());
    const finalizedResponse = await fetch(`${address}/api/v1/storage/uploads/${intent.object.id}/complete`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(finalizedResponse.status, 200, await finalizedResponse.clone().text());
    assert.equal((await finalizedResponse.json() as { status: string }).status, 'ACTIVE');

    await payouts.settle(admin, payout.id, { proof_media_id: intent.object.id, evidence: 'Synthetic transfer verified' }, `settle:${payout.id}`);
    assert.deepEqual((await database.owner.query(`SELECT media.status,media.visibility,media.resource_type,media.resource_id,
      media.owner_user_id,proof.uploaded_by FROM soundpub.payout_settlement_proofs proof
      JOIN soundpub.media_objects media ON media.id=proof.media_object_id WHERE proof.payout_id=$1`, [payout.id])).rows,
      [{ status: 'ACTIVE', visibility: 'PRIVATE', resource_type: 'payout', resource_id: payout.id,
        owner_user_id: admin.id, uploaded_by: admin.id }]);
    assert.equal((await database.owner.query('SELECT status FROM soundpub.payout_requests WHERE id=$1', [payout.id])).rows[0].status, 'paid');

    assert.equal((await fetch(`${address}/api/v1/storage/objects/${intent.object.id}/download`, {
      headers: { authorization: 'Bearer stranger' },
    })).status, 404);
    const picCapability = await fetch(`${address}/api/v1/storage/objects/${intent.object.id}/download`, {
      headers: { authorization: 'Bearer pic' },
    });
    assert.equal(picCapability.status, 200, await picCapability.clone().text());
    assert.deepEqual(Buffer.from(await (await fetch((await picCapability.json() as { url: string }).url)).arrayBuffer()), proof);
    assert.equal((await fetch(`${address}/api/v1/storage/objects/${intent.object.id}`, {
      method: 'DELETE', headers: { authorization: 'Bearer admin' },
    })).status, 409, 'Settled payout proof cannot be removed');
    const capabilityResponse = await fetch(`${address}/api/v1/storage/objects/${intent.object.id}/download`, { headers });
    assert.equal(capabilityResponse.status, 200, await capabilityResponse.clone().text());
    const capability = await capabilityResponse.json() as { url: string };
    const downloaded = await fetch(capability.url);
    assert.ok(downloaded.ok);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), proof);
    const tampered = new URL(capability.url);
    tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    assert.equal((await fetch(tampered)).status, 403);
    const signer = new S3Client({ endpoint, region: 'us-east-1', credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true });
    try {
      const expired = await getSignedUrl(signer, new GetObjectCommand({ Bucket: store.bucket, Key: store.key(intent.object.id) }), {
        expiresIn: 1, signingDate: new Date(Date.now() - 120_000),
      });
      assert.equal((await fetch(expired)).status, 403);
    } finally { signer.destroy(); }
    assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.finance_events
      WHERE business_reference=$1 AND owner_id=$2 AND kind='PAYOUT_SETTLEMENT'`, [payout.id, pic.id])).rows[0].count, 1);
  } finally {
    await app.close().catch(() => undefined);
    store?.close();
  }
});
