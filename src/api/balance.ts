import { apiRequest } from './client';

export interface BackendBalance {
  owner_id: string; aggregate: boolean; account_count: number; currency: 'IDR';
  status: 'RECONCILED' | 'RECONCILIATION_REQUIRED'; available: string | null;
  reserved: string; settled: string; charged: string; refunded: string;
}
export const balanceApi = { get: (signal?: AbortSignal) => apiRequest<BackendBalance>('/api/v1/balance', { signal }) };
