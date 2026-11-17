import { z } from 'zod';
import { ApiError } from '../api/types.js';

export const categories = ['USER_AVATAR', 'ARTIST_PROFILE_IMAGE', 'LABEL_LOGO', 'RELEASE_COVER', 'TRACK_AUDIO', 'TRACK_CLIP', 'COPYRIGHT_DOCUMENT',
  'COPYRIGHT_REGISTRATION_DOCUMENT', 'TAKEDOWN_DOCUMENT', 'PAYOUT_PROOF', 'OTHER'] as const;
export const uploadCategories = ['USER_AVATAR', 'ARTIST_PROFILE_IMAGE', 'LABEL_LOGO', 'RELEASE_COVER', 'TRACK_AUDIO', 'TRACK_CLIP',
  'COPYRIGHT_REGISTRATION_DOCUMENT', 'TAKEDOWN_DOCUMENT', 'PAYOUT_PROOF', 'OTHER'] as const;
export const SETTINGS_MEDIA_RESOURCE_ID = '00000000-0000-4000-8000-0000000003d0';
export const copyrightDocumentType = z.enum(['IDENTITY','TAX','POWER_OF_ATTORNEY','AUDIO_DEMO','LYRICS','WORK_EVIDENCE',
  'CONTRACT_GENERATED','CONTRACT_STAMPED','CONTRACT_SIGNED','OTHER']);
export const uploadInput = z.strictObject({
  category: z.enum(uploadCategories), resource_type: z.enum(['user', 'artist_profile', 'label', 'release', 'track', 'settings', 'takedown', 'copyright_registration', 'payout']),
  resource_id: z.uuid(), mime_type: z.string().max(100), size: z.number().int().min(1),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).transform(v => v.toLowerCase()),
  filename: z.string().min(1).max(255).regex(/^[^/\\]+$/)
    .refine(value => [...value].every(character => character.charCodeAt(0) >= 32)),
  variant: z.enum(['default', 'light', 'dark']).default('default'),
  document_type: copyrightDocumentType.optional(),
  visibility: z.literal('PRIVATE').default('PRIVATE'),
});
export type UploadInput = z.infer<typeof uploadInput>;
export const mediaDto = z.strictObject({
  id: z.uuid(), category: z.enum(categories), resource_type: z.enum(['user', 'artist_profile', 'label', 'release', 'track', 'settings', 'takedown', 'copyright_registration', 'payout']), resource_id: z.uuid(),
  variant: z.enum(['default', 'light', 'dark']), visibility: z.literal('PRIVATE'),
  mime_type: z.string(), size: z.number(), checksum: z.string(), document_type: copyrightDocumentType.nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'FAILED', 'REPLACED', 'DELETED']),
  created_at: z.string(), updated_at: z.string(),
});
export type MediaDto = z.infer<typeof mediaDto>;
export interface MediaRow extends MediaDto {
  owner_user_id: string; bucket: string; object_key: string; expires_at: Date;
  release_id: string | null; track_id: string | null; profile_id: string | null; takedown_request_id: string | null;
  copyright_registration_id: string | null;
  upload_method: 'PUT' | 'MULTIPART'; multipart_upload_id: string | null;
  copyright_document_type: z.infer<typeof copyrightDocumentType> | null;
  original_filename: string | null;
}
export const MULTIPART_THRESHOLD_BYTES = 24 * 1024 ** 2;
export const MULTIPART_PART_SIZE_BYTES = 6 * 1024 ** 2;
export const limits = { USER_AVATAR: 5 * 1024 ** 2, ARTIST_PROFILE_IMAGE: 5 * 1024 ** 2, LABEL_LOGO: 1024 ** 2,
  RELEASE_COVER: 5 * 1024 ** 2, TRACK_AUDIO: 500 * 1024 ** 2, TRACK_CLIP: 20 * 1024 ** 2, COPYRIGHT_REGISTRATION_DOCUMENT: 25 * 1024 ** 2,
  TAKEDOWN_DOCUMENT: 10 * 1024 ** 2, PAYOUT_PROOF: 10 * 1024 ** 2,
  OTHER: 5 * 1024 ** 2 } as const;
const extensions: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'],
  'audio/wav': ['wav'], 'audio/x-wav': ['wav'], 'audio/flac': ['flac'],
  'audio/aiff': ['aiff', 'aif'], 'audio/x-aiff': ['aiff', 'aif'], 'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a'], 'audio/ogg': ['ogg'],
  'application/pdf': ['pdf'],
};
export function validateUpload(value: unknown): UploadInput {
  const parsed = uploadInput.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
  const input = parsed.data;
  const type = { USER_AVATAR: 'user', ARTIST_PROFILE_IMAGE: 'artist_profile', LABEL_LOGO: 'label', RELEASE_COVER: 'release', TRACK_AUDIO: 'track', TRACK_CLIP: 'track',
    COPYRIGHT_REGISTRATION_DOCUMENT: 'copyright_registration', TAKEDOWN_DOCUMENT: 'takedown', PAYOUT_PROOF: 'payout',
    OTHER: 'settings' }[input.category as keyof typeof limits];
  if (!type) throw new ApiError(400, 'BAD_REQUEST');
  if (input.resource_type !== type || (!['LABEL_LOGO', 'OTHER'].includes(input.category) && input.variant !== 'default')
    || (input.category === 'OTHER' && input.resource_id !== SETTINGS_MEDIA_RESOURCE_ID)) throw new ApiError(400, 'BAD_REQUEST');
  if ((input.category === 'COPYRIGHT_REGISTRATION_DOCUMENT') !== Boolean(input.document_type)) throw new ApiError(400, 'BAD_REQUEST');
  if (input.size > limits[input.category as keyof typeof limits]) throw new ApiError(400, 'MEDIA_SIZE_LIMIT');
  if (!(extensions[input.mime_type] ?? []).includes(input.filename.split('.').at(-1)!.toLowerCase())
    || !(input.category === 'TRACK_AUDIO' ? input.mime_type.startsWith('audio/')
      : input.category === 'TRACK_CLIP' ? ['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav'].includes(input.mime_type)
      : ['TAKEDOWN_DOCUMENT', 'COPYRIGHT_REGISTRATION_DOCUMENT', 'PAYOUT_PROOF'].includes(input.category)
        ? input.mime_type === 'application/pdf' || input.mime_type.startsWith('image/') || input.mime_type.startsWith('audio/')
      : input.mime_type.startsWith('image/'))) throw new ApiError(400, 'MEDIA_MIME_INVALID');
  return input;
}
export function dto(row: MediaRow): MediaDto { return mediaDto.strip().parse({ ...row, size: Number(row.size),
  document_type: row.copyright_document_type ?? null,
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
    : mime === 'audio/mp4' ? b.length >= 12 && ascii(4, 'ftyp')
    : mime === 'audio/ogg' ? b.length >= 4 && ascii(0, 'OggS')
    : mime === 'application/pdf' ? b.length >= 8 && ascii(0, '%PDF-') : false;
  if (!valid) throw new ApiError(400, 'MEDIA_MIME_INVALID');
}

