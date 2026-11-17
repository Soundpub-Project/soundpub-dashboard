import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { createRepositories } from '../db/repositories.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import {
  takedownCreate, takedownEligibleReleaseQuery, takedownListQuery,
  takedownCancellation, takedownTargetTransition, takedownTransition,
  type TakedownCancellation, type TakedownCreate, type TakedownEligibleReleaseQuery,
  type TakedownListQuery, type TakedownTargetTransition, type TakedownTransition,
} from './contracts.js';
export * from './contracts.js';

const allows = createAuthorizer();
const labelRoles = new Set(['label', 'whitelabel', 'label_custom']);
type Cursor = { createdAt: string; id: string; scope: string };
type ReleaseRow = {
  id: string; title: string; artist_name: string; upc: string | null; label_id: string;
  artist_id: string | null; artist_user_id: string | null; created_by: string | null;
  status: string; created_at: string;
};

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function requireActor(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function decodeCursor(value: string | undefined, scope: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as Cursor;
    if (!z.iso.datetime().safeParse(parsed.createdAt).success || !z.uuid().safeParse(parsed.id).success || parsed.scope !== scope) throw new Error();
    return parsed;
  } catch { throw new ApiError(400, 'BAD_REQUEST'); }
}
const concreteDsps = ['Spotify', 'Apple Music', 'YouTube Music', 'Meta', 'TikTok', 'Deezer', 'Amazon Music', 'Tidal'] as const;
const scopeHash = (actorId: string, kind: string, filter: unknown) =>
  createHash('sha256').update(JSON.stringify({ actorId, kind, filter })).digest('base64url');

const requestProjection = `r.id,r.request_code,r.requester_id,r.label_id,r.request_type,r.reason_category,r.reason_detail,r.other_reason,
  r.status,r.priority,r.contact_name,r.contact_position,r.contact_phone,r.contact_email,r.contact_address,
  r.declaration_version,r.declaration_checksum,
  to_char(r.declaration_accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS declaration_accepted_at,
  r.reviewer_id,r.review_note,r.rejection_reason,r.status_before_cancel,
  to_char(r.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS submitted_at,
  to_char(r.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reviewed_at,
  to_char(r.sent_to_dsp_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sent_to_dsp_at,
  to_char(r.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at,r.version,
  to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'release_id',i.release_id,'track_id',i.track_id,
    'title_snapshot',i.title_snapshot,'artist_name_snapshot',i.artist_name_snapshot,'upc_snapshot',i.upc_snapshot,
    'isrc_snapshot',i.isrc_snapshot) ORDER BY i.created_at,i.id) FROM soundpub.takedown_request_items i WHERE i.request_id=r.id),'[]'::jsonb) AS items,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'dsp_name',t.dsp_name,'status',t.status,
    'external_reference',t.external_reference,'submitted_at',to_char(t.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'completed_at',to_char(t.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'failure_reason',t.failure_reason,'admin_note',t.admin_note,'version',t.version) ORDER BY t.created_at,t.id)
    FROM soundpub.takedown_request_targets t WHERE t.request_id=r.id),'[]'::jsonb) AS targets,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'old_status',h.old_status,'new_status',h.new_status,
    'changed_by',h.changed_by,'note',h.note,'created_at',to_char(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    ORDER BY h.created_at,h.id) FROM soundpub.takedown_status_history h WHERE h.request_id=r.id),'[]'::jsonb) AS history,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'media_object_id',m.id,'file_name',d.file_name,
    'document_type',d.document_type,'mime_type',m.mime_type,'file_size',m.size,
    'created_at',to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'download_reference','/api/v1/storage/objects/'||m.id::text||'/download') ORDER BY d.created_at,d.id)
    FROM soundpub.takedown_request_documents d JOIN soundpub.media_objects m ON m.id=d.media_object_id
    WHERE d.request_id=r.id AND m.status='ACTIVE'),'[]'::jsonb) AS documents`;

