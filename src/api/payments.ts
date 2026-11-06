import { apiRequest } from './client';

export interface BackendInvoice {
  id: string; business_type: 'release'; business_id: string; provider: 'mock';
  amount_minor: string; currency: 'IDR'; precision: 2; status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  payer_owner_id: string; financial_owner_id: string; artist_id: string;
  ownership_policy: 'LOGIN_ACCOUNT' | 'LABEL_CUSTOM_PIC';
  reconciliation_required: boolean; created_at: string; updated_at: string;
}
export interface PaymentStatusResult {
  invoice: BackendInvoice | null;
  reconciliation: { invoice_id: string; issues: string[]; reconciled: boolean } | null;
}
export const paymentsApi = {
  create: (release_id: string) => apiRequest<BackendInvoice>('/api/v1/payments/invoices', { method: 'POST', body: { release_id, idempotency_key: `release-invoice:${release_id}` } }),
  status: (releaseId: string, signal?: AbortSignal) => apiRequest<PaymentStatusResult>(`/api/v1/payments/releases/${encodeURIComponent(releaseId)}`, { signal }),
};
