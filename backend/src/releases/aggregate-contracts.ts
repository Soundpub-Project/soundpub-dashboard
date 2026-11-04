import { z } from 'zod';
import { releaseCreate, releaseDto } from './contracts.js';
import { trackCreate, trackDto, trackVersion } from '../tracks/contracts.js';

export const initialTrack = trackCreate.omit({ release_version: true });
export const aggregateTrack = initialTrack.extend({ id: z.uuid().optional(), version: trackVersion.optional() })
  .refine(value => (value.id === undefined) === (value.version === undefined));
export const aggregateCreate = releaseCreate.extend({ tracks: z.array(initialTrack).max(10000) });
export const aggregatePatch = releaseCreate.omit({ artist_id: true, artist_user_id: true, status: true }).partial().extend({
  version: trackVersion, tracks: z.array(aggregateTrack).max(10000),
});
export const aggregateDto = z.strictObject({ release: releaseDto, tracks: z.array(trackDto) });
