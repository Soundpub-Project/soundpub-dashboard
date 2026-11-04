import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { catalogIdentity, customAuthority } from '../releases/ownership.js';
import { usersRepository } from '../users/repository.js';
import { canManageUser } from '../users/index.js';
import { trackCreate, trackPatch, trackDelete, trackReorder,
  type TrackCreate, type TrackPatch, type TrackDelete, type TrackReorder } from './contracts.js';
import { tracksRepository, type TrackParent } from './repository.js';

export * from './contracts.js';
export interface TracksOptions {
  /** Must reject unknown or existing downstream references, inside this transaction. */
  assertCanDelete?: (db: PoolClient, trackId: string) => Promise<void>;
}
const allows = createAuthorizer();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function requireActor(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
export function canManageTrackParent(actor: Principal, parent: TrackParent) {
  return allows(actor, 'authenticated') && (allows(actor, 'admin') ||
    (actor.roles.includes('artist') && actor.id === parent.artist_user_id) ||
    (actor.roles.some(role => role === 'label' || role === 'whitelabel') && actor.id === parent.label_id));
}
export function createTracksService(pool: Pool, options: TracksOptions = {}) {
  async function resource(db: PoolClient, actor: Principal, id: string, write: boolean, byTrack = false) {
    const repo = tracksRepository(db);
    const parentId = byTrack ? await repo.parentId(id) : id;
    if (!parentId) throw new ApiError(404, 'NOT_FOUND');
    const initial = await repo.parent(parentId, null);
    if (!initial) throw new ApiError(404, 'NOT_FOUND');
    if (initial.artist_id) {
      const identity = await catalogIdentity(db, initial.artist_id, initial.artist_user_id);
      if (identity.management_mode === 'LABEL_CUSTOM_MANAGED') {
        const { current } = await customAuthority(db, actor, identity, write);
        const parent = await repo.parent(parentId, write);
        if (!parent || parent.artist_id !== initial.artist_id || parent.artist_user_id !== null) throw new ApiError(404, 'NOT_FOUND');
        if (write && (parent.archived_at || !['draft', 'pending', 'rejected'].includes(parent.status))) throw new ApiError(409, 'CONFLICT');
        const track = byTrack ? await repo.find(id, parent.id) : null;
        if (byTrack && !track) throw new ApiError(404, 'NOT_FOUND');
        return { repo, parent, track, current };
      }
    }
    const users = usersRepository(db);
    const principals = await users.lock([actor.id, ...(initial.artist_user_id ? [initial.artist_user_id] : [])], write);
    const current = principals.get(actor.id);
    requireActor(current);
    const binding = initial.artist_user_id ? await repo.verifiedArtist(initial.artist_user_id, current.id, write) : null;
    const parent = await repo.parent(parentId, write);
    if (!parent || parent.artist_user_id !== initial.artist_user_id) throw new ApiError(404, 'NOT_FOUND');
    if (allows(current, 'admin')) {
      if (write && parent.artist_user_id && current.id !== parent.artist_user_id && !canManageUser(current, parent.artist_user_id,
        await users.allRoles(parent.artist_user_id))) throw new ApiError(404, 'NOT_FOUND');
    } else if (!binding?.verified || !canManageTrackParent(current, { ...parent, label_id: binding.label_id })) {
      throw new ApiError(404, 'NOT_FOUND');
    }
    if (write && (parent.archived_at || !['draft', 'pending', 'rejected'].includes(parent.status))) throw new ApiError(409, 'CONFLICT');
    const track = byTrack ? await repo.find(id, parent.id) : null;
    if (byTrack && !track) throw new ApiError(404, 'NOT_FOUND');
    return { repo, parent, track, current };
  }
  function version(actual: number, expected: number) {
    if (actual !== expected) throw new ApiError(409, 'CONFLICT');
  }
  async function finish(repo: ReturnType<typeof tracksRepository>, parent: TrackParent,
    actor: Principal, id: string, requestId: string, action: string, metadata: object = {}) {
    if (!await repo.bumpParent(parent.id, parent.version)) throw new ApiError(409, 'CONFLICT');
    await repo.audit(actor.id, id, requestId, action, { ...metadata, release_id: parent.id, release_version: parent.version + 1 });
  }
  return {
    async list(actor: Principal, releaseId: string) {
      requireActor(actor); const id = parse(z.uuid(), releaseId);
      return withTransaction(pool, async db => {
        const { repo, parent } = await resource(db, actor, id, false);
        return { items: await repo.list(id), release_version: parent.version };
      });
    },
    async get(actor: Principal, trackId: string) {
      requireActor(actor); const id = parse(z.uuid(), trackId);
      return withTransaction(pool, async db => (await resource(db, actor, id, false, true)).track!);
    },
    async create(actor: Principal, releaseId: string, input: TrackCreate, requestId: string) {
      requireActor(actor); const id = parse(z.uuid(), releaseId);
      const { release_version, ...fields } = parse(trackCreate, input);
      return withTransaction(pool, async db => {
        const { repo, parent, current } = await resource(db, actor, id, true);
        version(parent.version, release_version);
        // ponytail: priced releases use aggregate edits; allow standalone repricing after shared snapshot logic exists.
        if (parent.payment_priced) throw new ApiError(409, 'PAYMENT_PRICE_CHANGED');
        const trackId = randomUUID();
        await repo.create(trackId, id, fields);
        await finish(repo, parent, current, trackId, requestId, 'track.created');
        return { track: (await repo.find(trackId, id))!, release_version: parent.version + 1 };
      });
    },
    async update(actor: Principal, trackId: string, input: TrackPatch, requestId: string) {
      requireActor(actor); const id = parse(z.uuid(), trackId);
      const { version: expected, release_version, ...fields } = parse(trackPatch, input);
      return withTransaction(pool, async db => {
        const { repo, parent, track, current } = await resource(db, actor, id, true, true);
        version(parent.version, release_version); version(track!.version, expected);
        if (!await repo.update(id, parent.id, expected, fields)) throw new ApiError(409, 'CONFLICT');
        await finish(repo, parent, current, id, requestId, 'track.updated', { fields: Object.keys(fields) });
        return { track: (await repo.find(id, parent.id))!, release_version: parent.version + 1 };
      });
    },
    async delete(actor: Principal, trackId: string, input: TrackDelete, requestId: string) {
      requireActor(actor); const id = parse(z.uuid(), trackId);
      const expected = parse(trackDelete, input);
      return withTransaction(pool, async db => {
        const { repo, parent, track, current } = await resource(db, actor, id, true, true);
        version(parent.version, expected.release_version); version(track!.version, expected.version);
        if (parent.payment_priced) throw new ApiError(409, 'PAYMENT_PRICE_CHANGED');
        if (options.assertCanDelete) await options.assertCanDelete(db, id);
        try {
          if (!await repo.delete(id, parent.id, expected.version)) throw new ApiError(409, 'CONFLICT');
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === '23503') throw new ApiError(409, 'CONFLICT');
          throw error;
        }
        await finish(repo, parent, current, id, requestId, 'track.deleted');
        return { id, release_version: parent.version + 1 };
      });
    },
    async reorder(actor: Principal, releaseId: string, input: TrackReorder, requestId: string) {
      requireActor(actor); const id = parse(z.uuid(), releaseId);
      const { release_version, track_ids } = parse(trackReorder, input);
      return withTransaction(pool, async db => {
        const { repo, parent, current } = await resource(db, actor, id, true);
        version(parent.version, release_version);
        const tracks = await repo.list(id);
        const ids = new Set(tracks.map(track => track.id));
        if (ids.size !== track_ids.length || track_ids.some(track => !ids.has(track))) throw new ApiError(400, 'BAD_REQUEST');
        await repo.reorder(id, track_ids);
        await finish(repo, parent, current, id, requestId, 'track.reordered', { track_ids });
        return { items: await repo.list(id), release_version: parent.version + 1 };
      });
    },
  };
}
export type TracksService = ReturnType<typeof createTracksService>;
