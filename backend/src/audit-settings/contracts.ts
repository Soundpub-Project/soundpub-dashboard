import { z } from 'zod';

// Public branding uses backend media identities, never arbitrary URLs or provider config.
const mediaId = z.uuid().nullable();
export const publicSettings = z.strictObject({
  dashboard_logo_light: mediaId, dashboard_logo_dark: mediaId, favicon: mediaId,
  auth_notice_config: z.strictObject({ enabled: z.boolean(), title: z.string().max(160),
    badge: z.string().max(80), message: z.string().max(2000), detail: z.string().max(4000),
    buttonText: z.string().max(80), revision: z.string().regex(/^[0-9]{1,20}$/) }),
});
export const userSettings = z.strictObject({
  email_notif_payout: z.boolean(), email_notif_release: z.boolean(),
  email_notif_payment: z.boolean(), email_notif_announcement: z.boolean(),
});
export const adminSettings = publicSettings.extend({ maintenance_enabled: z.boolean(),
  min_payout_amount: z.string().regex(/^[1-9][0-9]{0,15}\.[0-9]{2}$/).nullable(),
  release_price_per_track: z.string().regex(/^[1-9][0-9]{0,15}\.[0-9]{2}$/).nullable() });
export const publicDefaults: z.infer<typeof publicSettings> = {
  dashboard_logo_light: null, dashboard_logo_dark: null, favicon: null,
  auth_notice_config: { enabled: false, title: '', badge: '', message: '', detail: '', buttonText: '', revision: '1' },
};
export const userDefaults: z.infer<typeof userSettings> = {
  email_notif_payout: true, email_notif_release: true, email_notif_payment: true, email_notif_announcement: true,
};
export const adminDefaults = { ...publicDefaults, maintenance_enabled: false, min_payout_amount: null, release_price_per_track: null };
export const settingsPatch = z.strictObject({ version: z.number().int().min(1),
  settings: adminSettings.partial().refine(value => Object.keys(value).length > 0) });
export const userSettingsPatch = z.strictObject({ version: z.number().int().min(1),
  settings: userSettings.partial().refine(value => Object.keys(value).length > 0) });
export const auditQuery = z.strictObject({
  actor: z.uuid().optional(), action: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/).optional(),
  resource: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/).optional(),
  resource_id: z.uuid().optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
}).refine(value => !value.from || !value.to || value.from <= value.to);
export const auditDto = z.strictObject({ id: z.uuid(), actor_user_id: z.uuid().nullable(),
  action: z.string(), resource_type: z.string(), resource_id: z.uuid().nullable(), created_at: z.string() });
