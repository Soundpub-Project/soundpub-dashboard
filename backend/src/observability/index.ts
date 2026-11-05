import pino, { type DestinationStream, type Logger } from "pino";
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { withTransaction } from '../db/pool.js';

// ponytail: known structured fields only; extend paths for new schemas. Never log secrets in free text.
const redactionPaths = [
  'authorization', 'cookie', 'headers', 'accessToken', 'refreshToken', 'access_token', 'refresh_token',
  'token', 'password', 'secret', 'clientSecret', 'client_secret', 'accessKeyId', 'secretAccessKey',
  'DATABASE_URL', 'RECONCILIATION_DATABASE_URL', 'AUDIT_DATABASE_URL', 'POSTGRES_PASSWORD', 'AUDIT_DATABASE_PASSWORD', 'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY',
  'WEBHOOK_MOCK_SECRET', 'DEV_AUTH_TOKENS_JSON', 'SPOTIFY_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY',
  'body', 'payload', 'url', 'signedUrl', 'signed_url', 'connectionString', 'err', 'error',
  'config', 'credentials', 'req.headers', 'req.body', 'req.rawBody', 'req.url', 'res.headers', 'res.body',
];

export function createLogger(level = "info", destination?: DestinationStream): Logger {
  return pino({
    level,
    redact: { paths: redactionPaths, censor: "[REDACTED]" },
    base: { service: "soundpub-backend" },
    timestamp: pino.stdTimeFunctions.isoTime,
  }, destination);
}

export class Metrics {
  readonly counters = new Map<string, number>();
  readonly timings = new Map<string, { count: number; totalMs: number }>();

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observe(name: string, durationMs: number): void {
    const current = this.timings.get(name) ?? { count: 0, totalMs: 0 };
    this.timings.set(name, { count: current.count + 1, totalMs: current.totalMs + durationMs });
  }

  snapshot(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      timings: Object.fromEntries([...this.timings].map(([name, value]) => [name, { ...value }])),
    };
  }
}

// ponytail: fixed aggregate names and 30-second logs; add an exporter when a collector exists.
export function instrumentApi(app: FastifyInstance, pool: Pool): Metrics {
  const metrics = new Metrics();
  app.addHook('onResponse', async (_request, reply) => {
    metrics.increment('requests');
    metrics.increment(`responses.${Math.floor(reply.statusCode / 100)}xx`);
    metrics.observe('requestMs', reply.elapsedTime);
  });
  const timer = setInterval(() => {
    app.log.info({ metrics: metrics.snapshot(), dbPool: poolMetrics(pool) }, 'api metrics');
  }, 30_000).unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
  return metrics;
}

export function poolMetrics(pool: Pick<Pool, 'totalCount' | 'idleCount' | 'waitingCount'>) {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

export async function sampleQueue(pool: Pool) {
  // ponytail: cap sampled rows at 1000; use indexed/maintained exact gauges for larger queues.
  const result = await withTransaction(pool, async db => {
    await db.query("SET LOCAL statement_timeout = '1000ms'");
    return db.query<{ status: string; count: number }>({
      text: `SELECT status, count(*)::int AS count FROM
        (SELECT status FROM soundpub.outbox_events WHERE status IN ('pending','processing','dead') LIMIT 1000) sample
        GROUP BY status`,
    });
  });
  const counts = { pending: 0, processing: 0, dead: 0 };
  for (const row of result.rows) {
    if (row.status === 'pending' || row.status === 'processing' || row.status === 'dead') counts[row.status] = row.count;
  }
  return { ...counts, sampleLimit: 1000 };
}
