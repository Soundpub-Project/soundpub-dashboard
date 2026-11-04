import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { content, targeted, listQuery, type NotificationDto } from './contracts.js';

const allows = createAuthorizer();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
const visible = `(n.recipient_user_id = $1 OR n.kind = 'GLOBAL_ANNOUNCEMENT')`;
const projection = `n.id, n.recipient_user_id, n.kind, n.type, n.title, n.body,
  '{}'::jsonb AS metadata_safe,
  to_char(r.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS read_at,
  to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
const cursorSchema = z.strictObject({ at: z.iso.datetime(), id: z.uuid() });

export function createNotificationsService(pool: Pool) {
  async function authorized<T>(actor: Principal, admin: boolean, work: (db: PoolClient) => Promise<T>) {
    if (!allows(actor, admin ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!allows(current ?? null, admin ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
      return work(db);
    });
  }
  async function list(actor: Principal, input: unknown = {}, admin = false) {
    const query = parse(listQuery, input);
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (query.cursor) {
      try { cursor = parse(cursorSchema, JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))); }
      catch { throw new ApiError(400, 'BAD_REQUEST'); }
    }
    const limit = query.limit ?? 50;
    return authorized(actor, admin, async db => {
      const rows = (await db.query<NotificationDto>(`SELECT ${projection} FROM soundpub.notifications n
        LEFT JOIN soundpub.notification_reads r ON r.notification_id = n.id AND r.user_id = $1
        WHERE ${admin ? '($1::uuid IS NOT NULL)' : visible}
        AND ($2::timestamptz IS NULL OR (n.created_at,n.id) < ($2::timestamptz,$3::uuid))
        ORDER BY n.created_at DESC,n.id DESC LIMIT $4`, [actor.id, cursor?.at ?? null, cursor?.id ?? null, limit + 1])).rows;
      const items = rows.slice(0, limit), last = items.at(-1);
      return { items, nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString('base64url') : null };
    });
  }
  async function audit(db: PoolClient, actor: Principal, id: string, action: string, requestId: string) {
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id)
      VALUES ($1,$2,'notification',$3,$4)`, [actor.id, action, id, requestId]);
  }
  return {
    list,
    async unreadCount(actor: Principal) {
      return authorized(actor, false, async db => ({ count: Number((await db.query(`SELECT count(*) FROM soundpub.notifications n
        WHERE ${visible} AND NOT EXISTS (SELECT 1 FROM soundpub.notification_reads r WHERE r.notification_id=n.id AND r.user_id=$1)`, [actor.id])).rows[0].count) }));
    },
    async setRead(actor: Principal, id: string, read = true) {
      parse(z.uuid(), id);
      return authorized(actor, false, async db => {
        const found = await db.query(`SELECT n.id FROM soundpub.notifications n WHERE ${visible} AND n.id=$2 FOR SHARE`, [actor.id, id]);
        if (!found.rowCount) throw new ApiError(404, 'NOT_FOUND');
        if (!read) {
          await db.query('DELETE FROM soundpub.notification_reads WHERE notification_id=$1 AND user_id=$2', [id, actor.id]);
          return { id, read_at: null };
        }
        await db.query(`INSERT INTO soundpub.notification_reads(notification_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, actor.id]);
        const row = (await db.query(`SELECT to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS read_at
          FROM soundpub.notification_reads WHERE notification_id=$1 AND user_id=$2`, [id, actor.id])).rows[0];
        return { id, read_at: row.read_at as string };
      });
    },
    async readAll(actor: Principal) {
      return authorized(actor, false, async db => ({ updated: (await db.query(`INSERT INTO soundpub.notification_reads(notification_id,user_id)
        SELECT n.id,$1 FROM soundpub.notifications n WHERE ${visible} ON CONFLICT DO NOTHING`, [actor.id])).rowCount ?? 0 }));
    },
    async create(actor: Principal, input: unknown, requestId: string, announcement = false) {
      const value = announcement ? parse(content, input) : parse(targeted, input);
      return authorized(actor, true, async db => {
        const recipient = 'recipient_user_id' in value ? value.recipient_user_id : null;
        if (recipient && !(await db.query('SELECT id FROM soundpub.backend_users WHERE id=$1', [recipient])).rowCount) throw new ApiError(404, 'NOT_FOUND');
        const row = (await db.query<{ id: string }>(`INSERT INTO soundpub.notifications(recipient_user_id,kind,type,title,body,created_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [recipient, announcement ? 'GLOBAL_ANNOUNCEMENT' : 'USER_NOTIFICATION',
          announcement ? 'announcement' : ('type' in value ? value.type : 'info'), value.title, value.body, actor.id])).rows[0]!;
        await audit(db, actor, row.id, announcement ? 'announcement.created' : 'notification.created', requestId);
        return row;
      });
    },
    async update(actor: Principal, id: string, input: unknown, requestId: string) {
      parse(z.uuid(), id); const value = parse(content, input);
      return authorized(actor, true, async db => {
        if (!(await db.query('UPDATE soundpub.notifications SET title=$2,body=$3 WHERE id=$1', [id, value.title, value.body])).rowCount) throw new ApiError(404, 'NOT_FOUND');
        await audit(db, actor, id, 'notification.updated', requestId); return { id };
      });
    },
    async remove(actor: Principal, id: string, requestId: string) {
      parse(z.uuid(), id);
      return authorized(actor, true, async db => {
        if (!(await db.query('DELETE FROM soundpub.notifications WHERE id=$1', [id])).rowCount) throw new ApiError(404, 'NOT_FOUND');
        await audit(db, actor, id, 'notification.deleted', requestId); return { id };
      });
    },
  };
}
export type NotificationsService = ReturnType<typeof createNotificationsService>;
