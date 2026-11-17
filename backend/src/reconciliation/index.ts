import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { usersRepository } from '../users/repository.js';
import { withTransaction } from '../db/pool.js';

interface IssueRow { code: string; resource_type: string | null; resource_id: string | null; detail: Record<string, unknown> | null; total_count: string; fingerprint: string }
interface Check { code: string; sql: string }
export interface FinanceReconciliationIssue { code: string; resourceType: string; resourceId: string; detail: Record<string, unknown> }
export interface FinanceReconciliationRun {
  id: string; status: 'PASS' | 'FAIL'; issue_count: number; issues: FinanceReconciliationIssue[];
  snapshot: Record<string, number>; snapshot_checksum: string; runner: string; started_at: Date; finished_at: Date;
}

const checks: Check[] = [
  { code: 'ROYALTY_BATCH_INTEGRITY', sql: `SELECT 'ROYALTY_BATCH_INTEGRITY' AS code,'royalty_import' AS resource_type,
    b.id::text AS resource_id,jsonb_build_object('status',b.status) AS detail
    FROM soundpub.royalty_import_batches b
    WHERE (EXISTS(SELECT 1 FROM soundpub.royalty_import_corrections c WHERE c.batch_id=b.id)
        AND NOT soundpub.royalty_correction_intact(b.id))
      OR (NOT EXISTS(SELECT 1 FROM soundpub.royalty_import_corrections c WHERE c.batch_id=b.id)
        AND NOT soundpub.royalty_reconciliation_intact(b.id))
    ORDER BY b.id LIMIT $1` },
  { code: 'COPYRIGHT_ROYALTY_BATCH_INTEGRITY', sql: `SELECT 'COPYRIGHT_ROYALTY_BATCH_INTEGRITY' AS code,
    'copyright_royalty' AS resource_type,b.id::text AS resource_id,
    jsonb_build_object('corrected',EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections c WHERE c.batch_id=b.id),
      'matched',EXISTS(SELECT 1 FROM soundpub.copyright_royalty_reconciliations r WHERE r.batch_id=b.id AND r.result='MATCHED')) AS detail
    FROM soundpub.copyright_royalty_batches b
    WHERE (EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections c WHERE c.batch_id=b.id)
        AND NOT soundpub.copyright_royalty_correction_intact(b.id))
      OR (NOT EXISTS(SELECT 1 FROM soundpub.copyright_royalty_corrections c WHERE c.batch_id=b.id)
        AND (NOT EXISTS(SELECT 1 FROM soundpub.copyright_royalty_reconciliations r
          WHERE r.batch_id=b.id AND r.result='MATCHED')
          OR NOT soundpub.copyright_royalty_reconciliation_intact(b.id)))
    ORDER BY b.id LIMIT $1` },
  { code: 'FINANCE_EVIDENCE', sql: `SELECT 'FINANCE_EVIDENCE' AS code,'finance_event' AS resource_type,e.id::text AS resource_id,
    jsonb_build_object('kind',e.kind,'ownerId',e.owner_id) AS detail
    FROM soundpub.finance_events e LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id
    LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
    WHERE a.event_id IS NULL OR o.id IS NULL OR a.old_state IS DISTINCT FROM e.old_state OR a.new_state IS DISTINCT FROM e.new_state
      OR o.topic IS DISTINCT FROM 'finance.event' OR o.payload IS DISTINCT FROM jsonb_build_object('eventId',e.id)
      OR o.idempotency_key IS DISTINCT FROM 'finance:'||e.id::text
    ORDER BY e.id LIMIT $1` },
  { code: 'PAYOUT_INTEGRITY', sql: `WITH broken AS (
    SELECT p.id,p.status,p.amount,COALESCE(sum(a.amount),0) AS allocated
    FROM soundpub.payout_requests p LEFT JOIN soundpub.payout_allocations a ON a.payout_id=p.id GROUP BY p.id
    HAVING COALESCE(sum(a.amount),0)<>p.amount
      OR EXISTS(SELECT 1 FROM soundpub.payout_allocations x WHERE x.payout_id=p.id AND (
        NOT EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=x.owner_id AND e.currency=p.currency
          AND e.business_reference=p.id::text AND e.kind='PAYOUT_RESERVATION' AND e.amount_minor=x.amount*100)
        OR (p.status='paid' AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=x.owner_id AND e.currency=p.currency
          AND e.business_reference=p.id::text AND e.kind='PAYOUT_SETTLEMENT' AND e.amount_minor=x.amount*100))
        OR (p.status IN ('cancelled','failed','rejected') AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=x.owner_id
          AND e.currency=p.currency AND e.business_reference=p.id::text AND e.kind='PAYOUT_RELEASE' AND e.amount_minor=x.amount*100))
        OR (p.status IN ('pending','approved') AND EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.owner_id=x.owner_id
          AND e.business_reference=p.id::text AND e.kind IN ('PAYOUT_RELEASE','PAYOUT_SETTLEMENT')))))
      OR EXISTS(SELECT 1 FROM soundpub.finance_events e WHERE e.business_reference=p.id::text
        AND e.kind IN ('PAYOUT_RESERVATION','PAYOUT_RELEASE','PAYOUT_SETTLEMENT') AND NOT EXISTS(
          SELECT 1 FROM soundpub.payout_allocations x WHERE x.payout_id=p.id AND x.owner_id=e.owner_id
            AND x.amount*100=e.amount_minor AND (e.kind='PAYOUT_RESERVATION'
              OR (e.kind='PAYOUT_SETTLEMENT' AND p.status='paid')
              OR (e.kind='PAYOUT_RELEASE' AND p.status IN ('cancelled','failed','rejected')))))
      OR NOT EXISTS(SELECT 1 FROM soundpub.audit_logs l WHERE l.resource_type='payout' AND l.resource_id=p.id::text
        AND l.action='payout.'||p.status)
      OR NOT EXISTS(SELECT 1 FROM soundpub.outbox_events o WHERE o.topic='payout.changed'
        AND o.payload->>'payout_id'=p.id::text AND o.payload->>'new_state'=p.status)
  ) SELECT 'PAYOUT_INTEGRITY' AS code,'payout' AS resource_type,id::text AS resource_id,
    jsonb_build_object('status',status,'amount',amount::text,'allocated',allocated::text) AS detail
    FROM broken ORDER BY id LIMIT $1` },
  { code: 'PAYMENT_INTEGRITY', sql: `WITH broken AS (
    SELECT i.id,i.status,i.reconciliation_required,CASE WHEN i.provider='mock' THEN m.status ELSE i.provider_status END AS provider_status
    FROM soundpub.payment_invoices i LEFT JOIN soundpub.payment_mock_invoices m ON m.provider_invoice_id=i.provider_invoice_id
    LEFT JOIN soundpub.releases r ON r.id=i.business_id
    WHERE i.reconciliation_required OR (i.provider='mock' AND (m.provider_invoice_id IS NULL OR m.amount_minor<>i.amount_minor OR m.currency<>i.currency OR m.status<>i.status))
      OR (i.provider='xendit' AND i.status<>'CREATING' AND i.provider_status IS DISTINCT FROM i.status)
      OR r.id IS NULL OR r.total_payment_snapshot IS NULL OR r.price_per_track_snapshot IS NULL
      OR r.pricing_snapshot_mode IS NULL OR r.pricing_snapshot_track_count IS NULL
      OR (r.total_payment_snapshot*100)::bigint<>i.amount_minor
      OR (r.pricing_snapshot_mode='per_category' AND r.pricing_snapshot_track_count<>(SELECT count(*) FROM soundpub.tracks t WHERE t.release_id=r.id))
      OR (r.pricing_snapshot_mode='per_track' AND (r.price_per_track_snapshot*100*(SELECT count(*) FROM soundpub.tracks t WHERE t.release_id=r.id))::bigint<>i.amount_minor)
      OR (SELECT count(*) FROM soundpub.payment_effects e WHERE e.invoice_id=i.id AND e.kind='PAYMENT_CHARGE')
           <>CASE WHEN i.status IN ('PAID','REFUNDED') THEN 1 ELSE 0 END
      OR (SELECT count(*) FROM soundpub.payment_effects e WHERE e.invoice_id=i.id AND e.kind='PAYMENT_REFUND')
           <>CASE WHEN i.status='REFUNDED' THEN 1 ELSE 0 END
      OR EXISTS(SELECT 1 FROM soundpub.payment_effects e WHERE e.invoice_id=i.id AND (e.amount_minor<>i.amount_minor OR e.currency<>i.currency
        OR NOT EXISTS(SELECT 1 FROM soundpub.finance_events f WHERE f.business_reference=i.id::text AND f.kind=e.kind
          AND f.amount_minor=e.amount_minor AND f.currency=e.currency AND f.evidence=e.reference AND f.owner_id=i.financial_owner_id)))
      OR EXISTS(SELECT 1 FROM soundpub.finance_events f WHERE f.business_reference=i.id::text
        AND f.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND') AND NOT EXISTS(SELECT 1 FROM soundpub.payment_effects e
          WHERE e.invoice_id=i.id AND e.kind=f.kind AND e.amount_minor=f.amount_minor AND e.currency=f.currency
            AND e.reference=f.evidence AND f.owner_id=i.financial_owner_id))
      OR NOT EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.resource_type='payment_invoice' AND a.resource_id=i.id::text
        AND a.action='payment.invoice_created' AND a.metadata->>'idempotency_reference'=i.idempotency_key)
      OR EXISTS(SELECT 1 FROM soundpub.payment_effects e WHERE e.invoice_id=i.id AND e.kind='PAYMENT_CHARGE'
        AND NOT EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.resource_type='payment_invoice'
          AND a.resource_id=i.id::text AND a.action='payment.callback' AND a.request_id=e.reference))
      OR EXISTS(SELECT 1 FROM soundpub.payment_effects e WHERE e.invoice_id=i.id AND e.kind='PAYMENT_REFUND'
        AND NOT EXISTS(SELECT 1 FROM soundpub.audit_logs a WHERE a.resource_type='payment_invoice'
          AND a.resource_id=i.id::text AND a.action='payment.callback' AND a.request_id=e.reference)
        AND NOT EXISTS(SELECT 1 FROM soundpub.payment_refunds pr JOIN soundpub.audit_logs a
          ON a.resource_type='payment_invoice' AND a.resource_id=i.id::text AND a.action='payment.refund'
            AND a.request_id=pr.idempotency_key
          WHERE pr.invoice_id=i.id AND e.reference='refund:'||pr.idempotency_key))      OR EXISTS(SELECT 1 FROM soundpub.payment_effects e WHERE e.invoice_id=i.id
        AND NOT EXISTS(SELECT 1 FROM soundpub.payment_refunds pr WHERE pr.invoice_id=i.id
          AND e.reference='refund:'||pr.idempotency_key)
        AND NOT EXISTS(SELECT 1 FROM soundpub.payment_callback_receipts receipt JOIN soundpub.webhook_events webhook
          ON webhook.event_id=receipt.event_id AND webhook.provider=CASE WHEN i.provider='mock' THEN 'mock-payment' ELSE 'xendit-invoice' END AND webhook.status='processed'
          WHERE receipt.event_id=e.reference AND receipt.provider_invoice_id=i.provider_invoice_id
            AND receipt.disposition='applied' AND receipt.payload->>'provider_invoice_id'=i.provider_invoice_id
            AND receipt.payload->>'amount_minor'=i.amount_minor::text AND receipt.payload->>'currency'=i.currency
            AND receipt.payload->>'status'=CASE WHEN e.kind='PAYMENT_CHARGE' THEN 'PAID' ELSE 'REFUNDED' END))
  ) SELECT 'PAYMENT_INTEGRITY' AS code,'payment_invoice' AS resource_type,id::text AS resource_id,
    jsonb_build_object('status',status,'providerStatus',provider_status,'reconciliationRequired',reconciliation_required) AS detail
    FROM broken ORDER BY id LIMIT $1` },
  { code: 'COPYRIGHT_PAYMENT_MANUAL_REVIEW', sql: `SELECT 'COPYRIGHT_PAYMENT_MANUAL_REVIEW' AS code,
    'copyright_payment' AS resource_type,p.id::text AS resource_id,
    jsonb_build_object('registrationId',p.registration_id,'status',p.status,
      'providerStatus',p.provider_status,'reconciliationRequired',p.reconciliation_required) AS detail
    FROM soundpub.copyright_registration_payments p
    WHERE p.reconciliation_required OR p.status='RECONCILIATION_REQUIRED'
      OR (p.status IN ('FAILED','EXPIRED') AND p.provider_status='PAID')
    ORDER BY p.id LIMIT $1` },
  { code: 'COPYRIGHT_PAYMENT_CALLBACK_UNRESOLVED', sql: `SELECT 'COPYRIGHT_PAYMENT_CALLBACK_UNRESOLVED' AS code,
    'copyright_payment_callback' AS resource_type,r.provider||':'||r.event_id AS resource_id,
    jsonb_build_object('paymentId',r.payment_id,'providerInvoiceId',r.provider_invoice_id,
      'callbackStatus',r.callback_status,'disposition',r.disposition) AS detail
    FROM soundpub.copyright_registration_payment_callback_receipts r
    WHERE r.disposition<>'APPLIED'
    ORDER BY r.provider,r.event_id LIMIT $1` },
  { code: 'MANUAL_ADJUSTMENT_UNAPPROVED', sql: `SELECT 'MANUAL_ADJUSTMENT_UNAPPROVED' AS code,'finance_event' AS resource_type,
    e.id::text AS resource_id,jsonb_build_object('ownerId',e.owner_id,'businessReference',e.business_reference) AS detail
    FROM soundpub.finance_events e WHERE e.kind='MANUAL_ADJUSTMENT' AND NOT soundpub.finance_adjustments_intact(e.owner_id)
    ORDER BY e.id LIMIT $1` },
  { code: 'ORPHAN_LEDGER_EVENT', sql: `SELECT 'ORPHAN_LEDGER_EVENT' AS code,'finance_event' AS resource_type,e.id::text AS resource_id,
    jsonb_build_object('kind',e.kind,'businessReference',e.business_reference) AS detail
    FROM soundpub.finance_events e WHERE
      (e.kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT') AND
        NOT ((e.business_reference ~ '^royalty:[0-9a-f-]{36}$'
          AND EXISTS(SELECT 1 FROM soundpub.royalty_import_batches b WHERE 'royalty:'||b.id::text=e.business_reference))
        OR (e.business_reference ~ '^copyright-royalty:[0-9a-f-]{36}$'
          AND EXISTS(SELECT 1 FROM soundpub.copyright_royalty_batches b
            WHERE 'copyright-royalty:'||b.id::text=e.business_reference))))
      OR (e.kind IN ('PAYOUT_RESERVATION','PAYOUT_RELEASE','PAYOUT_SETTLEMENT') AND
        NOT EXISTS(SELECT 1 FROM soundpub.payout_requests p WHERE p.id::text=e.business_reference))
      OR (e.kind IN ('PAYMENT_CHARGE','PAYMENT_REFUND') AND
        NOT EXISTS(SELECT 1 FROM soundpub.payment_invoices i WHERE i.id::text=e.business_reference))
    ORDER BY e.id LIMIT $1` },
  { code: 'PAYMENT_CALLBACK_ORPHAN', sql: `SELECT 'PAYMENT_CALLBACK_ORPHAN' AS code,'payment_callback' AS resource_type,
    receipt.event_id AS resource_id,jsonb_build_object('providerInvoiceId',receipt.provider_invoice_id) AS detail
    FROM soundpub.payment_callback_receipts receipt WHERE receipt.disposition='applied'
      AND NOT EXISTS(SELECT 1 FROM soundpub.payment_effects effect WHERE effect.reference=receipt.event_id)
    ORDER BY receipt.event_id LIMIT $1` },  { code: 'PAYMENT_CALLBACK_UNRESOLVED', sql: `SELECT 'PAYMENT_CALLBACK_UNRESOLVED' AS code,'payment_callback' AS resource_type,
    event_id AS resource_id,jsonb_build_object('providerInvoiceId',provider_invoice_id,'disposition',disposition) AS detail
    FROM soundpub.payment_callback_receipts WHERE disposition NOT IN ('applied','ignored') ORDER BY event_id LIMIT $1` },
];

