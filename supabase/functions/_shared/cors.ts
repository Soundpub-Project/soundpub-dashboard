/**
 * Shared CORS helper for Soundpub Edge Functions.
 *
 * Origin is echoed back only when it appears in the allowlist, so a browser on
 * an attacker-controlled page cannot read responses from token-bearing calls.
 *
 * Extra origins can be added at deploy time without editing code:
 *   ALLOWED_ORIGINS=https://foo.example,https://bar.example
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dashboard.soundpub.xyz',
  'https://dev-dashboard.soundpub.xyz',
  'https://dev.soundpub.xyz',
  'https://dev-soundpub.maskhar.com',
  'https://web.maskhar.com',
  'http://localhost:8181',
  'http://127.0.0.1:8181',
];

function allowlist(): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

/** Primary app origin, used for redirects that must never be attacker-controlled. */
export function appBaseUrl(): string {
  return (
    Deno.env.get('APP_BASE_URL') ??
    Deno.env.get('PUBLIC_SITE_URL') ??
    DEFAULT_ALLOWED_ORIGINS[0]
  ).replace(/\/$/, '');
}

/** True when `origin` is one this deployment is willing to serve cross-origin. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return allowlist().includes(origin.replace(/\/$/, ''));
}

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-callback-token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

/**
 * CORS headers for a specific request. An unknown origin gets no
 * `Access-Control-Allow-Origin`, so the browser blocks the response.
 * Non-browser callers (no Origin header) are unaffected.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');

  if (!isAllowedOrigin(origin)) {
    return { ...BASE_HEADERS };
  }

  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Static fallback for call sites that have no `Request` in scope.
 * Prefer `buildCorsHeaders(req)`.
 */
export const corsHeaders: Record<string, string> = {
  ...BASE_HEADERS,
  'Access-Control-Allow-Origin': appBaseUrl(),
};
