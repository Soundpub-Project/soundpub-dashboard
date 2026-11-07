import { getApiAccessToken, SoundpubApiError } from './client';

export const exportDatasetIds = [
  'profiles', 'artists', 'releases', 'tracks', 'royalties', 'royalty_uploads',
  'payout_requests', 'audit_logs', 'user_roles', 'app_settings',
] as const;

export type ExportDataset = typeof exportDatasetIds[number];

const datasets = new Set<string>(exportDatasetIds);
const categories: Record<number, ConstructorParameters<typeof SoundpubApiError>[0]> = {
  400: 'VALIDATION_ERROR', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 429: 'RATE_LIMITED', 503: 'TEMPORARY_FAILURE',
};

function integerHeader(response: Response, name: string) {
  const raw = response.headers.get(name);
  if (raw === null || !/^\d+$/.test(raw)) throw new SoundpubApiError('INTERNAL_ERROR', response.status);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new SoundpubApiError('INTERNAL_ERROR', response.status);
  return value;
}

async function exportError(response: Response) {
  const payload = await response.json().catch(() => null);
  const requestId = response.headers.get('x-request-id') ?? payload?.error?.requestId;
  const code = typeof payload?.error?.code === 'string' ? payload.error.code : categories[response.status] ?? 'INTERNAL_ERROR';
  const message = typeof payload?.error?.message === 'string' ? payload.error.message : code;
  return new SoundpubApiError(categories[response.status] ?? 'INTERNAL_ERROR', response.status, requestId, code, message);
}

export async function downloadBackendExport(dataset: ExportDataset, options: {
  limit?: number; signal?: AbortSignal; timeoutMs?: number;
} = {}) {
  if (!datasets.has(dataset)) throw new SoundpubApiError('VALIDATION_ERROR', 0);
  const limit = options.limit ?? 100_000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) throw new SoundpubApiError('VALIDATION_ERROR', 0);

  const baseUrl = import.meta.env.VITE_SOUNDPUB_API_URL || window.location.origin;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new SoundpubApiError('TEMPORARY_FAILURE', 0);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, options.timeoutMs ?? 60_000);

  try {
    const token = await getApiAccessToken();
    const url = new URL(`/api/v1/admin/exports/${encodeURIComponent(dataset)}`, baseUrl);
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url, { method: 'GET', credentials: 'include', signal: controller.signal,
      headers: { Accept: 'text/csv', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) throw await exportError(response);
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/csv')) {
      throw new SoundpubApiError('INTERNAL_ERROR', response.status, response.headers.get('x-request-id') ?? undefined);
    }
    const rowCount = integerHeader(response, 'x-export-row-count');
    const csv = await response.text();
    if (rowCount > 0 && csv.length === 0) throw new SoundpubApiError('INTERNAL_ERROR', response.status);
    return { csv, rowCount };
  } catch (error) {
    if (error instanceof SoundpubApiError) throw error;
    throw new SoundpubApiError('TEMPORARY_FAILURE', 0);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
