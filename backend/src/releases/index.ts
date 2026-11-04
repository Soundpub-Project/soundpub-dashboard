import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { canManageArtist } from '../artists/index.js';
import { artistsRepository } from '../artists/repository.js';
import { usersRepository } from '../users/repository.js';
import { withTransaction } from '../db/pool.js';
import { releaseCreate, releasePatch, releaseListQuery,
  type ReleaseCreate, type ReleasePatch, type ReleaseListQuery, type ReleaseStatus } from './contracts.js';
import { catalogIdentity, customAuthority } from './ownership.js';
import { releasesRepository } from './repository.js';
import { tracksRepository } from '../tracks/repository.js';
import { formatMoney } from '../finance/index.js';
import { aggregateCreate, aggregatePatch } from './aggregate-contracts.js';
export * from './contracts.js';

const allows = createAuthorizer();
const isLabel = (actor: Principal) => actor.roles.some(role => role === 'label' || role === 'whitelabel');
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function requireActor(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
}
// Frontend: ReleaseFormPage, Releases, ArchiveReleaseDialog. Payment is a separate trusted domain.
const transitions: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  draft: ['pending', 'inactive'], pending: ['inactive'], pending_paid: ['processing', 'inactive'],
  processing: ['active', 'rejected', 'inactive'], active: ['inactive'],
  rejected: ['revision_submitted', 'inactive'], revision_submitted: ['processing', 'inactive'], inactive: ['pending'],
};
export function createReleasesService(pool: Pool) {
  async function priceSnapshot(db: PoolClient, releaseId: string | null, trackCount: number) {
    const configuredPrice = (await db.query<{ price: string | null }>(
      "SELECT settings->>'release_price_per_track' AS price FROM soundpub.application_settings WHERE id=true")).rows[0]?.price;
    const invoice = releaseId ? (await db.query<{ amount_minor: string }>(
      'SELECT amount_minor FROM soundpub.payment_invoices WHERE business_id=$1', [releaseId])).rows[0] : undefined;
    const price = invoice ? (await db.query<{ price: string | null }>(
      'SELECT price_per_track_snapshot::text AS price FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0]?.price : configuredPrice;
    if (!price) {
      if (invoice) throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
      return { price_per_track_snapshot: null, total_payment_snapshot: null };
    }
    if (!/^[1-9][0-9]{0,15}\.[0-9]{2}$/.test(price) || trackCount < 1) throw new ApiError(409, 'PAYMENT_PRICE_UNAVAILABLE');
    const [whole, cents] = price.split('.');
    if (invoice && invoice.amount_minor !== String((BigInt(whole!) * 100n + BigInt(cents!)) * BigInt(trackCount)))
      throw new ApiError(409, 'PAYMENT_PRICE_CHANGED');
    return { price_per_track_snapshot: price, total_payment_snapshot: formatMoney(
      (BigInt(whole!) * 100n + BigInt(cents!)) * BigInt(trackCount)) };
  }
  async function authority(db: PoolClient, actor: Principal, artistId: string | null, write: boolean, canonicalId?: string | null) {
    const canonical = canonicalId ? await catalogIdentity(db, canonicalId, artistId) : null;
    if (canonical?.management_mode === 'LABEL_CUSTOM_MANAGED') return customAuthority(db, actor, canonical, write);
    if (canonical) artistId = canonical.artist_user_id;
    const users = usersRepository(db);
    const principals = await users.lock([actor.id, ...(artistId ? [artistId] : [])], write);
    const current = principals.get(actor.id);
    requireActor(current);
    if (canonical) {
      const locked = (await db.query<{ id: string; artist_user_id: string | null; management_mode: string }>(
        `SELECT id, artist_user_id, management_mode FROM soundpub.artists WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
        [canonical.id])).rows[0];
      if (!locked || locked.artist_user_id !== artistId || locked.management_mode !== 'LOGIN_ACCOUNT') throw new ApiError(409, 'CONFLICT');
    }
    const artists = artistsRepository(db);
    if (artistId) await db.query(`SELECT id FROM soundpub.artists WHERE artist_user_id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [artistId]);
    const target = artistId ? principals.get(artistId) : undefined;
    const artist = artistId ? await artists.find(artistId) : null;
    if (allows(current, 'admin') && (!write || !target)) return { current, artist };
    if (!target || !artist || !canManageArtist(current,
      { ...target, roles: await users.allRoles(target.id) }, artist.label_user_id, write)) throw new ApiError(404, 'NOT_FOUND');
    return { current, artist };
  }
  async function resource(db: PoolClient, actor: Principal, id: string, write: boolean) {
    const repo = releasesRepository(db);
    const initial = await repo.find(id);
    if (!initial) throw new ApiError(404, 'NOT_FOUND');
    const auth = await authority(db, actor, initial.artist_user_id, write, initial.artist_id);
    const release = await repo.find(id, write);
    if (!release || release.artist_user_id !== initial.artist_user_id || release.artist_id !== initial.artist_id) throw new ApiError(409, 'CONFLICT');
    return { ...auth, repo, release };
  }
  return {
    async createAggregate(actor: Principal, input: z.infer<typeof aggregateCreate>, requestId: string) {
      requireActor(actor);
      const { tracks, ...value } = parse(aggregateCreate, input);
      return withTransaction(pool, async db => {
        const canonical = await catalogIdentity(db, value.artist_id, value.artist_user_id);
        const { current, artist } = await authority(db, actor, canonical.artist_user_id, true, canonical.id);
        value.artist_id = canonical.id;
        value.artist_user_id = canonical.artist_user_id ?? undefined;
        if (!artist) throw new ApiError(400, 'BAD_REQUEST');
        const repo = releasesRepository(db);
        const trackRepo = tracksRepository(db);
        const id = randomUUID();
        const snapshot = await priceSnapshot(db, null, tracks.length);
        await repo.create(id, current.id, artist.label_user_id, value, snapshot);
        for (const fields of tracks) await trackRepo.create(randomUUID(), id, fields);
        await repo.audit(current.id, id, requestId, 'release.aggregate.created', { tracks: tracks.length, artistId: canonical.id, labelId: artist.label_user_id });
        return { release: (await repo.find(id))!, tracks: await trackRepo.list(id) };
      });
    },
    async updateAggregate(actor: Principal, releaseId: string, input: z.infer<typeof aggregatePatch>, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      const { tracks, version, ...metadata } = parse(aggregatePatch, input);
      return withTransaction(pool, async db => {
        const { current, repo, release } = await resource(db, actor, id, true);
        if (release.version !== version || release.archived_at || !['draft', 'pending', 'rejected'].includes(release.status)) {
          throw new ApiError(409, 'CONFLICT');
        }
        if (!allows(current, 'admin') && metadata.upc !== undefined) throw new ApiError(403, 'FORBIDDEN');
        const trackRepo = tracksRepository(db);
        const existing = await trackRepo.list(id);
        const byId = new Map(existing.map(track => [track.id, track]));
        const retained = new Set<string>();
        const diff: Record<'CREATE' | 'UPDATE' | 'REMOVE' | 'UNCHANGED', string[]> = {
          CREATE: [], UPDATE: [], REMOVE: [], UNCHANGED: [],
        };
        for (const track of tracks) {
          if (!track.id) continue;
          const stored = byId.get(track.id);
          if (!stored || retained.has(track.id) || stored.version !== track.version) throw new ApiError(409, 'CONFLICT');
          retained.add(track.id);
        }
        for (const stored of existing) {
          if (retained.has(stored.id)) continue;
          try {
            if (!await trackRepo.delete(stored.id, id, stored.version)) throw new ApiError(409, 'CONFLICT');
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === '23503') throw new ApiError(409, 'CONFLICT');
            throw error;
          }
          diff.REMOVE.push(stored.id);
        }
        const ordered: string[] = [];
        for (const [index, track] of tracks.entries()) {
          const { id: trackId, version: expected, ...fields } = track;
          if (!trackId) {
            const created = randomUUID();
            await trackRepo.create(created, id, fields);
            ordered.push(created);
            diff.CREATE.push(created);
          } else {
            const stored = byId.get(trackId)!;
            const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
              value !== stored[key as keyof typeof stored]));
            if (stored.position !== index + 1) changes.position = index + 1;
            if (Object.keys(changes).length) {
              if (!await trackRepo.update(trackId, id, expected!, changes)) throw new ApiError(409, 'CONFLICT');
              diff.UPDATE.push(trackId);
            } else diff.UNCHANGED.push(trackId);
            ordered.push(trackId);
          }
        }
        await db.query(`UPDATE soundpub.tracks t SET position=ordered.position::integer, updated_at=now()
          FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id,position)
          WHERE t.release_id=$1 AND t.id=ordered.id AND t.position<>ordered.position`, [id, ordered]);
        const snapshot = await priceSnapshot(db, id, tracks.length);
        if (Object.keys(metadata).length || snapshot) {
          if (!await repo.update(id, { ...metadata, ...snapshot, version })) throw new ApiError(409, 'CONFLICT');
        } else if (!await trackRepo.bumpParent(id, version)) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, id, requestId, 'release.aggregate.updated', { previousVersion: version, diff });
        return { release: (await repo.find(id))!, tracks: await trackRepo.list(id) };
      });
    },
    async list(actor: Principal, input: ReleaseListQuery = {}) {
      requireActor(actor);
      const query = parse(releaseListQuery, input);
      const filter = createHash('sha256').update(JSON.stringify([actor.id, query.search ?? null, query.status ?? null])).digest('base64url');
      let cursor: string | null = null;
      if (query.cursor) {
        try {
          if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
          const decoded = parse(z.strictObject({ id: z.uuid(), filter: z.string().length(43) }),
            JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
          if (decoded.filter !== filter) throw new Error('Invalid cursor');
          cursor = decoded.id;
        } catch { throw new ApiError(400, 'BAD_REQUEST'); }
      }
      return withTransaction(pool, async db => {
        const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
        requireActor(current);
        if (current.roles.includes('label_custom')) await db.query(
          'SELECT id FROM soundpub.label_custom_units WHERE owner_user_id=$1 FOR SHARE', [current.id]);
        const limit = Number(query.limit ?? 50);
        const rows = await releasesRepository(db).list(current.id, allows(current, 'admin'), isLabel(current),
          current.roles.includes('artist'), query, cursor, limit, current.roles.includes('label_custom'));
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return { items, nextCursor: rows.length > limit && last
          ? Buffer.from(JSON.stringify({ id: last.id, filter })).toString('base64url') : null };
      });
    },
    async get(actor: Principal, releaseId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      return withTransaction(pool, async db => (await resource(db, actor, id, false)).release);
    },
    async create(actor: Principal, input: ReleaseCreate, requestId: string) {
      requireActor(actor);
      const value = parse(releaseCreate, input);
      return withTransaction(pool, async db => {
        const canonical = await catalogIdentity(db, value.artist_id, value.artist_user_id);
        const { current, artist } = await authority(db, actor, canonical.artist_user_id, true, canonical.id);
        value.artist_id = canonical.id;
        value.artist_user_id = canonical.artist_user_id ?? undefined;
        if (!artist) throw new ApiError(400, 'BAD_REQUEST');
        const repo = releasesRepository(db);
        const id = randomUUID();
        await repo.create(id, current.id, artist.label_user_id, value);
        await repo.audit(current.id, id, requestId, 'release.created', { artistId: canonical.id, artistUserId: value.artist_user_id ?? null, labelId: artist.label_user_id });
        return (await repo.find(id))!;
      });
    },
    async update(actor: Principal, releaseId: string, input: ReleasePatch, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      const patch = parse(releasePatch, input);
      return withTransaction(pool, async db => {
        const { current, repo, release } = await resource(db, actor, id, true);
        if (patch.version !== release.version) throw new ApiError(409, 'CONFLICT');
        const admin = allows(current, 'admin');
        const next = patch.status ?? release.status;
        if (patch.status !== undefined && patch.status === release.status) throw new ApiError(409, 'CONFLICT');
        if (release.status === 'pending_paid' && (!admin || next !== 'processing' ||
          Object.keys(patch).some(key => key !== 'version' && key !== 'status'))) throw new ApiError(403, 'FORBIDDEN');
        if (next !== release.status && ['pending', 'revision_submitted'].includes(next)) throw new ApiError(409, 'CONFLICT');
        if (next !== release.status && !transitions[release.status].includes(next)) throw new ApiError(409, 'CONFLICT');
        const picArchive = current.roles.includes('label_custom') && patch.status === 'inactive' &&
          typeof patch.archived_at === 'string' && Object.keys(patch).every(key => ['version', 'status', 'archived_at'].includes(key));
        const picRestore = current.roles.includes('label_custom') && release.status === 'inactive' &&
          patch.status === undefined && patch.archived_at === null && Object.keys(patch).every(key => ['version', 'archived_at'].includes(key));
        if (!admin && !picArchive && !picRestore && (!['draft', 'pending', 'rejected'].includes(release.status) ||
          next !== release.status && !['pending', 'revision_submitted'].includes(next) ||
          patch.upc !== undefined || patch.archived_at !== undefined || patch.rejection_reason !== undefined)) throw new ApiError(403, 'FORBIDDEN');
        if (next === 'rejected' && !patch.rejection_reason?.trim()) throw new ApiError(400, 'BAD_REQUEST');
        if (patch.rejection_reason !== undefined && next !== 'rejected') throw new ApiError(400, 'BAD_REQUEST');
        if (next !== release.status && ['pending', 'revision_submitted'].includes(next)) {
          const readiness = await db.query<{ count: number; missing_audio: number }>(`SELECT count(*)::int AS count,
            count(*) FILTER (WHERE audio_url IS NULL)::int AS missing_audio
            FROM soundpub.tracks WHERE release_id=$1`, [id]);
          if (!release.cover_url || !readiness.rows[0]?.count || readiness.rows[0].missing_audio) throw new ApiError(409, 'CONFLICT');
        }
        if (next === 'revision_submitted') patch.rejection_reason = null;
        if (patch.archived_at !== undefined && (patch.archived_at === null ? next !== 'pending' : next !== 'inactive')) throw new ApiError(400, 'BAD_REQUEST');
        // ponytail: activation blocked until transactional track/ISRC validation joins this domain.
        if (next === 'active' && next !== release.status) throw new ApiError(409, 'CONFLICT');
        if (!await repo.update(id, patch)) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, id, requestId, 'release.updated', {
          previousStatus: release.status, status: next, previousVersion: release.version,
          fields: Object.keys(patch).filter(key => key !== 'version'),
        });
        return (await repo.find(id))!;
      });
    },
    async delete(actor: Principal, releaseId: string, _requestId: string): Promise<never> {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      return withTransaction(pool, async db => {
        await resource(db, actor, id, true);
        // ponytail: delete/refund blocked until all payment, track, storage and royalty dependencies are known.
        throw new ApiError(409, 'CONFLICT');
      });
    },
  };
}
export type ReleasesService = ReturnType<typeof createReleasesService>;
