import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError, type Principal } from '../api/types.js';
import { createOpaqueToken, digestOpaqueToken, hashPassword, verifyPassword } from '../auth/local-crypto.js';
import type { Identity, Role } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { lifecycleRequestInput, lifecycleTokenInput, passwordRecoveryResetInput } from './contracts.js';
import { encryptDeliveryToken } from './delivery-crypto.js';

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

export function createLocalAuthService(pool: Pool, options: { deliverySecret: string; deliveryKeyId?: string }) {
  async function requestToken(input: unknown, requestId: string, purpose: 'email_verification' | 'password_reset') {
    const startedAt = performance.now();
    const parsed = lifecycleRequestInput.safeParse(input);
    if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
    const token = createOpaqueToken();
    try { await withTransaction(pool, async db => {
      const found = await db.query<{ user_id: string; email: string; email_verified_at: Date | null; status: Principal['status'] }>(
        `SELECT c.user_id,c.login_email AS email,u.email_verified_at,u.status
         FROM soundpub.local_auth_credentials c JOIN soundpub.backend_users u ON u.id=c.user_id
         WHERE c.login_email=$1 FOR UPDATE OF c,u`, [parsed.data.email]);
      const row = found.rows[0];
      const eligible = row && row.status === 'active' && (purpose === 'password_reset' || !row.email_verified_at);
      if (!eligible) return;
      await db.query(`UPDATE soundpub.auth_one_time_tokens SET consumed_at=now(),consumed_request_id=$3
        WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL`, [row.user_id, purpose, requestId]);
      const inserted = await db.query<{ id: string; expires_at: Date }>(`INSERT INTO soundpub.auth_one_time_tokens
        (user_id,purpose,token_sha256,expires_at,request_id)
        VALUES($1::uuid,$2::text,$3::bytea,now()+CASE WHEN $2::text='email_verification' THEN interval '24 hours' ELSE interval '1 hour' END,$4::text)
        RETURNING id,expires_at`, [row.user_id, purpose, digestOpaqueToken(token), requestId]);
      const expiresAt = inserted.rows[0]!.expires_at;
      const action = purpose === 'email_verification' ? 'auth.email_verification_requested' : 'auth.password_reset_requested';
      const topic = purpose === 'email_verification' ? 'auth.email_verification.requested' : 'auth.password_reset.requested';
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES(NULL,$1,'auth_one_time_token',$2,$3,jsonb_build_object('purpose',$4::text,'expires_at',$5::timestamptz,'target_user_id',$6::uuid))`,
      [action, inserted.rows[0]!.id, requestId, purpose, expiresAt, row.user_id]);
      const encrypted = encryptDeliveryToken(token, options.deliverySecret, options.deliveryKeyId);
      await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
        VALUES($1,jsonb_build_object('userId',$2::uuid,'email',$3::text,'token_ciphertext',$4::text,
          'token_iv',$5::text,'token_tag',$6::text,'expiresAt',$7::timestamptz,'token_key_id',$8::text),$9)`,
      [topic, row.user_id, row.email, encrypted.token_ciphertext, encrypted.token_iv, encrypted.token_tag,
        expiresAt, encrypted.token_key_id, `auth-token:${inserted.rows[0]!.id}`]);
    }); } finally {
      const remaining = 75 - (performance.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  async function consumeToken(input: unknown, requestId: string, purpose: 'email_verification' | 'password_reset') {
    const parsed = (purpose === 'password_reset' ? passwordRecoveryResetInput : lifecycleTokenInput).safeParse(input);
    if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
    let digest: Buffer;
    try { digest = digestOpaqueToken(parsed.data.token); } catch { throw new ApiError(400, 'BAD_REQUEST'); }
    const consumed = await withTransaction(pool, async db => {
      const found = await db.query<{ id: string; user_id: string; status: Principal['status'] }>(
        `SELECT t.id,t.user_id,u.status FROM soundpub.auth_one_time_tokens t
         JOIN soundpub.backend_users u ON u.id=t.user_id
         WHERE t.token_sha256=$1 AND t.purpose=$2 AND t.consumed_at IS NULL AND t.expires_at>now()
         FOR UPDATE OF t,u`, [digest, purpose]);
      const tokenRow = found.rows[0];
      if (!tokenRow || tokenRow.status !== 'active') return false;
      const newHash = purpose === 'password_reset'
        ? await hashPassword((parsed.data as z.infer<typeof passwordRecoveryResetInput>).newPassword) : null;
      await db.query(`UPDATE soundpub.auth_one_time_tokens SET consumed_at=now(),consumed_request_id=$2
        WHERE id=$1`, [tokenRow.id, requestId]);
      if (purpose === 'email_verification') {
        await db.query(`UPDATE soundpub.backend_users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now()
          WHERE id=$1`, [tokenRow.user_id]);
      } else {
        await db.query(`UPDATE soundpub.local_auth_credentials SET password_hash=$2,password_changed_at=now(),
          failed_attempts=0,locked_until=NULL,requires_password_reset=false,updated_at=now() WHERE user_id=$1`,
        [tokenRow.user_id, newHash]);
        await db.query('UPDATE soundpub.auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [tokenRow.user_id]);
        await db.query(`UPDATE soundpub.auth_one_time_tokens SET consumed_at=now(),consumed_request_id=$2
          WHERE user_id=$1 AND consumed_at IS NULL`, [tokenRow.user_id, requestId]);
      }
      const action = purpose === 'email_verification' ? 'auth.email_verified' : 'auth.password_reset_completed';
      const topic = purpose === 'email_verification' ? 'auth.email_verified' : 'auth.password_reset.completed';
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES($1,$2,'local_auth_credential',$1::uuid::text,$3,jsonb_build_object('token_id',$4::uuid))`,
      [tokenRow.user_id, action, requestId, tokenRow.id]);
      await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
        VALUES($1,jsonb_build_object('userId',$2::uuid),$3)`,
      [topic, tokenRow.user_id, `auth-consumed:${tokenRow.id}`]);
      return true;
    });
    if (!consumed) throw new ApiError(400, 'BAD_REQUEST');
  }

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
    requestEmailVerification: (input: unknown, requestId: string) => requestToken(input, requestId, 'email_verification'),
    confirmEmailVerification: (input: unknown, requestId: string) => consumeToken(input, requestId, 'email_verification'),
    requestPasswordRecovery: (input: unknown, requestId: string) => requestToken(input, requestId, 'password_reset'),
    resetRecoveredPassword: (input: unknown, requestId: string) => consumeToken(input, requestId, 'password_reset'),
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
    async loginPartner(identity: Identity, labelId: string, requestId: string) {
      const result = await withTransaction(pool, async db => {
        const bound = await db.query<{ id: string; status: Principal['status']; parent_label_id: string | null }>(`
          SELECT u.id,u.status,p.parent_label_id FROM soundpub.external_identities i
          JOIN soundpub.backend_users u ON u.id=i.application_user_id
          JOIN soundpub.profiles p ON p.id=u.id
          JOIN soundpub.artist_profiles ap ON ap.user_id=u.id
          JOIN soundpub.artists a ON a.artist_user_id=u.id AND a.label_id=p.parent_label_id
          JOIN soundpub.backend_users label ON label.id=p.parent_label_id AND label.status='active'
          WHERE i.provider='iccn' AND i.issuer=$1 AND i.subject=$2 AND i.verified_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM soundpub.user_roles label_role WHERE label_role.user_id=label.id
              AND label_role.role IN ('label','whitelabel') AND label_role.verified_at IS NOT NULL)
          FOR UPDATE OF u`, [identity.issuer, identity.subject]);
        const user = bound.rows[0];
        if (!user || user.status !== 'active' || user.parent_label_id !== labelId) return null;
        const assignedRoles = await roles(db, user.id);
        if (!assignedRoles.includes('artist') || assignedRoles.some(role => role !== 'artist')) return null;
        const token = createOpaqueToken();
        const csrfToken = createOpaqueToken();
        const expiresAt = new Date(Date.now() + absoluteSessionMs);
        await db.query(`INSERT INTO soundpub.auth_sessions(user_id,token_sha256,csrf_sha256,idle_expires_at,expires_at)
          VALUES ($1,$2,$3,$4,$4)`, [user.id, digestOpaqueToken(token), digestOpaqueToken(csrfToken), expiresAt]);
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'auth.partner_login','auth_session',$1::uuid::text,$2,'{}')`, [user.id, requestId]);
        return { token, csrfToken, expiresAt: expiresAt.toISOString(), principal: {
          id: user.id, status: user.status, roles: assignedRoles,
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
