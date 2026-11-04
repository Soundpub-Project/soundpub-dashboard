import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { canManageUser } from '../users/index.js';
import { usersRepository } from '../users/repository.js';
import { customManagedArtistCreate, customManagedArtistListQuery, customManagedArtistPatch,
  labelCustomOwnerScope, labelCustomUnitCreate, labelCustomUnitPatch, customManagedArtistDto,
  type LabelCustomActor, type LabelCustomOwnerScope, type LabelCustomUnitCreate, type LabelCustomUnitPatch,
  type CustomManagedArtistCreate, type CustomManagedArtistPatch, type CustomManagedArtistListQuery } from './contracts.js';
import { labelCustomRepository } from './repository.js';

export * from './contracts.js';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
const isAdmin = (actor: LabelCustomActor) => actor.roles.includes('admin') || actor.roles.includes('superadmin');
const allows = createAuthorizer();
function requireActor(actor: LabelCustomActor | undefined): asserts actor is LabelCustomActor {
  if (!actor || !allows(actor, 'authenticated') ||
      !(isAdmin(actor) || actor.roles.includes('label_custom'))) throw new ApiError(403, 'FORBIDDEN');
  parse(z.uuid(), actor.id);
}
const requestIdSchema = z.string().trim().min(1).max(200);
const cursorSchema = z.strictObject({ id: z.uuid(), filter: z.string().length(43) });
function pagination(actorId: string, ownerId: string, query: CustomManagedArtistListQuery) {
  const filter = createHash('sha256').update(JSON.stringify([
    'label-custom-artists', actorId, ownerId, query.search ?? null, query.status ?? 'active',
  ])).digest('base64url');
  let after: string | null = null;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
      const cursor = parse(cursorSchema, JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (cursor.filter !== filter) throw new Error('Invalid cursor');
      after = cursor.id;
    } catch { throw new ApiError(400, 'BAD_REQUEST'); }
  }
  return { after, filter, limit: Number(query.limit ?? 50) };
}

