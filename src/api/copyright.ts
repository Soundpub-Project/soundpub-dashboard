import { apiRequest } from './client';

export interface CopyrightRoyaltyPreviewRow {
  composer_code: string;
  composer_name: string;
  total_net_royalti: string;
}

export interface CopyrightRoyaltyPreviewRequest {
  source: string;
  source_batch: string;
  period: string;
  currency: 'IDR';
  rows: CopyrightRoyaltyPreviewRow[];
}

export interface CopyrightRoyaltyPreviewRowResult extends CopyrightRoyaltyPreviewRow {
  beneficiary_id: string | null;
  canonical_name: string | null;
  mapping_id: string | null;
  status: 'MATCHED' | 'UNMATCHED';
}

export interface CopyrightRoyaltyPreview extends Omit<CopyrightRoyaltyPreviewRequest, 'rows'> {
  rows: CopyrightRoyaltyPreviewRowResult[];
  total_amount: string;
  checksum: string;
  status: 'UNRECONCILED';
  policy_code: string;
  policy_checksum: string;
  posting_allowed: boolean;
  blockers: string[];
}

export interface CopyrightRoyaltyEntry {
  id: string; batch_id: string; composer_code: string; composer_name: string; beneficiary_id: string;
  canonical_name: string; mapping_id: string; period: string; amount: string; policy_code: string; created_at: string;
}

export interface CopyrightRoyaltyBatch {
  id: string; source: string; source_batch: string; period: string; currency: 'IDR'; uploader_id: string;
  row_count: number; total_amount: string; checksum: string; policy_code: string; policy_checksum: string;
  status: 'UNRECONCILED' | 'RECONCILED' | 'CORRECTED'; created_at: string;
}

export interface CopyrightRoyaltyImportDetail extends CopyrightRoyaltyBatch { entries: CopyrightRoyaltyEntry[] }
export interface CopyrightRoyaltyCorrection { id: string; batch_id: string; reason: string; actor_id: string; created_at: string }
export interface CopyrightRoyaltyReconciliation {
  id: string; batch_id: string; actor_id: string; result: 'MATCHED' | 'MISMATCH'; evidence: string;
  snapshot_checksum: string; snapshot: unknown; issues: unknown[]; created_at: string; replayed: boolean;
}
export interface CopyrightBeneficiaryMapping {
  id: string; composer_code: string; owner_id: string; canonical_name: string; valid_from: string;
  valid_through: string | null; created_by: string; created_at: string; revoked: boolean;
  revoked_by: string | null; revocation_reason: string | null; revoked_at: string | null;
}
export interface CopyrightBeneficiaryMappingCreate {
  composer_code: string; owner_id: string; canonical_name: string; valid_from: string; valid_through?: string | null;
}

interface Page<T> { items: T[]; next_offset: number | null }
const pageQuery = (limit = 50, offset = 0) => `?limit=${limit}&offset=${offset}`;

export const copyrightApi = {
  previewRoyalties: (body: CopyrightRoyaltyPreviewRequest, signal?: AbortSignal) =>
    apiRequest<CopyrightRoyaltyPreview>('/api/v1/copyright/royalties/preview', {
      method: 'POST', body, signal, timeoutMs: 120000,
    }),
  postImport: (body: { expected_checksum: string; statement: CopyrightRoyaltyPreviewRequest }) =>
    apiRequest<{ batch: CopyrightRoyaltyImportDetail; replayed: boolean }>('/api/v1/admin/copyright/royalties/imports', {
      method: 'POST', body, timeoutMs: 120000,
    }),
  listImports: (limit = 50, offset = 0, signal?: AbortSignal) =>
    apiRequest<Page<CopyrightRoyaltyBatch>>(`/api/v1/admin/copyright/royalties/imports${pageQuery(limit, offset)}`, { signal }),
  getImport: (id: string, signal?: AbortSignal) =>
    apiRequest<CopyrightRoyaltyImportDetail>(`/api/v1/admin/copyright/royalties/imports/${encodeURIComponent(id)}`, { signal }),
  listRoyalties: (limit = 50, offset = 0, signal?: AbortSignal) =>
    apiRequest<Page<CopyrightRoyaltyEntry>>(`/api/v1/copyright/royalties${pageQuery(limit, offset)}`, { signal }),
  correctImport: (id: string, reason: string) =>
    apiRequest<CopyrightRoyaltyCorrection>(`/api/v1/admin/copyright/royalties/imports/${encodeURIComponent(id)}/corrections`, {
      method: 'POST', body: { reason }, timeoutMs: 120000,
    }),
  reconcileImport: (id: string, evidence: string) =>
    apiRequest<CopyrightRoyaltyReconciliation>(`/api/v1/admin/copyright/royalties/imports/${encodeURIComponent(id)}/reconciliation`, {
      method: 'POST', body: { evidence }, timeoutMs: 120000,
    }),
  createMapping: (body: CopyrightBeneficiaryMappingCreate) =>
    apiRequest<CopyrightBeneficiaryMapping>('/api/v1/admin/copyright/beneficiary-mappings', { method: 'POST', body }),
  listMappings: (query: { composer_code?: string; owner_id?: string; include_revoked?: boolean; limit?: number; offset?: number } = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.composer_code) params.set('composer_code', query.composer_code);
    if (query.owner_id) params.set('owner_id', query.owner_id);
    if (query.include_revoked !== undefined) params.set('include_revoked', String(query.include_revoked));
    params.set('limit', String(query.limit ?? 50));
    params.set('offset', String(query.offset ?? 0));
    return apiRequest<Page<CopyrightBeneficiaryMapping>>(`/api/v1/admin/copyright/beneficiary-mappings?${params}`, { signal });
  },
  revokeMapping: (id: string, reason: string) =>
    apiRequest<CopyrightBeneficiaryMapping>(`/api/v1/admin/copyright/beneficiary-mappings/${encodeURIComponent(id)}/revoke`, {
      method: 'POST', body: { reason },
    }),
};
