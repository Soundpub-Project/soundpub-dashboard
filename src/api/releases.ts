import { apiRequest } from './client';
export interface BackendRelease {
  id: string; artist_id: string | null; label_id: string | null; label_name: string | null; artist_user_id: string | null; created_by: string | null;
  title: string; artist_name: string; release_type: string | null; genre: string | null;
  release_date: string | null; cover_url: string | null; upc: string | null;
  distribution_service: 'standard' | 'custom_label'; custom_label_name: string | null; custom_record_name: string | null;
  status: 'draft' | 'pending' | 'pending_paid' | 'processing' | 'active' | 'rejected' | 'revision_submitted' | 'inactive';
  rejection_reason: string | null; archived_at: string | null; version: number; created_at: string; updated_at: string;
}
export interface CursorPage<T> { items: T[]; nextCursor: string | null }
export type ReleaseMetadata = { title: string; artist_name: string; release_type: 'single' | 'ep' | 'album' | 'compilation'; genre?: string | null; release_date?: string | null; distribution_service?: 'standard' | 'custom_label'; custom_label_name?: string | null; custom_record_name?: string | null };
export type ReleaseArtistIdentity = { artist_id: string; artist_user_id?: never } | { artist_user_id: string; artist_id?: never };
export type AggregateTrack = { id?: string; version?: number; title: string; artist_name: string; lyrics?: string | null };
export type AggregateResult = { release: BackendRelease; tracks: import('./tracks').BackendTrack[] };
export type ReleaseActivation = { version: number; upc: string; tracks: { id: string; version: number; isrc: string }[] };
export interface SubmissionReadiness {
  release_id: string; version: number; ready: boolean;
  blockers: { code: string; owner: 'PHASE3C' | 'PHASE3D_STORAGE' | 'PHASE3E_PAYMENT' | 'LATER_PROVIDER' }[];
}
export const releasesApi = {
  customLabelEligibility: () => apiRequest<{ eligible: boolean }>('/api/v1/releases/custom-label-eligibility'),
  create: (body: ReleaseMetadata & ReleaseArtistIdentity & { status: 'draft' }) => apiRequest<BackendRelease>('/api/v1/releases', { method: 'POST', body }),
  createAggregate: (body: ReleaseMetadata & ReleaseArtistIdentity & { status: 'draft'; tracks: AggregateTrack[] }) => apiRequest<AggregateResult>('/api/v1/releases/aggregate', { method: 'POST', body }),
  updateAggregate: (id: string, body: Partial<ReleaseMetadata> & { version: number; tracks: AggregateTrack[] }) => apiRequest<AggregateResult>(`/api/v1/releases/${encodeURIComponent(id)}/aggregate`, { method: 'PATCH', body }),
  readiness: (id: string) => apiRequest<SubmissionReadiness>(`/api/v1/releases/${encodeURIComponent(id)}/submission-readiness`),
  submit: (id: string, body: { version: number }) => apiRequest<BackendRelease>(`/api/v1/releases/${encodeURIComponent(id)}/submit`, { method: 'POST', body }),
  update: (id: string, body: Partial<ReleaseMetadata> & { version: number; status?: string; rejection_reason?: string; archived_at?: string | null }) => apiRequest<BackendRelease>(`/api/v1/releases/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  activate: (id: string, body: ReleaseActivation) => apiRequest<BackendRelease>(`/api/v1/admin/releases/${encodeURIComponent(id)}/activate`, { method: 'POST', body }),
  list: (cursor?: string) => apiRequest<CursorPage<BackendRelease>>(`/api/v1/releases?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  detail: (id: string) => apiRequest<BackendRelease>(`/api/v1/releases/${encodeURIComponent(id)}`),
};
