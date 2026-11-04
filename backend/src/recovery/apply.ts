import pg from 'pg';
import type { PoolClient } from 'pg';
import { planRecovery, type RecoveryReport } from './index.js';

export interface DisposableTarget {
  databaseUrl: string;
  confirmDisposableDatabase: string;
  /** Explicit fixture-only high port. Omit to retain the original 55433 guard. */
  expectedPort?: number;
}
export function guardTarget(target: DisposableTarget): URL {
  let url: URL;
  try { url = new URL(target.databaseUrl); } catch { throw new Error('Invalid disposable target'); }
  const port = target.expectedPort ?? 55433;
  if (!Number.isInteger(port) || port < 32768 || port > 65535 ||
      !['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !/^\/soundpub_recovery_test_[a-z0-9_]+$/.test(url.pathname) || url.port !== String(port) ||
      url.username !== 'soundpub_recovery' || !url.password || url.search || url.hash ||
      target.confirmDisposableDatabase !== url.pathname.slice(1)) throw new Error('Explicit disposable recovery target required');
  return url;
}

/** Internal transaction writer, exported for synthetic SQL-contract tests. Never writes live domain tables. */
export async function writeRecoveryTransaction(client: Pick<PoolClient, 'query'>, report: RecoveryReport, database: string): Promise<void> {
  await client.query('BEGIN');
  try {
    const identity = await client.query('SELECT current_database() AS database, current_user AS username');
    if (identity.rows[0]?.database !== database || identity.rows[0]?.username !== 'soundpub_recovery') throw new Error('Connected target mismatch');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soundpub_recovery_foundation'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS recovery_foundation');
    await client.query(`CREATE TABLE IF NOT EXISTS recovery_foundation.records (
      namespace text NOT NULL, kind text NOT NULL, source_id text NOT NULL,
      canonical_id uuid NOT NULL UNIQUE, payload jsonb NOT NULL,
      PRIMARY KEY (namespace, kind, source_id))`);
    for (const record of report.accepted) {
      const values = [report.namespace, record.kind, record.sourceId, record.canonicalId, JSON.stringify(record.data)];
      await client.query(`INSERT INTO recovery_foundation.records(namespace,kind,source_id,canonical_id,payload)
        VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (namespace,kind,source_id) DO NOTHING`, values);
      const match = await client.query(`SELECT 1 FROM recovery_foundation.records
        WHERE namespace=$1 AND kind=$2 AND source_id=$3 AND canonical_id=$4 AND payload=$5::jsonb`, values);
      if (match.rowCount !== 1) throw new Error('Recovery replay conflict');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function recover(stagingDirectory: string, options: { apply?: boolean; target?: DisposableTarget } = {}): Promise<RecoveryReport> {
  const target = options.apply ? guardTarget(options.target ?? { databaseUrl: '', confirmDisposableDatabase: '' }) : undefined;
  const report = await planRecovery(stagingDirectory);
  if (!target) return report;
  if (report.rejected.length || report.orphan.length) throw new Error('Apply requires zero rejected and orphan rows');
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 3000, options: '-c statement_timeout=10000 -c lock_timeout=3000' });
  try {
    const client = await pool.connect();
    try { await writeRecoveryTransaction(client, report, target.pathname.slice(1)); }
    finally { client.release(); }
  } finally { await pool.end(); }
  return { ...report, mode: 'apply' };
}
