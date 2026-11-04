import { z } from 'zod';

export const submissionInput = z.strictObject({ version: z.number().int().min(1).max(2147483646) });
export const blockerOwners = {
  RELEASE_STATE_INVALID: 'PHASE3C', RELEASE_METADATA_REQUIRED: 'PHASE3C',
  TRACKS_REQUIRED: 'PHASE3C', TRACK_METADATA_REQUIRED: 'PHASE3C', OWNERSHIP_REQUIRED: 'PHASE3C',
  COVER_REQUIRED: 'PHASE3D_STORAGE', AUDIO_REQUIRED: 'PHASE3D_STORAGE', MEDIA_UNAVAILABLE: 'PHASE3D_STORAGE',
  PAYMENT_REQUIRED: 'PHASE3E_PAYMENT', PAYMENT_UNAVAILABLE: 'PHASE3E_PAYMENT',
  PROVIDER_METADATA_REQUIRED: 'LATER_PROVIDER', PROVIDER_UNAVAILABLE: 'LATER_PROVIDER',
} as const;
export type BlockerCode = keyof typeof blockerOwners;
export interface SubmissionBlocker {
  code: BlockerCode;
  owner: typeof blockerOwners[BlockerCode];
}
export const submissionReadinessDto = z.strictObject({
  release_id: z.uuid(), version: z.number().int().min(1), ready: z.boolean(),
  blockers: z.array(z.strictObject({
    code: z.enum(Object.keys(blockerOwners) as [BlockerCode, ...BlockerCode[]]),
    owner: z.enum(['PHASE3C', 'PHASE3D_STORAGE', 'PHASE3E_PAYMENT', 'LATER_PROVIDER']),
  })),
});
