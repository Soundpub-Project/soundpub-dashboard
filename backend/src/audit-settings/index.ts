import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { adminDefaults, adminSettings, auditQuery, publicDefaults, publicSettings,
  settingsPatch, userDefaults, userSettings, userSettingsPatch } from './contracts.js';

const allows = createAuthorizer();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
  return parsed.data;
}
// Project each field independently, rejecting malformed persisted values and unknown keys.
export function projectSettings<T extends z.ZodRawShape>(schema: z.ZodObject<T>, defaults: z.infer<z.ZodObject<T>>, input: unknown) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(schema.shape).map(([key, validator]) => {
    const parsed = (validator as z.ZodType).safeParse(source[key]);
    return [key, parsed.success ? parsed.data : (defaults as Record<string, unknown>)[key]];
  })) as z.infer<z.ZodObject<T>>;
}
const actions = new Set(['profile.updated', 'user.suspended', 'user.status_changed', 'user.roles_changed',
  'artist.created', 'artist.updated', 'artist.removed_from_label', 'artist.deletion_requested', 'artist.deletion_reviewed',
  'label.updated', 'release.created', 'release.updated', 'release.aggregate.created', 'release.aggregate.updated',
  'release.submitted', 'track.created', 'track.updated', 'track.deleted', 'notification.created', 'notification.updated',
  'notification.deleted', 'announcement.created', 'settings.updated', 'user_settings.updated',
  'media.upload_requested', 'media.finalized', 'media.deleted',
  'royalty.file_upload_requested', 'royalty.file_uploaded']);
