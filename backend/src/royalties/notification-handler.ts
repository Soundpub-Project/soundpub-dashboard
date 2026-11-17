import type { OutboxEvent, SqlClient } from '../worker/index.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RoyaltyChangedEvent = OutboxEvent & { payload: unknown };

export async function notifyRoyaltyOwnersAfterReconciliation(event: RoyaltyChangedEvent, db: SqlClient): Promise<void> {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
  const payload = event.payload as Record<string, unknown>;
  if (payload.result !== 'MATCHED') return;
  if (typeof payload.batch_id !== 'string' || !uuid.test(payload.batch_id) ||
      typeof payload.reconciliation_checksum !== 'string' || !/^[a-f0-9]{64}$/.test(payload.reconciliation_checksum)) {
    throw new Error('ROYALTY_NOTIFICATION_EVENT_INVALID');
  }
  const batchId = payload.batch_id.toLowerCase();
  const evidence = (await db.query<{ period: string; actor_id: string; corrected: boolean; intact: boolean }>(`SELECT
      batch.period,reconciliation.actor_id,(correction.id IS NOT NULL) AS corrected,
      soundpub.royalty_reconciliation_intact(batch.id) AS intact
    FROM soundpub.royalty_import_reconciliations reconciliation
    JOIN soundpub.royalty_import_batches batch ON batch.id=reconciliation.batch_id
    LEFT JOIN soundpub.royalty_import_corrections correction ON correction.batch_id=batch.id
    WHERE reconciliation.batch_id=$1 AND reconciliation.outbox_id=$2
      AND reconciliation.snapshot_checksum=$3 AND reconciliation.result='MATCHED'
    FOR SHARE OF batch`, [batchId,event.id,payload.reconciliation_checksum])).rows[0];
  if (!evidence) throw new Error('ROYALTY_NOTIFICATION_EVIDENCE_MISSING');
  if (evidence.corrected) return;
  if (!evidence.intact) throw new Error('ROYALTY_NOTIFICATION_EVIDENCE_INVALID');
  await db.query(`WITH batch_owners AS (
      SELECT allocation.owner_id,sum(allocation.amount)::numeric(24,2) AS amount
      FROM soundpub.royalty_import_allocations allocation
      JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
      WHERE entry.batch_id=$1 AND allocation.owner_id IS NOT NULL
      GROUP BY allocation.owner_id HAVING sum(allocation.amount)>0
    ), recipients AS (
      SELECT owner.owner_id AS recipient_id,owner.amount,true AS owner_notice
      FROM batch_owners owner
      JOIN soundpub.backend_users user_record ON user_record.id=owner.owner_id AND user_record.status='active'
      WHERE EXISTS(SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=owner.owner_id
        AND role.role IN ('artist','label','whitelabel','label_custom','admin','superadmin')
        AND role.verified_at IS NOT NULL)
      UNION ALL
      SELECT DISTINCT role.user_id,NULL::numeric(24,2),false
      FROM soundpub.user_roles role JOIN soundpub.backend_users user_record
        ON user_record.id=role.user_id AND user_record.status='active'
      WHERE role.role IN ('admin','superadmin') AND role.verified_at IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM batch_owners owner WHERE owner.owner_id=role.user_id)
    )
    INSERT INTO soundpub.notifications(recipient_user_id,kind,type,title,body,metadata_safe,created_by)
    SELECT recipient_id,'USER_NOTIFICATION','success','Royalti berhasil diverifikasi',
      CASE WHEN owner_notice THEN 'Rekonsiliasi royalti periode '||$2||' berhasil. Bagian akun Anda sebesar IDR '
        ||amount::text||' tercatat di ledger.'
        ELSE 'Batch royalti periode '||$2||' berhasil melewati rekonsiliasi independen.' END,
      jsonb_strip_nulls(jsonb_build_object('royalty_batch_id',$1::text,'period',$2,
        'amount',CASE WHEN owner_notice THEN amount::text END)), $3::uuid
    FROM recipients`, [batchId,evidence.period,evidence.actor_id]);
}