import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const date = z.iso.date();
const dateTime = z.iso.datetime();
const version = z.number().int().min(1).max(2147483646);

export const copyrightApplicantType = z.enum(['personal', 'band_representative', 'company_label']);
export const copyrightRegistrationStatus = z.enum([
  'draft', 'awaiting_payment', 'paid_pending_review', 'in_review', 'revision_requested',
  'approved', 'rejected', 'contract_draft', 'contract_generated', 'stamping_pending',
  'stamped', 'contract_signed', 'active',
]);
export const copyrightPaymentStatus = z.enum(['pending', 'paid', 'expired', 'failed', 'cancelled', 'refunded']);
export const copyrightContractStatus = z.enum(['draft', 'generated', 'stamping_pending', 'stamped', 'signed', 'active', 'void']);
export const copyrightReleaseStatus = z.enum(['unreleased', 'released', 'unknown']);
export const copyrightFileType = z.enum([
  'ktp', 'npwp', 'power_of_attorney', 'audio_demo', 'lyrics_document', 'work_evidence',
  'contract_generated', 'contract_stamped', 'contract_signed',
]);

export const copyrightRegistrationCreateDraft = z.strictObject({
  legal_name: requiredText(200),
  email: z.email().max(320),
  phone: requiredText(50),
  applicant_type: copyrightApplicantType,
});

export const copyrightCowriterInput = z.strictObject({
  name: requiredText(200),
  ownership_percentage: z.number().finite().min(0).max(100),
});

export const copyrightWorkInput = z.strictObject({
  title: requiredText(300),
  alternate_title: optionalText(300),
  composer_name: requiredText(300),
  lyricist_name: optionalText(300),
  ownership_percentage: z.number().finite().min(0.01).max(100),
  is_collaboration: z.boolean(),
  cowriters: z.array(copyrightCowriterInput).max(100).default([]),
  release_status: copyrightReleaseStatus,
  release_date: date.nullable().optional(),
  isrc: z.string().trim().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/).nullable().optional(),
  upc: z.string().trim().regex(/^\d{12,14}$/).nullable().optional(),
  links: z.array(z.url().max(2_000)).max(20).default([]),
  lyrics: optionalText(100_000),
  notes: optionalText(10_000),
}).superRefine((value, context) => {
  if (value.release_status === 'released' && !value.release_date) {
    context.addIssue({ code: 'custom', path: ['release_date'], message: 'Released work requires release date' });
  }
  if (value.release_status !== 'released' && value.release_date) {
    context.addIssue({ code: 'custom', path: ['release_date'], message: 'Release date is only valid for released work' });
  }
  if (value.is_collaboration !== (value.cowriters.length > 0)) {
    context.addIssue({ code: 'custom', path: ['cowriters'], message: 'Collaboration and cowriters must agree' });
  }
  const total = value.ownership_percentage + value.cowriters.reduce((sum, item) => sum + item.ownership_percentage, 0);
  if (total > 100) context.addIssue({ code: 'custom', path: ['ownership_percentage'], message: 'Ownership exceeds 100 percent' });
});

export const copyrightRegistrationDraftReplace = z.strictObject({
  version,
  legal_name: requiredText(200),
  stage_name: optionalText(200),
  nik: z.string().trim().regex(/^\d{16}$/).nullable().optional(),
  email: z.email().max(320),
  phone: optionalText(50),
  address: requiredText(2_000),
  applicant_type: copyrightApplicantType,
  npwp: z.string().trim().regex(/^\d{15,16}$/).nullable().optional(),
  bank_name: requiredText(200),
  bank_account_number: z.string().trim().regex(/^\d{4,40}$/),
  bank_account_name: requiredText(200),
  works: z.array(copyrightWorkInput).min(1).max(500),
}).superRefine((value, context) => {
  const titles = new Set<string>();
  value.works.forEach((work, index) => {
    const title = work.title.toLocaleLowerCase('id-ID');
    if (titles.has(title)) context.addIssue({ code: 'custom', path: ['works', index, 'title'], message: 'Duplicate work title' });
    titles.add(title);
  });
});

export const copyrightRegistrationSubmit = z.strictObject({
  version,
  declaration_accepted: z.literal(true),
  declaration_version: z.literal('copyright-registration-terms-v1'),
});

export const copyrightRegistrationInvoiceRequest = z.strictObject({});
export const copyrightRegistrationPaymentCallback = z.strictObject({
  provider_invoice_id: requiredText(200),
  provider_external_id: requiredText(200).optional(),
  status: z.enum(['PAID', 'FAILED', 'EXPIRED', 'CANCELLED']),
  amount_minor: z.number().int().positive().max(9007199254740991),
  currency: z.literal('IDR'),
});
export const copyrightRegistrationInvoiceDto = z.strictObject({
  registration_id: z.uuid(), payment_id: z.uuid(), provider: z.enum(['mock-copyright-registration','xendit']),
  provider_invoice_id: z.string().nullable(), provider_invoice_url: z.url().nullable(), amount: z.string(), currency: z.literal('IDR'),
  payment_status: copyrightPaymentStatus,
});
export const copyrightRegistrationPaymentCallbackResult = z.strictObject({
  status: z.enum(['accepted', 'duplicate']),
});

