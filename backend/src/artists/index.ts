import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { canManageUser } from '../users/index.js';
import { usersRepository } from '../users/repository.js';
import { artistCreate, artistPatch, artistListQuery, artistDeletionListQuery, artistDeletionRequest, artistDeletionReview,
  type ArtistCreate, type ArtistPatch, type ArtistListQuery, type ArtistDeletionListQuery,
  type ArtistDeletionRequest, type ArtistDeletionReview } from './contracts.js';
import { artistsRepository } from './repository.js';

export * from './contracts.js';
export interface ArtistsOptions {
  /** Must fail closed on unknown dependencies; called inside the mutation transaction. */
  assertCanDetach?: (db: PoolClient, artistUserId: string) => Promise<void>;
}
const allows = createAuthorizer();
const label = (actor: Principal) => actor.roles.some(role => role === 'label' || role === 'whitelabel');
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function requireActor(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
export function canManageArtist(actor: Principal, target: Principal, verifiedLabelId: string | null, write = false) {
  if (!allows(actor, 'authenticated') || !target.roles.includes('artist')) return false;
  if (actor.id === target.id) return true;
  if (allows(actor, 'admin')) return !write || canManageUser(actor, target.id, target.roles);
  return label(actor) && actor.id === verifiedLabelId && !target.roles.some(role => role === 'admin' || role === 'superadmin');
}
const cursorSchema = z.strictObject({ id: z.uuid(), filter: z.string().length(43) });
function pagination(actorId: string, input: ArtistListQuery, scope: string) {
  const query = parse(artistListQuery, input);
  const filter = createHash('sha256').update(JSON.stringify([scope, actorId, query.search ?? null, query.status ?? null])).digest('base64url');
  let cursorId: string | null = null;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
      const cursor = parse(cursorSchema, JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (cursor.filter !== filter) throw new Error('Invalid cursor');
      cursorId = cursor.id;
    } catch { throw new ApiError(400, 'BAD_REQUEST'); }
  }
  const limit = Number(query.limit ?? 50);
  return { query, cursorId, limit, page<T extends { id: string }>(rows: T[]) {
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({ id: last.id, filter })).toString('base64url') : null };
  } };
}
export function createArtistsService(pool: Pool, options: ArtistsOptions = {}) {
  async function resource(db: PoolClient, actor: Principal, id: string, write: boolean) {
    const users = usersRepository(db);
    const principals = await users.lock([actor.id, id], write);
    const current = principals.get(actor.id);
    requireActor(current);
    const repo = artistsRepository(db);
    if (write) await repo.lockRoster(id);
    const target = principals.get(id);
    const artist = await repo.find(id);
    if (!target || !artist || !canManageArtist(current,
      { ...target, roles: await users.allRoles(id) }, artist.label_user_id, write)) throw new ApiError(404, 'NOT_FOUND');
    return { users, repo, current, artist };
  }
  return {
    async list(actor: Principal, input: ArtistListQuery = {}) {
      requireActor(actor);
      const page = pagination(actor.id, input, 'artists');
      return withTransaction(pool, async db => {
        const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
        requireActor(current);
        if (!allows(current, 'admin') && !label(current) && !current.roles.includes('artist')) throw new ApiError(403, 'FORBIDDEN');
        return page.page(await artistsRepository(db).list(current.id, allows(current, 'admin'), label(current), page.query, page.cursorId, page.limit));
      });
    },
    async get(actor: Principal, artistUserId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), artistUserId);
      return withTransaction(pool, async db => (await resource(db, actor, id, false)).artist);
    },
    async create(actor: Principal, input: ArtistCreate, requestId: string) {
      requireActor(actor);
      const { label_user_id, ...patch } = parse(artistCreate, input);
      return withTransaction(pool, async db => {
        const users = usersRepository(db);
        const principals = await users.lock([actor.id, ...(label_user_id ? [label_user_id] : [])], true);
        const current = principals.get(actor.id);
        requireActor(current);
        const admin = allows(current, 'admin');
        if (!admin && !label(current)) throw new ApiError(403, 'FORBIDDEN');
        if (!admin && label_user_id !== undefined && label_user_id !== current.id) throw new ApiError(403, 'FORBIDDEN');
        const labelId = label_user_id ?? (label(current) ? current.id : null);
        if (labelId) {
          const owner = principals.get(labelId);
          if (!owner || !allows(owner, 'authenticated') || !label(owner)) throw new ApiError(400, 'BAD_REQUEST');
        }
        const id = randomUUID();
        const repo = artistsRepository(db);
        // Business principal only: never create provider identity, generated email, password or session.
        await repo.createUser(id, labelId, patch);
        await repo.update(id, patch);
        await users.audit(current.id, id, requestId, 'artist.created', { labelUserId: labelId, fields: Object.keys(patch) });
        return (await repo.find(id))!;
      });
    },
    async update(actor: Principal, artistUserId: string, input: ArtistPatch, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), artistUserId);
      const patch = parse(artistPatch, input);
      return withTransaction(pool, async db => {
        const { users, repo } = await resource(db, actor, id, true);
        await repo.update(id, patch);
        await users.audit(actor.id, id, requestId, 'artist.updated', { fields: Object.keys(patch) });
        return (await repo.find(id))!;
      });
    },
    async removeFromLabel(actor: Principal, artistUserId: string, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), artistUserId);
      return withTransaction(pool, async db => {
        const { users, repo, current, artist } = await resource(db, actor, id, true);
        if (!allows(current, 'admin') && (!label(current) || artist.label_user_id !== current.id)) throw new ApiError(403, 'FORBIDDEN');
        if (!artist.label_user_id) throw new ApiError(409, 'CONFLICT');
        if (options.assertCanDetach) await options.assertCanDetach(db, id);
        if (!await repo.detach(id, artist.label_user_id)) throw new ApiError(409, 'CONFLICT');
        await users.audit(actor.id, id, requestId, 'artist.removed_from_label', { previousLabelUserId: artist.label_user_id });
        return { id, label_user_id: null };
      });
    },
    async requestDeletion(actor: Principal, artistUserId: string, input: ArtistDeletionRequest, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), artistUserId);
      const { reason } = parse(artistDeletionRequest, input);
      return withTransaction(pool, async db => {
        const { users, repo, current, artist } = await resource(db, actor, id, true);
        if (!allows(current, 'admin') && (!label(current) || artist.label_user_id !== current.id)) throw new ApiError(403, 'FORBIDDEN');
        if (!artist.label_user_id) throw new ApiError(409, 'CONFLICT');
        const result = await repo.requestDeletion(id, artist.label_user_id, reason);
        if (!result) throw new ApiError(409, 'CONFLICT');
        await users.audit(actor.id, id, requestId, 'artist.deletion_requested', { deletionRequestId: result.id });
        return result;
      });
    },
    async listDeletionRequests(actor: Principal, input: ArtistDeletionListQuery = {}) {
      requireActor(actor);
      const page = pagination(actor.id, parse(artistDeletionListQuery, input), 'artist-deletion-requests');
      return withTransaction(pool, async db => {
        const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
        requireActor(current);
        if (!allows(current, 'admin') && !label(current)) throw new ApiError(403, 'FORBIDDEN');
        return page.page(await artistsRepository(db).deletionRequests(current.id, allows(current, 'admin'), page.cursorId, page.limit));
      });
    },
    async reviewDeletionRequest(actor: Principal, deletionRequestId: string, input: ArtistDeletionReview, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), deletionRequestId);
      const { status } = parse(artistDeletionReview, input);
      if (!allows(actor, 'admin')) throw new ApiError(403, 'FORBIDDEN');
      return withTransaction(pool, async db => {
        const repo = artistsRepository(db);
        const initial = await repo.deletionRequest(id);
        if (!initial) throw new ApiError(404, 'NOT_FOUND');
        const { users, current, artist } = await resource(db, actor, initial.artist_id, true);
        if (!allows(current, 'admin')) throw new ApiError(403, 'FORBIDDEN');
        const pending = await repo.deletionRequest(id, true);
        if (!pending || pending.status !== 'pending' ||
            (status === 'approved' && pending.label_id !== artist.label_user_id)) throw new ApiError(409, 'CONFLICT');
        const result = await repo.reviewDeletion(id, status);
        if (!result) throw new ApiError(409, 'CONFLICT');
        // Approval records review only; permanent account deletion remains a separate lifecycle capability.
        await users.audit(actor.id, initial.artist_id, requestId, 'artist.deletion_reviewed', { deletionRequestId: id, status });
        return result;
      });
    },
  };
}
export type ArtistsService = ReturnType<typeof createArtistsService>;


