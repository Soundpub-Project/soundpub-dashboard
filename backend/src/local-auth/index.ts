import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError, type Principal } from '../api/types.js';
import { createOpaqueToken, digestOpaqueToken, hashPassword, verifyPassword } from '../auth/local-crypto.js';
import type { Role } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';

const loginInput = z.strictObject({ email: z.email().max(320).transform(value => value.trim().toLowerCase()),
  password: z.string().min(1).max(1024) });
const passwordInput = z.strictObject({ currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12).max(1024) });
const dummyHash = 'scrypt$v=1$ln=17,r=8,p=1$BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc$wWuwD_X40CaPDItW91LQOEHdyVpjIQ_MT0Rm6y-KTMFAq4x8JFWt_M4peXBvUkvjd-ibidcfSA3liG3Ky0sb7Q';
const absoluteSessionMs = 6 * 60 * 60 * 1000;
const maxFailures = 5;
const lockMs = 15 * 60 * 1000;

type CredentialRow = { user_id: string; password_hash: string; failed_attempts: number; locked_until: Date | null;
  status: Principal['status'] };
type SessionRow = { id: string; user_id: string; status: Principal['status']; roles: Role[]; csrf_sha256: Buffer;
  expires_at: Date };

function parseLogin(input: unknown) {
  const result = loginInput.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
async function roles(db: PoolClient, userId: string) {
  return (await db.query<{ role: Role }>(`SELECT role FROM soundpub.user_roles
    WHERE user_id=$1 AND tenant_id IS NULL AND verified_at IS NOT NULL ORDER BY role`, [userId])).rows.map(row => row.role);
}
function principal(row: SessionRow): Principal {
  return { id: row.user_id, status: row.status, roles: row.roles };
}

export function createLocalAuthService(pool: Pool) {
  async function session(token: string, write = false): Promise<SessionRow | null> {
    let digest: Buffer;
    try { digest = digestOpaqueToken(token); } catch { return null; }
    const result = await pool.query<SessionRow>(`SELECT s.id,s.user_id,u.status,s.csrf_sha256,s.expires_at,
      COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL),'{}') AS roles
      FROM soundpub.auth_sessions s JOIN soundpub.backend_users u ON u.id=s.user_id
      LEFT JOIN soundpub.user_roles r ON r.user_id=u.id AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL
      WHERE s.token_sha256=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.idle_expires_at>now()
      GROUP BY s.id,u.id`, [digest]);
    const row = result.rows[0] ?? null;
    if (row && write) await pool.query('UPDATE soundpub.auth_sessions SET last_seen_at=now() WHERE id=$1', [row.id]);
    return row;
  }
  return {
    async login(input: unknown, requestId: string) {
      const value = parseLogin(input);
      const result = await withTransaction(pool, async db => {
        const found = await db.query<CredentialRow>(`SELECT c.user_id,c.password_hash,c.failed_attempts,c.locked_until,u.status
          FROM soundpub.local_auth_credentials c JOIN soundpub.backend_users u ON u.id=c.user_id
          WHERE c.login_email=$1 FOR UPDATE OF c,u`, [value.email]);
        const credential = found.rows[0];
        if (!credential) {
          await verifyPassword(value.password, dummyHash);
          return null;
        }
        if (credential.locked_until && credential.locked_until.getTime() > Date.now()) throw new ApiError(429, 'RATE_LIMITED');
        const valid = await verifyPassword(value.password, credential.password_hash);
        if (!valid) {
          const failures = credential.failed_attempts + 1;
          await db.query(`UPDATE soundpub.local_auth_credentials SET
            failed_attempts=CASE WHEN $2::integer >= $3::integer THEN 0 ELSE $2::integer END,
            locked_until=CASE WHEN $2::integer >= $3::integer THEN now()+($4::bigint * interval '1 millisecond') ELSE NULL END,
            updated_at=now()
            WHERE user_id=$1`, [credential.user_id, failures, maxFailures, lockMs]);
          await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
            VALUES ($1::uuid,'auth.login_failed','auth_session',$1::uuid::text,$2,'{}')`, [credential.user_id, requestId]);
          return null;
        }
        if (credential.status !== 'active') throw new ApiError(403, 'FORBIDDEN');
        const token = createOpaqueToken();
        const csrfToken = createOpaqueToken();
        const expiresAt = new Date(Date.now() + absoluteSessionMs);
        await db.query(`UPDATE soundpub.local_auth_credentials SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE user_id=$1`, [credential.user_id]);
        await db.query(`INSERT INTO soundpub.auth_sessions(user_id,token_sha256,csrf_sha256,idle_expires_at,expires_at)
          VALUES ($1,$2,$3,$4,$4)`, [credential.user_id, digestOpaqueToken(token), digestOpaqueToken(csrfToken), expiresAt]);
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1::uuid,'auth.login_succeeded','auth_session',$1::uuid::text,$2,'{}')`, [credential.user_id, requestId]);
        return { token, csrfToken, expiresAt: expiresAt.toISOString(), principal: {
          id: credential.user_id, status: credential.status, roles: await roles(db, credential.user_id),
        } satisfies Principal };
      });
      if (!result) throw new ApiError(401, 'UNAUTHORIZED');
      return result;
    },
    async authenticate(token: string, csrfToken?: string, requireCsrf = false) {
      const row = await session(token, true);
      if (!row || row.status !== 'active') return null;
      if (requireCsrf) {
        let digest: Buffer;
        try { digest = digestOpaqueToken(csrfToken ?? ''); } catch { return null; }
        if (!row.csrf_sha256.equals(digest)) return null;
      }
      return principal(row);
    },
    async rotateCsrf(token: string) {
      const row = await session(token);
      if (!row || row.status !== 'active') throw new ApiError(401, 'UNAUTHORIZED');
      const csrfToken = createOpaqueToken();
      await pool.query('UPDATE soundpub.auth_sessions SET csrf_sha256=$2,last_seen_at=now() WHERE id=$1',
        [row.id, digestOpaqueToken(csrfToken)]);
      return { csrfToken, expiresAt: row.expires_at.toISOString(), principal: principal(row) };
    },
    async logout(token: string, csrfToken: string, requestId: string) {
      const row = await session(token);
      if (!row) return;
      let digest: Buffer;
      try { digest = digestOpaqueToken(csrfToken); } catch { throw new ApiError(403, 'FORBIDDEN'); }
      if (!row.csrf_sha256.equals(digest)) throw new ApiError(403, 'FORBIDDEN');
      await withTransaction(pool, async db => {
        await db.query('UPDATE soundpub.auth_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL', [row.id]);
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'auth.logout','auth_session',$2,$3,'{}')`, [row.user_id, row.id, requestId]);
      });
    },
    async changePassword(token: string, csrfToken: string, input: unknown, requestId: string) {
      const value = passwordInput.safeParse(input);
      if (!value.success) throw new ApiError(400, 'BAD_REQUEST');
      let tokenDigest: Buffer;
      let csrfDigest: Buffer;
      try {
        tokenDigest = digestOpaqueToken(token);
        csrfDigest = digestOpaqueToken(csrfToken);
      } catch { throw new ApiError(401, 'UNAUTHORIZED'); }
      const changed = await withTransaction(pool, async db => {
        const result = await db.query<{ session_id: string; user_id: string; status: Principal['status'];
          csrf_sha256: Buffer; password_hash: string }>(`SELECT s.id AS session_id,s.user_id,u.status,s.csrf_sha256,c.password_hash
          FROM soundpub.auth_sessions s JOIN soundpub.backend_users u ON u.id=s.user_id
          JOIN soundpub.local_auth_credentials c ON c.user_id=s.user_id
          WHERE s.token_sha256=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.idle_expires_at>now()
          FOR UPDATE OF s,u,c`, [tokenDigest]);
        const row = result.rows[0];
        if (!row || row.status !== 'active' || !row.csrf_sha256.equals(csrfDigest)) return false;
        if (!await verifyPassword(value.data.currentPassword, row.password_hash)) return false;
        if (await verifyPassword(value.data.newPassword, row.password_hash)) throw new ApiError(409, 'CONFLICT');
        const newHash = await hashPassword(value.data.newPassword);
        await db.query(`UPDATE soundpub.local_auth_credentials SET password_hash=$2,password_changed_at=now(),
          failed_attempts=0,locked_until=NULL,requires_password_reset=false,updated_at=now() WHERE user_id=$1`,
        [row.user_id, newHash]);
        await db.query('UPDATE soundpub.auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [row.user_id]);
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'auth.password_changed','local_auth_credential',$1::uuid::text,$2,'{}')`, [row.user_id, requestId]);
        return true;
      });
      if (!changed) throw new ApiError(401, 'UNAUTHORIZED');
    },
  };
}
export type LocalAuthService = ReturnType<typeof createLocalAuthService>;