export const copyrightRegistrationListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9]\d|100)$/).optional(),
  cursor: z.string().min(1).max(500).optional(),
  status: copyrightRegistrationStatus.optional(),
  applicant_type: copyrightApplicantType.optional(),
  payment_status: copyrightPaymentStatus.optional(),
  payment_review: z.literal('required').optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export const copyrightRegistrationReviewTransition = z.strictObject({
  version,
  status: z.enum(['in_review', 'revision_requested', 'approved', 'rejected']),
  note: optionalText(10_000),
  composer_code: z.string().trim().regex(/^[A-Z0-9_-]{1,100}$/).nullable().optional(),
}).superRefine((value, context) => {
  if (['revision_requested', 'rejected'].includes(value.status) && !value.note) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'Transition note required' });
  }
  if (value.status !== 'approved' && value.composer_code) {
    context.addIssue({ code: 'custom', path: ['composer_code'], message: 'Composer code is approval-only' });
  }
});

export const copyrightContractTransition = z.strictObject({
  version,
  status: z.enum(['generated', 'stamping_pending', 'stamped', 'signed', 'active', 'void']),
  note: optionalText(10_000),
  media_object_id: z.uuid().nullable().optional(),
  stamp_provider: optionalText(200),
}).superRefine((value, context) => {
  if (['generated', 'stamped', 'signed'].includes(value.status) && !value.media_object_id) {
    context.addIssue({ code: 'custom', path: ['media_object_id'], message: 'Contract artifact requires media object' });
  }
  if (value.status === 'void' && !value.note) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'Void reason required' });
  }
});

export const copyrightRegistrationFileDto = z.strictObject({
  id: z.uuid(), file_type: copyrightFileType, file_name: z.string(), mime_type: z.string(),
  file_size: z.number().int().nonnegative(), media_object_id: z.uuid(), uploaded_at: dateTime,
  download_reference: z.string(),
});
export const copyrightWorkDto = z.strictObject({
  id: z.uuid(), registration_id: z.uuid(), ...copyrightWorkInput.shape, created_at: dateTime, updated_at: dateTime,
});
export const copyrightPaymentDto = z.strictObject({
  id: z.uuid(), registration_id: z.uuid(), amount: z.string().regex(/^(0|[1-9]\d{0,15})\.\d{2}$/),
  currency: z.literal('IDR'), payment_status: copyrightPaymentStatus, provider: z.enum(['mock-copyright-registration','xendit']).nullable(), provider_invoice_id: z.string().nullable(),
  provider_invoice_url: z.url().nullable(), reconciliation_required: z.boolean(), paid_at: dateTime.nullable(), created_at: dateTime, updated_at: dateTime,
});
export const copyrightContractDto = z.strictObject({
  id: z.uuid(), registration_id: z.uuid(), contract_number: z.string().nullable(), status: copyrightContractStatus,
  template_version: z.string(), media_object_id: z.uuid().nullable(), signed_at: dateTime.nullable(),
  stamped_at: dateTime.nullable(), stamp_provider: z.string().nullable(), version,
  created_at: dateTime, updated_at: dateTime, download_reference: z.string().nullable(),
});
export const copyrightRegistrationSummaryDto = z.strictObject({
  id: z.uuid(), user_id: z.uuid(), legal_name: z.string(), email: z.email(), applicant_type: copyrightApplicantType,
  status: copyrightRegistrationStatus, composer_code: z.string().nullable(), contract_number: z.string().nullable(),
  submitted_at: dateTime.nullable(), reviewed_at: dateTime.nullable(), approved_at: dateTime.nullable(),
  rejected_at: dateTime.nullable(), version, created_at: dateTime, updated_at: dateTime,
});
export const copyrightRegistrationDetailDto = copyrightRegistrationSummaryDto.extend({
  stage_name: z.string().nullable(), nik: z.string().nullable(), phone: z.string(), address: z.string(),
  npwp: z.string().nullable(), bank_name: z.string().nullable(), bank_account_number: z.string().nullable(), bank_account_name: z.string().nullable(),
  revision_notes: z.string().nullable(), admin_notes: z.string().nullable(),
  works: z.array(copyrightWorkDto), files: z.array(copyrightRegistrationFileDto),
  payment: copyrightPaymentDto.nullable(), contract: copyrightContractDto.nullable(),
  allowed_actions: z.array(z.string()).default([]),
});
export const copyrightRegistrationListDto = z.strictObject({
  items: z.array(copyrightRegistrationSummaryDto), next_cursor: z.string().nullable().default(null),
});

export type CopyrightApplicantType = z.infer<typeof copyrightApplicantType>;
export type CopyrightRegistrationCreateDraft = z.infer<typeof copyrightRegistrationCreateDraft>;
export type CopyrightCowriterInput = z.infer<typeof copyrightCowriterInput>;
export type CopyrightWorkInput = z.infer<typeof copyrightWorkInput>;
export type CopyrightRegistrationDraftReplace = z.infer<typeof copyrightRegistrationDraftReplace>;
export type CopyrightRegistrationSubmit = z.infer<typeof copyrightRegistrationSubmit>;
export type CopyrightRegistrationInvoiceRequest = z.infer<typeof copyrightRegistrationInvoiceRequest>;
export type CopyrightRegistrationPaymentCallback = z.infer<typeof copyrightRegistrationPaymentCallback>;
export type CopyrightRegistrationListQuery = z.infer<typeof copyrightRegistrationListQuery>;
export type CopyrightRegistrationReviewTransition = z.infer<typeof copyrightRegistrationReviewTransition>;
export type CopyrightContractTransition = z.infer<typeof copyrightContractTransition>;
export type CopyrightRegistrationSummaryDto = z.infer<typeof copyrightRegistrationSummaryDto>;
export type CopyrightRegistrationDetailDto = z.infer<typeof copyrightRegistrationDetailDto>;
export type CopyrightRegistrationListDto = z.infer<typeof copyrightRegistrationListDto>;
