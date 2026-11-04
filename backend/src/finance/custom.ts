import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';

/** Custom role overrides pooled label scope; caller holds principal authority lock. */
export async function customFinanceScope(db: PoolClient, ownerId: string): Promise<boolean> {
  const custom = Boolean((await db.query(`SELECT 1 FROM soundpub.user_roles
    WHERE user_id=$1 AND role='label_custom'`, [ownerId])).rowCount);
  if (!custom) return false;
  const unit = (await db.query(`SELECT unit.id FROM soundpub.label_custom_units unit
    JOIN soundpub.backend_users u ON u.id=unit.owner_user_id
    WHERE unit.owner_user_id=$1 AND unit.status='active' AND u.status='active'
    FOR SHARE OF unit,u`, [ownerId])).rowCount;
  if (!unit) throw new ApiError(403, 'ACTIVE_PIC_UNIT_REQUIRED');
  return true;
}