export function createLabelCustomService(pool: Pool) {
  async function authority(db: PoolClient, actor: LabelCustomActor, scope: LabelCustomOwnerScope, write: boolean) {
    // Shared user/role locks preserve ordering with user lifecycle operations.
    const principals = await usersRepository(db).lock([actor.id, ...(scope.owner_user_id ? [scope.owner_user_id] : [])], write);
    const current = principals.get(actor.id);
    requireActor(current);
    let ownerId = current.id;
    if (isAdmin(current)) {
      if (!scope.owner_user_id) throw new ApiError(400, 'BAD_REQUEST');
      ownerId = scope.owner_user_id;
    } else if (scope.owner_user_id !== undefined && scope.owner_user_id !== current.id) {
      throw new ApiError(403, 'FORBIDDEN');
    }
    const owner = principals.get(ownerId);
    if (!owner || owner.status !== 'active' || !owner.roles.includes('label_custom')) throw new ApiError(400, 'BAD_REQUEST');
    if (write && current.id !== ownerId && !canManageUser(current, ownerId, owner.roles)) throw new ApiError(404, 'NOT_FOUND');
    const repo = labelCustomRepository(db);
    const unit = await repo.unit(ownerId, write);
    return { current, ownerId, repo, unit };
  }
  function inputs(actor: LabelCustomActor, scope: LabelCustomOwnerScope) {
    requireActor(actor);
    return parse(labelCustomOwnerScope, scope);
  }
  async function resource(db: PoolClient, actor: LabelCustomActor, scope: LabelCustomOwnerScope, id: string, write: boolean) {
    const context = await authority(db, actor, scope, write);
    if (!context.unit) throw new ApiError(404, 'NOT_FOUND');
    const artist = await context.repo.artist(context.ownerId, context.unit.id, id, write);
    if (!artist) throw new ApiError(404, 'NOT_FOUND');
    return { ...context, unit: context.unit, artist };
  }
  return {
    async getUnit(actor: LabelCustomActor, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope);
      return withTransaction(pool, async db => {
        const { unit } = await authority(db, actor, target, false);
        if (!unit) throw new ApiError(404, 'NOT_FOUND');
        return unit;
      });
    },
    async createUnit(actor: LabelCustomActor, input: LabelCustomUnitCreate, requestId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), data = parse(labelCustomUnitCreate, input);
      const request = parse(requestIdSchema, requestId);
      return withTransaction(pool, async db => {
        const { repo, current, ownerId, unit } = await authority(db, actor, target, true);
        if (unit) throw new ApiError(409, 'CONFLICT');
        const id = randomUUID();
        const created = await repo.createUnit(id, ownerId, `LC-${id.replaceAll('-', '').toUpperCase()}`, data.name);
        if (!created) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, 'label_custom_unit', created.id, request, 'label_custom.unit_created', { ownerUserId: ownerId });
        return created;
      });
    },
    async updateUnit(actor: LabelCustomActor, input: LabelCustomUnitPatch, requestId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), patch = parse(labelCustomUnitPatch, input);
      const request = parse(requestIdSchema, requestId);
      return withTransaction(pool, async db => {
        const { repo, current, ownerId, unit } = await authority(db, actor, target, true);
        if (!unit) throw new ApiError(404, 'NOT_FOUND');
        const updated = await repo.updateUnit(unit.id, ownerId, patch);
        if (!updated) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, 'label_custom_unit', unit.id, request, 'label_custom.unit_updated', {
          ownerUserId: ownerId, fields: Object.keys(patch),
        });
        return updated;
      });
    },
    async listArtists(actor: LabelCustomActor, input: CustomManagedArtistListQuery = {}, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), query = parse(customManagedArtistListQuery, input);
      return withTransaction(pool, async db => {
        const { repo, ownerId, unit } = await authority(db, actor, target, false);
        if (!unit) throw new ApiError(404, 'NOT_FOUND');
        const { after, filter, limit } = pagination(actor.id, ownerId, query);
        const rows = await repo.listArtists(ownerId, unit.id, query, after, limit);
        const items = rows.slice(0, limit), last = items.at(-1);
        return { items, nextCursor: rows.length > limit && last
          ? Buffer.from(JSON.stringify({ id: last.id, filter })).toString('base64url') : null };
      });
    },
    async getArtist(actor: LabelCustomActor, artistId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), id = parse(z.uuid(), artistId);
      return withTransaction(pool, async db => (await resource(db, actor, target, id, false)).artist);
    },
    async createArtist(actor: LabelCustomActor, input: CustomManagedArtistCreate, requestId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), data = parse(customManagedArtistCreate, input);
      const request = parse(requestIdSchema, requestId);
      return withTransaction(pool, async db => {
        const { repo, current, ownerId, unit } = await authority(db, actor, target, true);
        if (!unit) throw new ApiError(404, 'NOT_FOUND');
        if (unit.status !== 'active') throw new ApiError(409, 'CONFLICT');
        const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
        const replay = await repo.claimArtistCreate(ownerId, request, requestHash);
        if (replay.state === 'conflict') throw new ApiError(409, 'CONFLICT');
        if (replay.state === 'completed') return parse(customManagedArtistDto, replay.responseBody);
        const created = await repo.createArtist(randomUUID(), ownerId, unit.id, data);
        if (!created) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, 'artist', created.id, request, 'label_custom.artist_created', {
          ownerUserId: ownerId, unitId: unit.id,
        });
        if (!await repo.completeArtistCreate(replay.scope, request, created)) throw new Error('Artist idempotency completion failed');
        return created;
      });
    },
    async updateArtist(actor: LabelCustomActor, artistId: string, input: CustomManagedArtistPatch,
      requestId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), id = parse(z.uuid(), artistId), patch = parse(customManagedArtistPatch, input);
      const request = parse(requestIdSchema, requestId);
      return withTransaction(pool, async db => {
        const { repo, current, ownerId, unit, artist } = await resource(db, actor, target, id, true);
        if (artist.status !== 'active') throw new ApiError(409, 'CONFLICT');
        const updated = await repo.updateArtist(ownerId, unit.id, id, patch);
        if (!updated) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, 'artist', id, request, 'label_custom.artist_updated', {
          ownerUserId: ownerId, unitId: unit.id, fields: Object.keys(patch),
        });
        return updated;
      });
    },
    async archiveArtist(actor: LabelCustomActor, artistId: string, requestId: string, scope: LabelCustomOwnerScope = {}) {
      const target = inputs(actor, scope), id = parse(z.uuid(), artistId);
      const request = parse(requestIdSchema, requestId);
      return withTransaction(pool, async db => {
        const { repo, current, ownerId, unit, artist } = await resource(db, actor, target, id, true);
        if (artist.status === 'archived') return artist;
        const archived = await repo.archiveArtist(ownerId, unit.id, id);
        if (!archived) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, 'artist', id, request, 'label_custom.artist_archived', {
          ownerUserId: ownerId, unitId: unit.id,
        });
        return archived;
      });
    },
  };
}
export type LabelCustomService = ReturnType<typeof createLabelCustomService>;
