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
  posting_allowed: false;
  blockers: string[];
}

export const copyrightApi = {
  previewRoyalties: (body: CopyrightRoyaltyPreviewRequest, signal?: AbortSignal) =>
    apiRequest<CopyrightRoyaltyPreview>('/api/v1/copyright/royalties/preview', {
      method: 'POST', body, signal, timeoutMs: 120000,
    }),
};
