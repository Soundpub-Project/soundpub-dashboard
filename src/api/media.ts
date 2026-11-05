import { apiRequest } from './client';

export type MediaCategory = 'USER_AVATAR' | 'LABEL_LOGO' | 'RELEASE_COVER' | 'TRACK_AUDIO' | 'TAKEDOWN_DOCUMENT' | 'OTHER';
export interface MediaBinding { category: MediaCategory; resource_type: 'user' | 'label' | 'release' | 'track' | 'settings' | 'takedown'; resource_id: string; variant?: 'default' | 'light' | 'dark' }
export interface MediaObject extends MediaBinding { id: string; status: 'PENDING' | 'ACTIVE' | 'FAILED' | 'REPLACED' | 'DELETED'; mime_type: string; size: number; checksum: string }
export const mediaApi = {
  request: (body: MediaBinding & { filename: string; mime_type: string; size: number; checksum: string; visibility: 'PRIVATE' }) => apiRequest<{ object: MediaObject; url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string }>('/api/v1/storage/uploads', { method: 'POST', body }),
  complete: (id: string) => apiRequest<MediaObject>(`/api/v1/storage/uploads/${encodeURIComponent(id)}/complete`, { method: 'POST', timeoutMs: 120000 }),
  abort: (id: string) => apiRequest(`/api/v1/storage/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  download: (id: string) => apiRequest<{ url: string; expires_at: string }>(`/api/v1/storage/objects/${encodeURIComponent(id)}/download`),
  remove: (id: string) => apiRequest(`/api/v1/storage/objects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
