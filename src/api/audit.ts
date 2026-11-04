import { apiRequest } from './client';

export interface AuditEntry {
  id: string; actor_user_id: string | null; action: string; resource_type: string; resource_id: string | null; created_at: string;
}
export interface AuditFilter { actor?: string; action?: string; resource?: string; resource_id?: string; from?: string; to?: string; limit?: number; offset?: number }
export const auditApi = {
  list: (filter: AuditFilter = {}, signal?: AbortSignal) => apiRequest<{ items: AuditEntry[]; nextOffset: number | null }>(`/api/v1/admin/audit?${new URLSearchParams(Object.entries(filter).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]))}`, { signal }),
  detail: (id: string) => apiRequest<AuditEntry>(`/api/v1/admin/audit/${encodeURIComponent(id)}`),
};
