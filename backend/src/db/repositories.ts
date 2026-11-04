import type { Pool, PoolClient } from 'pg';
import { ROLES, type Role } from '../auth/index.js';

export interface User {
  id: string; email: string | null; status: 'active' | 'inactive' | 'suspended'; created_at: Date;
}
export interface ExternalIdentity {
  application_user_id: string; provider: string; issuer: string; subject: string;
  verified_at: Date | null;
}
export interface StorageAsset {
  id: string; bucket: string; object_key: string; owner_user_id: string | null;
  owner_reference_id: string | null; content_type: string; size_bytes: string;
  checksum_sha256: string | null; status: 'pending' | 'ready' | 'deleted' | 'failed'; created_at: Date;
}
export interface OutboxEvent {
  id: string; topic: string; payload: unknown; idempotency_key: string; attempts: number;
}

export function createRepositories(db: Pool | PoolClient) {
  return {
    users: {
      async findById(id: string): Promise<User | null> {
        return (await db.query<User>('SELECT id, email, status, created_at FROM soundpub.backend_users WHERE id = $1', [id])).rows[0] ?? null;
      },
      async create(input: { id?: string; email?: string | null; status?: User['status'] }): Promise<User> {
        return (await db.query<User>(`INSERT INTO soundpub.backend_users(id, email, status)
          VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3) RETURNING id, email, status, created_at`,
        [input.id ?? null, input.email ?? null, input.status ?? 'inactive'])).rows[0]!;
      },
    },
    identities: {
      async bind(input: ExternalIdentity): Promise<void> {
        await db.query(`INSERT INTO soundpub.external_identities
          (application_user_id, provider, issuer, subject, verified_at) VALUES ($1,$2,$3,$4,$5)`,
        [input.application_user_id, input.provider, input.issuer, input.subject, input.verified_at]);
      },
    },
    principals: {
      async findByIdentity(identity: { issuer: string; subject: string }) {
        const identities = await db.query<User>(`SELECT u.id, u.email, u.status, u.created_at
          FROM soundpub.external_identities i JOIN soundpub.backend_users u ON u.id = i.application_user_id
          WHERE i.issuer = $1 AND i.subject = $2 AND i.verified_at IS NOT NULL`, [identity.issuer, identity.subject]);
        if (identities.rows.length !== 1) return null;
        const user = identities.rows[0]!;
        const roles = await db.query<{ role: string }>(
          `SELECT role FROM soundpub.user_roles WHERE user_id = $1 AND tenant_id IS NULL
           AND verified_at IS NOT NULL`, [user.id]);
        const allowed = new Set<string>(ROLES);
        if (roles.rows.some(row => !allowed.has(row.role))) return { id: user.id, status: user.status, roles: [] };
        return { id: user.id, status: user.status, roles: roles.rows.map(row => row.role as Role) };
      },
    },
    storage: {
      async findById(id: string): Promise<StorageAsset | null> {
        return (await db.query<StorageAsset>('SELECT * FROM soundpub.storage_assets WHERE id = $1', [id])).rows[0] ?? null;
      },
      async insert(input: Omit<StorageAsset, 'created_at'>): Promise<void> {
        await db.query(`INSERT INTO soundpub.storage_assets
          (id,bucket,object_key,owner_user_id,owner_reference_id,content_type,size_bytes,checksum_sha256,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.id,input.bucket,input.object_key,input.owner_user_id,input.owner_reference_id,input.content_type,input.size_bytes,input.checksum_sha256,input.status]);
      },
    },
    idempotency: {
      // Keep claim, effects and completion on one transaction client so reclaim cannot race a live effect.
      async begin(input: { scope: string; key: string; requestHash: string; expiresAt: Date }) {
        const inserted = await db.query(`INSERT INTO soundpub.idempotency_keys(scope,key,request_hash,expires_at)
          VALUES ($1,$2,$3,$4) ON CONFLICT (scope,key) DO UPDATE
          SET request_hash = EXCLUDED.request_hash, status = 'processing',
              created_at = now(), expires_at = EXCLUDED.expires_at,
              response_status = NULL, response_body = NULL
          WHERE soundpub.idempotency_keys.expires_at <= now()
          RETURNING status`,
        [input.scope, input.key, input.requestHash, input.expiresAt]);
        if (inserted.rowCount) return { state: 'new' as const };
        const existing = await db.query<{ request_hash: string; status: 'processing' | 'completed'; response_status: number | null; response_body: unknown }>(
          `SELECT request_hash,status,response_status,response_body FROM soundpub.idempotency_keys
           WHERE scope = $1 AND key = $2 AND expires_at > now()`, [input.scope, input.key]);
        const row = existing.rows[0];
        if (!row || row.request_hash !== input.requestHash) return { state: 'conflict' as const };
        return row.status === 'completed'
          ? { state: 'completed' as const, responseStatus: row.response_status!, responseBody: row.response_body }
          : { state: 'processing' as const };
      },
      async complete(input: { scope: string; key: string; responseStatus: number; responseBody: unknown }): Promise<boolean> {
        const result = await db.query(`UPDATE soundpub.idempotency_keys SET status = 'completed', response_status = $3, response_body = $4::jsonb
          WHERE scope = $1 AND key = $2 AND status = 'processing' AND expires_at > now()`,
        [input.scope, input.key, input.responseStatus, JSON.stringify(input.responseBody)]);
        return result.rowCount === 1;
      },
    },    outbox: {
      async enqueue(input: { topic: string; payload: unknown; idempotencyKey: string }): Promise<string | null> {
        const result = await db.query<{ id: string }>(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
          VALUES ($1,$2::jsonb,$3) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [input.topic, JSON.stringify(input.payload), input.idempotencyKey]);
        return result.rows[0]?.id ?? null;
      },
    },
    audit: {
      async append(input: { actorUserId?: string; action: string; resourceType: string; resourceId?: string; metadata?: unknown }): Promise<void> {
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
          VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [input.actorUserId ?? null,input.action,input.resourceType,input.resourceId ?? null,JSON.stringify(input.metadata ?? {})]);
      },
    },
  };
}


