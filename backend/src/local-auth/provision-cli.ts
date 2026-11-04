import { z } from 'zod';
import { hashPassword } from '../auth/local-crypto.js';
import { assertFoundationEnvironment, parseIsolatedDatabaseUrl } from '../config/database-target.js';
import { createPool, withTransaction } from '../db/index.js';

const input = z.strictObject({
  email: z.email().max(320).transform(value => value.trim().toLowerCase()),
  password: z.string().min(12).max(1024),
  bootstrapAdmin: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  fullName: z.string().trim().min(1).max(200).default('Soundpub Administrator'),
}).parse({
  email: process.env.LOCAL_AUTH_EMAIL,
  password: process.env.LOCAL_AUTH_PASSWORD,
  bootstrapAdmin: process.env.LOCAL_AUTH_BOOTSTRAP_ADMIN,
  fullName: process.env.LOCAL_AUTH_FULL_NAME,
});
const connectionString = process.env.DATABASE_URL;
assertFoundationEnvironment(process.env.NODE_ENV);
parseIsolatedDatabaseUrl(connectionString, ['soundpub_owner', 'soundpub_app']);

const pool = createPool({ connectionString });
try {
  const passwordHash = await hashPassword(input.password);
  const result = await withTransaction(pool, async db => {
    let bootstrappedAdmin = false;
    let user = (await db.query<{ id: string }>(`SELECT id FROM soundpub.backend_users
      WHERE lower(email)=lower($1) ORDER BY created_at LIMIT 2 FOR UPDATE`, [input.email])).rows;
    if (user.length === 0 && input.bootstrapAdmin) {
      user = (await db.query<{ id: string }>(`INSERT INTO soundpub.backend_users(
        email,email_verified_at,status,migration_source
      ) VALUES ($1,now(),'active',$2::jsonb) RETURNING id`, [
        input.email, JSON.stringify({ bootstrap: 'local-admin' }),
      ])).rows;
      await db.query(`INSERT INTO soundpub.profiles(id,full_name,password_set)
        VALUES ($1,$2,true)`, [user[0]!.id, input.fullName]);
      await db.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
        VALUES ($1,'admin',now())`, [user[0]!.id]);
      await db.query(`INSERT INTO soundpub.audit_logs(action,resource_type,resource_id,metadata)
        VALUES ('auth.bootstrap_admin','backend_user',$1,$2::jsonb)`, [
        user[0]!.id, JSON.stringify({ email: input.email }),
      ]);
      bootstrappedAdmin = true;
    }
    if (user.length !== 1) throw new Error(user.length === 0 ? 'User not found' : 'Email is not unique');
    await db.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
      VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET login_email=excluded.login_email,
      password_hash=excluded.password_hash,password_changed_at=now(),failed_attempts=0,locked_until=NULL,
      requires_password_reset=false,updated_at=now()`, [user[0]!.id, input.email, passwordHash]);
    await db.query('UPDATE soundpub.auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user[0]!.id]);
    return { userId: user[0]!.id, bootstrappedAdmin };
  });
  console.log(JSON.stringify({
    provisioned: true, userId: result.userId, email: input.email,
    bootstrappedAdmin: result.bootstrappedAdmin,
  }));
} finally {
  await pool.end();
}
