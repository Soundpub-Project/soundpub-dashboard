import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { formatMoney, parseMoney, postEvent } from './index.js';

const allows = createAuthorizer();
const requestInput = z.strictObject({ owner_id: z.uuid(),
  amount: z.string().regex(/^-?(0|[1-9][0-9]{0,15})\.[0-9]{2}$/), reason: z.string().trim().min(10).max(240) });
const reviewInput = z.strictObject({ version: z.number().int().min(1), decision: z.enum(['APPROVE','REJECT']),
  note: z.string().trim().min(10).max(240) });
const pageInput = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0), status: z.enum(['PENDING','APPROVED','REJECTED']).optional() });
const ownerSearchInput = z.strictObject({ search: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(25) });
const columns = "request.id,request.owner_id,COALESCE(owner_profile.full_name,'') AS owner_name," +
  "request.amount_minor::text,request.currency,request.reason,request.status,request.requested_by," +
  "COALESCE(requester_profile.full_name,'') AS requester_name,request.requested_at,request.reviewed_by," +
  "COALESCE(reviewer_profile.full_name,'') AS reviewer_name,request.reviewed_at,request.decision_note," +
  "request.finance_event_id,request.version";
const joins = ' FROM soundpub.finance_adjustment_requests request' +
  ' LEFT JOIN soundpub.profiles owner_profile ON owner_profile.id=request.owner_id' +
  ' LEFT JOIN soundpub.profiles requester_profile ON requester_profile.id=request.requested_by' +
  ' LEFT JOIN soundpub.profiles reviewer_profile ON reviewer_profile.id=request.reviewed_by';
const keyPattern = /^[A-Za-z0-9:_-]{1,128}$/;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const asMoney = (minor: string) => formatMoney(BigInt(minor));

