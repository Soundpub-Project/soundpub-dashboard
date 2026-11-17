import { z } from 'zod';
import { ROLES } from '../auth/index.js';

const mediaUrl = z.url({ protocol: /^https?$/ }).max(2048).nullable();
export const profilePatch = z.strictObject({
  full_name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  avatar_url: mediaUrl.optional(), logo_url: mediaUrl.optional(),
  logo_url_light: mediaUrl.optional(), logo_url_dark: mediaUrl.optional(),
}).refine(value => Object.keys(value).length > 0);
export const statusPatch = z.strictObject({ status: z.enum(['active', 'inactive', 'suspended']) });
export const passwordReset = z.strictObject({ newPassword: z.string().min(12).max(1024) });
export const whitelabelArtistCreate = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullable().optional(),
});
export const whitelabelDashboardDto = z.strictObject({
  label_id: z.uuid(), subscription_status: z.string().nullable(), currency: z.literal('IDR'),
  total_artists: z.number().int().nonnegative(), total_releases: z.number().int().nonnegative(),
  total_revenue: z.string(), artists_with_access: z.number().int().nonnegative(),
  artists_without_access: z.number().int().nonnegative(),
});
export const composerCodePut = z.strictObject({ composerCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).max(100).nullable() });
export const partnerIdentityPut = z.strictObject({
  subject: z.string().trim().min(1).max(255).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
});
const partnerBindingDto = z.strictObject({
  provider: z.literal('iccn'), issuer: z.string(), subject: z.string(), verifiedAt: z.string().nullable(),
});
export const partnerIdentityDto = z.strictObject({
  eligible: z.boolean(), issuer: z.string().nullable(), binding: partnerBindingDto.nullable(),
});
export const userCreate = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(1024),
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullable().optional(),
  role: z.enum(ROLES),
  parentLabelId: z.uuid().nullable().optional(),
});
export const rolesPut = z.strictObject({
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length).refine(value => new Set(value).size === value.length),
  parentLabelId: z.uuid().nullable().optional(),
});
export const listQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: statusPatch.shape.status.optional(), role: z.enum(ROLES).optional(),
});
export const profileDto = z.strictObject({
  id: z.uuid(), email: z.string().nullable(), account_kind: z.enum(['STANDARD', 'MANAGED_ARTIST']), full_name: z.string(),
  phone: z.string().nullable(), address: z.string().nullable(),
  avatar_url: z.string().nullable(), logo_url: z.string().nullable(),
  logo_url_light: z.string().nullable(), logo_url_dark: z.string().nullable(),
  parent_label_id: z.uuid().nullable(), parent_label_name: z.string().nullable(),
  composer_code: z.string().nullable(), balance: z.string(),
  status: statusPatch.shape.status, email_verified: z.boolean(),
  password_set: z.boolean().nullable(), subscription_status: z.string().nullable(),
  subscription_upgraded_at: z.string().nullable(), sso_provider: z.string().nullable(),
  artist_profile_completed: z.boolean().nullable(), created_at: z.string(), updated_at: z.string(),
});
export type ProfileDto = z.infer<typeof profileDto>;
export type ProfilePatch = z.infer<typeof profilePatch>;
export type RolesPut = z.infer<typeof rolesPut>;
export type ListQuery = z.infer<typeof listQuery>;
export type ComposerCodePut = z.infer<typeof composerCodePut>;
export type PartnerIdentityPut = z.infer<typeof partnerIdentityPut>;
export type PasswordReset = z.infer<typeof passwordReset>;
export type UserCreate = z.infer<typeof userCreate>;
export type WhitelabelArtistCreate = z.infer<typeof whitelabelArtistCreate>;
