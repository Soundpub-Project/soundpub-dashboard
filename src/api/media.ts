import { apiRequest } from './client';

export type MediaCategory = 'USER_AVATAR' | 'ARTIST_PROFILE_IMAGE' | 'LABEL_LOGO' | 'RELEASE_COVER' | 'TRACK_AUDIO' | 'TRACK_CLIP' | 'TAKEDOWN_DOCUMENT' | 'PAYOUT_PROOF' | 'OTHER';
export interface MediaBinding { category: MediaCategory; resource_type: 'user' | 'artist_profile' | 'label' | 'release' | 'track' | 'settings' | 'takedown' | 'payout'; resource_id: string; variant?: 'default' | 'light' | 'dark' }
export interface MediaObject extends MediaBinding { id: string; status: 'PENDING' | 'ACTIVE' | 'FAILED' | 'REPLACED' | 'DELETED'; mime_type: string; size: number; checksum: string }
export interface MultipartStatus { object: MediaObject; part_size: number; parts: number[]; completed: boolean; expires_at: string }
export const mediaApi = {
  request: (body: MediaBinding & { filename: string; mime_type: string; size: number; checksum: string; visibility: 'PRIVATE' }) => apiRequest<{ object: MediaObject; url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string }>('/api/v1/storage/uploads', { method: 'POST', body }),
  requestMultipart: (body: MediaBinding & { filename: string; mime_type: string; size: number; checksum: string; visibility: 'PRIVATE' }) => apiRequest<{ object: MediaObject; part_size: number; expires_at: string }>('/api/v1/storage/uploads/multipart', { method: 'POST', body }),
  multipartStatus: (id: string) => apiRequest<MultipartStatus>(`/api/v1/storage/uploads/${encodeURIComponent(id)}/multipart`),
  multipartPart: (id: string, partNumber: number) => apiRequest<{ url: string; size: number; expires_at: string }>(`/api/v1/storage/uploads/${encodeURIComponent(id)}/multipart/parts`, { method: 'POST', body: { part_number: partNumber } }),
  complete: (id: string) => apiRequest<MediaObject>(`/api/v1/storage/uploads/${encodeURIComponent(id)}/complete`, { method: 'POST', timeoutMs: 120000 }),
  abort: (id: string) => apiRequest(`/api/v1/storage/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  download: (id: string) => apiRequest<{ url: string; expires_at: string }>(`/api/v1/storage/objects/${encodeURIComponent(id)}/download`),
  remove: (id: string) => apiRequest(`/api/v1/storage/objects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
