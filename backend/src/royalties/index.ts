import { createHash } from 'node:crypto';
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
import { prepareLegacyRoyaltyCsv, previewLegacyRoyaltyCsv } from './legacy-preview.js';
import { LEGACY_ROYALTY_POLICY } from './split.js';
import type { RoyaltyImportFileRow, RoyaltyImportObjectStore } from './store.js';

const allows = createAuthorizer();
const csvCommitEnvelope = z.strictObject({
  csv: z.string().min(1).max(1_000_000),
  source: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/),
  filename: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f\\/]+$/),
  expected_checksum: z.string().regex(/^[0-9a-f]{64}$/),
});
const fileUploadEnvelope = z.strictObject({
  source: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/),
  filename: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f\\/]+$/),
  mime_type: z.literal('text/csv'),
  size: z.number().int().min(1).max(100 * 1024 ** 2),
  checksum: z.string().regex(/^[0-9a-fA-F]{64}$/).transform(value => value.toLowerCase()),
});
type ImportSessionRow = RoyaltyImportFileRow & { source: string; filename: string; status: string; phase: string;
  processed_rows: number; total_rows: number | null; attempts: number; preview_checksum: string | null;
  preview_result: unknown; error_code: string | null; batch_id: string | null; upload_expires_at: Date;
  created_at: Date; updated_at: Date };
