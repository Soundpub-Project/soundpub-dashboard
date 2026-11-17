import { customReadiness } from '../finance/readiness.js';
import { customFinanceScope } from '../finance/custom.js';
import type { PoolClient } from 'pg';
import type { PayoutPolicy } from './finance.js';

function minimumPayoutSetting(value: string | null | undefined) {
  if (value == null || value === '') return '50000.00';
  return /^(?:0|[1-9][0-9]{0,15})$/.test(value) ? `${value}.00` : value;
}

export const databasePayoutPolicy: PayoutPolicy = async (db: PoolClient, ownerId: string) => {
  const minimum = (await db.query<{ minimum: string | null }>(
    "SELECT settings->>'min_payout_amount' AS minimum FROM soundpub.application_settings WHERE id=true")).rows[0]?.minimum;
  const custom = await customFinanceScope(db, ownerId);
  if (custom) {
    const ready = await customReadiness(db, ownerId);
    return { minimum: minimumPayoutSetting(minimum), destinationReady: ready.destinationReady, reconciled: ready.reconciled };
  }
  const scope = custom ? [ownerId] : (await db.query<{ id: string }>(`SELECT p.id FROM soundpub.profiles p
    WHERE p.id=$1 OR (p.parent_label_id=$1 AND EXISTS (SELECT 1 FROM soundpub.artists a
      WHERE a.artist_user_id=p.id AND a.label_id=$1 AND a.verified_at IS NOT NULL))`, [ownerId])).rows.map(row => row.id);
  const unresolved = Boolean((await db.query(`SELECT 1 FROM soundpub.royalty_import_allocations allocation
          JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
    JOIN soundpub.royalty_import_batches batch ON batch.id=entry.batch_id
    LEFT JOIN soundpub.royalty_import_corrections correction ON correction.batch_id=batch.id
    WHERE allocation.owner_id=ANY($1::uuid[]) AND correction.id IS NULL
      AND NOT soundpub.royalty_reconciliation_intact(batch.id) LIMIT 1`,
  [[...new Set([ownerId, ...scope])]])).rowCount);
  return { minimum: minimumPayoutSetting(minimum), destinationReady: true, reconciled: !custom && !unresolved };
};

