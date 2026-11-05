import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';

type Summary = { count: number; total: string };
type OwnerAmount = { owner_id: string; expected_minor: string; actual_minor: string };

export async function inspectRoyaltyBatch(db: PoolClient, batchId: string) {
  const batch = (await db.query<{ id: string; uploader_id: string; row_count: number; total_amount: string; checksum: string; corrected: boolean }>(
    `SELECT b.id,b.uploader_id,b.row_count,b.total_amount::text,b.checksum,(c.id IS NOT NULL) AS corrected
     FROM soundpub.royalty_import_batches b
     LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=b.id
     WHERE b.id=$1 FOR SHARE OF b`, [batchId])).rows[0];
  if (!batch) throw new ApiError(404, 'NOT_FOUND');
  if (batch.corrected) throw new ApiError(409, 'ROYALTY_RECONCILIATION_VOIDED');

  const entries = (await db.query<Summary>(`SELECT count(*)::int AS count,
    COALESCE(sum(net_amount),0)::numeric(24,2)::text AS total
    FROM soundpub.royalty_import_entries WHERE batch_id=$1`, [batchId])).rows[0]!;
  const allocations = (await db.query<Summary & { user_total: string }>(`SELECT count(*)::int AS count,
    COALESCE(sum(a.amount),0)::numeric(24,2)::text AS total,
    COALESCE(sum(a.amount) FILTER (WHERE a.owner_id IS NOT NULL),0)::numeric(24,2)::text AS user_total
    FROM soundpub.royalty_import_allocations a
    JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id WHERE e.batch_id=$1`, [batchId])).rows[0]!;
  const owners = (await db.query<OwnerAmount>(`WITH expected AS (
      SELECT a.owner_id,sum(a.amount*100)::bigint AS amount_minor
      FROM soundpub.royalty_import_allocations a JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id
      WHERE e.batch_id=$1 AND a.owner_id IS NOT NULL GROUP BY a.owner_id
    ), actual AS (
      SELECT owner_id,sum(amount_minor)::bigint AS amount_minor
      FROM soundpub.finance_events WHERE business_reference='royalty:'||$1::text AND kind='ROYALTY_EARNING'
      GROUP BY owner_id
    ) SELECT COALESCE(expected.owner_id,actual.owner_id) AS owner_id,
      COALESCE(expected.amount_minor,0)::text AS expected_minor,COALESCE(actual.amount_minor,0)::text AS actual_minor
    FROM expected FULL JOIN actual USING(owner_id) ORDER BY COALESCE(expected.owner_id,actual.owner_id)`, [batchId])).rows;
  const ledger = (await db.query<{ count: number; total_minor: string; broken: number; unexpected: number }>(`SELECT
      count(*)::int AS count,COALESCE(sum(e.amount_minor),0)::text AS total_minor,
      count(*) FILTER (WHERE a.event_id IS NULL OR o.id IS NULL OR a.old_state IS DISTINCT FROM e.old_state
        OR a.new_state IS DISTINCT FROM e.new_state OR o.topic IS DISTINCT FROM 'finance.event'
        OR o.payload IS DISTINCT FROM jsonb_build_object('eventId',e.id)
        OR o.idempotency_key IS DISTINCT FROM 'finance:'||e.id::text)::int AS broken,
      count(*) FILTER (WHERE e.kind<>'ROYALTY_EARNING')::int AS unexpected
    FROM soundpub.finance_events e LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id
    LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
    WHERE e.business_reference='royalty:'||$1::text`, [batchId])).rows[0]!;
  const evidence = (await db.query<{ audits: number; events: number }>(`SELECT
      (SELECT count(*)::int FROM soundpub.audit_logs WHERE resource_type='royalty_import' AND resource_id=$1
        AND action IN ('royalty.imported','royalty.csv_imported','royalty.replacement_imported')) AS audits,
      (SELECT count(*)::int FROM soundpub.outbox_events WHERE topic='royalty.changed' AND payload->>'batch_id'=$1::text
        AND payload->>'action' IN ('royalty.imported','royalty.csv_imported','royalty.replacement_imported')) AS events`, [batchId])).rows[0]!;
  const snapshot = { batch: { id: batch.id, uploader_id: batch.uploader_id, row_count: batch.row_count,
    total_amount: batch.total_amount, checksum: batch.checksum },
    entries, allocations, owners, ledger, evidence };
  const issues: string[] = [];
  if (entries.count !== batch.row_count) issues.push('ENTRY_COUNT_MISMATCH');
  if (entries.total !== batch.total_amount) issues.push('ENTRY_TOTAL_MISMATCH');
  if (allocations.total !== batch.total_amount) issues.push('ALLOCATION_TOTAL_MISMATCH');
  if (owners.some(owner => owner.expected_minor !== owner.actual_minor)) issues.push('LEDGER_OWNER_MISMATCH');
  if (ledger.broken || ledger.unexpected) issues.push('FINANCE_INTEGRITY_MISMATCH');
  if (!evidence.audits) issues.push('IMPORT_AUDIT_MISSING');
  if (!evidence.events) issues.push('IMPORT_OUTBOX_MISSING');
  const checksum = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { snapshot, issues, checksum, matched: issues.length === 0 };
}
