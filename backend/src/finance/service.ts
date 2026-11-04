import { customReadiness } from './readiness.js';
import { customFinanceScope } from '../finance/custom.js';
import type { Pool } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { getBalance, parseMoney, formatMoney, type Balance } from './index.js';

const allows = createAuthorizer();
const empty = (): Balance => ({ currency: 'IDR', available: '0.00', reserved: '0.00', settled: '0.00', charged: '0.00', refunded: '0.00' });

export function createBalanceService(pool: Pool) {
  return {
    async get(actor: Principal, ownerId?: unknown) {
      const parsed = ownerId === undefined ? { success: true as const, data: actor.id } : z.uuid().safeParse(ownerId);
      if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
      const requested = parsed.data;
      return withTransaction(pool, async db => {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const users = usersRepository(db);
        const current = (await users.lock([actor.id], false)).get(actor.id);
        if (!current || !allows(current, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
        if (requested !== current.id && !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
        const roles = requested === current.id ? current.roles : await users.allRoles(requested);
        const custom = await customFinanceScope(db, requested);
        const aggregate = !custom && roles.some(role => role === 'label' || role === 'whitelabel');
        const ids = aggregate ? (await db.query<{ id: string }>(`SELECT p.id FROM soundpub.profiles p
          WHERE p.id=$1 OR (p.parent_label_id=$1 AND EXISTS (SELECT 1 FROM soundpub.artists a
            WHERE a.artist_user_id=p.id AND a.label_id=$1 AND a.verified_at IS NOT NULL)) ORDER BY p.id`, [requested])).rows.map(row => row.id) : [requested];
        const accountIds = [...new Set(ids)];
        const reconciliationRequired = custom ? !(await customReadiness(db, requested)).reconciled : Boolean((await db.query(`SELECT 1 FROM soundpub.royalty_import_allocations allocation
          JOIN soundpub.royalty_import_entries entry ON entry.id=allocation.entry_id
          JOIN soundpub.royalty_import_batches batch ON batch.id=entry.batch_id
          LEFT JOIN soundpub.royalty_import_corrections correction ON correction.batch_id=batch.id
          WHERE allocation.owner_id=ANY($1::uuid[]) AND batch.status='UNRECONCILED' AND correction.id IS NULL LIMIT 1`, [accountIds])).rowCount);
        const total = empty();
        for (const id of accountIds) {
          const balance = await getBalance(db, id);
          for (const field of ['available', 'reserved', 'settled', 'charged', 'refunded'] as const) {
            total[field] = formatMoney(parseMoney(total[field]) + parseMoney(balance[field]));
          }
        }
        return { owner_id: requested, aggregate, account_count: accountIds.length,
          status: reconciliationRequired ? 'RECONCILIATION_REQUIRED' as const : 'RECONCILED' as const,
          ...total, available: reconciliationRequired ? null : total.available };
      });
    },
  };
}
export type BalanceService = ReturnType<typeof createBalanceService>;