export function createFinanceAdjustmentsService(pool: Pool) {
  async function lockAdmin(db: PoolClient, actor: Principal, ownerId?: string) {
    const ids = [actor.id, ...(ownerId ? [ownerId] : [])];
    const current = (await usersRepository(db).lock(ids, true)).get(actor.id);
    if (!current || !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    return current;
  }
  async function find(db: PoolClient, id: string, lock = false) {
    const suffix = lock ? ' FOR UPDATE OF request' : '';
    const row = (await db.query('SELECT ' + columns + joins + ' WHERE request.id=$1' + suffix, [id])).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return row;
  }
  return {
    async eligibleOwners(actor: Principal, raw: unknown = {}) {
      const parsed = ownerSearchInput.safeParse(raw);
      if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
      return withTransaction(pool, async db => {
        await lockAdmin(db, actor);
        const result = await db.query(`SELECT user_record.id,user_record.email,
          COALESCE(profile.full_name,'') AS full_name,array_agg(DISTINCT role.role ORDER BY role.role) AS roles
          FROM soundpub.backend_users user_record
          JOIN soundpub.profiles profile ON profile.id=user_record.id
          JOIN soundpub.user_roles role ON role.user_id=user_record.id AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL
            AND role.role IN ('artist','label','label_custom','whitelabel','copyright')
          WHERE user_record.status='active' AND ($1='' OR user_record.email ILIKE '%'||$1||'%'
            OR profile.full_name ILIKE '%'||$1||'%')
          GROUP BY user_record.id,profile.full_name
          ORDER BY profile.full_name,user_record.email,user_record.id LIMIT $2`, [parsed.data.search,parsed.data.limit]);
        return { items: result.rows };
      });
    },
    async list(actor: Principal, raw: unknown = {}) {
      const parsed = pageInput.safeParse(raw);
      if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
      return withTransaction(pool, async db => {
        await lockAdmin(db, actor);
        const value = parsed.data;
        const result = await db.query('SELECT ' + columns + joins +
          ' WHERE ($1::text IS NULL OR request.status=$1)' +
          " ORDER BY CASE WHEN request.status='PENDING' THEN 0 ELSE 1 END,request.requested_at DESC,request.id DESC LIMIT $2 OFFSET $3",
        [value.status ?? null,value.limit,value.offset]);
        return { items: result.rows };
      });
    },
    async request(actor: Principal, raw: unknown, key: string, requestId: string) {
      const parsed = requestInput.safeParse(raw);
      if (!parsed.success || !keyPattern.test(key)) throw new ApiError(400, 'BAD_REQUEST');
      const value = parsed.data;
      const amount = formatMoney(parseMoney(value.amount));
      if (parseMoney(amount) === 0n) throw new ApiError(400, 'INVALID_MONEY');
      const requestHash = digest({ owner_id: value.owner_id, amount, reason: value.reason });
      return withTransaction(pool, async db => {
        const current = await lockAdmin(db, actor, value.owner_id);
        const target = (await db.query("SELECT user_record.status,EXISTS(SELECT 1 FROM soundpub.user_roles role " +
          "WHERE role.user_id=user_record.id AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL " +
          "AND role.role IN ('artist','label','label_custom','whitelabel','copyright')) AS eligible " +
          'FROM soundpub.backend_users user_record WHERE user_record.id=$1', [value.owner_id])).rows[0];
        if (!target?.eligible || target.status !== 'active') throw new ApiError(404, 'NOT_FOUND');
        const prior = (await db.query('SELECT id,request_hash FROM soundpub.finance_adjustment_requests WHERE requested_by=$1 AND idempotency_key=$2',
          [current.id,key])).rows[0];
        if (prior) {
          if (prior.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
          return find(db, prior.id);
        }
        const inserted = (await db.query('INSERT INTO soundpub.finance_adjustment_requests ' +
          '(owner_id,amount_minor,reason,requested_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6) ' +
          'ON CONFLICT(requested_by,idempotency_key) DO NOTHING RETURNING id',
        [value.owner_id,parseMoney(amount).toString(),value.reason,current.id,key,requestHash])).rows[0];
        if (!inserted) {
          const concurrent = (await db.query('SELECT id,request_hash FROM soundpub.finance_adjustment_requests WHERE requested_by=$1 AND idempotency_key=$2',
            [current.id,key])).rows[0];
          if (!concurrent || concurrent.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
          return find(db, concurrent.id);
        }
        await db.query("INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata) " +
          "VALUES($1,'finance.adjustment.requested','finance_adjustment',$2,$3,$4::jsonb)",
        [current.id,inserted.id,requestId,JSON.stringify({ ownerId: value.owner_id, amount, currency: 'IDR', idempotencyKey: key })]);
        return find(db,inserted.id);
      });
    },
    async review(actor: Principal, id: string, raw: unknown, key: string, requestId: string) {
      const parsed = reviewInput.safeParse(raw);
      if (!parsed.success || !z.uuid().safeParse(id).success || !keyPattern.test(key)) throw new ApiError(400, 'BAD_REQUEST');
      const input = parsed.data;
      const reviewHash = digest({ decision: input.decision, note: input.note, version: input.version });
      return withTransaction(pool, async db => {
        const current = await lockAdmin(db, actor);
        const request = (await db.query('SELECT ' + columns + ',request.review_key,request.review_hash' + joins +
          ' WHERE request.id=$1 FOR UPDATE OF request', [id])).rows[0] as Record<string, unknown> | undefined;
        if (!request) throw new ApiError(404, 'NOT_FOUND');
        if (request.status !== 'PENDING') {
          if (request.reviewed_by === current.id && request.review_key === key && request.review_hash === reviewHash) return find(db,id);
          throw new ApiError(409, 'CONFLICT');
        }
        if (request.requested_by === current.id) throw new ApiError(403, 'FORBIDDEN');
        if (request.version !== input.version) throw new ApiError(409, 'CONFLICT');
        const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        let eventId: string | null = null;
        if (status === 'APPROVED') {
          const event = await postEvent(db, { ownerId: String(request.owner_id), kind: 'MANUAL_ADJUSTMENT',
            amount: asMoney(String(request.amount_minor)), businessReference: 'manual-adjustment:' + id,
            idempotencyKey: 'manual-adjustment:' + id, actorId: current.id, evidence: String(request.reason) });
          eventId = event.event.id;
        }
        const update = await db.query("UPDATE soundpub.finance_adjustment_requests SET status=$3,reviewed_by=$4," +
          'reviewed_at=clock_timestamp(),review_key=$5,review_hash=$6,decision_note=$7,finance_event_id=$8,version=version+1 ' +
          "WHERE id=$1 AND version=$2 AND status='PENDING' RETURNING id",
        [id,input.version,status,current.id,key,reviewHash,input.note,eventId]);
        if (update.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
        await db.query("INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata) " +
          'VALUES($1,$2,\'finance_adjustment\',$3,$4,$5::jsonb)',
        [current.id,'finance.adjustment.' + status.toLowerCase(),id,requestId,JSON.stringify({ ownerId: request.owner_id,
          amount: asMoney(String(request.amount_minor)), currency: request.currency, financeEventId: eventId, note: input.note })]);
        return find(db,id);
      });
    },
  };
}
export type FinanceAdjustmentsService = ReturnType<typeof createFinanceAdjustmentsService>;
