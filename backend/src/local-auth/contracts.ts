import { z } from 'zod';

export const lifecycleRequestInput = z.strictObject({
  email: z.email().max(320).transform(value => value.trim().toLowerCase()),
});

export const lifecycleTokenInput = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const passwordRecoveryResetInput = lifecycleTokenInput.extend({
  newPassword: z.string().min(12).max(1024),
});

export const acceptedResponseSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string', const: 'accepted' } },
} as const;

export const okResponseSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string', const: 'ok' } },
} as const;

