/**
 * Shared caller-authentication helpers for Soundpub Edge Functions.
 *
 * `verify_jwt = false` is set for most functions in `supabase/config.toml`, so
 * the platform performs no JWT check and every function must authenticate its
 * own caller. These helpers keep that check identical everywhere.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type AppRole =
  | 'superadmin'
  | 'admin'
  | 'label'
  | 'whitelabel'
  | 'artist'
  | 'copyright'
  | 'user';

export interface Caller {
  id: string;
  email: string | null;
  role: AppRole | null;
}

/** HTTP-shaped failure so handlers can map to a status instead of a blanket 400. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function schema(): string {
  return (
    Deno.env.get('DATABASE_SCHEMA') ||
    Deno.env.get('SUPABASE_DB_SCHEMA') ||
    'Soundpub'
  );
}

/**
 * Resolve the caller from the request's `Authorization` header.
 *
 * The token is validated by Supabase (anon key + caller JWT), and the role is
 * read server-side from `user_roles` — never from the request body or a claim
 * the client could have set.
 */
export async function requireUser(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing authorization header');
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      db: { schema: schema() },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new AuthError('Unauthorized');
  }

  const { data: roleRow } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (roleRow?.role as AppRole | undefined) ?? null,
  };
}

/** Caller must hold one of `roles`, otherwise 403. */
export async function requireRole(
  req: Request,
  roles: AppRole[],
): Promise<Caller> {
  const caller = await requireUser(req);
  if (!caller.role || !roles.includes(caller.role)) {
    throw new AuthError('Forbidden: insufficient role', 403);
  }
  return caller;
}

/** Caller must be `admin` or `superadmin`. */
export function requireAdmin(req: Request): Promise<Caller> {
  return requireRole(req, ['admin', 'superadmin']);
}

/**
 * Authenticate a machine caller (cron, CI) via a shared secret header.
 *
 * Compares in constant time so the secret cannot be recovered by timing the
 * response. Returns false when the expected secret is unset, so a missing
 * env var fails closed rather than allowing everyone through.
 */
export function verifySharedSecret(
  req: Request,
  envVar: string,
  headerName = 'x-service-secret',
): boolean {
  const expected = Deno.env.get(envVar);
  if (!expected) return false;

  const received = req.headers.get(headerName);
  if (!received) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(received);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * True when the request carries the service-role key, i.e. the caller is one of
 * our own Edge Functions rather than a browser. Compared in constant time.
 */
export function verifyServiceRole(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!expected) return false;

  const header = req.headers.get('Authorization') ?? '';
  const received = header.replace(/^Bearer\s+/i, '').trim();
  if (!received) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(received);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Escape a string for safe interpolation into an HTML template. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * SHA-256 hex digest.
 *
 * Used so password-reset tokens are stored hashed: a leaked database row (or a
 * backup, or a read-only SQL bug) then no longer hands an attacker a working
 * reset link. The token itself is high-entropy, so a plain digest is enough —
 * there is nothing to brute-force.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate a UUID before it reaches a PostgREST filter string. */
export function assertUuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new AuthError(`Invalid ${field}`, 400);
  }
  return value;
}
