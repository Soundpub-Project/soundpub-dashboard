import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { previewLegacyRoyaltyCsv } from './legacy-preview.js';
import type { RoyaltyImportFileRow, RoyaltyImportObjectStore } from './store.js';

interface JobRow extends RoyaltyImportFileRow {
  status: string;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
}

export type RoyaltyJobOutcome = 'idle' | 'processed' | 'retry' | 'failed';

export function createRoyaltyImportJobProcessor(pool: Pool, store: RoyaltyImportObjectStore, workerId = randomUUID()) {
  async function claim(): Promise<JobRow | null> {
    const db = await pool.connect();
    let discard = false;
    try {
      await db.query('BEGIN');
      const row = (await db.query<JobRow>(`SELECT session.* FROM soundpub.royalty_import_sessions session
        JOIN soundpub.backend_users requester ON requester.id=session.requester_id AND requester.status='active'
        WHERE ((session.status IN ('UPLOADED','QUEUED') AND (session.next_attempt_at IS NULL OR session.next_attempt_at<=clock_timestamp()))
          OR (session.status='PARSING' AND session.lease_expires_at<=clock_timestamp()))
          AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=session.requester_id
            AND role.role IN ('admin','superadmin') AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)
        ORDER BY session.created_at,session.id FOR UPDATE OF session SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) { await db.query('COMMIT'); return null; }
      const claimed = (await db.query<JobRow>(`UPDATE soundpub.royalty_import_sessions SET status='PARSING',phase='PARSE',
        attempts=attempts+1,lease_owner=$2,lease_expires_at=clock_timestamp()+interval '5 minutes',error_code=NULL,
        updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [row.id,workerId])).rows[0]!;
      await db.query('COMMIT');
      return claimed;
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { db.release(discard); }
  }

  async function finish(id: string, preview: Awaited<ReturnType<typeof previewLegacyRoyaltyCsv>>) {
    const result = await pool.query(`UPDATE soundpub.royalty_import_sessions SET status='PREVIEW_READY',phase='PREVIEW',
      processed_rows=$3,total_rows=$4,preview_checksum=$5,preview_result=$6::jsonb,error_code=NULL,
      lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=clock_timestamp()
      WHERE id=$1 AND status='PARSING' AND lease_owner=$2`,
    [id,workerId,preview.parsed_rows,preview.parsed_rows+preview.invalid_rows,preview.checksum,JSON.stringify(preview)]);
    if (!result.rowCount) throw new Error('ROYALTY_JOB_LEASE_LOST');
  }

  async function fail(row: JobRow, code: string, permanent: boolean): Promise<'retry' | 'failed'> {
    const dead = permanent || row.attempts >= 5;
    const delay = Math.min(300, 2 ** Math.max(0, row.attempts - 1));
    const result = await pool.query(`UPDATE soundpub.royalty_import_sessions SET status=$3,phase='PARSE',error_code=$4,
      lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=CASE WHEN $3='QUEUED' THEN clock_timestamp()+($5*interval '1 second') ELSE NULL END,
      updated_at=clock_timestamp() WHERE id=$1 AND status='PARSING' AND lease_owner=$2`,
    [row.id,workerId,dead ? 'FAILED' : 'QUEUED',code,delay]);
    if (!result.rowCount) throw new Error('ROYALTY_JOB_LEASE_LOST');
    return dead ? 'failed' : 'retry';
  }

  return {
    async poll(): Promise<RoyaltyJobOutcome> {
      const revoked = await pool.query(`UPDATE soundpub.royalty_import_sessions session SET status='FAILED',phase='PARSE',
        error_code='ROYALTY_IMPORT_AUTHORITY_REVOKED',lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=clock_timestamp()
        WHERE session.status IN ('UPLOADED','QUEUED','PARSING') AND NOT EXISTS (
          SELECT 1 FROM soundpub.backend_users requester JOIN soundpub.user_roles role ON role.user_id=requester.id
          WHERE requester.id=session.requester_id AND requester.status='active' AND role.role IN ('admin','superadmin')
            AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)`);
      if (revoked.rowCount) return 'failed';
      const row = await claim();
      if (!row) return 'idle';
      try {
        const csv = await store.read(row);
        const db = await pool.connect();
        try { await finish(row.id, await previewLegacyRoyaltyCsv(db, csv)); }
        finally { db.release(); }
        return 'processed';
      } catch (error) {
        const code = error instanceof Error && /^ROYALTY_[A-Z0-9_]+$/.test(error.message) ? error.message : 'ROYALTY_PARSE_RETRY';
        const permanent = ['ROYALTY_FILE_ENCODING_INVALID','ROYALTY_FILE_SIZE_MISMATCH','ROYALTY_FILE_CHECKSUM_MISMATCH'].includes(code);
        return fail(row, code, permanent);
      }
    },
  };
}
