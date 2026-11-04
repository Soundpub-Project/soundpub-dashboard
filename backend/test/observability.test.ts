import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger, Metrics, instrumentApi, poolMetrics } from '../src/observability/index.js';
import Fastify from 'fastify';
import type { Pool } from 'pg';

test('structured logger redacts credentials, request bodies and signed URLs without mutating input', () => {
  const lines: string[] = [];
  const logger = createLogger('info', { write(line: string) { lines.push(line); } });
  const marker = 'synthetic-secret-marker';
  const event = {
    requestId: 'request-1', method: 'POST', route: '/api/v1/webhooks/events', statusCode: 401, durationMs: 12,
    password: marker, access_token: marker, refreshToken: marker,
    config: { DATABASE_URL: marker, OBJECT_STORAGE_SECRET_KEY: marker, WEBHOOK_MOCK_SECRET: marker },
    credentials: { secretAccessKey: marker, accessKeyId: marker },
    req: { headers: { authorization: marker, cookie: marker, 'x-api-key': marker, 'x-webhook-signature': marker }, body: { nested: marker }, url: `/path?token=${marker}` },
    res: { headers: { 'set-cookie': marker } },
    signedUrl: `http://127.0.0.1:9000/private?X-Amz-Signature=${marker}`,
  };
  logger.info(event, 'request completed');
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]!.includes(marker));
  const record = JSON.parse(lines[0]!);
  assert.equal(record.service, 'soundpub-backend');
  assert.equal(record.requestId, event.requestId);
  assert.equal(record.durationMs, 12);
  assert.equal(record.statusCode, 401);
  assert.ok(!Number.isNaN(Date.parse(record.time)));
  assert.equal(event.password, marker);
  assert.equal(event.req.headers.authorization, marker);
});

test('logger honors configured level and retains safe child correlation', () => {
  const lines: string[] = [];
  const logger = createLogger('warn', { write(line: string) { lines.push(line); } });
  logger.info('filtered');
  logger.child({ eventId: 'event-1', password: 'synthetic-child-secret' }).warn({ attempt: 2 }, 'retry');
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]!.includes('synthetic-child-secret'));
  assert.equal(JSON.parse(lines[0]!).eventId, 'event-1');
});

test('metrics aggregate counts and durations; snapshots do not mutate live state', () => {
  const metrics = new Metrics();
  metrics.increment('requests');
  metrics.increment('requests', 2);
  metrics.observe('requestMs', 10);
  metrics.observe('requestMs', 20);
  const snapshot = metrics.snapshot();
  assert.deepEqual(snapshot, { counters: { requests: 3 }, timings: { requestMs: { count: 2, totalMs: 30 } } });
  (snapshot.timings as Record<string, { count: number }>).requestMs!.count = 99;
  assert.equal((metrics.snapshot().timings as Record<string, { count: number }>).requestMs!.count, 2);
});

test('runtime API metrics aggregate errors and latency without request labels', async () => {
  const app = Fastify();
  const pool = { totalCount: 2, idleCount: 1, waitingCount: 3 } as Pool;
  const metrics = instrumentApi(app, pool);
  app.get('/ok/:id', async () => ({ ok: true }));
  try {
    await app.inject('/ok/private-one');
    await app.inject('/ok/private-two');
    await app.inject('/missing?secret=private');
    assert.deepEqual(metrics.snapshot().counters, { requests: 3, 'responses.2xx': 2, 'responses.4xx': 1 });
    assert.equal(metrics.timings.get('requestMs')?.count, 3);
    assert.ok(metrics.timings.get('requestMs')!.totalMs >= 0);
    assert.ok(!JSON.stringify(metrics.snapshot()).includes('private'));
    assert.deepEqual(poolMetrics(pool), { total: 2, idle: 1, waiting: 3 });
  } finally { await app.close(); }
});
