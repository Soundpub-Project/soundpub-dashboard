import { apiRequest } from './client';

export interface RoyaltySummary {
  beneficiary_id: string; currency: 'IDR'; gross_earnings: string; corrections: string;
  net_earnings: string; status: 'UNRECONCILED'; available_balance: null;
}
export interface RoyaltyImport {
  source: string; period: string; currency: 'IDR'; filename: string;
  rows: { source_row_id: string; beneficiary_id?: string; artist_id?: string; release_id: string; track_id: string;
    platform?: string; gross_amount: string; deduction_amount: string; net_amount: string }[];
}
export interface RoyaltyPreview {
  valid_rows: number; invalid_rows: number; total_amount: string; currency: 'IDR';
  unknown_mappings: number; duplicates: number; errors: { row: number; code: string }[];
  warnings: string[]; checksum: string | null;
}
export interface RoyaltyBatch {
  id: string; source: string; period: string; currency: 'IDR'; filename: string;
  row_count: number; total_amount: string; status: string; created_at: string;
}
export interface RoyaltyBreakdownQuery { artist_id?: string; release_id?: string; period?: string; offset?: number }
export interface RoyaltyBreakdown {
  owner_id: string; currency: 'IDR'; status: 'UNRECONCILED';
  items: { artist_id: string; release_id: string; track_id: string; platform: string; period: string; gross_earnings: string; corrections: string; net_earnings: string }[];
}
export const royaltiesApi = {
  breakdown: (query: RoyaltyBreakdownQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: '50' });
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
    return apiRequest<RoyaltyBreakdown>(`/api/v1/royalties/breakdown?${params}`, { signal });
  },
  summary: (signal?: AbortSignal) => apiRequest<RoyaltySummary>('/api/v1/royalties/summary', { signal }),
  history: (offset = 0) => apiRequest<{ items: RoyaltyBatch[] }>(`/api/v1/royalties/imports?limit=50&offset=${offset}`),
  preview: (body: RoyaltyImport) => apiRequest<RoyaltyPreview>('/api/v1/royalties/imports/preview', { method: 'POST', body, timeoutMs: 120000 }),
  commit: (body: RoyaltyImport) => apiRequest<{ id: string; replayed: boolean }>('/api/v1/royalties/imports/commit', { method: 'POST', body, timeoutMs: 120000 }),
};
