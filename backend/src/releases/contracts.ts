import { z } from 'zod';

export const releaseStatus = z.enum(['draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected', 'revision_submitted', 'inactive']);
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const fields = {
  title: z.string().trim().min(1).max(200),
  artist_name: z.string().trim().min(1).max(200),
  release_type: z.enum(['single', 'ep', 'album', 'compilation']),
  genre: text(100), release_date: z.iso.date().nullable().optional(),
  cover_url: z.url({ protocol: /^https?$/ }).max(2048).refine(value => {
    const url = new URL(value);
    return !url.username && !url.password;
  }).nullable().optional(),
  upc: z.string().trim().regex(/^\d{12,13}$/).nullable().optional(),
};
export const releaseCreate = z.strictObject({ ...fields, artist_id: z.uuid().optional(), artist_user_id: z.uuid().optional(), status: z.literal('draft').optional() });
export const releasePatch = z.strictObject({
  ...z.strictObject(fields).partial().shape,
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1),
  status: releaseStatus.optional(), rejection_reason: text(2000),
  archived_at: z.iso.datetime().nullable().optional(),
}).refine(value => Object.keys(value).some(key => key !== 'version'));
export const releaseListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(),
  search: z.string().trim().min(1).max(200).optional(), status: releaseStatus.optional(),
});
export const releaseDto = z.strictObject({
  id: z.uuid(), artist_id: z.uuid().nullable(), label_id: z.uuid().nullable(), label_name: z.string().nullable(), artist_user_id: z.uuid().nullable(), created_by: z.uuid().nullable(),
  title: z.string(), artist_name: z.string(), release_type: z.string().nullable(), genre: z.string().nullable(),
  release_date: z.string().nullable(), cover_url: z.string().nullable(), upc: z.string().nullable(),
  status: releaseStatus, rejection_reason: z.string().nullable(), archived_at: z.string().nullable(),
  version: z.number().int().min(1), created_at: z.string(), updated_at: z.string(),
});
export type ReleaseStatus = z.infer<typeof releaseStatus>;
export type ReleaseCreate = z.infer<typeof releaseCreate>;
export type ReleasePatch = z.infer<typeof releasePatch>;
export type ReleaseListQuery = z.infer<typeof releaseListQuery>;
export type ReleaseDto = z.infer<typeof releaseDto>;
