import { z } from 'zod';
export const notificationType = z.enum(['info', 'success', 'warning', 'error', 'release', 'announcement', 'payout']);
export const content = z.strictObject({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
export const targeted = content.extend({ recipient_user_id: z.uuid(), type: notificationType.default('info') });
export const listQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(200).optional(), cursor: z.string().max(1000).optional() });
export const notificationDto = z.strictObject({
  id: z.uuid(), recipient_user_id: z.uuid().nullable(), kind: z.enum(['USER_NOTIFICATION', 'GLOBAL_ANNOUNCEMENT']),
  type: notificationType, title: z.string(), body: z.string(), metadata_safe: z.strictObject({}),
  read_at: z.string().nullable(), created_at: z.string(),
});
export type NotificationDto = z.infer<typeof notificationDto>;
