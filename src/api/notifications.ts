import { apiRequest } from './client';

export interface BackendNotification {
  id: string;
  recipient_user_id: string | null;
  type: string;
  title: string;
  body: string;
  metadata_safe: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  is_global?: boolean;
  kind: 'USER_NOTIFICATION' | 'GLOBAL_ANNOUNCEMENT';
}

export const notificationsApi = {
  list: (cursor?: string, signal?: AbortSignal) => apiRequest<{ items: BackendNotification[]; nextCursor: string | null }>(`/api/v1/notifications?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
  unread: (signal?: AbortSignal) => apiRequest<{ count: number }>('/api/v1/notifications/unread-count', { signal }),
  read: (id: string) => apiRequest(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  readAll: () => apiRequest('/api/v1/notifications/read-all', { method: 'POST' }),
  unreadOne: (id: string) => apiRequest(`/api/v1/notifications/${encodeURIComponent(id)}/unread`, { method: 'POST' }),
  adminList: () => apiRequest<{ items: BackendNotification[]; nextCursor: string | null }>('/api/v1/admin/notifications?limit=200'),
  update: (id: string, body: { title: string; body: string }) => apiRequest(`/api/v1/admin/notifications/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  remove: (id: string) => apiRequest(`/api/v1/admin/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  announce: (body: { title: string; body: string }) => apiRequest('/api/v1/admin/announcements', { method: 'POST', body }),
};
