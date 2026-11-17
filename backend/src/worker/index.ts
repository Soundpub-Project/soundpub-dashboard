export interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}
export interface SqlPool { connect(): Promise<SqlClient & { release(discard?: boolean): void }> }

export async function transaction<T>(pool: SqlPool, work: (db: SqlClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  let discard = false;
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { db.release(discard); }
}

// Caller must use a transaction: guard and database effects commit together.
export async function once(db: SqlClient, consumer: string, key: string, effect: () => Promise<void>): Promise<boolean> {
  if (!consumer || !key) throw new Error('Consumer and idempotency key required');
  const inserted = await db.query(
    'INSERT INTO integration_effects (consumer, idempotency_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING idempotency_key',
    [consumer, key],
  );
  if (!inserted.rows.length) return false;
  await effect();
  return true;
}

export interface OutboxEvent { id: string; topic: string; payload: unknown; idempotency_key: string; attempts: number }
export type OutboxHandler = ((event: OutboxEvent, db: SqlClient) => Promise<void>) | {
  delivery: 'external';
  handle(event: OutboxEvent): Promise<void>;
};
export interface WorkerOptions { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }

export function retryDelay(attempt: number, baseMs = 1000, capMs = 300000): number {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(baseMs) || baseMs <= 0 || !Number.isFinite(capMs) || capMs < baseMs) throw new Error('Invalid retry policy');
  return Math.min(capMs, baseMs * 2 ** Math.min(attempt - 1, 52));
}

export async function pollOutbox(pool: SqlPool, handlers: Record<string, OutboxHandler>, options: WorkerOptions = {}): Promise<'idle' | 'processed' | 'retry' | 'dead'> {
  const { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 300000 } = options;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid maxAttempts');
  retryDelay(1, baseDelayMs, maxDelayMs);
  const workerId = `worker:${process.pid}`;
  const claimed = await transaction(pool, async db => {
    const result = await db.query<OutboxEvent>(`SELECT id, topic, payload, idempotency_key, attempts
      FROM outbox_events WHERE (status = 'pending' AND available_at <= now())
        OR (status = 'processing' AND locked_at < now() - interval '2 minutes')
      ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`);
    const event = result.rows[0];
    if (!event) return null;
    const lease = await db.query(`UPDATE outbox_events SET status='processing',locked_at=now(),locked_by=$2
      WHERE id=$1`, [event.id, workerId]);
    if (lease.rowCount !== 1) return null;
    const handler = Object.hasOwn(handlers, event.topic) ? handlers[event.topic] : undefined;
    if (handler && typeof handler !== 'function') {
      return { kind: 'external' as const, event, handler };
    }
    if (!handler) {
      const attempt = event.attempts + 1;
      const status = attempt >= maxAttempts ? 'dead' : 'pending';
      await db.query(`UPDATE outbox_events SET status=$2,attempts=$3,
        available_at=now()+($4*interval '1 millisecond'),last_error='Delivery failed',
        locked_at=NULL,locked_by=NULL WHERE id=$1`,
      [event.id, status, attempt, retryDelay(attempt, baseDelayMs, maxDelayMs)]);
      return { kind: 'outcome' as const, outcome: status === 'dead' ? 'dead' as const : 'retry' as const };
    }
    await db.query('SAVEPOINT delivery');
    try {
      await once(db, 'outbox', event.idempotency_key, () => handler(event, db));
      await db.query(`UPDATE outbox_events SET status = 'processed', attempts = attempts + 1,
        processed_at = now(), last_error = NULL,locked_at=NULL,locked_by=NULL WHERE id = $1`, [event.id]);
      return { kind: 'outcome' as const, outcome: 'processed' as const };
    } catch {
      await db.query('ROLLBACK TO SAVEPOINT delivery');
      const attempt = event.attempts + 1;
      const status = attempt >= maxAttempts ? 'dead' : 'pending';
      // Store no provider exception text: it can contain credentials or personal data.
      await db.query(`UPDATE outbox_events SET status = $2, attempts = $3,
        available_at = now() + ($4 * interval '1 millisecond'), last_error = $5,locked_at=NULL,locked_by=NULL WHERE id = $1`,
      [event.id, status, attempt, retryDelay(attempt, baseDelayMs, maxDelayMs), 'Delivery failed']);
      return { kind: 'outcome' as const, outcome: status === 'dead' ? 'dead' as const : 'retry' as const };
    }
  });
  if (!claimed) return 'idle';
  if (claimed.kind === 'outcome') return claimed.outcome;

  try {
    await claimed.handler.handle(claimed.event);
    await transaction(pool, async db => {
      await db.query(`UPDATE outbox_events SET status='processed',attempts=attempts+1,processed_at=now(),
        locked_at=NULL,locked_by=NULL,last_error=NULL WHERE id=$1 AND status='processing' AND locked_by=$2`,
      [claimed.event.id, workerId]);
    });
    return 'processed';
  } catch {
    return transaction(pool, async db => {
      const attempt = claimed.event.attempts + 1;
      const status = attempt >= maxAttempts ? 'dead' : 'pending';
      await db.query(`UPDATE outbox_events SET status=$2,attempts=$3,
        available_at=now()+($4*interval '1 millisecond'),locked_at=NULL,locked_by=NULL,
        last_error='Delivery failed' WHERE id=$1 AND status='processing' AND locked_by=$5`,
      [claimed.event.id, status, attempt, retryDelay(attempt, baseDelayMs, maxDelayMs), workerId]);
      return status === 'dead' ? 'dead' : 'retry';
    });
  }
}