const resources = new Set(['backend_user', 'artist', 'label', 'release', 'track', 'notification', 'announcement', 'settings', 'user_settings', 'storage_asset', 'media', 'royalty_import_session']);
export function safeAudit(row: Record<string, unknown>) {
  return { id: row.id as string, actor_user_id: row.actor_user_id as string | null,
    action: actions.has(String(row.action)) ? String(row.action) : 'other',
    resource_type: resources.has(String(row.resource_type)) ? String(row.resource_type) : 'other',
    resource_id: z.uuid().safeParse(row.resource_id).success ? row.resource_id as string : null,
    created_at: row.created_at as string };
}
const auditProjection = `id, actor_user_id, action, resource_type, resource_id,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

export function createAuditSettingsService(pool: Pool) {
  async function authorized<T>(actor: Principal, policy: 'admin' | 'authenticated', work: (db: PoolClient) => Promise<T>) {
    if (!allows(actor, policy)) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!allows(current ?? null, policy)) throw new ApiError(403, 'FORBIDDEN');
      return work(db);
    });
  }
  async function readApplication(db: Pick<Pool, 'query'> | PoolClient) {
    return (await db.query<{ settings: unknown; version: number }>(
      'SELECT settings, version FROM soundpub.application_settings WHERE id = true')).rows[0]!;
  }
  return {
    async publicSettings() {
      const row = await readApplication(pool);
      return { settings: projectSettings(publicSettings, publicDefaults, row.settings) };
    },
    async userSettings(actor: Principal) {
      return authorized(actor, 'authenticated', async db => {
        const row = (await db.query('SELECT settings, version FROM soundpub.user_settings WHERE user_id = $1', [actor.id])).rows[0];
        return { settings: projectSettings(userSettings, userDefaults, row?.settings), version: row?.version ?? 1 };
      });
    },
    async adminSettings(actor: Principal) {
      return authorized(actor, 'admin', async db => {
        const row = await readApplication(db);
        return { settings: projectSettings(adminSettings, adminDefaults, row.settings), version: row.version };
      });
    },
    async updateUserSettings(actor: Principal, input: unknown, requestId: string) {
      const patch = parse(userSettingsPatch, input);
      return authorized(actor, 'authenticated', async db => {
        await db.query('INSERT INTO soundpub.user_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [actor.id]);
        const row = (await db.query('SELECT settings, version FROM soundpub.user_settings WHERE user_id = $1 FOR UPDATE', [actor.id])).rows[0]!;
        if (row.version !== patch.version) throw new ApiError(409, 'CONFLICT');
        const settings = { ...projectSettings(userSettings, userDefaults, row.settings), ...patch.settings };
        await db.query('UPDATE soundpub.user_settings SET settings=$2::jsonb, version=version+1 WHERE user_id=$1', [actor.id, JSON.stringify(settings)]);
        await usersRepository(db).audit(actor.id, actor.id, requestId, 'user_settings.updated', { fields: Object.keys(patch.settings), version: row.version + 1 });
        return { settings, version: row.version + 1 };
      });
    },
    async updateAdminSettings(actor: Principal, input: unknown, requestId: string) {
      const patch = parse(settingsPatch, input);
      return authorized(actor, 'admin', async db => {
        const row = (await db.query('SELECT settings, version FROM soundpub.application_settings WHERE id = true FOR UPDATE')).rows[0]!;
        if (row.version !== patch.version) throw new ApiError(409, 'CONFLICT');
        for (const [key, variant] of Object.entries({ dashboard_logo_light: 'light', dashboard_logo_dark: 'dark', favicon: 'default' })) {
          const mediaId = patch.settings[key as keyof typeof patch.settings];
          if (typeof mediaId === 'string' && !(await db.query(`SELECT id FROM soundpub.media_objects WHERE id=$1 AND status='ACTIVE'
            AND category='OTHER' AND resource_type='settings' AND resource_id=$2 AND variant=$3`,
          [mediaId, '00000000-0000-4000-8000-0000000003d0', variant])).rowCount) throw new ApiError(409, 'MEDIA_REFERENCE_INVALID');
        }
        const settings = { ...projectSettings(adminSettings, adminDefaults, row.settings), ...patch.settings };
        await db.query('UPDATE soundpub.application_settings SET settings=$1::jsonb, version=version+1 WHERE id=true', [JSON.stringify(settings)]);
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,request_id,metadata)
          VALUES ($1,'settings.updated','settings',$2,$3::jsonb)`,
        [actor.id, requestId, JSON.stringify({ fields: Object.keys(patch.settings), version: row.version + 1 })]);
        return { settings, version: row.version + 1 };
      });
    },
    async listAudit(actor: Principal, input: unknown) {
      const query = parse(auditQuery, input);
      return authorized(actor, 'admin', async db => {
        const result = await db.query(`SELECT ${auditProjection} FROM soundpub.audit_logs
          WHERE ($1::uuid IS NULL OR actor_user_id=$1) AND ($2::text IS NULL OR action=$2)
          AND ($3::text IS NULL OR resource_type=$3) AND ($4::text IS NULL OR resource_id=$4)
          AND ($5::timestamptz IS NULL OR created_at >= $5) AND ($6::timestamptz IS NULL OR created_at <= $6)
          ORDER BY created_at DESC, id DESC LIMIT $7 OFFSET $8`,
        [query.actor ?? null, query.action ?? null, query.resource ?? null, query.resource_id ?? null,
          query.from ?? null, query.to ?? null, query.limit + 1, query.offset]);
        return { items: result.rows.slice(0, query.limit).map(safeAudit),
          nextOffset: result.rows.length > query.limit ? query.offset + query.limit : null };
      });
    },
    async getAudit(actor: Principal, id: string) {
      parse(z.uuid(), id);
      return authorized(actor, 'admin', async db => {
        const row = (await db.query(`SELECT ${auditProjection} FROM soundpub.audit_logs WHERE id=$1`, [id])).rows[0];
        if (!row) throw new ApiError(404, 'NOT_FOUND');
        return safeAudit(row);
      });
    },
  };
}
export type AuditSettingsService = ReturnType<typeof createAuditSettingsService>;
