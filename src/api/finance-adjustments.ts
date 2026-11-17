import { apiRequest } from './client';

export interface FinanceAdjustmentOwner {
  id: string; email: string | null; full_name: string; roles: string[];
}
export interface FinanceAdjustment {
  id: string; owner_id: string; owner_name: string; amount_minor: string; currency: 'IDR'; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; requested_by: string; requester_name: string;
  requested_at: string; reviewed_by: string | null; reviewer_name: string | null; reviewed_at: string | null;
  decision_note: string | null; finance_event_id: string | null; version: number;
}
export interface FinanceAdjustmentPage {
  limit: number; offset: number; status?: FinanceAdjustment['status'];
}
export const financeAdjustmentsApi = {
  owners: (search: string, signal?: AbortSignal) => apiRequest<{ items: FinanceAdjustmentOwner[] }>(
    `/api/v1/admin/finance/adjustment-owners?search=${encodeURIComponent(search)}&limit=50`, { signal }),
  list: (status?: FinanceAdjustment['status'], signal?: AbortSignal) => apiRequest<{ items: FinanceAdjustment[] }>(
    `/api/v1/admin/finance/adjustments?limit=50${status ? `&status=${status}` : ''}`, { signal }),
  request: (body: { owner_id: string; amount: string; reason: string }, idempotencyKey: string) =>
    apiRequest<FinanceAdjustment>('/api/v1/admin/finance/adjustments', { method: 'POST', body, idempotencyKey }),
  review: (id: string, body: { version: number; decision: 'APPROVE' | 'REJECT'; note: string }, idempotencyKey: string) =>
    apiRequest<FinanceAdjustment>(`/api/v1/admin/finance/adjustments/${encodeURIComponent(id)}/review`,
      { method: 'POST', body, idempotencyKey }),
};
