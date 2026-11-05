import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { ApiError } from '../api/types.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { parse } from '../royalties/contracts.js';
import { postEvent } from '../finance/index.js';
import { decimal, minor } from '../royalties/contracts.js';
import { beneficiaryMappingCreate, beneficiaryMappingQuery, beneficiaryMappingRevoke, COPYRIGHT_ROYALTY_POLICY_CODE,
  copyrightRoyaltyCorrectionCreate, copyrightRoyaltyImportCreate, copyrightRoyaltyListQuery,
  copyrightRoyaltyReconciliationCreate, parseComposerStatement } from './contracts.js';

const allows = createAuthorizer();
const policyChecksum = createHash('sha256').update(JSON.stringify({
  code: COPYRIGHT_ROYALTY_POLICY_CODE,
  sourceSemantics: 'legacy-final-amount-per-composer',
  allocation: '100-percent-to-db-resolved-beneficiary',
  workSplit: 'not-applicable',
})).digest('hex');
const projection = `m.id, m.composer_code, m.owner_id, m.canonical_name, m.valid_from::text,
  m.valid_through::text, m.created_by, to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  (r.mapping_id IS NOT NULL) AS revoked, r.actor_id AS revoked_by, r.reason AS revocation_reason,
  CASE WHEN r.revoked_at IS NULL THEN NULL ELSE to_char(r.revoked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS revoked_at`;

export interface ComposerRoyaltiesService {
  preview(actor: Principal, input: unknown): Promise<unknown>;
  postImport(actor: Principal, input: unknown, requestId?: string): Promise<unknown>;
  listImports(actor: Principal, input: unknown): Promise<unknown>;
  getImport(actor: Principal, id: string): Promise<unknown>;
  listRoyalties(actor: Principal, input: unknown): Promise<unknown>;
  correct(actor: Principal, id: string, input: unknown, requestId?: string): Promise<unknown>;
  reconcile(actor: Principal, id: string, input: unknown, requestId?: string): Promise<unknown>;
  createMapping(actor: Principal, input: unknown): Promise<unknown>;
  listMappings(actor: Principal, input: unknown): Promise<unknown>;
  revokeMapping(actor: Principal, id: string, input: unknown): Promise<unknown>;
}

