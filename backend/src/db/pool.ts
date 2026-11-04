import pg from 'pg';
import type { Pool, PoolClient, PoolConfig } from 'pg';

export function createPool(config: PoolConfig = {}): Pool {
  return new pg.Pool({ max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000,
    options: '-c search_path=soundpub,public', ...config });
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) {
      discard = true;
      throw new AggregateError([error, rollbackError], 'Transaction and rollback failed');
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
