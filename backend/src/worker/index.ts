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
export type OutboxHandler = (event: OutboxEvent, db: SqlClient) => Promise<void>;
export interface WorkerOptions { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }

export function retryDelay(attempt: number, baseMs = 1000, capMs = 300000): number {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(baseMs) || baseMs <= 0 || !Number.isFinite(capMs) || capMs < baseMs) throw new Error('Invalid retry policy');
  return Math.min(capMs, baseMs * 2 ** Math.min(attempt - 1, 52));
}

export async function pollOutbox(pool: SqlPool, handlers: Record<string, OutboxHandler>, options: WorkerOptions = {}): Promise<'idle' | 'processed' | 'retry' | 'dead'> {
  const { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 300000 } = options;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid maxAttempts');
  retryDelay(1, baseDelayMs, maxDelayMs);
  return transaction(pool, async db => {
    const result = await db.query<OutboxEvent>(`SELECT id, topic, payload, idempotency_key, attempts
      FROM outbox_events WHERE status = 'pending' AND available_at <= now()
      ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`);
    const event = result.rows[0];
    if (!event) return 'idle';
    await db.query('SAVEPOINT delivery');
    try {
      const handler = Object.hasOwn(handlers, event.topic) ? handlers[event.topic] : undefined;
      if (!handler) throw new Error('No handler registered for outbox topic');
      await once(db, 'outbox', event.idempotency_key, () => handler(event, db));
      await db.query(`UPDATE outbox_events SET status = 'processed', attempts = attempts + 1,
        processed_at = now(), last_error = NULL WHERE id = $1`, [event.id]);
      return 'processed';
    } catch {
      await db.query('ROLLBACK TO SAVEPOINT delivery');
      const attempt = event.attempts + 1;
      const status = attempt >= maxAttempts ? 'dead' : 'pending';
      // Store no provider exception text: it can contain credentials or personal data.
      await db.query(`UPDATE outbox_events SET status = $2, attempts = $3,
        available_at = now() + ($4 * interval '1 millisecond'), last_error = $5 WHERE id = $1`,
      [event.id, status, attempt, retryDelay(attempt, baseDelayMs, maxDelayMs), 'Delivery failed']);
      return status === 'dead' ? 'dead' : 'retry';
    }
  });
}
