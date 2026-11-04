import type { PoolClient } from 'pg';

/** Complete immutable batch set, correction state and non-payout ledger cutoff. */
export async function reconciliationSnapshot(db: PoolClient, owner: string) {
  const row = (await db.query(`WITH batches AS (
    SELECT e.batch_id, sum(a.amount)*100 AS amount, max(c.id::text) AS correction
    FROM soundpub.royalty_import_allocations a
    JOIN soundpub.royalty_import_entries e ON e.id=a.entry_id
    LEFT JOIN soundpub.royalty_import_corrections c ON c.batch_id=e.batch_id
    WHERE a.owner_id=$1 GROUP BY e.batch_id
  ), expected AS (
    SELECT 'ROYALTY_EARNING' AS kind,'royalty:'||batch_id::text AS reference,amount FROM batches WHERE amount<>0
    UNION ALL SELECT 'ROYALTY_ADJUSTMENT','royalty:'||batch_id::text,-amount FROM batches WHERE correction IS NOT NULL AND amount<>0
  ), actual AS (
    SELECT * FROM soundpub.finance_events WHERE owner_id=$1 AND currency='IDR'
      AND kind IN ('ROYALTY_EARNING','ROYALTY_ADJUSTMENT','MANUAL_ADJUSTMENT')
  ) SELECT jsonb_build_object(
    'batches',COALESCE((SELECT jsonb_agg(jsonb_build_array(batch_id,amount::text,correction) ORDER BY batch_id) FROM batches),'[]'::jsonb),
    'events',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM actual),'[]'::jsonb)
  ) AS snapshot,
  NOT EXISTS(SELECT kind,reference,amount FROM expected EXCEPT SELECT kind,business_reference,amount_minor FROM actual)
  AND NOT EXISTS(SELECT kind,business_reference,amount_minor FROM actual EXCEPT SELECT kind,reference,amount FROM expected)
  AND NOT EXISTS(SELECT 1 FROM soundpub.finance_events e
    LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
    WHERE e.owner_id=$1 AND e.currency='IDR' AND
    (a.event_id IS NULL OR o.id IS NULL OR a.old_state IS DISTINCT FROM e.old_state OR a.new_state IS DISTINCT FROM e.new_state
     OR o.topic IS DISTINCT FROM 'finance.event' OR o.payload IS DISTINCT FROM jsonb_build_object('eventId',e.id)
     OR o.idempotency_key IS DISTINCT FROM 'finance:'||e.id::text)) AS intact`, [owner])).rows[0];
  return { snapshot: row?.snapshot, intact: row?.intact === true };
}
export async function currentDestination(db: PoolClient, owner: string) {
  return (await db.query(`SELECT d.*, (v.destination_id IS NOT NULL AND r.id IS NULL) AS verified
    FROM soundpub.pic_payout_destinations d
    LEFT JOIN soundpub.pic_destination_verifications v ON v.destination_id=d.id
    LEFT JOIN soundpub.pic_readiness_revocations r ON r.destination_id=d.id
    WHERE d.owner_id=$1 AND d.currency='IDR' ORDER BY d.created_at DESC,d.id DESC LIMIT 1`, [owner])).rows[0];
}
export async function customReadiness(db: PoolClient, owner: string) {
  const source = await reconciliationSnapshot(db, owner);
  const destination = await currentDestination(db, owner);
  const approved = source.intact && Boolean((await db.query(`SELECT 1 FROM soundpub.pic_reconciliation_approvals a
    WHERE a.owner_id=$1 AND a.currency='IDR' AND a.snapshot=$2::jsonb
    AND NOT EXISTS(SELECT 1 FROM soundpub.pic_readiness_revocations r WHERE r.approval_id=a.id) LIMIT 1`,
  [owner, JSON.stringify(source.snapshot)])).rowCount);
  return { reconciled: approved, destinationReady: destination?.verified === true, destination };
}
