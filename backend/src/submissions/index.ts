import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { canManageArtist } from '../artists/index.js';
import { artistsRepository } from '../artists/repository.js';
import { usersRepository } from '../users/repository.js';
import { releasesRepository } from '../releases/repository.js';
import type { ReleaseDto } from '../releases/contracts.js';
import { catalogIdentity, customAuthority } from '../releases/ownership.js';
import { tracksRepository } from '../tracks/repository.js';
import type { TrackDto } from '../tracks/contracts.js';
import { withTransaction } from '../db/pool.js';
import { blockerOwners, submissionInput, type BlockerCode, type SubmissionBlocker } from './contracts.js';
import type { ProviderSubmission } from './provider.js';

export * from './contracts.js';
export { MockSubmissionProvider, type SubmissionProvider, type ProviderSubmission } from './provider.js';
export interface SubmissionContext {
  db: PoolClient;
  release: Readonly<ReleaseDto>;
  tracks: readonly Readonly<TrackDto>[];
  ownershipValid?: boolean;
}
export interface SubmissionDependencies {
  media?: { check(context: SubmissionContext): Promise<{ cover: boolean; audio: boolean }> };
  payment?: { isReleasePaymentSatisfied(context: SubmissionContext): Promise<boolean> };
  provider?: { providerReady(context: SubmissionContext): Promise<boolean>;
    createSubmission?(context: SubmissionContext): Promise<ProviderSubmission> };
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

export async function evaluateSubmission(context: SubmissionContext, dependencies: SubmissionDependencies = {}) {
  const { release, tracks } = context;
  const blockers: SubmissionBlocker[] = [];
  const block = (code: BlockerCode) => blockers.push({ code, owner: blockerOwners[code] });
  if (release.archived_at || !['draft', 'rejected'].includes(release.status)) block('RELEASE_STATE_INVALID');
  if (!release.title.trim() || !release.artist_name.trim() || !release.release_type ||
    !release.genre?.trim() || !release.release_date) block('RELEASE_METADATA_REQUIRED');
  if (!release.artist_user_id && context.ownershipValid !== true) block('OWNERSHIP_REQUIRED');
  if (!tracks.length) block('TRACKS_REQUIRED');
  if (tracks.some((track, index) => !track.title.trim() || !track.artist_name.trim() ||
    track.release_id !== release.id || track.position !== index + 1)) block('TRACK_METADATA_REQUIRED');
  try {
    if (!dependencies.media) block('MEDIA_UNAVAILABLE');
    else {
      const media = await dependencies.media.check(context);
      if (media.cover !== true) block('COVER_REQUIRED');
      if (media.audio !== true) block('AUDIO_REQUIRED');
    }
  } catch { block('MEDIA_UNAVAILABLE'); }
  try {
    if (!dependencies.payment) block('PAYMENT_UNAVAILABLE');
    else if (await dependencies.payment.isReleasePaymentSatisfied(context) !== true) block('PAYMENT_REQUIRED');
  } catch { block('PAYMENT_UNAVAILABLE'); }
  try {
    if (!dependencies.provider) block('PROVIDER_UNAVAILABLE');
    else if (await dependencies.provider.providerReady(context) !== true) block('PROVIDER_METADATA_REQUIRED');
    else if (!dependencies.provider.createSubmission) block('PROVIDER_UNAVAILABLE');
  } catch { block('PROVIDER_UNAVAILABLE'); }
  return { release_id: release.id, version: release.version, ready: blockers.length === 0, blockers };
}

export function createSubmissionService(pool: Pool, dependencies: SubmissionDependencies = {}) {
  async function resource(db: PoolClient, actor: Principal, id: string) {
    const repo = releasesRepository(db);
    const initial = await repo.find(id);
    if (!initial) throw new ApiError(404, 'NOT_FOUND');
    if (initial.artist_id) {
      const canonical = await catalogIdentity(db, initial.artist_id, initial.artist_user_id);
      if (canonical.management_mode === 'LABEL_CUSTOM_MANAGED') {
        const { current } = await customAuthority(db, actor, canonical, true);
        const release = await repo.find(id, true);
        if (!release || release.artist_id !== initial.artist_id || release.artist_user_id !== null) {
          throw new ApiError(409, 'CONFLICT');
        }
        const tracks = await tracksRepository(db).list(id);
        const readiness = await evaluateSubmission({ db, release, tracks, ownershipValid: true }, dependencies);
        return { repo, release, readiness, current };
      }
    }
    const users = usersRepository(db);
    const principals = await users.lock([actor.id, ...(initial.artist_user_id ? [initial.artist_user_id] : [])], true);
    const current = principals.get(actor.id);
    requireActor(current);
    let ownershipValid = false;
    if (initial.artist_user_id) {
      await db.query('SELECT id FROM soundpub.artists WHERE artist_user_id=$1 FOR UPDATE', [initial.artist_user_id]);
      const target = principals.get(initial.artist_user_id);
      const artist = await artistsRepository(db).find(initial.artist_user_id);
      ownershipValid = !!target && !!artist && canManageArtist(current,
        { ...target, roles: await users.allRoles(target.id) }, artist.label_user_id, true);
    }
    if (!ownershipValid && !allows(current, 'admin')) throw new ApiError(404, 'NOT_FOUND');
    const release = await repo.find(id, true);
    if (!release || release.artist_user_id !== initial.artist_user_id) throw new ApiError(409, 'CONFLICT');
    const tracks = await tracksRepository(db).list(id);
    const readiness = await evaluateSubmission({ db, release, tracks, ownershipValid }, dependencies);
    if (!ownershipValid && !readiness.blockers.some(blocker => blocker.code === 'OWNERSHIP_REQUIRED')) {
      readiness.blockers.push({ code: 'OWNERSHIP_REQUIRED', owner: 'PHASE3C' });
      readiness.ready = false;
    }
    return { repo, release, readiness, current };
  }
  return {
    async readiness(actor: Principal, releaseId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      return withTransaction(pool, async db => (await resource(db, actor, id)).readiness);
    },
    async submit(actor: Principal, releaseId: string, input: unknown, requestId: string) {
      requireActor(actor);
      const id = parse(z.uuid(), releaseId);
      const { version } = parse(submissionInput, input);
      return withTransaction(pool, async db => {
        const { repo, release, readiness, current } = await resource(db, actor, id);
        if (release.version !== version) throw new ApiError(409, 'CONFLICT');
        if (!readiness.ready) throw new ApiError(409, 'SUBMISSION_BLOCKED');
        if (!dependencies.provider?.createSubmission) throw new ApiError(409, 'SUBMISSION_BLOCKED');
        const providerSubmission = await dependencies.provider.createSubmission({ db, release, tracks: await tracksRepository(db).list(id) });
        if (providerSubmission.status !== 'ACCEPTED' || !providerSubmission.reference) throw new ApiError(409, 'SUBMISSION_BLOCKED');
        const status = release.status === 'rejected' ? 'revision_submitted' : 'pending_paid';
        if (!await repo.update(id, { version, status, rejection_reason: null })) throw new ApiError(409, 'CONFLICT');
        await repo.audit(current.id, id, requestId, 'release.submitted', { previousStatus: release.status, status, previousVersion: version, providerSubmission });
        return (await repo.find(id))!;
      });
    },
  };
}
export type SubmissionService = ReturnType<typeof createSubmissionService>;