const historyInput = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
const allows = createAuthorizer();
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize(child)]));
  return value;
};
const canonical = (value: unknown) => JSON.stringify(normalize(value));

async function assertAdmin(db: PoolClient, actor: Principal) {
  const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
  if (!current || !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
}

async function collect(db: PoolClient, issueLimit: number) {
  const issues: FinanceReconciliationIssue[] = [];
  const fingerprints: Record<string, string> = {};
  let issueCount = 0;
  for (const check of checks) {
    const sourceSql = check.sql.replace(/\s+ORDER BY [^\n]+ LIMIT \$1$/, '');
    const result = await db.query<IssueRow>(`WITH raw AS (${sourceSql}), issues AS (
      SELECT code,resource_type,resource_id,detail FROM raw), totals AS (
      SELECT count(*) AS total_count,md5(COALESCE(string_agg(code||chr(31)||resource_type||chr(31)||resource_id||chr(31)||detail::text,
        chr(30) ORDER BY code,resource_type,resource_id),'')) AS fingerprint FROM issues)
      SELECT issues.*,totals.total_count::text,totals.fingerprint FROM totals LEFT JOIN issues ON true
      ORDER BY issues.code,issues.resource_type,issues.resource_id LIMIT  $1`, [issueLimit]);
    const total = Number(result.rows[0]?.total_count ?? 0);
    issueCount += total;
    fingerprints[check.code] = result.rows[0]?.fingerprint ?? '';
    if (total > 0) for (const row of result.rows) {
      if (row.resource_type && row.resource_id && row.detail) issues.push({ code: row.code, resourceType: row.resource_type,
        resourceId: row.resource_id, detail: row.detail });
    }
  }
  issues.sort((a, b) => a.code.localeCompare(b.code) || a.resourceId.localeCompare(b.resourceId));
  return { issueCount, issues: issues.slice(0, issueLimit), fingerprints };
}

async function counts(db: PoolClient) {
  const row = (await db.query<Record<string, string>>(`SELECT
    (SELECT count(*) FROM soundpub.royalty_import_batches)::text AS royalty_batches,
    (SELECT count(*) FROM soundpub.copyright_royalty_batches)::text AS copyright_royalty_batches,
    (SELECT count(*) FROM soundpub.finance_events)::text AS finance_events,
    (SELECT count(*) FROM soundpub.payout_requests)::text AS payouts,
    (SELECT count(*) FROM soundpub.payment_invoices)::text AS payment_invoices,
    (SELECT count(*) FROM soundpub.copyright_registration_payments)::text AS copyright_payments,
    (SELECT count(*) FROM soundpub.copyright_registration_payments WHERE reconciliation_required)::text AS copyright_payment_manual_reviews,
    (SELECT count(*) FROM soundpub.copyright_registration_payment_callback_receipts WHERE disposition<>'APPLIED')::text AS copyright_payment_unresolved_callbacks,
    (SELECT count(*) FROM soundpub.finance_events WHERE kind='MANUAL_ADJUSTMENT')::text AS manual_adjustments,
    (SELECT count(*) FROM soundpub.payment_callback_receipts WHERE disposition NOT IN ('applied','ignored'))::text AS unresolved_callbacks`)).rows[0]!;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as Record<string, number>;
}

export async function runFinanceReconciliation(pool: Pool, options: { runner: string; issueLimit?: number; minimumIntervalMs?: number; timeoutMs?: number; now?: Date }) {
  const issueLimit = Math.min(Math.max(options.issueLimit ?? 500, 1), 5000);
  const now = options.now ?? new Date();
  return withTransaction(pool, async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query("SELECT set_config('statement_timeout',$1,true)", [String(options.timeoutMs ?? 5000)]);
    if (!(await db.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock(1936684400,42) AS locked')).rows[0]?.locked) return { outcome: 'locked' as const };
    const latest = (await db.query<{ finished_at: Date; status: 'PASS' | 'FAIL'; snapshot_checksum: string }>('SELECT finished_at,status,snapshot_checksum FROM soundpub.finance_reconciliation_runs ORDER BY finished_at DESC,id DESC LIMIT 1')).rows[0];
    if (latest && options.minimumIntervalMs && now.getTime() - new Date(latest.finished_at).getTime() < options.minimumIntervalMs) return { outcome: 'idle' as const };
    const { issueCount, issues, fingerprints } = await collect(db, issueLimit);
    const snapshot = await counts(db);
    const checksumInput = { fingerprints, issueCount, issues, snapshot };
    const snapshotChecksum = createHash('sha256').update(canonical(checksumInput)).digest('hex');
    const row = (await db.query<FinanceReconciliationRun>(`INSERT INTO soundpub.finance_reconciliation_runs
      (status,issue_count,issues,snapshot,snapshot_checksum,runner,started_at)
      VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING *`, [issueCount ? 'FAIL' : 'PASS', issueCount,
      JSON.stringify(issues), JSON.stringify(snapshot), snapshotChecksum, options.runner, now])).rows[0]!;
    const changed = !latest || latest.status !== row.status || latest.snapshot_checksum !== row.snapshot_checksum;
    if (changed) await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
      VALUES('finance.reconciliation',$1::jsonb,$2)`, [JSON.stringify({ runId: row.id, status: row.status,
      issueCount: row.issue_count, snapshotChecksum: row.snapshot_checksum }), `finance-reconciliation:${row.id}`]);
    return { outcome: 'recorded' as const, run: row, changed };
  });
}

export function createFinanceReconciliationService(pool: Pool) {
  return {
    async latest(actor: Principal) { return withTransaction(pool, async db => { await assertAdmin(db, actor); return (await db.query<FinanceReconciliationRun>(
      'SELECT * FROM soundpub.finance_reconciliation_runs ORDER BY finished_at DESC,id DESC LIMIT 1')).rows[0] ?? null; }); },
    async history(actor: Principal, input: unknown) { const page = historyInput.parse(input); return withTransaction(pool, async db => {
      await assertAdmin(db, actor); return (await db.query<FinanceReconciliationRun>(`SELECT * FROM soundpub.finance_reconciliation_runs
        ORDER BY finished_at DESC,id DESC LIMIT $1 OFFSET $2`, [page.limit, page.offset])).rows; }); },
  };
}
export type FinanceReconciliationService = ReturnType<typeof createFinanceReconciliationService>;
