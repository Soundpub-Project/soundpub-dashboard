import { customReadiness, currentDestination, reconciliationSnapshot } from '../finance/readiness.js';
import { customFinanceScope } from '../finance/custom.js';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { usersRepository } from '../users/repository.js';
import { withTransaction } from '../db/pool.js';
import { keyInput, money, minor, projection, requestInput, transitionAllowed, type Payout, type PayoutFinance, type State } from './contracts.js';

const allows = createAuthorizer();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
const isLabel = (p: Principal) => p.roles.some(r => r === 'label' || r === 'whitelabel' || r === 'label_custom');

export function createPayoutsService(pool: Pool, finance: PayoutFinance) {
  async function authorized<T>(actor: Principal, owner: string | null, admin: boolean,
    work: (db: PoolClient, current: Principal) => Promise<T>) {
    if (!actor) throw new ApiError(401, 'UNAUTHORIZED');
    return withTransaction(pool, async db => {
      // Same authority lock protocol as Users: status/role removals cannot race commit.
      const current = (await usersRepository(db).lock([actor.id, ...(owner ? [owner] : [])], true)).get(actor.id);
      if (!current || !allows(current, admin ? 'admin' : 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
      if (owner) { await customFinanceScope(db, owner); await finance.lock(db, owner); }
      return work(db, current);
    });
  }
  async function find(db: PoolClient, id: string, lock = false) {
    const row = (await db.query<Payout>(`SELECT ${projection} FROM soundpub.payout_requests WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    return row;
  }
  async function receipt(db: PoolClient, actor: Principal, key: string, payload: unknown, work: () => Promise<Payout>): Promise<Payout> {
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const old = (await db.query('SELECT fingerprint,response FROM soundpub.payout_operations WHERE actor_id=$1 AND key=$2', [actor.id, key])).rows[0];
    if (old) {
      if (old.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
      return old.response;
    }
    const row = await work();
    await db.query(`INSERT INTO soundpub.payout_operations(actor_id,key,fingerprint,payout_id,response) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [actor.id, key, fingerprint, row.id, JSON.stringify(row)]);
    return row;
  }
  async function emit(db: PoolClient, actor: Principal, row: Payout, old: State | null, key: string) {
    const metadata = { amount: row.amount, currency: row.currency, old_state: old, new_state: row.status, idempotency_key: key };
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,$2,'payout',$3,$4,$5::jsonb)`, [actor.id, `payout.${row.status}`, row.id, key, JSON.stringify(metadata)]);
    await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key) VALUES('payout.changed',$1::jsonb,$2)`,
      [JSON.stringify({ payout_id: row.id, user_id: row.user_id, ...metadata }), `payout:${actor.id}:${key}`]);
  }
  async function eligibility(db: PoolClient, current: Principal) {
    const custom = await customFinanceScope(db, current.id);
    const e = await finance.eligibility(db, current.id);
    if (custom) {
      const readiness = await customReadiness(db, current.id);
      e.reconciled = readiness.reconciled; e.destinationReady = readiness.destinationReady;
    }
    // Unknown threshold, readiness or reconciliation fails closed. No defaults from browser/cache.
    if (!money.safeParse(e.available).success || !money.safeParse(e.minimum).success || minor(e.minimum) <= 0n)
      throw new ApiError(409, 'FINANCIAL_RECONCILIATION_REQUIRED');
    const pending = Boolean((await db.query(`SELECT 1 FROM soundpub.payout_requests WHERE user_id=$1 AND status IN ('pending','approved') LIMIT 1`, [current.id])).rowCount);
    const reasons = [!isLabel(current) && 'ROLE_REQUIRED', !e.verified && 'VERIFICATION_REQUIRED',
      !e.destinationReady && 'DESTINATION_REQUIRED', !e.reconciled && 'RECONCILIATION_REQUIRED',
      pending && 'PENDING_PAYOUT', minor(e.available) < minor(e.minimum) && 'BELOW_MINIMUM'].filter(Boolean);
    return { eligible: reasons.length === 0, reasons, available: e.reconciled ? e.available : null,
      minimum: e.minimum, currency: 'IDR' as const };
  }
  async function transition(actor: Principal, id: string, input: unknown, key: string, trusted = false) {
    parse(z.uuid(), id); parse(keyInput, key);
    const value = parse(z.strictObject({ status: z.enum(['approved', 'rejected', 'cancelled', 'failed', 'paid']),
      evidence: z.string().min(1).max(200).optional() }), input);
    if (value.status === 'paid' && !trusted) throw new ApiError(403, 'TRUSTED_SETTLEMENT_REQUIRED');
    // Lookup owner only; recheck row and authority under transaction locks below.
    const owner = (await pool.query('SELECT user_id FROM soundpub.payout_requests WHERE id=$1', [id])).rows[0]?.user_id as string | undefined;
    if (!owner) throw new ApiError(404, 'NOT_FOUND');
    return authorized(actor, owner, value.status !== 'cancelled', async (db, current) => {
      const row = await find(db, id, true);
      if (value.status === 'cancelled' && row.user_id !== current.id) throw new ApiError(404, 'NOT_FOUND');
      return receipt(db, current, key, { operation: 'transition', id, ...value }, async () => {
        // Same terminal target is safe across different cancellation retry keys.
        if (row.status === value.status) {
          if (value.status === 'paid') throw new ApiError(409, 'PAYOUT_ALREADY_SETTLED');
          return row;
        }
        if (!transitionAllowed(row.status, value.status)) throw new ApiError(409, 'PAYOUT_TRANSITION_CONFLICT');
        if (value.status === 'paid') {
          if (!value.evidence) throw new ApiError(409, 'SETTLEMENT_EVIDENCE_REQUIRED');
          await finance.settle(db, row.id, value.evidence);
        } else if (['cancelled', 'failed', 'rejected'].includes(value.status)) await finance.release(db, row.id);
        await db.query('UPDATE soundpub.payout_requests SET status=$2,updated_at=now() WHERE id=$1', [id, value.status]);
        const changed = await find(db, id);
        await emit(db, current, changed, row.status, key);
        return changed;
      });
    });
  }
  async function readinessReceipt(db: PoolClient, actor: Principal, owner: string, key: string, payload: unknown,
    work: () => Promise<{ id: string; action: string }>) {
    parse(keyInput, key);
    const scope = `payout-readiness:${actor.id}:${owner}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const inserted = await db.query(`INSERT INTO soundpub.idempotency_keys(scope,key,request_hash,expires_at)
      VALUES($1,$2,$3,'infinity') ON CONFLICT (scope,key) DO NOTHING`, [scope,key,fingerprint]);
    if (!inserted.rowCount) {
      const prior = (await db.query(`SELECT request_hash,status,response_body FROM soundpub.idempotency_keys
        WHERE scope=$1 AND key=$2 FOR UPDATE`, [scope,key])).rows[0];
      if (!prior || prior.request_hash !== fingerprint || prior.status !== 'completed')
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
      return prior.response_body as { id: string; action: string };
    }
    const response = await work();
    const completed = await db.query(`UPDATE soundpub.idempotency_keys
      SET status='completed',response_status=200,response_body=$3::jsonb
      WHERE scope=$1 AND key=$2 AND status='processing'`, [scope,key,JSON.stringify(response)]);
    if (completed.rowCount !== 1) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return response;
  }

  async function readinessEvent(db: PoolClient, actor: Principal, owner: string, action: string, id: string) {
    // Never include bank fields or external evidence in audit/outbox.
    const metadata = JSON.stringify({ owner_id: owner, action });
    await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,$2,'payout_readiness',$3,$3,$4::jsonb)`, [actor.id, action, id, metadata]);
    await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
      VALUES('payout.readiness',$1::jsonb,$2)`, [metadata, `readiness:${action}:${id}`]);
  }
  return {
    destination(actor: Principal) {
      return authorized(actor, actor?.id, false, async (db, current) => {
        if (!await customFinanceScope(db, current.id)) throw new ApiError(403, 'FORBIDDEN');
        return { destination: await currentDestination(db, current.id) ?? null };
      });
    },
    updateDestination(actor: Principal, input: unknown) {
      const value = parse(z.strictObject({ bank_name: requestInput.shape.bank_name,
        account_number: requestInput.shape.account_number, account_holder_name: requestInput.shape.account_holder_name }), input);
      return authorized(actor, actor?.id, false, async (db, current) => {
        if (!await customFinanceScope(db, current.id)) throw new ApiError(403, 'FORBIDDEN');
        const existing = await currentDestination(db, current.id);
        if (existing && existing.bank_name === value.bank_name && existing.account_number === value.account_number &&
            existing.account_holder_name === value.account_holder_name) {
          const revoked = await db.query(`SELECT 1 FROM soundpub.pic_destination_verifications v
            JOIN soundpub.pic_readiness_revocations r ON r.destination_id=v.destination_id WHERE v.destination_id=$1`, [existing.id]);
          if (!revoked.rowCount) return { destination: existing };
        }
        const row = (await db.query(`INSERT INTO soundpub.pic_payout_destinations(owner_id,currency,bank_name,account_number,account_holder_name)
          VALUES($1,'IDR',$2,$3,$4) RETURNING *`, [current.id,value.bank_name,value.account_number,value.account_holder_name])).rows[0]!;
        await readinessEvent(db, current, current.id, 'destination.pending', row.id);
        return { destination: { ...row, verified: false } };
      });
    },
    reviewReadiness(actor: Principal, owner: string, input: unknown, key: string) {
      parse(z.uuid(), owner);
      parse(keyInput, key);
      const value = parse(z.discriminatedUnion('action', [
        z.strictObject({ action: z.literal('verify_destination'), destination_id: z.uuid(), evidence: z.string().trim().min(1).max(200) }),
        z.strictObject({ action: z.literal('approve_reconciliation'), evidence: z.string().trim().min(1).max(200) }),
        z.strictObject({ action: z.literal('revoke_destination'), destination_id: z.uuid(), reason: z.string().trim().min(1).max(200) }),
        z.strictObject({ action: z.literal('revoke_reconciliation'), approval_id: z.uuid(), reason: z.string().trim().min(1).max(200) }),
      ]), input);
      return authorized(actor, owner, true, async (db, current) => {
        if (current.id === owner) throw new ApiError(403, 'INDEPENDENT_REVIEW_REQUIRED');
        if (!await customFinanceScope(db, owner)) throw new ApiError(404, 'NOT_FOUND');
        return readinessReceipt(db, current, owner, key, value, async () => {
        let id: string;
        if (value.action === 'approve_reconciliation') {
          const source = await reconciliationSnapshot(db, owner);
          if (!source.intact) throw new ApiError(409, 'FINANCIAL_RECONCILIATION_REQUIRED');
          const existing = (await db.query(`SELECT a.id FROM soundpub.pic_reconciliation_approvals a
            WHERE a.owner_id=$1 AND a.currency='IDR' AND a.snapshot=$2::jsonb
            AND NOT EXISTS(SELECT 1 FROM soundpub.pic_readiness_revocations r WHERE r.approval_id=a.id)
            ORDER BY a.created_at DESC,a.id DESC LIMIT 1`, [owner,JSON.stringify(source.snapshot)])).rows[0];
          if (existing) return { id: existing.id as string, action: value.action };
          id = (await db.query(`INSERT INTO soundpub.pic_reconciliation_approvals(owner_id,currency,snapshot,evidence,actor_id)
            VALUES($1,'IDR',$2::jsonb,$3,$4) RETURNING id`, [owner,JSON.stringify(source.snapshot),value.evidence,current.id])).rows[0]!.id;
        } else if (value.action === 'verify_destination') {
          const destination = await currentDestination(db, owner);
          if (!destination || destination.id !== value.destination_id) throw new ApiError(404, 'NOT_FOUND');
          if (destination.verified) return { id: destination.id, action: value.action };
          if ((await db.query('SELECT 1 FROM soundpub.pic_destination_verifications WHERE destination_id=$1', [destination.id])).rowCount)
            throw new ApiError(409, 'CONFLICT');
          await db.query(`INSERT INTO soundpub.pic_destination_verifications(destination_id,actor_id,evidence) VALUES($1,$2,$3)`,
            [destination.id,current.id,value.evidence]);
          id = destination.id;
        } else {
          const destination = value.action === 'revoke_destination';
          const target = destination ? value.destination_id : value.approval_id;
          const table = destination ? 'pic_payout_destinations' : 'pic_reconciliation_approvals';
          if (!(await db.query(`SELECT 1 FROM soundpub.${table} WHERE id=$1 AND owner_id=$2`, [target,owner])).rowCount)
            throw new ApiError(404, 'NOT_FOUND');
          const prior = (await db.query(`SELECT id FROM soundpub.pic_readiness_revocations
            WHERE ${destination ? 'destination_id' : 'approval_id'}=$1`, [target])).rows[0];
          if (prior) return { id: prior.id as string, action: value.action };
          id = (await db.query(`INSERT INTO soundpub.pic_readiness_revocations(${destination ? 'destination_id' : 'approval_id'},actor_id,reason)
            VALUES($1,$2,$3) RETURNING id`, [target,current.id,value.reason])).rows[0]!.id;
        }
        await readinessEvent(db, current, owner, value.action, id);
        return { id, action: value.action };
        });
      });
    },
    eligibility(actor: Principal) { return authorized(actor, actor?.id, false, (db, current) => eligibility(db, current)); },
    request(actor: Principal, input: unknown, key: string) {
      const value = parse(requestInput, input); parse(keyInput, key);
      if (minor(value.amount) <= 0n) throw new ApiError(400, 'INVALID_AMOUNT');
      return authorized(actor, actor?.id, false, async (db, current) => {
        if (!isLabel(current)) throw new ApiError(403, 'FORBIDDEN');
        return receipt(db, current, key, { operation: 'request', ...value }, async () => {
          const e = await eligibility(db, current);
          if (!e.eligible) throw new ApiError(409, 'PAYOUT_INELIGIBLE');
          if (e.available === null) throw new ApiError(409, 'PAYOUT_INELIGIBLE');
          if (minor(value.amount) < minor(e.minimum)) throw new ApiError(409, 'BELOW_MINIMUM');
          if (minor(value.amount) > minor(e.available)) throw new ApiError(409, 'INSUFFICIENT_BALANCE');
          let destination = value;
          if (await customFinanceScope(db, current.id)) {
            const verified = await currentDestination(db, current.id);
            if (!verified?.verified) throw new ApiError(409, 'DESTINATION_REQUIRED');
            if (value.bank_name !== verified.bank_name || value.account_number !== verified.account_number || value.account_holder_name !== verified.account_holder_name)
              throw new ApiError(409, 'DESTINATION_MISMATCH');
            destination = { ...value, bank_name: verified.bank_name, account_number: verified.account_number, account_holder_name: verified.account_holder_name };
          }
          const row = (await db.query<Payout>(`INSERT INTO soundpub.payout_requests(user_id,amount,currency,bank_name,account_number,account_holder_name)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING ${projection}`, [current.id, value.amount, value.currency, destination.bank_name, destination.account_number, destination.account_holder_name])).rows[0]!;
          await finance.reserve(db, { payoutId: row.id, ownerId: current.id, amount: value.amount, currency: value.currency });
          await emit(db, current, row, null, key);
          return row;
        });
      });
    },
    list(actor: Principal, input: unknown = {}, admin = false) {
      const q = parse(z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(100000).default(0) }), input);
      return authorized(actor, null, admin, async (db, current) => ({ items: (await db.query<Payout>(`SELECT ${projection} FROM soundpub.payout_requests
        WHERE ($1::boolean OR user_id=$2) ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`, [admin, current.id, q.limit, q.offset])).rows }));
    },
    detail(actor: Principal, id: string) {
      parse(z.uuid(), id);
      return authorized(actor, null, false, async (db, current) => {
        const row = await find(db, id);
        if (row.user_id !== current.id && !allows(current, 'admin')) throw new ApiError(404, 'NOT_FOUND');
        return row;
      });
    },
    cancel(actor: Principal, id: string, key: string) { return transition(actor, id, { status: 'cancelled' }, key); },
    transition(actor: Principal, id: string, input: unknown, key: string) { return transition(actor, id, input, key); },
    /** Backend composition only: never bind this capability to browser routes. */
    settleMock(actor: Principal, id: string, evidence: string, key: string) {
      return transition(actor, id, { status: 'paid', evidence }, key, true);
    },
  };
}
export type PayoutsService = ReturnType<typeof createPayoutsService>;