export function createRoyaltiesService(pool: Pool, files?: RoyaltyImportObjectStore) {
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
    const errors: { row: number; code: string }[] = [], rows: (RoyaltyRow & { beneficiary_id: string; artist_id: string; label_owner_user_id: string })[] = [];
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
      const mapping = await db.query<{ artist_id: string; financial_owner_user_id: string; label_owner_user_id: string }>(`SELECT t.id, a.id AS artist_id,r.label_id AS label_owner_user_id,
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
      const resolvedRow = row as RoyaltyRow & { beneficiary_id: string; artist_id: string; label_owner_user_id: string };
      resolvedRow.label_owner_user_id = resolved.label_owner_user_id;
      const ownerTotal = (ownerTotals.get(row.beneficiary_id) ?? 0n) + minor(row.net_amount);
      if (ownerTotal > MAX_MINOR) { errors.push({ row: index + 1, code: 'BENEFICIARY_AMOUNT_LIMIT' }); continue; }
      ownerTotals.set(row.beneficiary_id, ownerTotal);
      rows.push(resolvedRow); total += minor(row.net_amount);
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
    const amounts = (await db.query<{ beneficiary_id: string; amount: string }>(`SELECT allocation.owner_id AS beneficiary_id,
      sum(allocation.amount)::text AS amount FROM soundpub.royalty_import_allocations allocation
      JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
      WHERE entry.batch_id=$1 AND allocation.owner_id IS NOT NULL
      GROUP BY allocation.owner_id ORDER BY allocation.owner_id`, [id])).rows;
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
  const sessionProjection = `id,requester_id,source,filename,mime_type,size_bytes::text,source_checksum,status,phase,
    processed_rows,total_rows,attempts,preview_checksum,preview_result,error_code,batch_id,upload_expires_at,created_at,updated_at`;
  const sessionDto = (row: ImportSessionRow) => ({ ...row, upload_expires_at: new Date(row.upload_expires_at).toISOString(),
    created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString() });
  return {
    async requestFileUpload(actor: Principal, input: unknown, requestId: string) {
      if (!files) throw new ApiError(503, 'NOT_READY');
      const value = parse(fileUploadEnvelope, input);
      return authorized(actor, true, async db => {
        const upload = await files.request(actor.id, value);
        const expiresAt = new Date(Date.now() + 300_000);
        const row = (await db.query<ImportSessionRow>(`INSERT INTO soundpub.royalty_import_sessions
          (id,requester_id,source,filename,bucket,object_key,mime_type,size_bytes,source_checksum,upload_expires_at,cleanup_after)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10::timestamptz+interval '24 hours') RETURNING *`,
        [upload.metadata.id,actor.id,value.source,value.filename,files.bucket,files.key(upload.metadata.id),value.mime_type,
          value.size,value.checksum,expiresAt])).rows[0]!;
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'royalty.file_upload_requested','royalty_import_session',$2,$3,$4::jsonb)`,
        [actor.id,row.id,requestId,JSON.stringify({ source: row.source, filename: row.filename, size: value.size })]);
        return { session: sessionDto(row), url: upload.url, method: upload.method, headers: upload.headers,
          expires_at: expiresAt.toISOString() };
      });
    },
    async completeFileUpload(actor: Principal, sessionId: string, requestId: string) {
      if (!files) throw new ApiError(503, 'NOT_READY');
      parse(z.uuid(), sessionId);
      const result = await authorized(actor, true, async db => {
        const row = (await db.query<ImportSessionRow>(`SELECT * FROM soundpub.royalty_import_sessions WHERE id=$1 FOR UPDATE`, [sessionId])).rows[0];
        if (!row || row.requester_id !== actor.id) throw new ApiError(404, 'NOT_FOUND');
        if (row.status === 'UPLOADED' || row.status === 'QUEUED' || row.status === 'PARSING' || row.status === 'PREVIEW_READY') return { session: sessionDto(row) };
        if (row.status !== 'UPLOAD_PENDING' || new Date(row.upload_expires_at).getTime() <= Date.now()) throw new ApiError(409, 'ROYALTY_FILE_UPLOAD_EXPIRED');
        try { await files.verify(row); }
        catch (error) {
          if (!(error instanceof ApiError) || error.statusCode !== 400) throw error;
          const failed = (await db.query<ImportSessionRow>(`UPDATE soundpub.royalty_import_sessions SET status='FAILED',phase='UPLOAD',
            error_code=$2,updated_at=now() WHERE id=$1 RETURNING *`, [row.id,error.code])).rows[0]!;
          return { error, session: sessionDto(failed) };
        }
        const uploaded = (await db.query<ImportSessionRow>(`UPDATE soundpub.royalty_import_sessions SET status='QUEUED',phase='QUEUED',
          error_code=NULL,updated_at=now() WHERE id=$1 RETURNING *`, [row.id])).rows[0]!;
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'royalty.file_uploaded','royalty_import_session',$2,$3,$4::jsonb)`,
        [actor.id,row.id,requestId,JSON.stringify({ checksum: row.source_checksum, size: Number(row.size_bytes) })]);
        return { session: sessionDto(uploaded) };
      });
      if ('error' in result) throw result.error;
      return result;
    },
    async fileSessions(actor: Principal, input: unknown = {}) {
      const query = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(100000).default(0) }), input);
      return authorized(actor, true, async db => ({ items: (await db.query<ImportSessionRow>(`SELECT ${sessionProjection}
        FROM soundpub.royalty_import_sessions ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`, [query.limit,query.offset])).rows.map(sessionDto) }));
    },
    async fileSession(actor: Principal, sessionId: string) {
      parse(z.uuid(), sessionId);
      return authorized(actor, true, async db => {
        const row = (await db.query<ImportSessionRow>(`SELECT ${sessionProjection} FROM soundpub.royalty_import_sessions WHERE id=$1`, [sessionId])).rows[0];
        if (!row) throw new ApiError(404, 'NOT_FOUND');
        return sessionDto(row);
      });
    },
    async commitFileSession(actor: Principal, sessionId: string, requestId: string) {
      if (!files) throw new ApiError(503, 'NOT_READY');
      parse(z.uuid(), sessionId);
      const session = await authorized(actor, true, async db => {
        const row = (await db.query<ImportSessionRow>(`SELECT * FROM soundpub.royalty_import_sessions WHERE id=$1 FOR UPDATE`, [sessionId])).rows[0];
        if (!row) throw new ApiError(404, 'NOT_FOUND');
        if (row.status === 'COMMITTED' && row.batch_id) return row;
        if (!['PREVIEW_READY','COMMITTING'].includes(row.status) || !row.preview_checksum || !row.preview_result) {
          throw new ApiError(409, 'ROYALTY_IMPORT_NOT_READY');
        }
        return (await db.query<ImportSessionRow>(`UPDATE soundpub.royalty_import_sessions SET status='COMMITTING',phase='COMMIT',
          error_code=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [sessionId])).rows[0]!;
      });
      if (session.status === 'COMMITTED' && session.batch_id) return { id: session.batch_id, replayed: true };
      try {
        const csv = await files.read(session);
        const result = await this.commitCsv(actor, { csv, source: session.source, filename: session.filename,
          expected_checksum: session.preview_checksum }, requestId);
        await authorized(actor, true, async db => {
          await db.query(`UPDATE soundpub.royalty_import_sessions SET status='COMMITTED',phase='DONE',batch_id=$2,
            error_code=NULL,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=clock_timestamp()
            WHERE id=$1 AND status='COMMITTING'`, [sessionId,result.id]);
        });
        return result;
      } catch (error) {
        await authorized(actor, true, async db => {
          await db.query(`UPDATE soundpub.royalty_import_sessions SET status='PREVIEW_READY',phase='PREVIEW',
            error_code=$2,updated_at=clock_timestamp() WHERE id=$1 AND status='COMMITTING'`,
          [sessionId,error instanceof ApiError ? error.code : 'ROYALTY_COMMIT_RETRY']);
        });
        throw error;
      }
    },
    async retryFileSession(actor: Principal, sessionId: string) {
      parse(z.uuid(), sessionId);
      return authorized(actor, true, async db => {
        const row = (await db.query<ImportSessionRow>(`SELECT * FROM soundpub.royalty_import_sessions WHERE id=$1 FOR UPDATE`, [sessionId])).rows[0];
        if (!row) throw new ApiError(404, 'NOT_FOUND');
        if (row.status !== 'FAILED' || !row.error_code?.startsWith('ROYALTY_PARSE_')) throw new ApiError(409, 'ROYALTY_IMPORT_RETRY_NOT_ALLOWED');
        const queued = (await db.query<ImportSessionRow>(`UPDATE soundpub.royalty_import_sessions SET status='QUEUED',phase='QUEUED',
          attempts=0,next_attempt_at=clock_timestamp(),error_code=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
          WHERE id=$1 RETURNING *`, [sessionId])).rows[0]!;
        return { session: sessionDto(queued) };
      });
    },
    async fileDownload(actor: Principal, sessionId: string) {
      if (!files) throw new ApiError(503, 'NOT_READY');
      parse(z.uuid(), sessionId);
      return authorized(actor, true, async db => {
        const row = (await db.query<ImportSessionRow>(`SELECT * FROM soundpub.royalty_import_sessions WHERE id=$1`, [sessionId])).rows[0];
        if (!row || !['UPLOADED','QUEUED','PARSING','PREVIEW_READY','COMMITTING','COMMITTED'].includes(row.status)) throw new ApiError(404, 'NOT_FOUND');
        return { url: await files.download(row), expires_in: 60 };
      });
    },
    async previewCsv(actor: Principal, input: unknown) {
      const value = parse(z.strictObject({ csv: z.string().min(1).max(1_000_000) }), input);
      return authorized(actor, true, async db => previewLegacyRoyaltyCsv(db, value.csv));
    },
    async preview(actor: Principal, input: unknown) {
      return authorized(actor, true, async db => (await validate(db, input)).summary);
    },
    async commitCsv(actor: Principal, input: unknown, requestId: string) {
      const value = parse(csvCommitEnvelope, input);
      return authorized(actor, true, async db => {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('royalty-csv-import',0))");
        const prepared = await prepareLegacyRoyaltyCsv(db, value.csv);
        if (prepared.issues.length || !prepared.checksum || !prepared.rows.length || prepared.rows.length > 1000)
          throw new ApiError(400, 'ROYALTY_IMPORT_INVALID');
        if (prepared.checksum !== value.expected_checksum) throw new ApiError(409, 'ROYALTY_PREVIEW_STALE');
        const period = prepared.rows[0]!.period;
        const batchChecksum = createHash('sha256').update(JSON.stringify({ source: value.source,
          checksum: prepared.checksum })).digest('hex');
        const existing = (await db.query<{ id: string }>(
          'SELECT id FROM soundpub.royalty_import_batches WHERE checksum=$1', [batchChecksum])).rows[0];
        if (existing) return { id: existing.id, replayed: true };
        const conflict = await db.query(`SELECT batch.id FROM soundpub.royalty_import_batches batch
          LEFT JOIN soundpub.royalty_import_corrections correction ON correction.batch_id=batch.id
          WHERE batch.source=$1 AND batch.period=$2 AND correction.id IS NULL LIMIT 1`, [value.source,period]);
        if (conflict.rowCount) throw new ApiError(409, 'ROYALTY_PERIOD_CONFLICT');
        const total = decimal(prepared.totals.net);
        const validation = { valid_rows: prepared.rows.length, invalid_rows: 0, period, currency: 'IDR',
          policy_code: LEGACY_ROYALTY_POLICY.code, checksum: prepared.checksum,
          total_net_amount: total, artist_amount: decimal(prepared.totals.artist),
          label_amount: decimal(prepared.totals.label), soundpub_amount: decimal(prepared.totals.soundpub) };
        const batch = (await db.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_batches
          (source,period,currency,checksum,filename,uploader_id,row_count,total_amount,validation_result)
          VALUES ($1,$2,'IDR',$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,
        [value.source,period,batchChecksum,value.filename,actor.id,prepared.rows.length,total,JSON.stringify(validation)])).rows[0]!;
        for (const row of prepared.rows) {
          const entry = (await db.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_entries
            (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,platform,gross_amount,deduction_amount,
              net_amount,artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code,source_isrc,source_upc,
              source_row_number,country,sales_type,sales_unit)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'0',$9,$10,$5,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
          [batch.id,value.source,period,value.filename + ':' + row.sourceRowNumber,row.artistOwnerUserId,row.releaseId,
            row.trackId,row.platform,decimal(row.netMinor),row.artistId,row.labelOwnerUserId,LEGACY_ROYALTY_POLICY.code,
            row.isrc,row.upc || row.catalogUpc || null,row.sourceRowNumber,row.country,row.salesType ?? null,row.salesUnit])).rows[0]!;
          const allocations = [
            ['ARTIST',row.artistOwnerUserId,row.split.artistMinor],
            ['LABEL',row.labelOwnerUserId,row.split.labelMinor],
            ['SOUNDPUB',null,row.split.soundpubMinor],
          ] as const;
          for (const [component, ownerId, amount] of allocations) if (amount > 0n) await db.query(`INSERT INTO soundpub.royalty_import_allocations
            (entry_id,component,owner_id,amount,policy_code) VALUES($1,$2,$3,$4,$5)`,
          [entry.id,component,ownerId,decimal(amount),LEGACY_ROYALTY_POLICY.code]);
        }
        await recordEarnings(db, actor, batch.id);
        await audit(db, actor, batch.id, 'royalty.csv_imported', requestId, { amount: total, currency: 'IDR',
          credited_amount: decimal(prepared.totals.artist + prepared.totals.label), soundpub_amount: decimal(prepared.totals.soundpub),
          old_state: null, new_state: 'UNRECONCILED', idempotency_reference: batchChecksum });
        return { id: batch.id, replayed: false };
      });
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
        for (const row of rows) {
          const entry = (await db.query<{ id: string }>(`INSERT INTO soundpub.royalty_import_entries
            (batch_id,source,period,source_row_id,beneficiary_id,release_id,track_id,platform,gross_amount,deduction_amount,
              net_amount,artist_id,financial_owner_user_id,label_owner_user_id,calculation_policy_code)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$5,$13,'BACKEND_SINGLE_OWNER_V1') RETURNING id`,
          [batch.id,value.source,value.period,row.source_row_id,row.beneficiary_id,row.release_id,row.track_id,row.platform,
            row.gross_amount,row.deduction_amount,row.net_amount,row.artist_id,row.label_owner_user_id])).rows[0]!;
          if (minor(row.net_amount) > 0n) await db.query(`INSERT INTO soundpub.royalty_import_allocations
            (entry_id,component,owner_id,amount,policy_code)
            VALUES ($1,'LEGACY_OWNER',$2,$3,'BACKEND_SINGLE_OWNER_V1')`, [entry.id,row.beneficiary_id,row.net_amount]);
        }
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
        const entries = (await db.query(`SELECT e.id,e.source_row_id,e.source_row_number,e.source_isrc,e.source_upc,
          e.beneficiary_id,e.artist_id,e.financial_owner_user_id,e.label_owner_user_id,e.calculation_policy_code,
          e.release_id,e.track_id,e.platform,e.country,e.sales_type,e.sales_unit,
          e.gross_amount::text,e.deduction_amount::text,e.net_amount::text,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'component',a.component,'owner_id',a.owner_id,
            'amount',a.amount::text,'policy_code',a.policy_code) ORDER BY a.component,a.id)
            FROM soundpub.royalty_import_allocations a WHERE a.entry_id=e.id),'[]'::jsonb) AS allocations
          FROM soundpub.royalty_import_entries e WHERE e.batch_id=$1 ORDER BY e.source_row_id,e.id`, [id])).rows;
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
          sum(a.amount)::text AS gross_earnings,
          sum(CASE WHEN c.id IS NULL THEN 0 ELSE -a.amount END)::text AS corrections,
          sum(CASE WHEN c.id IS NULL THEN a.amount ELSE 0 END)::text AS net_earnings
          FROM soundpub.royalty_import_allocations a
          JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id
          LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=e.batch_id
          WHERE a.owner_id=$1 AND ($2::uuid IS NULL OR e.artist_id=$2)
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
        const row = (await db.query(`SELECT COALESCE(sum(a.amount),0)::numeric(24,2)::text AS gross_earnings,
          COALESCE(sum(CASE WHEN c.id IS NOT NULL THEN -a.amount ELSE 0 END),0)::numeric(24,2)::text AS corrections,
          COALESCE(sum(CASE WHEN c.id IS NULL THEN a.amount ELSE 0 END),0)::numeric(24,2)::text AS net_earnings
          FROM soundpub.royalty_import_allocations a
          JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id
          LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=e.batch_id
          WHERE a.owner_id=$1`, [beneficiary])).rows[0];
        return { beneficiary_id: beneficiary, currency: 'IDR', ...row, status: 'UNRECONCILED', available_balance: null };
      });
    },
  };
}
export type RoyaltiesService = ReturnType<typeof createRoyaltiesService>;

