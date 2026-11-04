import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const url = z.url({ protocol: /^https?$/ }).max(2048).refine(value => {
  const parsed = new URL(value);
  return !parsed.username && !parsed.password;
});
export const artistSocialLinks = z.strictObject({
  instagram: url.optional(), youtube: url.optional(), tiktok: url.optional(),
  twitter: url.optional(), website: url.optional(),
  spotify: z.union([url, z.boolean()]).optional(),
  apple_music: z.union([url, z.boolean()]).optional(),
});
const fields = {
  artist_name: z.string().trim().min(1).max(200),
  // ponytail: legacy artist_type mixes performer and content types; preserve until product splits them.
  artist_type: z.string().trim().min(1).max(100).optional(),
  bio: text(10000), genre: text(100), legal_name: text(200), country: text(100),
  city: text(100), language: text(100), gender: text(100),
  date_of_birth: z.iso.date().refine(value => value <= new Date().toISOString().slice(0, 10)).nullable().optional(),
  social_links: artistSocialLinks.nullable().optional(),
  full_name: z.string().trim().min(1).max(200).optional(), phone: text(50), address: text(2000),
};
export const artistCreate = z.strictObject({ ...fields, label_user_id: z.uuid().optional() });
export const artistPatch = z.strictObject(fields).partial().refine(value => Object.keys(value).length > 0);
export const artistListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(), search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});
export const artistDeletionListQuery = artistListQuery.pick({ limit: true, cursor: true });
export const artistDeletionRequest = z.strictObject({ reason: z.string().trim().min(1).max(2000) });
export const artistDeletionReview = z.strictObject({ status: z.enum(['approved', 'rejected']) });
export const artistDto = z.strictObject({
  id: z.uuid(), profile_id: z.uuid().nullable(), catalog_artist_id: z.uuid().nullable(),
  label_user_id: z.uuid().nullable(), full_name: z.string(), phone: z.string().nullable(), address: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'suspended']), artist_name: z.string(), artist_type: z.string(),
  bio: z.string().nullable(), genre: z.string().nullable(), legal_name: z.string().nullable(), country: z.string().nullable(),
  city: z.string().nullable(), language: z.string().nullable(), gender: z.string().nullable(),
  date_of_birth: z.string().nullable(), profile_image_url: z.string().nullable(), social_links: artistSocialLinks,
  verified: z.boolean(), verified_at: z.string().nullable(), artist_profile_completed: z.boolean(),
  created_at: z.string(), updated_at: z.string(),
});
export const artistDeletionRequestDto = z.strictObject({
  id: z.uuid(), artist_id: z.uuid(), label_id: z.uuid(), reason: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']), created_at: z.string(), updated_at: z.string(),
});
export type ArtistCreate = z.infer<typeof artistCreate>;
export type ArtistPatch = z.infer<typeof artistPatch>;
export type ArtistListQuery = z.infer<typeof artistListQuery>;
export type ArtistDeletionListQuery = z.infer<typeof artistDeletionListQuery>;
export type ArtistDto = z.infer<typeof artistDto>;
export type ArtistDeletionRequest = z.infer<typeof artistDeletionRequest>;
export type ArtistDeletionReview = z.infer<typeof artistDeletionReview>;
export type ArtistDeletionRequestDto = z.infer<typeof artistDeletionRequestDto>;

