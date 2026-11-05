import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import type { Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import type { SubmissionDependencies } from '../submissions/index.js';
import { dto, validateUpload, type MediaRow } from './contracts.js';
import { mediaAuthority } from './authority.js';
import type { MediaObjectStore } from './store.js';
export * from './contracts.js';
export { createMediaObjectStore, type MediaObjectStore, type MediaStoreOptions } from './store.js';

function id(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
  return parsed.data;
}
function binding(row: Pick<MediaRow, 'category' | 'variant'>) {
  if (row.category === 'TAKEDOWN_DOCUMENT') return null;
  if (row.category === 'OTHER') return { table: 'application_settings', column: row.variant === 'light' ? 'dashboard_logo_light'
    : row.variant === 'dark' ? 'dashboard_logo_dark' : 'favicon', url: '' };
  if (row.category === 'USER_AVATAR') return { table: 'profiles', column: 'avatar_media_id', url: 'avatar_url' };
  if (row.category === 'LABEL_LOGO') return { table: 'profiles', column: row.variant === 'light' ? 'logo_light_media_id' : row.variant === 'dark' ? 'logo_dark_media_id' : 'logo_media_id',
    url: row.variant === 'light' ? 'logo_url_light' : row.variant === 'dark' ? 'logo_url_dark' : 'logo_url' };
  if (row.category === 'RELEASE_COVER') return { table: 'releases', column: 'cover_media_id', url: 'cover_url' };
  if (row.category === 'TRACK_AUDIO') return { table: 'tracks', column: 'audio_media_id', url: 'audio_url' };
  throw new ApiError(409, 'MEDIA_CATEGORY_UNSUPPORTED');
}
function settingMedia(row: Pick<MediaRow, 'resource_type' | 'category'>) {
  return row.resource_type === 'settings' && row.category === 'OTHER';
}
async function referenced(db: Pick<Pool, 'query'> | PoolClient, row: MediaRow) {
  const target = binding(row);
  if (!target) return !!(await db.query(`SELECT id FROM soundpub.takedown_request_documents
    WHERE media_object_id=$1`, [row.id])).rowCount;
  return settingMedia(row)
    ? !!(await db.query(`SELECT id FROM soundpub.application_settings WHERE id=true AND settings->>$1=$2`, [target.column, row.id])).rowCount
    : !!(await db.query(`SELECT id FROM soundpub.${target.table} WHERE id=$1 AND ${target.column}=$2`, [row.resource_id, row.id])).rowCount;
}
async function find(db: PoolClient, objectId: string, lock = false) {
  const row = (await db.query<MediaRow>(`SELECT * FROM soundpub.media_objects WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [objectId])).rows[0];
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  return row;
}
async function audit(db: PoolClient, actor: Principal, row: MediaRow, action: string, requestId: string) {
  await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
    VALUES ($1,$2,'media',$3,$4,$5::jsonb)`, [actor.id, action, row.id, requestId,
    JSON.stringify({ category: row.category, resourceType: row.resource_type, resourceId: row.resource_id })]);
}
export function createMediaService(pool: Pool, store: MediaObjectStore) {
  async function authorized(db: PoolClient, actor: Principal, objectId: string, write: boolean) {
    const initial = await find(db, objectId);
    const authority = await mediaAuthority(db, actor, initial, write);
    const row = await find(db, objectId, true);
    if (row.bucket !== store.bucket || row.object_key !== store.key(row.id)) throw new ApiError(409, 'MEDIA_STORE_MISMATCH');
    return { row, ...authority };
  }
  async function remove(actor: Principal, objectId: string, requestId = 'media') {
    const parsed = id(objectId);
    return withTransaction(pool, async db => {
      const { row, current, releaseId } = await authorized(db, actor, parsed, true);
      if (row.status === 'PENDING' && row.owner_user_id !== current.id) throw new ApiError(404, 'NOT_FOUND');
      if (row.status === 'DELETED') return { status: 'deleted' as const };
      const target = binding(row);
      if (!target) {
        if (await referenced(db,row)) throw new ApiError(409, 'CONFLICT');
      }
      if (settingMedia(row)) await db.query(`UPDATE soundpub.application_settings SET
        settings=jsonb_set(settings,ARRAY[$1], 'null'::jsonb),version=version+1
        WHERE id=true AND settings->>$1=$2`, [target!.column,row.id]);
      else if (target) await db.query(`UPDATE soundpub.${target.table} SET ${target.column}=NULL,${target.url}=NULL,updated_at=now()
        WHERE id=$1 AND ${target.column}=$2`, [row.resource_id, row.id]);
      if (releaseId && row.resource_type === 'track' && row.status === 'ACTIVE') await db.query('UPDATE soundpub.releases SET updated_at=now() WHERE id=$1', [releaseId]);
      await db.query(`UPDATE soundpub.media_objects SET status='DELETED',updated_at=now(),
        cleanup_after=GREATEST(expires_at + interval '60 seconds',now()+interval '60 seconds') WHERE id=$1`, [row.id]);
      await audit(db, current, row, 'media.deleted', requestId);
      return { status: 'deleted' as const };
    });
  }
  return {
    async requestUpload(actor: Principal, input: unknown, requestId = 'media') {
      const value = validateUpload(input);
      return withTransaction(pool, async db => {
        const { current } = await mediaAuthority(db, actor, value, true);
        const upload = await store.request(current.id, value);
        const expiresAt = new Date(Date.now() + 300_000);
        const row = (await db.query<MediaRow>(`INSERT INTO soundpub.media_objects
          (id,bucket,object_key,owner_user_id,category,resource_type,resource_id,profile_id,release_id,track_id,
          takedown_request_id,original_filename,variant,mime_type,size,checksum,expires_at,cleanup_after)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17::timestamptz+interval '60 seconds') RETURNING *`,
        [upload.metadata.id, store.bucket, store.key(upload.metadata.id), current.id, value.category, value.resource_type,
          value.resource_id, ['user','label'].includes(value.resource_type) ? value.resource_id : null,
          value.resource_type === 'release' ? value.resource_id : null, value.resource_type === 'track' ? value.resource_id : null,
          value.resource_type === 'takedown' ? value.resource_id : null, value.filename,
          value.variant, value.mime_type, value.size, value.checksum, expiresAt])).rows[0]!;
        await audit(db, current, row, 'media.upload_requested', requestId);
        return { object: dto(row), url: upload.url, method: upload.method, headers: upload.headers, expires_at: expiresAt.toISOString() };
      });
    },
    async completeUpload(actor: Principal, objectId: string, requestId = 'media') {
      const parsed = id(objectId);
      const result = await withTransaction(pool, async db => {
        const { row, current, releaseId } = await authorized(db, actor, parsed, true);
        if (row.owner_user_id !== current.id) throw new ApiError(404, 'NOT_FOUND');
        if (row.status === 'ACTIVE') return { object: dto(row) };
        if (row.status !== 'PENDING' || new Date(row.expires_at).getTime() <= Date.now()) throw new ApiError(409, 'MEDIA_UPLOAD_EXPIRED');
        const target = binding(row);
        const previous = target ? (await db.query<MediaRow>(`SELECT * FROM soundpub.media_objects WHERE category=$1
          AND resource_type=$2 AND resource_id=$3 AND variant=$4 AND status='ACTIVE' FOR UPDATE`,
        [row.category, row.resource_type, row.resource_id, row.variant])).rows[0] : undefined;
        if (previous && (await db.query(`SELECT 1 FROM soundpub.media_objects newer, soundpub.media_objects older
          WHERE newer.id=$1 AND older.id=$2 AND newer.request_order > older.request_order`, [previous.id,row.id])).rowCount) throw new ApiError(409, 'CONFLICT');
        try { await store.verify(row); }
        catch (error) {
          if (!(error instanceof ApiError) || error.statusCode !== 400) throw error;
          await db.query("UPDATE soundpub.media_objects SET status='FAILED',updated_at=now() WHERE id=$1", [row.id]);
          return { error };
        }
        if (previous) await db.query(`UPDATE soundpub.media_objects SET status='REPLACED',updated_at=now(),
          cleanup_after=GREATEST(expires_at+interval '60 seconds',now()+interval '60 seconds') WHERE id=$1`, [previous.id]);
        // Persist stable authenticated API reference, never S3 URL or signed capability.
        if (settingMedia(row)) await db.query(`UPDATE soundpub.application_settings SET
          settings=jsonb_set(settings,ARRAY[$1],to_jsonb($2::text)),version=version+1 WHERE id=true`, [target!.column,row.id]);
        else if (target) await db.query(`UPDATE soundpub.${target.table} SET ${target.column}=$2,${target.url}=$3,updated_at=now() WHERE id=$1`,
          [row.resource_id, row.id, `/api/v1/storage/objects/${row.id}/download`]);
        if (releaseId && row.resource_type === 'track') await db.query('UPDATE soundpub.releases SET updated_at=now() WHERE id=$1', [releaseId]);
        const active = (await db.query<MediaRow>("UPDATE soundpub.media_objects SET status='ACTIVE',updated_at=now() WHERE id=$1 RETURNING *", [row.id])).rows[0]!;
        if (active.category === 'TAKEDOWN_DOCUMENT') {
          await db.query(`INSERT INTO soundpub.takedown_request_documents
            (id,request_id,uploaded_by,media_object_id,file_name,document_type)
            VALUES (gen_random_uuid(),$1,$2,$3,$4,'Pendukung') ON CONFLICT (media_object_id) DO NOTHING`,
          [active.resource_id,current.id,active.id,active.original_filename]);
        }
        await audit(db, current, active, 'media.finalized', requestId);
        return { object: dto(active) };
      });
      if (result.error) throw result.error;
      return result.object!;
    },
    async get(actor: Principal, objectId: string) {
      const parsed = id(objectId);
      return withTransaction(pool, async db => {
        const { row } = await authorized(db, actor, parsed, false);
        if (row.status !== 'ACTIVE') throw new ApiError(404, 'NOT_FOUND');
        return dto(row);
      });
    },
    async download(actor: Principal, objectId: string) {
      const parsed = id(objectId);
      return withTransaction(pool, async db => {
        const { row } = await authorized(db, actor, parsed, false);
        const target = binding(row);
        if (row.status !== 'ACTIVE' || !(await referenced(db, row))) throw new ApiError(404, 'NOT_FOUND');
        if (await store.inspect(row) !== 'ok') throw new ApiError(409, 'MEDIA_BYTES_UNAVAILABLE');
        return { url: await store.download(row), expires_at: new Date(Date.now() + 60_000).toISOString() };
      });
    },
    async publicDownload(key: 'dashboard_logo_light' | 'dashboard_logo_dark' | 'favicon') {
      if (!['dashboard_logo_light','dashboard_logo_dark','favicon'].includes(key)) throw new ApiError(404, 'NOT_FOUND');
      const variant = key === 'dashboard_logo_light' ? 'light' : key === 'dashboard_logo_dark' ? 'dark' : 'default';
      const row = (await pool.query<MediaRow>(`SELECT m.* FROM soundpub.application_settings s JOIN soundpub.media_objects m
        ON m.id::text=s.settings->>$1 WHERE s.id=true AND m.status='ACTIVE' AND m.category='OTHER'
        AND m.resource_type='settings' AND m.resource_id=$2 AND m.variant=$3 AND m.mime_type LIKE 'image/%'`,
      [key, '00000000-0000-4000-8000-0000000003d0', variant])).rows[0];
      if (!row || row.bucket !== store.bucket || row.object_key !== store.key(row.id) || await store.inspect(row) !== 'ok') throw new ApiError(404, 'NOT_FOUND');
      return store.download(row);
    },
    delete: remove,
    abortUpload: remove,
    /** Internal job only: deletes known metadata-owned keys, never unknown/shared bytes. */
    async cleanup(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new ApiError(400, 'BAD_REQUEST');
      const active = (await pool.query<MediaRow>(`SELECT m.* FROM soundpub.media_objects m WHERE status='ACTIVE'
        AND (cleanup_after < now() OR NOT EXISTS (
          SELECT 1 FROM soundpub.profiles p WHERE m.id IN (p.avatar_media_id,p.logo_media_id,p.logo_light_media_id,p.logo_dark_media_id)
          UNION ALL SELECT 1 FROM soundpub.releases r WHERE r.cover_media_id=m.id
          UNION ALL SELECT 1 FROM soundpub.tracks t WHERE t.audio_media_id=m.id
          UNION ALL SELECT 1 FROM soundpub.application_settings s WHERE s.settings->>'dashboard_logo_light'=m.id::text
          OR s.settings->>'dashboard_logo_dark'=m.id::text OR s.settings->>'favicon'=m.id::text))
        ORDER BY updated_at,id LIMIT $1`, [limit])).rows;
      for (const candidate of active) await withTransaction(pool, async db => {
        if (candidate.bucket !== store.bucket || candidate.object_key !== store.key(candidate.id)) return;
        const target = binding(candidate);
        // Parent before media, matching finalize/submission lock order.
        if (candidate.resource_type === 'track') await db.query(`SELECT r.id FROM soundpub.releases r JOIN soundpub.tracks t
          ON t.release_id=r.id WHERE t.id=$1 FOR UPDATE OF r`, [candidate.resource_id]);
        if (settingMedia(candidate)) await db.query('SELECT id FROM soundpub.application_settings WHERE id=true FOR UPDATE');
        else if (target) await db.query(`SELECT ${target.column} AS media_id FROM soundpub.${target.table} WHERE id=$1 FOR UPDATE`, [candidate.resource_id]);
        const row = await find(db, candidate.id, true);
        if (row.status !== 'ACTIVE') return;
        if (!(await referenced(db,row))) await db.query(`UPDATE soundpub.media_objects SET status='REPLACED',
          updated_at=now(),cleanup_after=GREATEST(expires_at+interval '60 seconds',now()+interval '60 seconds') WHERE id=$1`, [row.id]);
        else if (new Date(row.expires_at).getTime() + 60_000 < Date.now()) {
          await store.removeStaging(row);
          await db.query("UPDATE soundpub.media_objects SET cleanup_after='infinity' WHERE id=$1", [row.id]);
        }
      });
      return withTransaction(pool, async db => {
        const candidates = (await db.query<MediaRow>(`SELECT * FROM soundpub.media_objects
          WHERE cleanup_after < now() AND status IN ('PENDING','FAILED','REPLACED','DELETED')
          ORDER BY cleanup_after,id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit])).rows;
        let deleted = 0;
        for (const row of candidates) {
          if (row.bucket !== store.bucket || row.object_key !== store.key(row.id)) continue;
          if (await referenced(db,row)) continue;
          await store.remove(row);
          await db.query(`UPDATE soundpub.media_objects SET status='DELETED',updated_at=now(),cleanup_after='infinity' WHERE id=$1`, [row.id]);
          deleted++;
        }
        return { deleted };
      });
    },
    async reconcile() {
      const rows = (await pool.query<MediaRow>('SELECT * FROM soundpub.media_objects')).rows;
      const known = new Set(rows.flatMap(row => [row.object_key, row.object_key.replace('/objects/', '/staging/')]));
      const issues: { id?: string; key?: string; reason: string }[] = [];
      for (const row of rows) {
        if (row.bucket !== store.bucket || row.object_key !== store.key(row.id)) {
          issues.push({ id: row.id, reason: 'store_mismatch' }); continue;
        }
        if (row.status === 'ACTIVE') {
          const state = await store.inspect(row);
          if (state !== 'ok') issues.push({ id: row.id, reason: state });
          if (!(await referenced(pool,row))) issues.push({ id: row.id, reason: 'unreferenced' });
        }
        if (row.status === 'PENDING' && new Date(row.expires_at).getTime() < Date.now()) issues.push({ id: row.id, reason: 'pending_expired' });
      }
      for (const key of await store.listKeys()) if (!known.has(key)) issues.push({ key, reason: 'unknown_object' });
      return { issues };
    },
  };
}
export type MediaService = ReturnType<typeof createMediaService>;

export function createMediaReadinessAdapter(): NonNullable<SubmissionDependencies['media']> {
  return { async check({ db, release, tracks }) {
    const cover = !!(await db.query(`SELECT m.id FROM soundpub.releases r JOIN soundpub.media_objects m ON m.id=r.cover_media_id
      WHERE r.id=$1 AND m.status='ACTIVE' AND m.category='RELEASE_COVER' AND m.resource_type='release'
      AND m.resource_id=r.id AND m.release_id=r.id`, [release.id])).rowCount;
    const audio = tracks.length > 0 && (await db.query(`SELECT t.id FROM soundpub.tracks t
      JOIN soundpub.media_objects m ON m.id=t.audio_media_id WHERE t.release_id=$1 AND t.id=ANY($2::uuid[])
      AND m.status='ACTIVE' AND m.category='TRACK_AUDIO' AND m.resource_type='track' AND m.resource_id=t.id AND m.track_id=t.id`,
    [release.id, tracks.map(track => track.id)])).rowCount === tracks.length;
    return { cover, audio };
  } };
}