export function createTakedownsService(pool: Pool) {
  async function notifyRequester(db: PoolClient, actorId: string, recipientId: string, requestId: string,
    type: 'info' | 'error', title: string, body: string, status?: string) {
    await db.query(`INSERT INTO soundpub.notifications(recipient_user_id,kind,type,title,body,metadata_safe,created_by)
      VALUES($1,'USER_NOTIFICATION',$2,$3,$4,$5::jsonb,$6::uuid)`,
    [recipientId,type,title,body,JSON.stringify({ takedown_request_id: requestId, ...(status ? { status } : {}) }),actorId]);
  }
  async function lockedActor(db: PoolClient, actor: Principal, write: boolean) {
    const current = (await usersRepository(db).lock([actor.id], write)).get(actor.id);
    requireActor(current);
    return current;
  }
  function accessSql(admin: boolean) {
    return admin ? '($1::uuid IS NOT NULL)' : '(r.requester_id=$1 OR r.label_id=$1)';
  }
  async function find(db: PoolClient, actor: Principal, id: string, lock = false) {
    const current = await lockedActor(db, actor, lock);
    const admin = allows(current, 'admin');
    const row = (await db.query(`SELECT ${requestProjection} FROM soundpub.takedown_requests r
      WHERE r.id=$2 AND ${accessSql(admin)} ${lock ? 'FOR UPDATE OF r' : ''}`, [current.id, id])).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return { current, row };
  }
  async function eligibleRelease(db: PoolClient, current: Principal, releaseId: string, write: boolean) {
    const row = (await db.query<ReleaseRow>(`SELECT r.id,r.title,r.artist_name,r.upc,r.label_id,r.artist_id,r.artist_user_id,r.created_by,r.status,
      to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
      FROM soundpub.releases r WHERE r.id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [releaseId])).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    if (allows(current, 'admin')) return row;
    if (current.roles.some(role => labelRoles.has(role)) && row.label_id === current.id) return row;
    if (current.roles.includes('artist') && (row.artist_user_id === current.id || row.created_by === current.id)) {
      const parent = (await db.query<{ parent_label_id: string | null }>(
        'SELECT parent_label_id FROM soundpub.profiles WHERE id=$1 FOR SHARE', [current.id])).rows[0]?.parent_label_id;
      if (parent === row.label_id) return row;
    }
    throw new ApiError(404, 'NOT_FOUND');
  }
  return {
    async list(actor: Principal, value: TakedownListQuery) {
      const query = parse(takedownListQuery, value);
      const limit = Number(query.limit ?? 50);
      return withTransaction(pool, async db => {
        const current = await lockedActor(db, actor, false);
        const scope = scopeHash(current.id, 'takedown-list', { status: query.status ?? null, search: query.search ?? null });
        const cursor = decodeCursor(query.cursor, scope);
        const rows = (await db.query(`SELECT ${requestProjection} FROM soundpub.takedown_requests r
          WHERE ${accessSql(allows(current, 'admin'))}
            AND ($2::text IS NULL OR r.status=$2)
            AND ($3::text IS NULL OR strpos(lower(r.reason_category||' '||r.reason_detail),lower($3))>0)
            AND ($4::timestamptz IS NULL OR (r.created_at,r.id)<($4::timestamptz,$5::uuid))
          ORDER BY r.created_at DESC,r.id DESC LIMIT $6`,
        [current.id, query.status ?? null, query.search ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1])).rows;
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return { items, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id, scope }) : null };
      });
    },
    async get(actor: Principal, id: string) {
      return withTransaction(pool, async db => (await find(db, actor, id)).row);
    },
    async eligibleReleases(actor: Principal, value: TakedownEligibleReleaseQuery) {
      const query = parse(takedownEligibleReleaseQuery, value);
      const limit = Number(query.limit ?? 50);
      return withTransaction(pool, async db => {
        const current = await lockedActor(db, actor, false);
        const scope = scopeHash(current.id, 'takedown-eligible-releases', { search: query.search ?? null });
        const cursor = decodeCursor(query.cursor, scope);
        const admin = allows(current, 'admin');
        const label = current.roles.some(role => labelRoles.has(role));
        const artist = current.roles.includes('artist');
        const rows = (await db.query<ReleaseRow>(`SELECT r.id,r.title,r.artist_name,r.upc,r.label_id,r.artist_id,r.artist_user_id,r.created_by,r.status,
          to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
          FROM soundpub.releases r WHERE ($2::boolean OR ($3::boolean AND r.label_id=$1) OR
            ($4::boolean AND (r.artist_user_id=$1 OR r.created_by=$1) AND EXISTS (
              SELECT 1 FROM soundpub.profiles p WHERE p.id=$1 AND p.parent_label_id=r.label_id)))
            AND ($5::text IS NULL OR strpos(lower(r.title||' '||r.artist_name||' '||COALESCE(r.upc,'')),lower($5))>0)
            AND ($6::timestamptz IS NULL OR (r.created_at,r.id)<($6::timestamptz,$7::uuid))
          ORDER BY r.created_at DESC,r.id DESC LIMIT $8`,
        [current.id, admin, label, artist, query.search ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1])).rows;
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return { items, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id, scope }) : null };
      });
    },
    async create(actor: Principal, value: TakedownCreate, idempotencyKey: string, requestId: string) {
      const input = parse(takedownCreate, value);
      if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, 'BAD_REQUEST');
      const normalized = { ...input,
        track_ids: input.track_ids ? [...input.track_ids].sort() : undefined,
        targets: [...(input.targets.includes('Semua DSP') ? concreteDsps : input.targets)].sort(),
      };
      const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      try { return await withTransaction(pool, async db => {
        const current = await lockedActor(db, actor, true);
        const repository = createRepositories(db);
        const scope = `takedown.submit:${current.id}`;
        const claim = await repository.idempotency.begin({ scope, key: idempotencyKey, requestHash,
          expiresAt: new Date(Date.now() + 7 * 86_400_000) });
        if (claim.state === 'completed') return claim.responseBody;
        if (claim.state !== 'new') throw new ApiError(409, 'CONFLICT');
        const release = await eligibleRelease(db, current, input.release_id, true);
        const id = randomUUID();
        const requestCode = `TD-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
        const declarationChecksum = createHash('sha256').update(`${input.declaration_version}:accepted`).digest('hex');
        const scopeKey = createHash('sha256').update(JSON.stringify({ releaseId: release.id,
          trackIds: normalized.track_ids ?? null })).digest('hex');
        let itemRows: Array<{ id: string; title: string; artist_name: string; upc: string | null; isrc: string | null }>;
        if (input.request_type === 'partial') {
          itemRows = (await db.query(`SELECT t.id,t.title,t.artist_name,r.upc,t.isrc FROM soundpub.tracks t
            JOIN soundpub.releases r ON r.id=t.release_id WHERE t.release_id=$1 AND t.id=ANY($2::uuid[])
            ORDER BY t.id FOR SHARE OF t`, [release.id, normalized.track_ids])).rows;
          if (itemRows.length !== normalized.track_ids!.length) throw new ApiError(400, 'BAD_REQUEST');
        } else {
          itemRows = [{ id: release.id, title: release.title, artist_name: release.artist_name, upc: release.upc, isrc: null }];
        }
        await db.query(`INSERT INTO soundpub.takedown_requests(id,request_code,scope_key,requester_id,label_id,request_type,reason_category,
          reason_detail,other_reason,status,priority,contact_name,contact_position,contact_phone,contact_email,contact_address,
          declaration_version,declaration_checksum,declaration_accepted_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,$11,$12,$13,$14,$15,$16,$17,clock_timestamp())`,
        [id,requestCode,scopeKey,current.id,release.label_id,input.request_type,input.reason_category,input.reason_detail,
          input.reason_category === 'Lainnya' ? input.other_reason : null,input.request_type === 'urgent' ? 'urgent' : 'normal',
          input.contact_name,input.contact_position,input.contact_phone,input.contact_email,input.contact_address,
          input.declaration_version,declarationChecksum]);
        for (const item of itemRows) {
          await db.query(`INSERT INTO soundpub.takedown_request_items
            (id,request_id,release_id,track_id,title_snapshot,artist_name_snapshot,upc_snapshot,isrc_snapshot)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(),id,release.id,
            input.request_type === 'partial' ? item.id : null,item.title,item.artist_name,item.upc,item.isrc]);
        }
        for (const dsp of normalized.targets) {
          await db.query(`INSERT INTO soundpub.takedown_request_targets(id,request_id,dsp_name)
            VALUES ($1,$2,$3)`, [randomUUID(),id,dsp]);
        }
        await db.query(`INSERT INTO soundpub.takedown_status_history(id,request_id,old_status,new_status,changed_by,note)
          VALUES ($1,$2,NULL,'SUBMITTED',$3,$4)`, [randomUUID(),id,current.id,'Permohonan takedown diajukan.']);
        await repository.audit.append({ actorUserId: current.id, action: 'takedown.submitted', resourceType: 'takedown',
          resourceId: id, metadata: { releaseId: release.id, labelId: release.label_id, targets: normalized.targets } });
        await repository.outbox.enqueue({ topic: 'takedown.submitted', payload: { requestId: id, requesterId: current.id,
          releaseId: release.id, labelId: release.label_id }, idempotencyKey: `takedown.submitted:${id}` });
        await notifyRequester(db, current.id, current.id, id, 'info', 'Permohonan Takedown Dikirim',
          'Permohonan takedown sedang menunggu review.');
        const response = (await find(db, current, id)).row;
        if (!await repository.idempotency.complete({ scope, key: idempotencyKey, responseStatus: 200, responseBody: response })) {
          throw new ApiError(409, 'CONFLICT');
        }
        return response;
      }); } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new ApiError(409, 'CONFLICT');
        throw error;
      }
    },
    async transition(actor: Principal, id: string, value: TakedownTransition, idempotencyKey: string, requestId: string) {
      const input = parse(takedownTransition, value);
      if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, 'BAD_REQUEST');
      const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      return withTransaction(pool, async db => {
        const { current, row } = await find(db, actor, id, true);
        if (!allows(current, 'admin')) throw new ApiError(404, 'NOT_FOUND');
        const repository = createRepositories(db);
        const scope = `takedown.transition:${id}`;
        const claim = await repository.idempotency.begin({ scope, key: idempotencyKey, requestHash,
          expiresAt: new Date(Date.now() + 7 * 86_400_000) });
        if (claim.state === 'completed') return claim.responseBody;
        if (claim.state !== 'new') throw new ApiError(409, 'CONFLICT');
        const transitions: Record<string, readonly string[]> = {
          SUBMITTED: ['UNDER_REVIEW'], UNDER_REVIEW: ['NEED_DOCUMENT', 'APPROVED', 'REJECTED'],
          NEED_DOCUMENT: ['UNDER_REVIEW', 'REJECTED'], APPROVED: ['SENT_TO_DSP'], CANCEL_REQUESTED: ['CANCELLED'],
        };
        if (!transitions[row.status]?.includes(input.status)) throw new ApiError(409, 'CONFLICT');
        const completed = input.status === 'CANCELLED';
        const result = await db.query(`UPDATE soundpub.takedown_requests SET status=$3,reviewer_id=$4,
          review_note=CASE WHEN $3='REJECTED' THEN review_note ELSE $5 END,
          rejection_reason=CASE WHEN $3='REJECTED' THEN $5 ELSE rejection_reason END,
          reviewed_at=CASE WHEN $3 IN ('UNDER_REVIEW','NEED_DOCUMENT','APPROVED','REJECTED') THEN clock_timestamp() ELSE reviewed_at END,
          sent_to_dsp_at=CASE WHEN $3='SENT_TO_DSP' THEN clock_timestamp() ELSE sent_to_dsp_at END,
          completed_at=CASE WHEN $6::boolean THEN clock_timestamp() ELSE completed_at END,updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`, [id,input.version,input.status,current.id,input.note ?? null,completed]);
        if (result.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
        await db.query(`INSERT INTO soundpub.takedown_status_history(id,request_id,old_status,new_status,changed_by,note)
          VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(),id,row.status,input.status,current.id,input.note ?? null]);
        await repository.audit.append({ actorUserId: current.id, action: 'takedown.transitioned', resourceType: 'takedown',
          resourceId: id, metadata: { requestId, from: row.status, to: input.status, version: input.version } });
        await repository.outbox.enqueue({ topic: 'takedown.status.changed', payload: { requestId: id,
          requesterId: row.requester_id, from: row.status, to: input.status },
        idempotencyKey: `takedown.status.changed:${id}:${input.version + 1}` });
        await notifyRequester(db, current.id, row.requester_id, id, input.status === 'REJECTED' ? 'error' : 'info',
          'Status Takedown Diperbarui', `Status permohonan berubah menjadi ${input.status}.`, input.status);
        const response = (await find(db, current, id)).row;
        if (!await repository.idempotency.complete({ scope, key: idempotencyKey, responseStatus: 200, responseBody: response })) {
          throw new ApiError(409, 'CONFLICT');
        }
        return response;
      });
    },
    async requestCancellation(actor: Principal, id: string, value: TakedownCancellation,
      idempotencyKey: string, requestId: string) {
      const input = parse(takedownCancellation, value);
      if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, 'BAD_REQUEST');
      const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      return withTransaction(pool, async db => {
        const { current, row } = await find(db, actor, id, true);
        if (row.requester_id !== current.id || !['SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED'].includes(row.status)) {
          throw new ApiError(404, 'NOT_FOUND');
        }
        const repository = createRepositories(db);
        const scope = `takedown.cancel:${id}`;
        const claim = await repository.idempotency.begin({ scope, key: idempotencyKey, requestHash,
          expiresAt: new Date(Date.now() + 7 * 86_400_000) });
        if (claim.state === 'completed') return claim.responseBody;
        if (claim.state !== 'new') throw new ApiError(409, 'CONFLICT');
        const result = await db.query(`UPDATE soundpub.takedown_requests
          SET status_before_cancel=status,status='CANCEL_REQUESTED',updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`, [id,input.version]);
        if (result.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
        await db.query(`INSERT INTO soundpub.takedown_status_history(id,request_id,old_status,new_status,changed_by,note)
          VALUES ($1,$2,$3,'CANCEL_REQUESTED',$4,$5)`, [randomUUID(),id,row.status,current.id,input.reason]);
        await repository.audit.append({ actorUserId: current.id, action: 'takedown.cancellation_requested', resourceType: 'takedown',
          resourceId: id, metadata: { requestId, from: row.status, version: input.version } });
        await repository.outbox.enqueue({ topic: 'takedown.status.changed', payload: { requestId: id,
          requesterId: current.id, from: row.status, to: 'CANCEL_REQUESTED' },
        idempotencyKey: `takedown.status.changed:${id}:${input.version + 1}` });
        const response = (await find(db, current, id)).row;
        if (!await repository.idempotency.complete({ scope, key: idempotencyKey, responseStatus: 200, responseBody: response })) {
          throw new ApiError(409, 'CONFLICT');
        }
        return response;
      });
    },
    async transitionTarget(actor: Principal, id: string, targetId: string, value: TakedownTargetTransition,
      idempotencyKey: string, requestId: string) {
      const input = parse(takedownTargetTransition, value);
      if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, 'BAD_REQUEST');
      const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      return withTransaction(pool, async db => {
        const { current, row } = await find(db, actor, id, true);
        if (!allows(current, 'admin') || !['SENT_TO_DSP','PROCESSING_DSP','PARTIALLY_COMPLETED'].includes(row.status)) {
          throw new ApiError(404, 'NOT_FOUND');
        }
        const target = (await db.query<{ id: string; status: string; version: number }>(
          'SELECT id,status,version FROM soundpub.takedown_request_targets WHERE id=$1 AND request_id=$2 FOR UPDATE',
          [targetId,id])).rows[0];
        if (!target) throw new ApiError(404, 'NOT_FOUND');
        const transitions: Record<string, readonly string[]> = { PENDING: ['SUBMITTED'],
          SUBMITTED: ['PROCESSING','COMPLETED','REJECTED'], PROCESSING: ['COMPLETED','REJECTED'] };
        if (!transitions[target.status]?.includes(input.status)) throw new ApiError(409, 'CONFLICT');
        const repository = createRepositories(db);
        const scope = `takedown.target.transition:${targetId}`;
        const claim = await repository.idempotency.begin({ scope, key: idempotencyKey, requestHash,
          expiresAt: new Date(Date.now() + 7 * 86_400_000) });
        if (claim.state === 'completed') return claim.responseBody;
        if (claim.state !== 'new') throw new ApiError(409, 'CONFLICT');
        const changed = await db.query(`UPDATE soundpub.takedown_request_targets SET status=$3,
          external_reference=COALESCE($4,external_reference),failure_reason=CASE WHEN $3='REJECTED' THEN $5 ELSE NULL END,
          admin_note=$6,submitted_at=CASE WHEN $3='SUBMITTED' THEN clock_timestamp() ELSE submitted_at END,
          completed_at=CASE WHEN $3 IN ('COMPLETED','REJECTED') THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
          WHERE id=$1 AND version=$2 RETURNING id`, [targetId,input.version,input.status,input.external_reference ?? null,
          input.failure_reason ?? null,input.admin_note ?? null]);
        if (changed.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
        const counts = (await db.query<{ total: number; completed: number; rejected: number; processing: number; submitted: number }>(
          `SELECT count(*)::int AS total,count(*) FILTER (WHERE status='COMPLETED')::int AS completed,
            count(*) FILTER (WHERE status='REJECTED')::int AS rejected,count(*) FILTER (WHERE status='PROCESSING')::int AS processing,
            count(*) FILTER (WHERE status='SUBMITTED')::int AS submitted
           FROM soundpub.takedown_request_targets WHERE request_id=$1`, [id])).rows[0]!;
        const aggregate = counts.completed === counts.total ? 'COMPLETED'
          : counts.completed + counts.rejected > 0 ? 'PARTIALLY_COMPLETED'
          : counts.processing > 0 ? 'PROCESSING_DSP' : 'SENT_TO_DSP';
        if (aggregate !== row.status) {
          await db.query(`UPDATE soundpub.takedown_requests SET status=$2,
            completed_at=CASE WHEN $2='COMPLETED' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
            WHERE id=$1`, [id,aggregate]);
          await db.query(`INSERT INTO soundpub.takedown_status_history(id,request_id,old_status,new_status,changed_by,note)
            VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(),id,row.status,aggregate,current.id,'Status dihitung dari target DSP.']);
        }
        await repository.audit.append({ actorUserId: current.id, action: 'takedown.target.transitioned', resourceType: 'takedown',
          resourceId: id, metadata: { requestId, targetId, from: target.status, to: input.status, aggregate } });
        await repository.outbox.enqueue({ topic: 'takedown.target.changed', payload: { requestId: id,targetId,
          requesterId: row.requester_id,targetStatus: input.status,requestStatus: aggregate },
        idempotencyKey: `takedown.target.changed:${targetId}:${input.version + 1}` });
        const response = (await find(db, current, id)).row;
        if (!await repository.idempotency.complete({ scope, key: idempotencyKey, responseStatus: 200, responseBody: response })) {
          throw new ApiError(409, 'CONFLICT');
        }
        return response;
      });
    },
  };
}
export type TakedownsService = ReturnType<typeof createTakedownsService>;
