import { createPool, migrate, withTransaction } from './index.js';
import { assertFoundationEnvironment, parseIsolatedDatabaseUrl } from '../config/database-target.js';

const command = process.argv[2] ?? 'up';
if (!['up', 'status', 'reset'].includes(command)) throw new Error('Usage: cli.ts up|status|reset');
const connectionString = process.env.DATABASE_URL;
assertFoundationEnvironment(process.env.NODE_ENV);
const target = parseIsolatedDatabaseUrl(connectionString, ['soundpub_owner']);
if (command === 'reset' && process.env.DB_RESET_CONFIRM !== target.pathname.slice(1)) {
  throw new Error('Reset requires DB_RESET_CONFIRM equal to the isolated database name');
}
const pool = createPool({ connectionString });
try {
  if (command === 'status') {
    const exists = await pool.query("SELECT to_regclass('soundpub.schema_migrations') AS name");
    const rows = exists.rows[0]?.name
      ? (await pool.query('SELECT name, checksum, applied_at FROM soundpub.schema_migrations ORDER BY name')).rows : [];
    console.log(JSON.stringify(rows, null, 2));
  } else {
    if (command === 'reset') {
      await withTransaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(1936684400, 1)');
        await client.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
      });
    }
    console.log(JSON.stringify({ applied: await migrate(pool) }));
  }
} finally {
  await pool.end();
}



