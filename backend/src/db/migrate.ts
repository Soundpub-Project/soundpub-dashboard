import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { withTransaction } from './pool.js';

export interface MigrateOptions { directory?: string | URL }

export async function migrate(pool: Pool, options: MigrateOptions = {}): Promise<string[]> {
  const sourceDirectory = new URL('../../migrations/', import.meta.url);
  const location = options.directory ?? (existsSync(sourceDirectory)
    ? sourceDirectory : new URL('../../../migrations/', import.meta.url));
  const directory = location instanceof URL ? fileURLToPath(location) : location;
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const versions = new Set<string>();
  const files = await Promise.all(names.map(async name => {
    const version = /^(\d+)_[-a-zA-Z0-9_]+\.sql$/.exec(name)?.[1];
    if (!version || versions.has(version)) throw new Error(`Invalid or duplicate migration version: ${name}`);
    versions.add(version);
    const sql = await readFile(resolve(directory, name), 'utf8');
    const transactionSql = sql.replace(/\$\$[\s\S]*?\$\$/g, '')
      .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, '');
    if (/^\s*(?:BEGIN|COMMIT|ROLLBACK|END|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/im.test(transactionSql)) {
      throw new Error(`Migration must not control transactions: ${name}`);
    }
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  return withTransaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(1936684400, 1)");
    await client.query('CREATE SCHEMA IF NOT EXISTS soundpub');
    await client.query(`CREATE TABLE IF NOT EXISTS soundpub.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const history = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM soundpub.schema_migrations ORDER BY name');
    for (let i = 0; i < history.rows.length; i++) {
      const row = history.rows[i]!;
      if (files[i]?.name !== row.name || files[i]?.checksum !== row.checksum) {
        throw new Error(`Migration history/checksum mismatch: ${row.name}`);
      }
    }
    const applied: string[] = [];
    for (const file of files.slice(history.rows.length)) {
      await client.query(file.sql);
      await client.query('INSERT INTO soundpub.schema_migrations (name, checksum) VALUES ($1, $2)', [file.name, file.checksum]);
      applied.push(file.name);
    }
    return applied;
  });
}

