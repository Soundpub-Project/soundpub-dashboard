import { customFinanceScope } from '../finance/custom.js';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { canonicalRow, decimal, fingerprint, importEnvelope, minor, parse, royaltyRow, type RoyaltyRow } from './contracts.js';
import { MAX_MINOR } from '../finance/money.js';
import { postEvent } from '../finance/index.js';
import { previewLegacyRoyaltyCsv } from './legacy-preview.js';

const allows = createAuthorizer();
export function createRoyaltiesService(pool: Pool) {
  async function authorized<T>(actor: Principal, admin: boolean, work: (db: PoolClient) => Promise<T>) {
    if (!allows(actor, admin ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!allows(current ?? null, admin ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
      return work(db);
    });
  }
  async function validate(db: PoolClient, input: unknown, lock = false) {
    const value = parse(importEnvelope, input);
    const errors: { row: number; code: string }[] = [], rows: (RoyaltyRow & { beneficiary_id: string; artist_id: string })[] = [];
    const seen = new Set<string>(), ownerTotals = new Map<string, bigint>();
    let total = 0n, duplicates = 0, unknownMappings = 0;
    for (const [index, raw] of value.rows.entries()) {
      const result = royaltyRow.safeParse(raw);
      if (!result.success) { errors.push({ row: index + 1, code: 'INVALID_ROW' }); continue; }
      const row = canonicalRow(result.data);
      if (minor(row.gross_amount) - minor(row.deduction_amount) !== minor(row.net_amount)) {
        errors.push({ row: index + 1, code: 'AMOUNT_MISMATCH' }); continue;
      }
      if (seen.has(row.source_row_id)) { duplicates++; errors.push({ row: index + 1, code: 'DUPLICATE_ROW' }); continue; }
      seen.add(row.source_row_id);
      const mapping = await db.query<{ artist_id: string; financial_owner_user_id: string }>(`SELECT t.id, a.id AS artist_id,
        CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED' THEN unit.owner_user_id
          ELSE a.artist_user_id END AS financial_owner_user_id
        FROM soundpub.tracks t JOIN soundpub.releases r ON r.id=t.release_id
        JOIN soundpub.artists a ON a.id=r.artist_id AND a.id=t.artist_id
        LEFT JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
        JOIN soundpub.backend_users u ON u.id=CASE WHEN a.management_mode='LABEL_CUSTOM_MANAGED'
          THEN unit.owner_user_id ELSE a.artist_user_id END
        WHERE t.id=$1 AND r.id=$2 AND u.status='active'
        AND ((a.management_mode='LOGIN_ACCOUNT' AND a.artist_user_id=COALESCE(t.artist_user_id,r.artist_user_id))
          OR (a.management_mode='LABEL_CUSTOM_MANAGED' AND unit.status='active'
            AND r.label_id=unit.owner_user_id AND a.label_id=unit.owner_user_id
            AND t.artist_user_id IS NULL AND r.artist_user_id IS NULL
            AND EXISTS(SELECT 1 FROM soundpub.user_roles ur WHERE ur.user_id=u.id AND ur.role='label_custom')))
        ${lock ? 'FOR SHARE OF t,r,a,u' : ''}`, [row.track_id, row.release_id]);
      const resolved = mapping.rows[0];
      if (!resolved || (row.beneficiary_id && row.beneficiary_id !== resolved.financial_owner_user_id)
        || (row.artist_id && row.artist_id !== resolved.artist_id)) {
        unknownMappings++; errors.push({ row: index + 1, code: 'UNKNOWN_MAPPING' }); continue;
      }
      row.beneficiary_id = resolved.financial_owner_user_id;
      row.artist_id = resolved.artist_id;
      const ownerTotal = (ownerTotals.get(row.beneficiary_id) ?? 0n) + minor(row.net_amount);
      if (ownerTotal > MAX_MINOR) { errors.push({ row: index + 1, code: 'BENEFICIARY_AMOUNT_LIMIT' }); continue; }
      ownerTotals.set(row.beneficiary_id, ownerTotal);
      rows.push(row as RoyaltyRow & { beneficiary_id: string; artist_id: string }); total += minor(row.net_amount);
    }
    const checksum = errors.length ? null : fingerprint(value.source, value.period, value.currency, rows);
    const summary = { valid_rows: rows.length, invalid_rows: errors.length, total_amount: decimal(total),
      currency: value.currency, unknown_mappings: unknownMappings, duplicates, errors,
      warnings: ['UNRECONCILED_NOT_AVAILABLE_BALANCE'], checksum };
    return { value, rows, summary };
  }
  async function audit(db: PoolClient, actor: Principal, id: string, action: string, requestId: string, metadata: unknown) {
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES ($1,$2,'royalty_import',$3,$4,$5::jsonb)`, [actor.id, action, id, requestId, JSON.stringify(metadata)]);
    await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
      VALUES('royalty.changed',$1::jsonb,$2)`,
    [JSON.stringify({ batch_id: id, action, ...metadata as object }), `${action}:${id}`]);
  }
  async function recordEarnings(db: PoolClient, actor: Principal, id: string, reversal = false) {
    const amounts = (await db.query<{ beneficiary_id: string; amount: string }>(`SELECT financial_owner_user_id AS beneficiary_id,
      sum(net_amount)::text AS amount FROM soundpub.royalty_import_entries WHERE batch_id=$1
      GROUP BY financial_owner_user_id ORDER BY financial_owner_user_id`, [id])).rows;
    for (const row of amounts) {
      const amount = minor(row.amount);
      if (amount === 0n) continue;
      await postEvent(db, { ownerId: row.beneficiary_id, currency: 'IDR',
        kind: reversal ? 'ROYALTY_ADJUSTMENT' : 'ROYALTY_EARNING', amount: decimal(reversal ? -amount : amount),
        businessReference: `royalty:${id}`, idempotencyKey: `royalty:${reversal ? 'correction:' : 'earning:'}${id}`,
        actorId: actor.id });
    }
  }
  const batchProjection = `b.id,b.source,b.period,b.currency,b.filename,b.uploader_id,b.row_count,
    b.total_amount::text,b.validation_result,b.checksum,b.created_at,
    CASE WHEN c.id IS NULL THEN b.status ELSE 'VOIDED_WITH_OFFSET' END AS status`;
  const batchJoin = `FROM soundpub.royalty_import_batches b LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=b.id`;
  return {
    async previewCsv(actor: Principal, input: unknown) {
      const value = parse(z.strictObject({ csv: z.string().min(1).max(1_000_000) }), input);
      return authorized(actor, true, async () => previewLegacyRoyaltyCsv(value.csv));
    },
    async preview(actor: Principal, input: unknown) {
      return authorized(actor, true, async db => (await validate(db, input)).summary);
    },
    async commit(actor: Principal, input: unknown, requestId: string) {
      return authorized(actor, true, async db => {
        // Global statement lock also serializes partially-overlapping source rows.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('phase3e:royalty-import',0))");
        const { value, rows, summary } = await validate(db, input, true);
        if (summary.invalid_rows) throw new ApiError(400, 'ROYALTY_IMPORT_INVALID');
        const existing = (await db.query('SELECT id FROM soundpub.royalty_import_batches WHERE checksum=$1', [summary.checksum])).rows[0];
        if (existing) return { id: existing.id as string, replayed: true };
        const overlap = await db.query(`SELECT id FROM soundpub.royalty_import_entries
          WHERE source=$1 AND period=$2 AND source_row_id=ANY($3::text[]) LIMIT 1`,
        [value.source, value.period, rows.map(row => row.source_row_id)]);
        if (overlap.rowCount) throw new ApiError(409, 'ROYALTY_SOURCE_ROW_CONFLICT');
        const batch = (await db.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_batches
          (source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
        [value.source,value.period,value.currency,summary.checksum,value.filename,actor.id,rows.length,summary.total_amount,JSON.stringify(summary)])).rows[0]!;
        for (const row of rows) await db.query(`INSERT INTO soundpub.royalty_import_entries
          (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,platform,gross_amount,deduction_amount,net_amount,artist_id,financial_owner_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$5)`, [batch.id,value.source,value.period,row.source_row_id,
          row.beneficiary_id,row.release_id,row.track_id,row.platform,row.gross_amount,row.deduction_amount,row.net_amount,row.artist_id]);
        await recordEarnings(db, actor, batch.id);
        await audit(db, actor, batch.id, 'royalty.imported', requestId, { amount: summary.total_amount,
          currency: value.currency, old_state: null, new_state: 'UNRECONCILED', idempotency_reference: summary.checksum });
        return { id: batch.id, replayed: false };
      });
    },
    async history(actor: Principal, input: unknown = {}) {
      const query = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100000).default(0) }), input);
      return authorized(actor, true, async db => ({ items: (await db.query(`SELECT ${batchProjection} ${batchJoin}
        ORDER BY b.created_at DESC,b.id DESC LIMIT $1 OFFSET $2`, [query.limit,query.offset])).rows }));
    },
    async detail(actor: Principal, id: string) {
      parse(z.uuid(), id);
      return authorized(actor, true, async db => {
        const batch = (await db.query(`SELECT ${batchProjection} ${batchJoin} WHERE b.id=$1`, [id])).rows[0];
        if (!batch) throw new ApiError(404, 'NOT_FOUND');
        const entries = (await db.query(`SELECT id,source_row_id,beneficiary_id,artist_id,financial_owner_user_id,release_id,track_id,
          gross_amount::text,deduction_amount::text,net_amount::text FROM soundpub.royalty_import_entries
          WHERE batch_id=$1 ORDER BY source_row_id`, [id])).rows;
        return { ...batch, entries };
      });
    },
    async correct(actor: Principal, id: string, input: unknown, requestId: string) {
      parse(z.uuid(), id);
      const { reason } = parse(z.strictObject({ reason: z.string().trim().min(1).max(1000) }), input);
      return authorized(actor, true, async db => {
        const batch = (await db.query(`SELECT total_amount::text,currency,checksum FROM soundpub.royalty_import_batches
          WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!batch) throw new ApiError(404, 'NOT_FOUND');
        const prior = (await db.query('SELECT reason FROM soundpub.royalty_import_corrections WHERE batch_id=$1', [id])).rows[0];
        if (prior) {
          if (prior.reason !== reason) throw new ApiError(409, 'ROYALTY_CORRECTION_CONFLICT');
          return { id, replayed: true };
        }
        await db.query('INSERT INTO soundpub.royalty_import_corrections(batch_id,actor_id,reason) VALUES ($1,$2,$3)', [id,actor.id,reason]);
        await recordEarnings(db, actor, id, true);
        await audit(db, actor, id, 'royalty.corrected', requestId, { amount: `-${batch.total_amount}`, currency: batch.currency,
          old_state: 'UNRECONCILED', new_state: 'VOIDED_WITH_OFFSET', idempotency_reference: `royalty-correction:${id}` });
        return { id, replayed: false };
      });
    },
    async breakdown(actor: Principal, input: unknown = {}) {
      const query = parse(z.strictObject({ artist_id: z.uuid().optional(), release_id: z.uuid().optional(),
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).max(100000).default(0) }), input);
      return authorized(actor, false, async db => {
        if (!await customFinanceScope(db, actor.id)) throw new ApiError(403, 'FORBIDDEN');
        if (query.artist_id && !(await db.query(`SELECT a.id FROM soundpub.artists a
          JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
          WHERE a.id=$1 AND unit.owner_user_id=$2`, [query.artist_id, actor.id])).rowCount)
          throw new ApiError(404, 'NOT_FOUND');
        if (query.release_id && !(await db.query(`SELECT r.id FROM soundpub.releases r
          JOIN soundpub.artists a ON a.id=r.artist_id
          JOIN soundpub.label_custom_units unit ON unit.id=a.label_custom_unit_id
          WHERE r.id=$1 AND r.label_id=$2 AND unit.owner_user_id=$2`, [query.release_id, actor.id])).rowCount)
          throw new ApiError(404, 'NOT_FOUND');
        const items = (await db.query(`SELECT e.artist_id,e.release_id,e.track_id,e.platform,e.period,
          sum(e.gross_amount)::text AS gross_earnings,
          sum(CASE WHEN c.id IS NULL THEN 0 ELSE -e.net_amount END)::text AS corrections,
          sum(CASE WHEN c.id IS NULL THEN e.net_amount ELSE 0 END)::text AS net_earnings
          FROM soundpub.royalty_import_entries e
          LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=e.batch_id
          WHERE e.financial_owner_user_id=$1 AND ($2::uuid IS NULL OR e.artist_id=$2)
            AND ($3::uuid IS NULL OR e.release_id=$3) AND ($4::text IS NULL OR e.period=$4)
          GROUP BY e.artist_id,e.release_id,e.track_id,e.platform,e.period
          ORDER BY e.period DESC,e.artist_id,e.release_id,e.track_id,e.platform
          LIMIT $5 OFFSET $6`, [actor.id,query.artist_id ?? null,query.release_id ?? null,
          query.period ?? null,query.limit,query.offset])).rows;
        return { owner_id: actor.id, currency: 'IDR', status: 'UNRECONCILED', items };
      });
    },
    async summary(actor: Principal, input: unknown = {}) {
      const query = parse(z.strictObject({ beneficiary_id: z.uuid().optional() }), input);
      return authorized(actor, false, async db => {
        const beneficiary = query.beneficiary_id ?? actor.id;
        await customFinanceScope(db, actor.id);
        const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
        if (beneficiary !== actor.id && !allows(current ?? null, 'admin')) throw new ApiError(403, 'FORBIDDEN');
        const row = (await db.query(`SELECT COALESCE(sum(e.gross_amount),0)::numeric(24,2)::text AS gross_earnings,
          COALESCE(sum(CASE WHEN c.id IS NOT NULL THEN -e.net_amount ELSE 0 END),0)::numeric(24,2)::text AS corrections,
          COALESCE(sum(CASE WHEN c.id IS NULL THEN e.net_amount ELSE 0 END),0)::numeric(24,2)::text AS net_earnings
          FROM soundpub.royalty_import_entries e LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=e.batch_id
          WHERE e.financial_owner_user_id=$1`, [beneficiary])).rows[0];
        return { beneficiary_id: beneficiary, currency: 'IDR', ...row, status: 'UNRECONCILED', available_balance: null };
      });
    },
  };
}
export type RoyaltiesService = ReturnType<typeof createRoyaltiesService>;