export function createComposerRoyaltiesService(pool: Pool): ComposerRoyaltiesService {
  async function authorized<T>(actor: Principal, role: 'admin' | 'authenticated', work: (db: PoolClient, current: Principal) => Promise<T>) {
    if (!allows(actor, role)) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!current || !allows(current, role)) throw new ApiError(403, 'FORBIDDEN');
      return work(db, current);
    });
  }
  async function previewInDb(db: PoolClient, input: unknown) {
    const statement = parseComposerStatement(input);
    const mappings = await db.query<{ id: string; composer_code: string; owner_id: string; canonical_name: string }>(
      `SELECT DISTINCT ON (lower(m.composer_code)) m.id, m.composer_code, m.owner_id, m.canonical_name
       FROM soundpub.copyright_beneficiary_mappings m
       LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
       WHERE lower(m.composer_code)=ANY($1::text[]) AND m.valid_from <= $2
         AND (m.valid_through IS NULL OR m.valid_through >= $2) AND r.mapping_id IS NULL
       ORDER BY lower(m.composer_code), m.valid_from DESC, m.created_at DESC, m.id DESC`,
    [statement.rows.map(row => row.composer_code.toLocaleLowerCase('en-US')), statement.period]);
    const byCode = new Map(mappings.rows.map(row => [row.composer_code.toLocaleLowerCase('en-US'), row]));
    const rows = statement.rows.map(row => {
      const mapping = byCode.get(row.composer_code.toLocaleLowerCase('en-US'));
      return { ...row, beneficiary_id: mapping?.owner_id ?? null, canonical_name: mapping?.canonical_name ?? null,
        mapping_id: mapping?.id ?? null, status: mapping ? 'MATCHED' as const : 'UNMATCHED' as const };
    });
    const blockers = rows.some(row => row.status === 'UNMATCHED') ? ['COMPOSER_IDENTITY_MAPPING_REQUIRED' as const] : [];
    const snapshot = { ...statement, rows, status: 'UNRECONCILED' as const,
      policy_code: COPYRIGHT_ROYALTY_POLICY_CODE, policy_checksum: policyChecksum,
      posting_allowed: blockers.length === 0, blockers };
    return { ...snapshot, checksum: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
  }
  const batchProjection = `b.id,b.source,b.source_batch,b.period,b.currency,b.uploader_id,b.row_count,
    b.total_amount::numeric(24,2)::text AS total_amount,b.checksum,b.policy_code,b.policy_checksum,
    CASE WHEN soundpub.copyright_royalty_reconciliation_intact(b.id) THEN 'RECONCILED' ELSE 'UNRECONCILED' END AS status,
    to_char(b.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
  const entryProjection = `e.id,e.batch_id,e.composer_code,e.composer_name,e.beneficiary_id,e.canonical_name,e.mapping_id,
    e.amount::numeric(24,2)::text AS amount,e.policy_code,
    to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
  async function detail(db: PoolClient, id: string, beneficiaryId?: string) {
    const batch = (await db.query(`SELECT ${batchProjection} FROM soundpub.copyright_royalty_batches b WHERE b.id=$1
      AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM soundpub.copyright_royalty_entries own WHERE own.batch_id=b.id AND own.beneficiary_id=$2))`,
    [id, beneficiaryId ?? null])).rows[0];
    if (!batch) throw new ApiError(404, 'NOT_FOUND');
    const entries = (await db.query(`SELECT ${entryProjection} FROM soundpub.copyright_royalty_entries e
      WHERE e.batch_id=$1 AND ($2::uuid IS NULL OR e.beneficiary_id=$2) ORDER BY e.created_at,e.id`, [id, beneficiaryId ?? null])).rows;
    return { ...batch, entries };
  }
  async function changeAudit(db: PoolClient, actorId: string, id: string, action: string, requestId: string, metadata: object) {
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,$2,'copyright_royalty',$3,$4,$5::jsonb)`, [actorId, action, id, requestId, JSON.stringify(metadata)]);
    await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
      VALUES('copyright.royalty.changed',$1::jsonb,$2)`, [JSON.stringify({ batch_id: id, action, ...metadata }), `${action}:${id}`]);
  }
  async function mappingRow(db: PoolClient, id: string) {
    return (await db.query(`SELECT ${projection} FROM soundpub.copyright_beneficiary_mappings m
      LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id WHERE m.id=$1`, [id])).rows[0];
  }
  return {
    async preview(actor, input) {
      return authorized(actor, 'admin', db => previewInDb(db, input));
    },
    async postImport(actor, input, requestId = 'copyright-royalty-import') {
      const value = parse(copyrightRoyaltyImportCreate, input);
      return authorized(actor, 'admin', async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 46))',
          [JSON.stringify([value.statement.source,value.statement.source_batch,value.statement.period])]);
        const preview = await previewInDb(db, value.statement);
        if (preview.checksum !== value.expected_checksum) throw new ApiError(409, 'COPYRIGHT_ROYALTY_PREVIEW_STALE');
        if (!preview.posting_allowed) throw new ApiError(409, 'COPYRIGHT_ROYALTY_MAPPING_REQUIRED');
        const replay = (await db.query<{ id: string }>('SELECT id FROM soundpub.copyright_royalty_batches WHERE checksum=$1', [preview.checksum])).rows[0];
        if (replay) return { batch: await detail(db, replay.id), replayed: true };
        const conflict = await db.query(`SELECT 1 FROM soundpub.copyright_royalty_batches
          WHERE source=$1 AND source_batch=$2 AND period=$3 LIMIT 1`, [preview.source, preview.source_batch, preview.period]);
        if (conflict.rowCount) throw new ApiError(409, 'COPYRIGHT_ROYALTY_SOURCE_CONFLICT');
        const beneficiaryIds = [...new Set(preview.rows.map(row => row.beneficiary_id!))].sort();
        const beneficiaries = await usersRepository(db).lock(beneficiaryIds, false);
        if (beneficiaryIds.some(id => { const user = beneficiaries.get(id); return !user || user.status !== 'active' || !user.roles.includes('copyright'); }))
          throw new ApiError(409, 'COPYRIGHT_ROYALTY_BENEFICIARY_INVALID');
        const batch = (await db.query<{ id: string }>(`INSERT INTO soundpub.copyright_royalty_batches
          (source,source_batch,period,currency,uploader_id,row_count,total_amount,checksum,policy_code,policy_checksum)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [preview.source,preview.source_batch,preview.period,preview.currency,actor.id,preview.rows.length,preview.total_amount,
          preview.checksum,preview.policy_code,preview.policy_checksum])).rows[0]!;
        for (const [index, row] of preview.rows.entries()) {
          await db.query(`INSERT INTO soundpub.copyright_royalty_entries
            (batch_id,row_number,composer_code,composer_name,beneficiary_id,canonical_name,mapping_id,amount,policy_code)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [batch.id,index + 1,row.composer_code,row.composer_name,row.beneficiary_id,row.canonical_name,row.mapping_id,
            row.total_net_royalti,preview.policy_code]);
        }
        const totals = new Map<string,bigint>();
        for (const row of preview.rows) totals.set(row.beneficiary_id!, (totals.get(row.beneficiary_id!) ?? 0n) + minor(row.total_net_royalti));
        for (const [beneficiaryId, amount] of [...totals].sort(([left], [right]) => left.localeCompare(right))) {
          await postEvent(db, { ownerId: beneficiaryId, currency: 'IDR', kind: 'ROYALTY_EARNING', amount: decimal(amount),
            businessReference: `copyright-royalty:${batch.id}`,
            idempotencyKey: `copyright-royalty:earning:${batch.id}:${beneficiaryId}`, actorId: actor.id });
        }
        await changeAudit(db, actor.id, batch.id, 'copyright_royalty.imported', requestId,
          { checksum: preview.checksum, policy_code: preview.policy_code, policy_checksum: preview.policy_checksum });
        return { batch: await detail(db, batch.id), replayed: false };
      });
    },
    async listImports(actor, input) {
      const query = parse(copyrightRoyaltyListQuery, input);
      return authorized(actor, 'admin', async db => {
        const limit = Number(query.limit ?? 50), offset = Number(query.offset ?? 0);
        const rows = (await db.query(`SELECT ${batchProjection} FROM soundpub.copyright_royalty_batches b
          ORDER BY b.created_at DESC,b.id DESC LIMIT $1 OFFSET $2`, [limit + 1, offset])).rows;
        return { items: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
      });
    },
    async getImport(actor, id) {
      parse(z.uuid(), id);
      return authorized(actor, 'admin', db => detail(db, id));
    },
    async listRoyalties(actor, input) {
      const query = parse(copyrightRoyaltyListQuery, input);
      return authorized(actor, 'authenticated', async (db, current) => {
        const admin = allows(current, 'admin');
        if (!admin && !current.roles.includes('copyright')) throw new ApiError(403, 'FORBIDDEN');
        const limit = Number(query.limit ?? 50), offset = Number(query.offset ?? 0);
        const rows = (await db.query(`SELECT ${entryProjection} FROM soundpub.copyright_royalty_entries e
          WHERE ($1::uuid IS NULL OR e.beneficiary_id=$1) ORDER BY e.created_at DESC,e.id DESC LIMIT $2 OFFSET $3`,
        [admin ? null : current.id, limit + 1, offset])).rows;
        return { items: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
      });
    },
    async correct(actor, id, input, requestId = 'copyright-royalty-correction') {
      parse(z.uuid(), id); const value = parse(copyrightRoyaltyCorrectionCreate, input);
      return authorized(actor, 'admin', async db => {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('copyright-royalty-correction:'||$1::text,0))", [id]);
        const batch = (await db.query('SELECT id FROM soundpub.copyright_royalty_batches WHERE id=$1', [id])).rows[0];
        if (!batch) throw new ApiError(404, 'NOT_FOUND');
        const existing = (await db.query(`SELECT id,batch_id,reason,actor_id,
          to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
          FROM soundpub.copyright_royalty_corrections WHERE batch_id=$1`, [id])).rows[0];
        if (existing) throw new ApiError(409, 'COPYRIGHT_ROYALTY_ALREADY_CORRECTED');
        const totals = (await db.query<{ beneficiary_id: string; amount: string }>(`SELECT beneficiary_id,
          (-sum(amount))::numeric(24,2)::text AS amount FROM soundpub.copyright_royalty_entries
          WHERE batch_id=$1 GROUP BY beneficiary_id ORDER BY beneficiary_id`, [id])).rows;
        if (!totals.length) throw new ApiError(409, 'COPYRIGHT_ROYALTY_BATCH_EMPTY');
        const targets = await usersRepository(db).lock(totals.map(row => row.beneficiary_id), false);
        if (totals.some(row => { const target = targets.get(row.beneficiary_id);
          return !target || target.status !== 'active' || !target.roles.includes('copyright'); }))
          throw new ApiError(409, 'COPYRIGHT_ROYALTY_BENEFICIARY_INVALID');
        for (const total of totals) await postEvent(db, { ownerId: total.beneficiary_id, currency: 'IDR', kind: 'ROYALTY_ADJUSTMENT',
          amount: total.amount, businessReference: `copyright-royalty:${id}`,
          idempotencyKey: `copyright-royalty:correction:${id}:${total.beneficiary_id}`, actorId: actor.id });
        const correction = (await db.query(`INSERT INTO soundpub.copyright_royalty_corrections
          (batch_id,reason,actor_id) VALUES($1,$2,$3)
          RETURNING id,batch_id,reason,actor_id,
          to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`,
        [id,value.reason,actor.id])).rows[0];
        await changeAudit(db, actor.id, id, 'copyright_royalty.corrected', requestId, { correction_id: correction.id });
        return correction;
      });
    },
    async reconcile(actor, id, input, requestId = 'copyright-royalty-reconciliation') {
      parse(z.uuid(), id); const value = parse(copyrightRoyaltyReconciliationCreate, input);
      return authorized(actor, 'admin', async db => {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('copyright-royalty-reconciliation:'||$1::text,0))", [id]);
        const batch = (await db.query<{ uploader_id: string }>('SELECT uploader_id FROM soundpub.copyright_royalty_batches WHERE id=$1', [id])).rows[0];
        if (!batch) throw new ApiError(404, 'NOT_FOUND');
        if (batch.uploader_id === actor.id) throw new ApiError(409, 'INDEPENDENT_RECONCILER_REQUIRED');
        if ((await db.query('SELECT 1 FROM soundpub.copyright_royalty_corrections WHERE batch_id=$1', [id])).rowCount)
          throw new ApiError(409, 'COPYRIGHT_ROYALTY_ALREADY_CORRECTED');
        const evidence = (await db.query(`SELECT jsonb_build_object('batch',to_jsonb(b),'entries',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
          FROM soundpub.copyright_royalty_entries e WHERE e.batch_id=b.id),'[]'::jsonb),'corrections',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
          FROM soundpub.copyright_royalty_corrections c WHERE c.batch_id=b.id),'[]'::jsonb)) AS snapshot
          FROM soundpub.copyright_royalty_batches b WHERE b.id=$1`, [id])).rows[0]!.snapshot;
        const snapshotText = JSON.stringify(evidence);
        const snapshotChecksum = createHash('sha256').update(snapshotText).digest('hex');
        const matched = (await db.query<{ matched: boolean }>(
          'SELECT soundpub.copyright_royalty_batch_finance_intact($1) AS matched', [id])).rows[0]?.matched === true;
        const result = matched ? 'MATCHED' : 'MISMATCH';
        const issues = matched ? [] : [{ code: 'COPYRIGHT_ROYALTY_FINANCE_MISMATCH' }];
        const prior = (await db.query(`SELECT id,batch_id,actor_id,result,evidence,snapshot_checksum,snapshot,issues,
          to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
          FROM soundpub.copyright_royalty_reconciliations WHERE batch_id=$1 AND snapshot_checksum=$2 AND result=$3`,
        [id,snapshotChecksum,result])).rows[0];
        if (prior) return { ...prior, replayed: true };
        const action = matched ? 'copyright_royalty.reconciled' : 'copyright_royalty.reconciliation_mismatch';
        const auditLogId = (await db.query<{ id: string }>(`INSERT INTO soundpub.audit_logs
          (actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES($1,$2,'copyright_royalty',$3,$4,$5::jsonb) RETURNING id`,
        [actor.id,action,id,requestId,JSON.stringify({ evidence: value.evidence, idempotency_reference: snapshotChecksum })])).rows[0]!.id;
        const outboxId = (await db.query<{ id: string }>(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
          VALUES('copyright.royalty.changed',$1::jsonb,$2) RETURNING id`,
        [JSON.stringify({ batch_id: id, reconciliation_checksum: snapshotChecksum, result }), matched
          ? `copyright-royalty.reconciled:${id}` : `copyright-royalty.reconciliation-mismatch:${id}:${snapshotChecksum}`])).rows[0]!.id;
        const row = (await db.query(`INSERT INTO soundpub.copyright_royalty_reconciliations
          (batch_id,actor_id,result,evidence,snapshot_checksum,snapshot,issues,audit_log_id,outbox_id)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
          RETURNING id,batch_id,actor_id,result,evidence,snapshot_checksum,snapshot,issues,
          to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`,
        [id,actor.id,result,value.evidence,snapshotChecksum,snapshotText,JSON.stringify(issues),auditLogId,outboxId])).rows[0];
        return { ...row, replayed: false };
      });
    },
    async createMapping(actor, input) {
      const value = parse(beneficiaryMappingCreate, input);
      return authorized(actor, 'admin', async db => {
        const target = (await usersRepository(db).lock([value.owner_id], false)).get(value.owner_id);
        if (!target || target.status !== 'active' || !target.roles.includes('copyright')) throw new ApiError(409, 'MAPPING_TARGET_INVALID');
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 0))', [value.composer_code]);
        const overlap = await db.query(`SELECT 1 FROM soundpub.copyright_beneficiary_mappings m
          LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
          WHERE lower(m.composer_code)=lower($1) AND r.mapping_id IS NULL
            AND m.valid_from <= COALESCE($3, '9999-12')
            AND $2 <= COALESCE(m.valid_through, '9999-12') LIMIT 1`,
        [value.composer_code, value.valid_from, value.valid_through ?? null]);
        if (overlap.rowCount) throw new ApiError(409, 'MAPPING_PERIOD_CONFLICT');
        const id = (await db.query<{ id: string }>(`INSERT INTO soundpub.copyright_beneficiary_mappings
          (composer_code,owner_id,canonical_name,valid_from,valid_through,created_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [value.composer_code, value.owner_id, value.canonical_name, value.valid_from, value.valid_through ?? null, actor.id])).rows[0]!.id;
        return mappingRow(db, id);
      });
    },
    async listMappings(actor, input) {
      const query = parse(beneficiaryMappingQuery, input);
      return authorized(actor, 'admin', async db => {
        const limit = query.limit ? Number(query.limit) : 50;
        const offset = query.offset ? Number(query.offset) : 0;
        const result = await db.query(`SELECT ${projection} FROM soundpub.copyright_beneficiary_mappings m
          LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
          WHERE ($1::text IS NULL OR lower(m.composer_code)=lower($1)) AND ($2::uuid IS NULL OR m.owner_id=$2)
            AND ($3::boolean OR r.mapping_id IS NULL)
          ORDER BY m.created_at DESC, m.id DESC LIMIT $4 OFFSET $5`,
        [query.composer_code ?? null, query.owner_id ?? null, query.include_revoked === 'true', limit + 1, offset]);
        return { items: result.rows.slice(0, limit), next_offset: result.rows.length > limit ? offset + limit : null };
      });
    },
    async revokeMapping(actor, id, input) {
      parse(z.uuid(), id);
      const value = parse(beneficiaryMappingRevoke, input);
      return authorized(actor, 'admin', async db => {
        const exists = await db.query('SELECT id FROM soundpub.copyright_beneficiary_mappings WHERE id=$1 FOR UPDATE', [id]);
        if (!exists.rowCount) throw new ApiError(404, 'NOT_FOUND');
        const inserted = await db.query(`INSERT INTO soundpub.copyright_beneficiary_mapping_revocations(mapping_id,actor_id,reason)
          VALUES ($1,$2,$3) ON CONFLICT (mapping_id) DO NOTHING`, [id, actor.id, value.reason]);
        if (!inserted.rowCount) throw new ApiError(409, 'MAPPING_ALREADY_REVOKED');
        return mappingRow(db, id);
      });
    },
  };
}
