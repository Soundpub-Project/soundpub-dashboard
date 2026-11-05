import { z } from 'zod';

export const takedownRequestType = z.enum(['standard', 'partial', 'urgent']);
export const takedownStatus = z.enum([
  'SUBMITTED', 'UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED', 'SENT_TO_DSP',
  'PROCESSING_DSP', 'PARTIALLY_COMPLETED', 'COMPLETED', 'REJECTED',
  'CANCEL_REQUESTED', 'CANCELLED',
]);
export const takedownTargetStatus = z.enum(['PENDING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED']);
export const takedownDsp = z.enum([
  'Spotify', 'Apple Music', 'YouTube Music', 'Meta', 'TikTok',
  'Deezer', 'Amazon Music', 'Tidal',
]);
export const takedownDspSelection = z.union([takedownDsp, z.literal('Semua DSP')]);
export const takedownReason = z.enum([
  'Permintaan pemilik karya', 'Kesalahan metadata', 'Rilis duplikat', 'Pindah distributor',
  'Hak distribusi berakhir', 'Sengketa hak cipta', 'Pelanggaran copyright',
  'Streaming manipulation atau fraud', 'Unauthorized upload', 'Pelanggaran kebijakan DSP',
  'Perintah hukum', 'Lainnya',
]);

const requiredText = (max: number) => z.string().trim().min(1).max(max);
export const takedownCreate = z.strictObject({
  release_id: z.uuid(),
  request_type: takedownRequestType.default('standard'),
  track_ids: z.array(z.uuid()).min(1).max(500).optional(),
  reason_category: takedownReason,
  reason_detail: requiredText(10_000),
  other_reason: z.string().trim().max(2_000).nullable().optional(),
  contact_name: requiredText(200),
  contact_position: requiredText(200),
  contact_phone: requiredText(50),
  contact_email: z.email().max(320),
  contact_address: requiredText(2_000),
  declaration_accepted: z.literal(true),
  declaration_version: z.literal('takedown-tor-v1'),
  targets: z.array(takedownDspSelection).min(1).max(8),
}).superRefine((value, context) => {
  if (new Set(value.targets).size !== value.targets.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Duplicate target' });
  }
  if (value.targets.includes('Semua DSP') && value.targets.length !== 1) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Semua DSP must be exclusive' });
  }
  if (value.request_type === 'partial' && !value.track_ids?.length) {
    context.addIssue({ code: 'custom', path: ['track_ids'], message: 'Partial request requires tracks' });
  }
  if (value.request_type !== 'partial' && value.track_ids?.length) {
    context.addIssue({ code: 'custom', path: ['track_ids'], message: 'Track scope is partial-only' });
  }
  if (value.track_ids && new Set(value.track_ids).size !== value.track_ids.length) {
    context.addIssue({ code: 'custom', path: ['track_ids'], message: 'Duplicate track' });
  }
  const otherWords = value.other_reason?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  if (value.reason_category === 'Lainnya' && otherWords < 5) {
    context.addIssue({ code: 'custom', path: ['other_reason'], message: 'Other reason requires five words' });
  }
  if (value.reason_category !== 'Lainnya' && value.other_reason) {
    context.addIssue({ code: 'custom', path: ['other_reason'], message: 'Other reason is not applicable' });
  }
});

export const takedownListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(),
  status: takedownStatus.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export const takedownEligibleReleaseQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(300).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export const takedownTransition = z.strictObject({
  version: z.number().int().min(1), status: z.enum(['UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED', 'SENT_TO_DSP', 'REJECTED', 'CANCELLED']),
  note: z.string().trim().max(10_000).nullable().optional(),
}).superRefine((value, context) => {
  if (['NEED_DOCUMENT', 'REJECTED'].includes(value.status) && !value.note) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'Transition note required' });
  }
});
export const takedownCancellation = z.strictObject({
  version: z.number().int().min(1), reason: requiredText(2_000),
});
export const takedownTargetTransition = z.strictObject({
  version: z.number().int().min(1), status: z.enum(['SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED']),
  external_reference: z.string().trim().min(1).max(1_000).nullable().optional(),
  failure_reason: z.string().trim().min(1).max(10_000).nullable().optional(),
  admin_note: z.string().trim().max(10_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === 'SUBMITTED' && !value.external_reference) {
    context.addIssue({ code: 'custom', path: ['external_reference'], message: 'External reference required' });
  }
  if (value.status === 'REJECTED' && !value.failure_reason) {
    context.addIssue({ code: 'custom', path: ['failure_reason'], message: 'Failure reason required' });
  }
});

export const takedownItemDto = z.strictObject({
  id: z.uuid(), release_id: z.uuid(), track_id: z.uuid().nullable(), title_snapshot: z.string(),
  artist_name_snapshot: z.string(), upc_snapshot: z.string().nullable(), isrc_snapshot: z.string().nullable(),
});
export const takedownTargetDto = z.strictObject({
  id: z.uuid(), dsp_name: takedownDsp, status: takedownTargetStatus,
  external_reference: z.string().nullable(), submitted_at: z.string().nullable(), completed_at: z.string().nullable(),
  failure_reason: z.string().nullable(), admin_note: z.string().nullable(), version: z.number().int().min(1),
});
export const takedownHistoryDto = z.strictObject({
  id: z.uuid(), old_status: takedownStatus.nullable(), new_status: takedownStatus,
  changed_by: z.uuid(), note: z.string().nullable(), created_at: z.string(),
});
export const takedownDto = z.strictObject({
  id: z.uuid(), request_code: z.string(), requester_id: z.uuid(), label_id: z.uuid(), request_type: takedownRequestType,
  reason_category: z.string(), reason_detail: z.string(), other_reason: z.string().nullable(),
  status: takedownStatus, priority: z.enum(['normal', 'urgent']), contact_name: z.string(),
  contact_position: z.string(), contact_phone: z.string(), contact_email: z.string(), contact_address: z.string(),
  declaration_version: z.string(), declaration_checksum: z.string(), declaration_accepted_at: z.string(),
  reviewer_id: z.uuid().nullable(), review_note: z.string().nullable(),
  rejection_reason: z.string().nullable(), submitted_at: z.string(), reviewed_at: z.string().nullable(),
  sent_to_dsp_at: z.string().nullable(), completed_at: z.string().nullable(), status_before_cancel: takedownStatus.nullable(),
  version: z.number().int().min(1),
  created_at: z.string(), updated_at: z.string(), items: z.array(takedownItemDto),
  targets: z.array(takedownTargetDto), history: z.array(takedownHistoryDto),
});
export const takedownEligibleReleaseDto = z.strictObject({
  id: z.uuid(), title: z.string(), artist_name: z.string(), upc: z.string().nullable(),
  label_id: z.uuid(), artist_id: z.uuid().nullable(), artist_user_id: z.uuid().nullable(),
  created_by: z.uuid().nullable(), status: z.string(), created_at: z.string(),
});

export type TakedownCreate = z.infer<typeof takedownCreate>;
export type TakedownListQuery = z.infer<typeof takedownListQuery>;
export type TakedownEligibleReleaseQuery = z.infer<typeof takedownEligibleReleaseQuery>;
export type TakedownTransition = z.infer<typeof takedownTransition>;
export type TakedownCancellation = z.infer<typeof takedownCancellation>;
export type TakedownTargetTransition = z.infer<typeof takedownTargetTransition>;
