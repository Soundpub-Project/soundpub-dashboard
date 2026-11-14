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

export interface RoyaltyCsvIssue {
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface RoyaltyCsvSampleRow {
  source_row_number: number;
  period: string;
  isrc: string;
  upc: string;
  title: string;
  artist: string;
  label_name: string;
  platform: string;
  country: string;
  sales_type: string | null;
  sales_unit: number;
  net_revenue: string;
  track_id: string;
  release_id: string;
  artist_id: string | null;
  artist_owner_user_id: string;
  label_owner_user_id: string | null;
}

export interface RoyaltyCsvPreview {
  parsed_rows: number;
  valid_rows: number;
  invalid_rows: number;
  file_errors: number;
  period: string | null;
  currency: 'IDR';
  policy_code: string;
  checksum: string | null;
  total_net_amount: string;
  artist_amount: string;
  label_amount: string;
  soundpub_amount: string;
  issues: RoyaltyCsvIssue[];
  sample_rows: RoyaltyCsvSampleRow[];
}

export type RoyaltyImportSessionStatus = 'UPLOAD_PENDING' | 'UPLOADED' | 'QUEUED' | 'PARSING' | 'PREVIEW_READY' | 'FAILED' | 'COMMITTING' | 'COMMITTED' | 'CLEANING' | 'DELETED';
export interface RoyaltyImportSession {
  id: string;
  requester_id: string;
  source: string;
  filename: string;
  mime_type: 'text/csv';
  size_bytes: string;
  source_checksum: string;
  operation_kind: 'IMPORT' | 'REPLACEMENT';
  replaces_batch_id: string | null;
  replacement_reason: string | null;
  request_key: string | null;
  approval_id: string | null;
  approval_actor_id: string | null;
  approval_evidence: string | null;
  approved_at: string | null;
  status: RoyaltyImportSessionStatus;
  phase: 'UPLOAD' | 'QUEUED' | 'PARSE' | 'MATCH' | 'PREVIEW' | 'COMMIT' | 'DONE';
  processed_rows: number;
  total_rows: number | null;
  attempts: number;
  preview_checksum: string | null;
  staging_checksum: string | null;
  preview_result: RoyaltyCsvPreview | null;
  error_code: string | null;
  batch_id: string | null;
  upload_expires_at: string;
  created_at: string;
  updated_at: string;
}
export type RoyaltyStagedRowStatus = 'ALL' | 'MATCHED' | 'INVALID';
export interface RoyaltyStagedRow {
  source_row_number: number;
  row_status: Exclude<RoyaltyStagedRowStatus, 'ALL'>;
  issue: RoyaltyCsvIssue | null;
  period: string | null;
  source_isrc: string | null;
  source_upc: string | null;
  title: string | null;
  artist_name: string | null;
  label_name: string | null;
  platform: string | null;
  country: string | null;
  sales_type: string | null;
  sales_unit: number | null;
  net_amount: string | null;
  track_id: string | null;
  release_id: string | null;
  artist_id: string | null;
  financial_owner_user_id: string | null;
  label_owner_user_id: string | null;
  artist_amount: string | null;
  label_amount: string | null;
  soundpub_amount: string | null;
  calculation_policy_code: string | null;
}
export interface RoyaltyFileUploadIntent {
  session: RoyaltyImportSession;
  url?: string;
  method?: 'PUT';
  headers?: Record<string, string>;
  expires_at?: string;
}
export interface RoyaltyPreview {
  valid_rows: number; invalid_rows: number; total_amount: string; currency: 'IDR';
  unknown_mappings: number; duplicates: number; errors: { row: number; code: string }[];
  warnings: string[]; checksum: string | null;
}

export interface RoyaltyBatch {
  id: string;
  source: string;
  period: string;
  currency: 'IDR';
  filename: string;
  uploader_id: string;
  row_count: number;
  total_amount: string;
  validation_result: Record<string, unknown>;
  checksum: string;
  status: 'UNRECONCILED' | 'VOIDED_WITH_OFFSET' | string;
  reconciliation_id: string | null;
  reconciliation_actor_id: string | null;
  reconciliation_evidence: string | null;
  reconciled_at: string | null;
  replacement_batch_id: string | null;
  replaces_batch_id: string | null;
  change_reason: string | null;
  change_actor_id: string | null;
  changed_at: string | null;
  created_at: string;
}

export interface RoyaltyAllocation {
  id: string;
  component: 'ARTIST' | 'LABEL' | 'SOUNDPUB' | 'COMPOSER' | 'LEGACY_OWNER';
  owner_id: string | null;
  amount: string;
  policy_code: string;
}

export interface RoyaltyImportEntry {
  id: string;
  source_row_id: string;
  source_row_number: number | null;
  source_isrc: string | null;
  source_upc: string | null;
  beneficiary_id: string;
  artist_id: string;
  financial_owner_user_id: string;
  label_owner_user_id: string;
  calculation_policy_code: string;
  release_id: string;
  track_id: string;
  platform: string | null;
  country: string | null;
  sales_type: string | null;
  sales_unit: number | null;
  gross_amount: string;
  deduction_amount: string;
  net_amount: string;
  allocations: RoyaltyAllocation[];
}

export interface RoyaltyImportDetail extends RoyaltyBatch {
  entries: RoyaltyImportEntry[];
  entry_total: number;
  entry_limit: number;
  entry_offset: number;
}

export interface RoyaltyReconciliation {
  batch_id: string;
  matched: boolean;
  issues: string[];
  checksum: string;
  snapshot: {
    batch: { id: string; uploader_id: string; row_count: number; total_amount: string; checksum: string };
    entries: { count: number; total: string };
    allocations: { count: number; total: string; user_total: string };
    owners: { owner_id: string; expected_minor: string; actual_minor: string }[];
    ledger: { count: number; total_minor: string; broken: number; unexpected: number };
    evidence: { audits: number; events: number };
  };
  approval: { id: string; actor_id: string; evidence: string; snapshot_checksum: string; created_at: string } | null;
  replayed?: boolean;
}

export interface RoyaltyBreakdownQuery { artist_id?: string; release_id?: string; period?: string; offset?: number }
export interface RoyaltyBreakdown {
  owner_id: string; currency: 'IDR'; status: 'UNRECONCILED';
  items: { artist_id: string; release_id: string; track_id: string; platform: string; period: string; gross_earnings: string; corrections: string; net_earnings: string }[];
}
export interface RoyaltyReportQuery extends RoyaltyBreakdownQuery { track_id?: string; search?: string; limit?: number }
export interface RoyaltyReportRow {
  id: string; period: string; isrc: string | null; upc: string | null; artist_id: string | null;
  release_id: string; track_id: string; release_title: string; track_title: string; artist_name: string;
  label_name: string | null; platform: string | null; country: string | null; sales_type: string | null;
  sales_unit: number | null; net_revenue: string; owner_revenue: string; corrected: boolean; created_at: string;
}
export interface RoyaltyReport {
  items: RoyaltyReportRow[]; total: number; limit: number; offset: number;
  summary: { gross_revenue: string; corrections: string; net_revenue: string;
    owner_gross_revenue: string; owner_corrections: string; owner_revenue: string };
}

export type RoyaltyAnalyticsView = 'stats' | 'monthly' | 'platform' | 'country' | 'period' | 'label' | 'artist' | 'track' | 'comparison' | 'top';
export interface RoyaltyAnalyticsQuery {
  period?: string | null; limit?: number; group_by?: 'title' | 'platform' | 'country';
  current_period?: string[]; previous_period?: string[];
}

export const royaltiesApi = {
  requestFileUpload: (body: { source: string; filename: string; mime_type: 'text/csv'; size: number; checksum: string }) =>
    apiRequest<RoyaltyFileUploadIntent>('/api/v1/royalties/import-files', { method: 'POST', body }),
  requestReplacementFileUpload: (id: string, body: { filename: string; mime_type: 'text/csv'; size: number;
    checksum: string; reason: string }, idempotencyKey: string) =>
    apiRequest<RoyaltyFileUploadIntent>(`/api/v1/royalties/imports/${encodeURIComponent(id)}/replacement-file-sessions`,
      { method: 'POST', body, idempotencyKey }),
  completeFileUpload: (id: string) => apiRequest<{ session: RoyaltyImportSession }>(`/api/v1/royalties/import-files/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  fileSession: (id: string, signal?: AbortSignal) => apiRequest<RoyaltyImportSession>(`/api/v1/royalties/import-files/${encodeURIComponent(id)}`, { signal }),
  fileSessionRows: (id: string, status: RoyaltyStagedRowStatus, offset = 0, signal?: AbortSignal) =>
    apiRequest<{ items: RoyaltyStagedRow[]; total: number; limit: number; offset: number; status: RoyaltyStagedRowStatus }>(
      `/api/v1/royalties/import-files/${encodeURIComponent(id)}/rows?status=${status}&limit=50&offset=${offset}`, { signal }),
  fileSessions: (offset = 0, signal?: AbortSignal) => apiRequest<{ items: RoyaltyImportSession[] }>(`/api/v1/royalties/import-files?limit=50&offset=${offset}`, { signal }),
  retryFileSession: (id: string) => apiRequest<{ session: RoyaltyImportSession }>(`/api/v1/royalties/import-files/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  approveFileSession: (id: string, body: { expected_checksum: string; evidence: string }) => apiRequest<{
    id: string; actor_id: string; preview_checksum: string; staging_checksum: string; evidence: string;
    created_at: string; replayed: boolean;
  }>(`/api/v1/admin/royalties/import-files/${encodeURIComponent(id)}/approve`, { method: 'POST', body }),
  commitFileSession: (id: string) => apiRequest<{ id: string; replaced_id?: string; replayed: boolean }>(`/api/v1/royalties/import-files/${encodeURIComponent(id)}/commit`, { method: 'POST', timeoutMs: 120000 }),
  periods: (signal?: AbortSignal) => apiRequest<{ items: string[] }>('/api/v1/royalties/periods', { signal }),
  analytics: <T>(view: RoyaltyAnalyticsView, query: RoyaltyAnalyticsQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams({ view });
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) for (const item of value) params.append(key, item);
      else params.set(key, String(value));
    }
    return apiRequest<T>(`/api/v1/royalties/analytics?${params}`, { signal });
  },
  report: (query: RoyaltyReportQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
    return apiRequest<RoyaltyReport>(`/api/v1/royalties/report?${params}`, { signal });
  },
  breakdown: (query: RoyaltyBreakdownQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: '50' });
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
    return apiRequest<RoyaltyBreakdown>(`/api/v1/royalties/breakdown?${params}`, { signal });
  },
  summary: (signal?: AbortSignal) => apiRequest<RoyaltySummary>('/api/v1/royalties/summary', { signal }),
  history: (offset = 0, signal?: AbortSignal) => apiRequest<{ items: RoyaltyBatch[] }>(`/api/v1/royalties/imports?limit=50&offset=${offset}`, { signal }),
  detail: (id: string, offset = 0, signal?: AbortSignal) => apiRequest<RoyaltyImportDetail>(
    `/api/v1/royalties/imports/${encodeURIComponent(id)}?limit=100&offset=${offset}`, { signal }),
  reconciliation: (id: string, signal?: AbortSignal) => apiRequest<RoyaltyReconciliation>(
    `/api/v1/admin/royalties/imports/${encodeURIComponent(id)}/reconciliation`, { signal }),
  reconcile: (id: string, body: { expected_checksum: string; evidence: string }) => apiRequest<RoyaltyReconciliation>(
    `/api/v1/admin/royalties/imports/${encodeURIComponent(id)}/reconciliation`, { method: 'POST', body, timeoutMs: 120000 }),
  correct: (id: string, reason: string) => apiRequest<{ id: string; replayed: boolean }>(`/api/v1/royalties/imports/${encodeURIComponent(id)}/correction`, {
    method: 'POST', body: { reason }, timeoutMs: 120000,
  }),
  replaceCsv: (id: string, body: { csv: string; filename: string; expected_checksum: string; reason: string }) =>
    apiRequest<{ id: string; replaced_id: string; replayed: boolean }>(`/api/v1/royalties/imports/${encodeURIComponent(id)}/replacement/csv`, {
      method: 'POST', body, timeoutMs: 120000,
    }),
  previewRoyaltyCsv: (csv: string, signal?: AbortSignal) => apiRequest<RoyaltyCsvPreview>('/api/v1/royalties/imports/csv/preview', {
    method: 'POST', body: { csv }, signal, timeoutMs: 120000,
  }),
  commitRoyaltyCsv: (body: { csv: string; source: string; filename: string; expected_checksum: string }) =>
    apiRequest<{ id: string; replayed: boolean }>('/api/v1/royalties/imports/csv/commit', { method: 'POST', body, timeoutMs: 120000 }),
  preview: (body: RoyaltyImport) => apiRequest<RoyaltyPreview>('/api/v1/royalties/imports/preview', { method: 'POST', body, timeoutMs: 120000 }),
  commit: (body: RoyaltyImport) => apiRequest<{ id: string; replayed: boolean }>('/api/v1/royalties/imports/commit', { method: 'POST', body, timeoutMs: 120000 }),
};
