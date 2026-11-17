import { apiRequest } from './client';

export interface BackendInvoice {
  id: string; business_type: 'release'; business_id: string; provider: 'mock' | 'xendit'; provider_invoice_id: string | null; provider_invoice_url?: string | null;
  amount_minor: string; currency: 'IDR'; precision: 2; status: 'CREATING' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  payer_owner_id: string; financial_owner_id: string; artist_id: string;
  ownership_policy: 'LOGIN_ACCOUNT' | 'LABEL_CUSTOM_PIC';
  reconciliation_required: boolean; created_at: string; updated_at: string;
}
export interface PaymentStatusResult {
  invoice: BackendInvoice | null;
  reconciliation: { invoice_id: string; issues: string[]; reconciled: boolean } | null;
}
export interface AdminPaymentInvoice {
  id: string;
  release_id: string;
  user_id: string;
  amount_minor: string;
  currency: string;
  status: BackendInvoice['status'];
  provider_invoice_id: string;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  invoice_number: string | null;
  release_title: string;
  release_artist: string;
  user_name: string;
  user_email: string | null;
  track_count: number;
  price_per_track: string;
}
export interface AdminPaymentInvoicesResult {
  invoices: AdminPaymentInvoice[];
  total: number;
  limit: number;
  offset: number;
}
export const paymentsApi = {
  create: (release_id: string) => apiRequest<BackendInvoice>('/api/v1/payments/invoices', { method: 'POST', body: { release_id, idempotency_key: `release-invoice:${release_id}` } }),
  status: (releaseId: string, signal?: AbortSignal) => apiRequest<PaymentStatusResult>(`/api/v1/payments/releases/${encodeURIComponent(releaseId)}`, { signal }),
  adminInvoices: (status = 'all', offset = 0, signal?: AbortSignal) => apiRequest<AdminPaymentInvoicesResult>(`/api/v1/admin/payments/invoices?status=${encodeURIComponent(status)}&limit=100&offset=${offset}`, { signal }),
  downloadInvoice: (id: string) => apiRequest<{ invoice_number: string; url: string }>(`/api/v1/admin/payments/invoices/${encodeURIComponent(id)}/download`),
};
