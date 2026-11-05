import { apiRequest } from './client';

export type CopyrightApplicantType = 'personal' | 'band_representative' | 'company_label';
export type CopyrightDocumentType = 'IDENTITY' | 'TAX' | 'POWER_OF_ATTORNEY' | 'AUDIO_DEMO' | 'LYRICS' | 'WORK_EVIDENCE'
  | 'CONTRACT_GENERATED' | 'CONTRACT_STAMPED' | 'CONTRACT_SIGNED';
export type CopyrightRegistrationStatus = 'draft' | 'awaiting_payment' | 'paid_pending_review' | 'in_review'
  | 'revision_requested' | 'approved' | 'rejected' | 'contract_draft' | 'contract_generated'
  | 'stamping_pending' | 'stamped' | 'contract_signed' | 'active';
export interface CopyrightWorkInput {
  title: string; alternate_title?: string | null; composer_name: string; lyricist_name?: string | null;
  ownership_percentage: number; is_collaboration: boolean;
  cowriters: { name: string; ownership_percentage: number }[];
  release_status: 'unreleased' | 'released' | 'unknown'; release_date?: string | null;
  isrc?: string | null; upc?: string | null; links: string[]; lyrics?: string | null; notes?: string | null;
}
export interface CopyrightFile {
  id: string; file_type: string; file_name: string; mime_type: string; file_size: number;
  media_object_id: string; uploaded_at: string; download_reference: string;
}
export interface CopyrightRegistration {
  id: string; user_id: string; legal_name: string; stage_name: string | null; nik: string | null;
  email: string; phone: string; address: string; applicant_type: CopyrightApplicantType; npwp: string | null;
  bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null;
  status: string; composer_code: string | null; contract_number: string | null;
  revision_notes: string | null; admin_notes: string | null; version: number;
  submitted_at: string | null; reviewed_at: string | null; approved_at: string | null; rejected_at: string | null;
  works: (CopyrightWorkInput & { id: string })[]; files: CopyrightFile[];
  payment: null | { amount: string; currency: 'IDR'; payment_status: string; provider_invoice_url: string | null; paid_at: string | null };
  contract: null | { contract_number: string | null; status: string; version: number;
    signed_at: string | null; download_reference: string | null };
  allowed_actions: string[];
}
export interface CopyrightDraft {
  version: number; legal_name: string; stage_name?: string | null; nik?: string | null; email: string; phone?: string | null;
  address: string; applicant_type: CopyrightApplicantType; npwp?: string | null; bank_name: string;
  bank_account_number: string; bank_account_name: string; works: CopyrightWorkInput[];
}
export interface CopyrightRegistrationListQuery {
  limit?: number; cursor?: string; status?: CopyrightRegistrationStatus; applicant_type?: CopyrightApplicantType;
  payment_status?: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled' | 'refunded'; search?: string;
}
export type CopyrightRegistrationSummary = Pick<CopyrightRegistration, 'id' | 'user_id' | 'legal_name' | 'email'
  | 'applicant_type' | 'status' | 'version' | 'submitted_at' | 'reviewed_at' | 'approved_at' | 'rejected_at'> & {
    composer_code: string | null; contract_number: string | null; created_at: string; updated_at: string;
  };
export interface CopyrightRegistrationPage { items: CopyrightRegistrationSummary[]; next_cursor: string | null }
export interface CopyrightInvoice {
  registration_id: string; payment_id: string; provider: 'mock-copyright-registration'; provider_invoice_id: string;
  provider_invoice_url: string; amount: string; currency: 'IDR'; payment_status: string;
}
const key = (operation: string) => `${operation}:${crypto.randomUUID()}`;
export const copyrightRegistrationsApi = {
  current: (signal?: AbortSignal) => apiRequest<CopyrightRegistration | null>('/api/v1/copyright/registrations/current', { signal }),
  create: (body: { legal_name: string; email: string; phone: string; applicant_type: CopyrightApplicantType }) =>
    apiRequest<CopyrightRegistration>('/api/v1/copyright/registrations', { method: 'POST', body, idempotencyKey: key('copyright-create') }),
  detail: (id: string) => apiRequest<CopyrightRegistration>(`/api/v1/copyright/registrations/${encodeURIComponent(id)}`),
  list: (query: CopyrightRegistrationListQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(name, String(value));
    return apiRequest<CopyrightRegistrationPage>(`/api/v1/admin/copyright/registrations${params.size ? `?${params}` : ''}`, { signal });
  },
  saveDraft: (id: string, body: CopyrightDraft) => apiRequest<CopyrightRegistration>(
    `/api/v1/copyright/registrations/${encodeURIComponent(id)}/draft`, { method: 'PUT', body, idempotencyKey: key('copyright-draft') }),
  submit: (id: string, version: number) => apiRequest<CopyrightRegistration>(
    `/api/v1/copyright/registrations/${encodeURIComponent(id)}/submit`, { method: 'POST',
      body: { version, declaration_accepted: true, declaration_version: 'copyright-registration-terms-v1' },
      idempotencyKey: key('copyright-submit') }),
  review: (id: string, body: { version: number; status: 'in_review' | 'revision_requested' | 'approved' | 'rejected';
    note?: string | null; composer_code?: string | null }) => apiRequest<CopyrightRegistration>(
    `/api/v1/admin/copyright/registrations/${encodeURIComponent(id)}/review`,
    { method: 'POST', body, idempotencyKey: key('copyright-review') }),
  transitionContract: (id: string, body: { version: number;
    status: 'generated' | 'stamping_pending' | 'stamped' | 'signed' | 'active' | 'void';
    note?: string | null; media_object_id?: string | null; stamp_provider?: string | null }) => apiRequest<CopyrightRegistration>(
    `/api/v1/admin/copyright/registrations/${encodeURIComponent(id)}/contract/transitions`,
    { method: 'POST', body, idempotencyKey: key('copyright-contract') }),
  downloadEvidence: (mediaIdOrReference: string) => apiRequest<{ url: string; expires_at: string }>(
    `/api/v1/storage/objects/${encodeURIComponent(mediaIdOrReference)}/download`),
  requestInvoice: (id: string) => apiRequest<CopyrightInvoice>(
    `/api/v1/copyright/registrations/${encodeURIComponent(id)}/payment/invoice`,
    { method: 'POST', body: {}, idempotencyKey: key('copyright-invoice') }),
  uploadEvidence: async (registrationId: string, file: File, documentType: CopyrightDocumentType) => {
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map(value => value.toString(16).padStart(2, '0')).join('');
    const intent = await apiRequest<{ object: { id: string }; url: string; method: 'PUT'; headers: Record<string,string> }>(
      '/api/v1/storage/uploads', { method: 'POST', body: { category: 'COPYRIGHT_REGISTRATION_DOCUMENT',
        resource_type: 'copyright_registration', resource_id: registrationId, document_type: documentType,
        filename: file.name, mime_type: file.type, size: file.size, checksum, visibility: 'PRIVATE' } });
    const uploaded = await fetch(intent.url, { method: intent.method, headers: intent.headers, body: file });
    if (!uploaded.ok) {
      await apiRequest(`/api/v1/storage/uploads/${encodeURIComponent(intent.object.id)}`, { method: 'DELETE' }).catch(() => undefined);
      throw new Error('Upload dokumen gagal. Silakan coba lagi.');
    }
    return apiRequest(`/api/v1/storage/uploads/${encodeURIComponent(intent.object.id)}/complete`, { method: 'POST', timeoutMs: 120000 });
  },
};
