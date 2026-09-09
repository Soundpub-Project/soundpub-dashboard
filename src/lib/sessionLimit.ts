import type { Session } from '@supabase/supabase-js';

const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SESSION_STARTED_AT_KEY = 'soundpub.session_started_at';
const SESSION_EXPIRED_KEY = 'soundpub.session_expired_at';

interface StoredSessionStart {
  userId: string;
  startedAt: number;
}

function getStoredSessionStart(): StoredSessionStart | null {
  try {
    const raw = localStorage.getItem(SESSION_STARTED_AT_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as StoredSessionStart;
    if (!value.userId || !Number.isFinite(value.startedAt)) return null;
    return value;
  } catch {
    return null;
  }
}

function getAccessTokenIssuedAt(accessToken: string): number | null {
  try {
    const encodedPayload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload));
    return typeof payload.iat === 'number' ? payload.iat * 1000 : null;
  } catch {
    return null;
  }
}

export function getSessionExpiresAt(session: Session): number {
  const stored = getStoredSessionStart();
  const startedAt = stored?.userId === session.user.id
    ? stored.startedAt
    : getAccessTokenIssuedAt(session.access_token) ?? Date.now();

  if (!stored || stored.userId !== session.user.id) {
    localStorage.setItem(SESSION_STARTED_AT_KEY, JSON.stringify({ userId: session.user.id, startedAt }));
  }

  return startedAt + SESSION_MAX_AGE_MS;
}

export function clearSessionLimit(): void {
  localStorage.removeItem(SESSION_STARTED_AT_KEY);
  localStorage.removeItem(SESSION_EXPIRED_KEY);
}

export function markSessionExpired(): void {
  localStorage.removeItem(SESSION_STARTED_AT_KEY);
  localStorage.setItem(SESSION_EXPIRED_KEY, String(Date.now()));
}

export function isSessionExpired(): boolean {
  return localStorage.getItem(SESSION_EXPIRED_KEY) !== null;
}
