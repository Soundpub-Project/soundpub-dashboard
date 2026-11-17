import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { createInvoiceDocumentStore } from '../src/payments/invoice-document-store.js';
import { dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

test('invoice PDF object stays private and 10-minute signed download serves attachment', {
  skip: !dockerTestsEnabled, timeout: 90_000,
}, async t => {
  const accessKeyId = `synthetic${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const secretAccessKey = randomUUID();
  const resource = testComposeResource('test-rustfs', { RUSTFS_ACCESS_KEY: accessKeyId, RUSTFS_SECRET_KEY: secretAccessKey });
  t.after(() => resource.close());
  const endpoint = `http://127.0.0.1:${Number(resource.start().split(':')[1])}`;
  const deadline = Date.now() + 45_000;
  for (;;) {
    try { if ((await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; }
    catch { /* Wait for the disposable object store to become ready. */ }
    if (Date.now() > deadline) throw new Error('Disposable RustFS readiness timeout');
    await setTimeout(200);
  }
  const bucket = `invoice-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const client = new S3Client({ endpoint, region: 'us-east-1', credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true });
  t.after(() => client.destroy());
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  const store = createInvoiceDocumentStore({ environment: 'test', endpoint, publicEndpoint: endpoint,
    credentials: { accessKeyId, secretAccessKey }, bucket, prefix: 'private-invoice-docs' });
  t.after(() => store.close());

  const ownerId = randomUUID();
  const invoiceId = randomUUID();
  const path = `${ownerId}/${invoiceId}/SPB-202611-${invoiceId.slice(0, 8).toUpperCase()}.pdf`;
  const bytes = Buffer.from('%PDF-1.7\nsynthetic private invoice');
  await store.put(path, bytes);
  const signed = await store.signedDownload(path, 'SPB-202611-invoice.pdf', 600);
  const response = await fetch(signed);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition') ?? '', /SPB-202611-invoice\.pdf/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);

  const unsigned = await fetch(`${endpoint}/${bucket}/private-invoice-docs/${path}`);
  assert.ok([401, 403].includes(unsigned.status), `Expected private object denial, got ${unsigned.status}`);
});
