import { z } from 'zod';

export const trackVersion = z.number().int().min(1).max(2147483646);
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const fields = {
  title: z.string().trim().min(1).max(200),
  artist_name: z.string().trim().min(1).max(200),
  genre: text(100), composer: text(500), lyricist: text(500), lyrics: text(50000),
  isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/).nullable().optional(),
  duration: z.number().finite().min(1).max(86400).nullable().optional(),
  explicit_lyrics: z.boolean().optional(),
};
export const trackCreate = z.strictObject({ ...fields, release_version: trackVersion });
export const trackPatch = z.strictObject({ ...fields }).partial().extend({
  version: trackVersion, release_version: trackVersion,
}).refine(value => Object.keys(value).some(key => key !== 'version' && key !== 'release_version'));
export const trackDelete = z.strictObject({ version: trackVersion, release_version: trackVersion });
export const trackReorder = z.strictObject({
  release_version: trackVersion,
  track_ids: z.array(z.uuid()).max(10000).refine(ids => new Set(ids).size === ids.length),
});
export const trackDto = z.strictObject({
  id: z.uuid(), artist_id: z.uuid().nullable(), release_id: z.uuid(), title: z.string(), artist_name: z.string(),
  position: z.number().int().min(1), version: trackVersion,
  genre: z.string().nullable(), composer: z.string().nullable(), lyricist: z.string().nullable(),
  lyrics: z.string().nullable(), isrc: z.string().nullable(), duration: z.number().nullable(),
  audio_url: z.string().nullable().optional(),
  clip_url: z.string().nullable().optional(),
  explicit_lyrics: z.boolean(), created_at: z.string(), updated_at: z.string(),
});
export type TrackCreate = z.infer<typeof trackCreate>;
export type TrackPatch = z.infer<typeof trackPatch>;
export type TrackDelete = z.infer<typeof trackDelete>;
export type TrackReorder = z.infer<typeof trackReorder>;
export type TrackDto = z.infer<typeof trackDto>;
