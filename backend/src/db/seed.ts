import { createPool, withTransaction } from './index.js';
import { assertFoundationEnvironment, parseIsolatedDatabaseUrl } from '../config/database-target.js';

const connectionString = process.env.DATABASE_URL;
assertFoundationEnvironment(process.env.NODE_ENV);
parseIsolatedDatabaseUrl(connectionString, ['soundpub_owner']);

const fixtures = [
  ['00000000-0000-4000-8000-000000000001', 'user@example.test', 'user', 'user'],
  ['00000000-0000-4000-8000-000000000002', 'artist@example.test', 'artist', 'artist'],
  ['00000000-0000-4000-8000-000000000003', 'label@example.test', 'label', 'label'],
  ['00000000-0000-4000-8000-000000000004', 'admin@example.test', 'admin', 'admin'],
  ['00000000-0000-4000-8000-000000000005', 'superadmin@example.test', 'superadmin', 'superadmin'],
] as const;
const pool = createPool({ connectionString });
try {
  await withTransaction(pool, async db => {
    for (const [id, email, subject, role] of fixtures) {
      await db.query(`INSERT INTO soundpub.backend_users(id,email,status,migration_source) VALUES ($1,$2,'active','{"fixture":true}')
        ON CONFLICT (id) DO UPDATE SET email = excluded.email, status = 'active', migration_source = excluded.migration_source`, [id, email]);
      await db.query(`INSERT INTO soundpub.external_identities(application_user_id,provider,issuer,subject,verified_at,binding_provenance)
        VALUES ($1,'mock','soundpub-development',$2,now(),'{"fixture":true}') ON CONFLICT (provider,issuer,subject) DO NOTHING`, [id, subject]);
      await db.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())
        ON CONFLICT (user_id,role,tenant_id) DO UPDATE SET verified_at = excluded.verified_at`, [id, role]);
    }
  });
  console.log(JSON.stringify({ seeded: fixtures.length }));
} finally { await pool.end(); }


