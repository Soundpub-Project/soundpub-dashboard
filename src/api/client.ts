export type ApiErrorCategory =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'RATE_LIMITED' | 'TEMPORARY_FAILURE' | 'INTERNAL_ERROR';

export class SoundpubApiError extends Error {
  constructor(
    public readonly category: ApiErrorCategory,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly code: string = category,
    public readonly serverMessage: string = code,
  ) {
    super(serverMessage);
    this.name = 'SoundpubApiError';
  }
}

let tokenProvider: () => Promise<string | null> = async () => null;
let csrfToken: string | null = null;

export const maintenanceModeEvent = 'soundpub:maintenance-mode';

function notifyMaintenanceMode() {
  window.dispatchEvent(new CustomEvent(maintenanceModeEvent));
}

export function setApiTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

export function setApiCsrfToken(token: string | null) {
  csrfToken = token;
}

const categories: Record<number, ApiErrorCategory> = {
  400: 'VALIDATION_ERROR', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED',
  413: 'VALIDATION_ERROR', 415: 'VALIDATION_ERROR',
  503: 'TEMPORARY_FAILURE',
};

export async function apiRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal; timeoutMs?: number; authenticated?: boolean; idempotencyKey?: string } = {},
): Promise<T> {
  const baseUrl = import.meta.env.VITE_SOUNDPUB_API_URL || window.location.origin;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new SoundpubApiError('TEMPORARY_FAILURE', 0);
  if (!path.startsWith('/api/v1/') || path.startsWith('//')) throw new SoundpubApiError('VALIDATION_ERROR', 0);
  const token = options.authenticated === false ? null : await tokenProvider();
  const method = options.method ?? 'GET';
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, options.timeoutMs ?? 15000);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(mutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') ?? payload?.error?.requestId;
      const code = typeof payload?.error?.code === 'string' ? payload.error.code : categories[response.status] ?? 'INTERNAL_ERROR';
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : code;
      if (response.status === 503 && code === 'MAINTENANCE_MODE') notifyMaintenanceMode();
      throw new SoundpubApiError(categories[response.status] ?? 'INTERNAL_ERROR', response.status, requestId, code, message);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof SoundpubApiError) throw error;
    if (controller.signal.aborted) throw new SoundpubApiError('TEMPORARY_FAILURE', 0);
    throw new SoundpubApiError('TEMPORARY_FAILURE', 0);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
