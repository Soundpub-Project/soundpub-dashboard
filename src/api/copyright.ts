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

export interface CopyrightRoyaltyPreview extends CopyrightRoyaltyPreviewRequest {
  total_amount: string;
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
