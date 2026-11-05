import { z } from 'zod';
import { ApiError } from '../api/types.js';

export const categories = ['USER_AVATAR', 'LABEL_LOGO', 'RELEASE_COVER', 'TRACK_AUDIO', 'COPYRIGHT_DOCUMENT', 'TAKEDOWN_DOCUMENT', 'OTHER'] as const;
export const uploadCategories = ['USER_AVATAR', 'LABEL_LOGO', 'RELEASE_COVER', 'TRACK_AUDIO', 'TAKEDOWN_DOCUMENT', 'OTHER'] as const;
export const SETTINGS_MEDIA_RESOURCE_ID = '00000000-0000-4000-8000-0000000003d0';
export const uploadInput = z.strictObject({
  category: z.enum(uploadCategories), resource_type: z.enum(['user', 'label', 'release', 'track', 'settings', 'takedown']),
  resource_id: z.uuid(), mime_type: z.string().max(100), size: z.number().int().min(1),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).transform(v => v.toLowerCase()),
  filename: z.string().min(1).max(255).regex(/^[^/\\]+$/)
    .refine(value => [...value].every(character => character.charCodeAt(0) >= 32)),
  variant: z.enum(['default', 'light', 'dark']).default('default'),
  visibility: z.literal('PRIVATE').default('PRIVATE'),
});
export type UploadInput = z.infer<typeof uploadInput>;
export const mediaDto = z.strictObject({
  id: z.uuid(), category: z.enum(categories), resource_type: z.enum(['user', 'label', 'release', 'track', 'settings', 'takedown']), resource_id: z.uuid(),
  variant: z.enum(['default', 'light', 'dark']), visibility: z.literal('PRIVATE'),
  mime_type: z.string(), size: z.number(), checksum: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'FAILED', 'REPLACED', 'DELETED']),
  created_at: z.string(), updated_at: z.string(),
});
export type MediaDto = z.infer<typeof mediaDto>;
export interface MediaRow extends MediaDto {
  owner_user_id: string; bucket: string; object_key: string; expires_at: Date;
  release_id: string | null; track_id: string | null; profile_id: string | null; takedown_request_id: string | null;
  original_filename: string | null;
}
export const limits = { USER_AVATAR: 5 * 1024 ** 2, LABEL_LOGO: 1024 ** 2,
  RELEASE_COVER: 5 * 1024 ** 2, TRACK_AUDIO: 500 * 1024 ** 2, TAKEDOWN_DOCUMENT: 10 * 1024 ** 2,
  OTHER: 5 * 1024 ** 2 } as const;
const extensions: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
  'audio/wav': ['wav'], 'audio/x-wav': ['wav'], 'audio/flac': ['flac'],
  'audio/aiff': ['aiff', 'aif'], 'audio/x-aiff': ['aiff', 'aif'], 'audio/mpeg': ['mp3'],
  'application/pdf': ['pdf'],
};
export function validateUpload(value: unknown): UploadInput {
  const parsed = uploadInput.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
  const input = parsed.data;
  const type = { USER_AVATAR: 'user', LABEL_LOGO: 'label', RELEASE_COVER: 'release', TRACK_AUDIO: 'track',
    TAKEDOWN_DOCUMENT: 'takedown', OTHER: 'settings' }[input.category as keyof typeof limits];
  if (!type) throw new ApiError(400, 'BAD_REQUEST');
  if (input.resource_type !== type || (!['LABEL_LOGO', 'OTHER'].includes(input.category) && input.variant !== 'default')
    || (input.category === 'OTHER' && input.resource_id !== SETTINGS_MEDIA_RESOURCE_ID)) throw new ApiError(400, 'BAD_REQUEST');
  if (input.size > limits[input.category as keyof typeof limits]) throw new ApiError(400, 'MEDIA_SIZE_LIMIT');
  if (!(extensions[input.mime_type] ?? []).includes(input.filename.split('.').at(-1)!.toLowerCase())
    || !(input.category === 'TRACK_AUDIO' ? input.mime_type.startsWith('audio/')
      : input.category === 'TAKEDOWN_DOCUMENT' ? input.mime_type === 'application/pdf' || input.mime_type.startsWith('image/')
      : input.mime_type.startsWith('image/'))) throw new ApiError(400, 'MEDIA_MIME_INVALID');
  return input;
}
export function dto(row: MediaRow): MediaDto { return mediaDto.strip().parse({ ...row, size: Number(row.size),
  created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString() }); }

export function assertMediaSignature(data: Uint8Array, mime: string): void {
  const b = Buffer.from(data);
  const ascii = (offset: number, value: string) => b.subarray(offset, offset + value.length).toString('ascii') === value;
  // ponytail: format signatures, not decoding/transcoding; add sandboxed decoder when structural guarantees required.
  const valid = mime === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.length >= 24 && ascii(12, 'IHDR')
    : mime === 'image/jpeg' ? b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255
    : mime === 'image/webp' ? b.length >= 20 && ascii(0, 'RIFF') && ascii(8, 'WEBP')
    : ['audio/wav', 'audio/x-wav'].includes(mime) ? b.length >= 44 && ascii(0, 'RIFF') && ascii(8, 'WAVE')
    : mime === 'audio/flac' ? b.length >= 42 && ascii(0, 'fLaC')
    : ['audio/aiff', 'audio/x-aiff'].includes(mime) ? b.length >= 26 && ascii(0, 'FORM') && (ascii(8, 'AIFF') || ascii(8, 'AIFC'))
    : mime === 'audio/mpeg' ? b.length >= 10 && (ascii(0, 'ID3') || (b[0] === 255 && ((b[1] ?? 0) & 0xe0) === 0xe0))
    : mime === 'application/pdf' ? b.length >= 8 && ascii(0, '%PDF-') : false;
  if (!valid) throw new ApiError(400, 'MEDIA_MIME_INVALID');
}

