import { z } from 'zod';
import type { Principal } from '../auth/index.js';

export type LabelCustomActor = Principal;
export const labelCustomOwnerScope = z.strictObject({ owner_user_id: z.uuid().optional() });
export const labelCustomUnitCreate = z.strictObject({ name: z.string().trim().min(1).max(200) });
export const labelCustomUnitPatch = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).refine(value => Object.values(value).some(field => field !== undefined));

const artistFields = {
  name: z.string().trim().min(1).max(200),
  contact_email: z.string().trim().max(320).pipe(z.email()),
  contact_phone: z.string().trim().min(1).max(50),
};
export const customManagedArtistCreate = z.strictObject(artistFields);
export const customManagedArtistPatch = z.strictObject(artistFields).partial()
  .refine(value => Object.values(value).some(field => field !== undefined));
export const customManagedArtistListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
});
export const labelCustomUnitDto = z.strictObject({
  id: z.uuid(), owner_user_id: z.uuid(), unit_code: z.string().min(1), name: z.string(),
  status: z.enum(['active', 'archived']), created_at: z.string(), updated_at: z.string(),
});
export const customManagedArtistDto = z.strictObject({
  id: z.uuid(), label_id: z.uuid(), artist_user_id: z.null(), label_custom_unit_id: z.uuid(),
  management_mode: z.literal('LABEL_CUSTOM_MANAGED'), name: z.string(),
  contact_email: z.string(), contact_phone: z.string(), status: z.enum(['active', 'archived']),
  verified_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
export type LabelCustomOwnerScope = z.infer<typeof labelCustomOwnerScope>;
export type LabelCustomUnitCreate = z.infer<typeof labelCustomUnitCreate>;
export type LabelCustomUnitPatch = z.infer<typeof labelCustomUnitPatch>;
export type LabelCustomUnitDto = z.infer<typeof labelCustomUnitDto>;
export type CustomManagedArtistCreate = z.infer<typeof customManagedArtistCreate>;
export type CustomManagedArtistPatch = z.infer<typeof customManagedArtistPatch>;
export type CustomManagedArtistListQuery = z.infer<typeof customManagedArtistListQuery>;
export type CustomManagedArtistDto = z.infer<typeof customManagedArtistDto>;
