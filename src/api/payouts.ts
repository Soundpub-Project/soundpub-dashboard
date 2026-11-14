import { apiRequest } from './client';

export interface BackendPayout {
  id: string; user_id: string; amount: string; currency: 'IDR';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'failed' | 'paid';
  bank_name: string; account_holder_name: string; proof_media_id: string | null; created_at: string; updated_at: string;
}
export interface PayoutEligibility {
  eligible: boolean; reasons: string[]; available: string | null; minimum: string; currency: 'IDR';
}
export interface PayoutRequest {
  amount: string; currency: 'IDR'; bank_name: string; account_number: string; account_holder_name: string;
}
export interface PicDestination {
  id: string; owner_id: string; currency: 'IDR'; bank_name: string;
  account_number: string; account_holder_name: string; verified: boolean;
}
export type DestinationInput = Pick<PicDestination, 'bank_name' | 'account_number' | 'account_holder_name'>;
export type ReadinessReview =
  | { action: 'verify_destination'; destination_id: string; evidence: string }
  | { action: 'approve_reconciliation'; evidence: string }
  | { action: 'revoke_destination'; destination_id: string; reason: string }
  | { action: 'revoke_reconciliation'; approval_id: string; reason: string };
export const payoutsApi = {
  destination: (signal?: AbortSignal) => apiRequest<{ destination: PicDestination | null }>('/api/v1/payouts/destination', { signal }),
  updateDestination: (body: DestinationInput) => apiRequest<{ destination: PicDestination }>('/api/v1/payouts/destination', { method: 'PUT', body }),
  reviewReadiness: (ownerId: string, body: ReadinessReview, idempotencyKey: string) => apiRequest<{ id: string; action: string }>(`/api/v1/admin/payouts/readiness/${encodeURIComponent(ownerId)}`, { method: 'POST', body, idempotencyKey }),
  list: (admin = false, offset = 0) => apiRequest<{ items: BackendPayout[] }>(`/api/v1/${admin ? 'admin/' : ''}payouts?limit=50&offset=${offset}`),
  eligibility: () => apiRequest<PayoutEligibility>('/api/v1/payouts/eligibility'),
  request: ({ idempotency_key, ...body }: PayoutRequest & { idempotency_key: string }) => apiRequest<BackendPayout>('/api/v1/payouts', { method: 'POST', body, idempotencyKey: idempotency_key }),
  transition: (id: string, status: 'approved' | 'rejected' | 'failed', idempotency_key: string) => apiRequest<BackendPayout>(`/api/v1/admin/payouts/${encodeURIComponent(id)}/transition`, { method: 'POST', body: { status }, idempotencyKey: idempotency_key }),
  settle: (id: string, body: { proof_media_id: string; evidence: string }, idempotency_key: string) => apiRequest<BackendPayout>(`/api/v1/admin/payouts/${encodeURIComponent(id)}/settle`, { method: 'POST', body, idempotencyKey: idempotency_key }),
  cancel: (id: string, idempotency_key: string) => apiRequest<BackendPayout>(`/api/v1/payouts/${encodeURIComponent(id)}/cancel`, { method: 'POST', idempotencyKey: idempotency_key }),
};
