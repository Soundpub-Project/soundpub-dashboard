import { apiRequest } from './client';

export type TakedownStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'NEED_DOCUMENT' | 'APPROVED' | 'SENT_TO_DSP' |
  'PROCESSING_DSP' | 'PARTIALLY_COMPLETED' | 'COMPLETED' | 'REJECTED' | 'CANCEL_REQUESTED' | 'CANCELLED';
export type TargetStatus = 'PENDING' | 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type TakedownDsp = 'Semua DSP' | 'Spotify' | 'Apple Music' | 'YouTube Music' | 'Meta' | 'TikTok' |
  'Deezer' | 'Amazon Music' | 'Tidal';
export interface TakedownRelease { id: string; title: string; artist_name: string; upc: string | null; label_id: string;
  artist_id: string | null; artist_user_id: string | null; created_by: string | null; status: string; created_at: string }
export interface TakedownTarget { id: string; dsp_name: Exclude<TakedownDsp, 'Semua DSP'>; status: TargetStatus;
  external_reference: string | null; submitted_at: string | null; completed_at: string | null;
  failure_reason: string | null; admin_note: string | null; version: number }
export interface TakedownRequest {
  id: string; request_code: string; requester_id: string; label_id: string; request_type: 'standard' | 'partial' | 'urgent';
  reason_category: string; reason_detail: string; other_reason: string | null; status: TakedownStatus; priority: 'normal' | 'urgent';
  contact_name: string; contact_position: string; contact_phone: string; contact_email: string; contact_address: string;
  declaration_version: string; declaration_checksum: string; declaration_accepted_at: string; reviewer_id: string | null;
  review_note: string | null; rejection_reason: string | null; submitted_at: string; reviewed_at: string | null;
  sent_to_dsp_at: string | null; completed_at: string | null; status_before_cancel: TakedownStatus | null; version: number;
  created_at: string; updated_at: string;
  items: { id: string; release_id: string; track_id: string | null; title_snapshot: string; artist_name_snapshot: string;
    upc_snapshot: string | null; isrc_snapshot: string | null }[];
  targets: TakedownTarget[];
  history: { id: string; old_status: TakedownStatus | null; new_status: TakedownStatus; changed_by: string;
    note: string | null; created_at: string }[];
  documents: { id: string; media_object_id: string; file_name: string; document_type: string | null; mime_type: string;
    file_size: number; created_at: string; download_reference: string }[];
}
export interface CursorPage<T> { items: T[]; nextCursor: string | null }
export interface CreateTakedown {
  release_id: string; request_type: 'standard' | 'partial' | 'urgent'; track_ids?: string[];
  reason_category: string; reason_detail: string; other_reason?: string | null; contact_name: string;
  contact_position: string; contact_phone: string; contact_email: string; contact_address: string;
  declaration_accepted: true; declaration_version: 'takedown-tor-v1'; targets: TakedownDsp[];
}
const idempotencyKey = () => crypto.randomUUID();
export const takedownsApi = {
  list: (cursor?: string) => apiRequest<CursorPage<TakedownRequest>>(`/api/v1/takedowns?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  detail: (id: string) => apiRequest<TakedownRequest>(`/api/v1/takedowns/${encodeURIComponent(id)}`),
  eligibleReleases: () => apiRequest<CursorPage<TakedownRelease>>('/api/v1/takedowns/eligible-releases?limit=100'),
  create: (body: CreateTakedown) => apiRequest<TakedownRequest>('/api/v1/takedowns', { method: 'POST', body, idempotencyKey: idempotencyKey() }),
  transition: (id: string, body: { version: number; status: 'UNDER_REVIEW' | 'NEED_DOCUMENT' | 'APPROVED' | 'SENT_TO_DSP' | 'REJECTED' | 'CANCELLED'; note?: string | null }) =>
    apiRequest<TakedownRequest>(`/api/v1/takedowns/${encodeURIComponent(id)}/transitions`, { method: 'POST', body, idempotencyKey: idempotencyKey() }),
  cancel: (id: string, body: { version: number; reason: string }) => apiRequest<TakedownRequest>(`/api/v1/takedowns/${encodeURIComponent(id)}/cancellation`, { method: 'POST', body, idempotencyKey: idempotencyKey() }),
  transitionTarget: (id: string, targetId: string, body: { version: number; status: 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'; external_reference?: string | null; failure_reason?: string | null; admin_note?: string | null }) =>
    apiRequest<TakedownRequest>(`/api/v1/takedowns/${encodeURIComponent(id)}/targets/${encodeURIComponent(targetId)}/transitions`, { method: 'POST', body, idempotencyKey: idempotencyKey() }),
};
