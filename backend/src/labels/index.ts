import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { canManageUser } from '../users/index.js';
import { usersRepository } from '../users/repository.js';
import { assignInput, removeInput, rosterQuery, transferInput,
  type AssignInput, type ParentDto, type RemoveInput, type RosterQuery, type TransferInput } from './contracts.js';
import { labelsRepository } from './repository.js';

export * from './contracts.js';
export interface LabelsOptions {
  // Check removal eligibility inside this transaction; throw to deny or when dependencies are unavailable.
  assertCanRemove?: (db: PoolClient, artistId: string) => Promise<void>;
}
const allows = createAuthorizer();
const isLabel = (actor: Principal | undefined) => !!actor && actor.roles.some(role => role === 'label' || role === 'whitelabel');
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function authenticated(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
const cursorSchema = z.strictObject({ after: z.uuid(), filter: z.string() });
function pageInput(input: RosterQuery, scope: unknown[]) {
  const query = parse(rosterQuery, input);
  const filter = createHash('sha256').update(JSON.stringify([...scope, query.search ?? null, query.status ?? null])).digest('base64url');
  let after: string | null = null;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
      const cursor = parse(cursorSchema, JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (cursor.filter !== filter) throw new Error('Invalid cursor');
      after = cursor.after;
    } catch { throw new ApiError(400, 'BAD_REQUEST'); }
  }
  return { query, filter, after, limit: Number(query.limit ?? 50) };
}
const cursorFor = (after: string, filter: string) => Buffer.from(JSON.stringify({ after, filter })).toString('base64url');

/** Caller owns BEGIN/COMMIT/ROLLBACK; share this client with artist operations. */
export function labelsInTransaction(db: PoolClient, options: LabelsOptions = {}) {
  const users = usersRepository(db);
  const repo = labelsRepository(db);

  async function change(actor: Principal, artistId: string, labelId: string | null,
    expected: string | null, operation: 'assign' | 'transfer' | 'remove', requestId: string) {
    parse(z.uuid(), artistId);
    parse(z.string().trim().min(1).max(200), requestId);
    // Match Users locking order, including source/destination authority, before reading relationship state.
    const principals = await users.lock([actor.id, artistId, ...[expected, labelId].filter((id): id is string => id !== null)], true);
    const current = principals.get(actor.id);
    authenticated(current);
    if (operation !== 'remove' && !allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    const artist = await repo.artist(artistId, true);
    const membership = await repo.membership(artistId);
    const owns = isLabel(current) && !!membership?.verified_at && membership.label_id === current.id && artist?.parent_label_id === current.id;
    if (operation === 'remove' && !allows(current, 'admin') && !owns) throw new ApiError(403, 'FORBIDDEN');
    const target = principals.get(artistId);
    if (!artist || !target) throw new ApiError(404, 'NOT_FOUND');
    if (!target.roles.includes('artist')) throw new ApiError(400, 'BAD_REQUEST');
    const allRoles = await users.allRoles(artistId);
    if (allows(current, 'admin') ? !canManageUser(current, artistId, allRoles)
      : artistId === current.id || allRoles.some(role => role === 'admin' || role === 'superadmin')) {
      throw new ApiError(403, 'FORBIDDEN');
    }
    if (artist.parent_label_reference_id !== null || artist.parent_label_id !== expected ||
        (expected === null ? membership !== null : !membership?.verified_at || membership.label_id !== expected)) {
      throw new ApiError(409, 'CONFLICT');
    }
    if (labelId !== null) {
      const destination = principals.get(labelId);
      if (labelId === artistId || !destination || !allows(destination, 'authenticated') || !isLabel(destination) ||
          !await repo.artist(labelId, false) || target.status !== 'active') throw new ApiError(400, 'BAD_REQUEST');
    }
    if (labelId === expected) return { artistId, parentLabelId: labelId, membershipId: membership?.id ?? null, changed: false };
    if (operation === 'remove') {
      if (options.assertCanRemove) await options.assertCanRemove(db, artistId);
    }
    const affected = operation === 'transfer' ? await repo.transferImpact(artistId) : null;
    if (!await repo.setParent(artistId, labelId, expected)) throw new ApiError(409, 'CONFLICT');
    let membershipId = membership?.id ?? null;
    if (labelId === null) {
      await repo.remove(membershipId!);
      membershipId = null;
    } else if (membershipId) await repo.move(membershipId, labelId);
    else membershipId = await repo.assign(artistId, labelId, artist.artist_name);
    await users.audit(current.id, artistId, requestId, `label.artist_${operation === 'assign' ? 'assigned' : operation === 'transfer' ? 'transferred' : 'removed'}`, {
      previousParentLabelId: expected, parentLabelId: labelId, membershipId, royaltyTransferMode: 'keep_old_label',
      ...(affected ? { affected, historicalOwnership: 'kept', note: 'Historical release/track/royalty ownership was kept unchanged.' } : {}),
    });
    return { artistId, parentLabelId: labelId, membershipId, changed: true, ...(affected ? { affected } : {}) };
  }

  return {
    async list(actor: Principal, input: RosterQuery = {}) {
      const query = parse(rosterQuery, input);
      const page = pageInput({ ...query, status: query.status ?? 'active' }, ['labels', actor.id]);
      const current = (await users.lock([actor.id], false)).get(actor.id);
      authenticated(current);
      const rows = await repo.labels(current.id, allows(current, 'admin'), page.query, page.after, page.limit);
      const items = rows.slice(0, page.limit);
      return { items, nextCursor: rows.length > page.limit ? cursorFor(items.at(-1)!.id, page.filter) : null };
    },
    async get(actor: Principal, labelId: string) {
      parse(z.uuid(), labelId);
      const current = (await users.lock([actor.id, labelId], false)).get(actor.id);
      authenticated(current);
      const label = (await repo.labels(current.id, allows(current, 'admin'), {}, null, 1, labelId))[0];
      if (!label) throw new ApiError(404, 'NOT_FOUND');
      return label;
    },
    async roster(actor: Principal, labelId: string, input: RosterQuery = {}) {
      parse(z.uuid(), labelId);
      const { query, filter, after, limit } = pageInput(input, ['roster', actor.id, labelId]);
      const principals = await users.lock([actor.id, labelId], false);
      const current = principals.get(actor.id);
      authenticated(current);
      if (!allows(current, 'admin') && (current.id !== labelId || !isLabel(current))) throw new ApiError(403, 'FORBIDDEN');
      const label = principals.get(labelId);
      if (!label || !await repo.artist(labelId, false)) throw new ApiError(404, 'NOT_FOUND');
      if (!isLabel(label)) throw new ApiError(400, 'BAD_REQUEST');
      const rows = await repo.roster(labelId, query, after, limit);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit
        ? cursorFor(items.at(-1)!.membershipId, filter) : null };
    },
    async currentParent(actor: Principal, artistId: string): Promise<ParentDto> {
      parse(z.uuid(), artistId);
      const principals = await users.lock([actor.id, artistId], false);
      const current = principals.get(actor.id);
      authenticated(current);
      const artist = await repo.artist(artistId, false);
      const membership = await repo.membership(artistId);
      const owns = isLabel(current) && !!membership?.verified_at && membership.label_id === current.id && artist?.parent_label_id === current.id;
      if (current.id !== artistId && !allows(current, 'admin') && !owns) throw new ApiError(403, 'FORBIDDEN');
      if (!artist || !principals.has(artistId)) throw new ApiError(404, 'NOT_FOUND');
      if (!principals.get(artistId)!.roles.includes('artist')) throw new ApiError(400, 'BAD_REQUEST');
      return { artistId, parentLabelId: artist.parent_label_id,
        membershipId: membership?.verified_at && membership.label_id === artist.parent_label_id ? membership.id : null };
    },
    async assign(actor: Principal, artistId: string, input: AssignInput, requestId: string) {
      const data = parse(assignInput, input);
      return change(actor, artistId, data.labelId, data.expectedParentLabelId, 'assign', requestId);
    },
    async transfer(actor: Principal, artistId: string, input: TransferInput, requestId: string) {
      const data = parse(transferInput, input);
      return change(actor, artistId, data.labelId, data.expectedParentLabelId, 'transfer', requestId);
    },
    async remove(actor: Principal, artistId: string, input: RemoveInput, requestId: string) {
      const data = parse(removeInput, input);
      return change(actor, artistId, null, data.expectedParentLabelId, 'remove', requestId);
    },
  };
}

export function createLabelsService(pool: Pool, options: LabelsOptions = {}) {
  return {
    list: (actor: Principal, query: RosterQuery = {}) =>
      withTransaction(pool, db => labelsInTransaction(db, options).list(actor, query)),
    get: (actor: Principal, labelId: string) =>
      withTransaction(pool, db => labelsInTransaction(db, options).get(actor, labelId)),
    roster: (actor: Principal, labelId: string, query: RosterQuery = {}) =>
      withTransaction(pool, db => labelsInTransaction(db, options).roster(actor, labelId, query)),
    currentParent: (actor: Principal, artistId: string) =>
      withTransaction(pool, db => labelsInTransaction(db, options).currentParent(actor, artistId)),
    assign: (actor: Principal, artistId: string, input: AssignInput, requestId: string) =>
      withTransaction(pool, db => labelsInTransaction(db, options).assign(actor, artistId, input, requestId)),
    transfer: (actor: Principal, artistId: string, input: TransferInput, requestId: string) =>
      withTransaction(pool, db => labelsInTransaction(db, options).transfer(actor, artistId, input, requestId)),
    remove: (actor: Principal, artistId: string, input: RemoveInput, requestId: string) =>
      withTransaction(pool, db => labelsInTransaction(db, options).remove(actor, artistId, input, requestId)),
  };
}
export type LabelsService = ReturnType<typeof createLabelsService>;


