import Keycloak from 'keycloak-js';

const SSO_BASE_URL = import.meta.env.VITE_SSO_BASE_URL || 'https://sso.iccn.or.id';
const SSO_REALM = import.meta.env.VITE_SSO_REALM || 'playground';
const SSO_CLIENT_ID = import.meta.env.VITE_SSO_CLIENT_ID || 'soundpub';
const SSO_PKCE_KEY = 'soundpub_iccn_sso_pkce';

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;
let refreshTimer: number | null = null;

interface StoredPkceState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface SsoCallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
}

// ---------------------------------------------------------------
// SSO active flag (localStorage hint)
// Used to remember that the user has had a working ICCN session
// recently, so we can be more aggressive with silent checks even
// when 3rd-party cookies are blocked between visits.
// ---------------------------------------------------------------
const SSO_ACTIVE_KEY = 'soundpub_iccn_sso_active';
const SSO_ACTIVE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function markSsoActive(): void {
  try {
    localStorage.setItem(SSO_ACTIVE_KEY, String(Date.now()));
  } catch {
    // ignore (private mode etc.)
  }
}

export function clearSsoActive(): void {
  try {
    localStorage.removeItem(SSO_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function wasSsoActive(): boolean {
  try {
    const raw = localStorage.getItem(SSO_ACTIVE_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > SSO_ACTIVE_TTL_MS) {
      localStorage.removeItem(SSO_ACTIVE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getRedirectUri(): string {
  return `${window.location.origin}/auth`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

async function createSsoLoginUrl(options?: { prompt?: 'none'; redirectUri?: string }): Promise<string> {
  const redirectUri = options?.redirectUri || getRedirectUri();
  const state = randomBase64Url(16);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const stored: StoredPkceState = { state, codeVerifier, redirectUri, createdAt: Date.now() };
  sessionStorage.setItem(SSO_PKCE_KEY, JSON.stringify(stored));

  const url = new URL(`${SSO_BASE_URL}/realms/${SSO_REALM}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', SSO_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (options?.prompt) url.searchParams.set('prompt', options.prompt);

  return url.toString();
}

export function getKeycloak(): Keycloak {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: SSO_BASE_URL,
      realm: SSO_REALM,
      clientId: SSO_CLIENT_ID,
    });
  }
  return keycloakInstance;
}

/**
 * Reset Keycloak instance to force a fresh init.
 * Use sparingly — only on hard errors or logout.
 */
export function resetKeycloak(): void {
  keycloakInstance = null;
  initPromise = null;
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Initialize Keycloak WITHOUT auto-login (no onLoad).
 * Used to process SSO callback when returning from Keycloak.
 * Idempotent: if already initialized, returns current state.
 */
export async function initKeycloak(): Promise<boolean> {
  const kc = getKeycloak();
  if (kc.authenticated !== undefined) {
    return kc.authenticated ?? false;
  }
  if (initPromise) return initPromise;
  try {
    console.log('SSO: Initializing Keycloak for callback processing...');
    initPromise = kc.init({
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'fragment',
      flow: 'standard',
    });
    const authenticated = await initPromise;
    console.log('SSO: Keycloak init result:', authenticated, 'token exists:', !!kc.token);
    return authenticated;
  } catch (error) {
    console.error('SSO: Keycloak init error:', error);
    initPromise = null;
    resetKeycloak();
    return false;
  }
}

/**
 * Silent SSO check — detects existing Keycloak session via hidden iframe
 * without performing a full-page redirect. Requires Web Origins to be
 * whitelisted on the Keycloak client (sso.iccn.or.id).
 */
export async function initKeycloakSilent(): Promise<boolean> {
  const kc = getKeycloak();
  if (kc.authenticated !== undefined) {
    return kc.authenticated ?? false;
  }
  if (initPromise) return initPromise;
  try {
    console.log('SSO: Running silent SSO check...');
    initPromise = kc.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'fragment',
      flow: 'standard',
    });
    const authenticated = await initPromise;
    console.log('SSO: Silent check result:', authenticated, 'token exists:', !!kc.token);
    return authenticated;
  } catch (error) {
    console.warn('SSO: Silent check failed (likely Web Origins not whitelisted in Keycloak):', error);
    initPromise = null;
    resetKeycloak();
    return false;
  }
}

/**
 * Periodically refresh the Keycloak token. Calls onRefresh callback
 * when token actually changes so callers can sync downstream sessions.
 */
export function setupTokenRefresh(onRefresh?: (token: string) => void): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
  }
  refreshTimer = window.setInterval(async () => {
    const kc = getKeycloak();
    if (!kc.authenticated) return;
    try {
      const refreshed = await kc.updateToken(60);
      if (refreshed && kc.token && onRefresh) {
        console.log('SSO: Keycloak token refreshed');
        onRefresh(kc.token);
      }
    } catch (err) {
      console.warn('SSO: Token refresh failed:', err);
    }
  }, 30000);
}

/**
 * Initialize Keycloak and immediately trigger login redirect.
 * Used when user explicitly clicks "Login via SSO".
 */
export async function initKeycloakAndLogin(): Promise<void> {
  try {
    console.log('SSO: Redirecting to ICCN authorization endpoint...');
    window.location.href = await createSsoLoginUrl();
  } catch (error) {
    console.error('SSO: Login redirect error:', error);
    resetKeycloak();
    throw error;
  }
}

export async function initSsoPromptNone(redirectUri?: string): Promise<void> {
  window.location.href = await createSsoLoginUrl({ prompt: 'none', redirectUri });
}

export function keycloakLogout(): void {
  const kc = getKeycloak();
  const idToken = kc.idToken;
  resetKeycloak();
  clearSsoActive();
  kc.logout({
    redirectUri: `${window.location.origin}/auth`,
    ...(idToken ? { idToken } : {}),
  });
}

export function getToken(): string | undefined {
  return getKeycloak().token;
}

export function getIdToken(): string | undefined {
  return getKeycloak().idToken;
}

export function isKeycloakAuthenticated(): boolean {
  return getKeycloak().authenticated ?? false;
}

/**
 * Check if current URL contains Keycloak SSO callback parameters.
 */
export function isSsoCallback(): boolean {
  const params = getSsoCallbackParams();
  return !!((params.code || params.error) && params.state);
}

export function getSsoCallbackParams(): SsoCallbackParams {
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.has('code') || queryParams.has('error')) {
    return {
      code: queryParams.get('code'),
      state: queryParams.get('state'),
      error: queryParams.get('error'),
      errorDescription: queryParams.get('error_description'),
    };
  }

  const rawHash = window.location.hash || '';
  if (!rawHash) return { code: null, state: null, error: null, errorDescription: null };
  const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  const hashParams = new URLSearchParams(hash);
  return {
    code: hashParams.get('code'),
    state: hashParams.get('state'),
    error: hashParams.get('error'),
    errorDescription: hashParams.get('error_description'),
  };
}

export function consumeStoredPkceState(callbackState: string | null): StoredPkceState | null {
  try {
    const raw = sessionStorage.getItem(SSO_PKCE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPkceState;
    sessionStorage.removeItem(SSO_PKCE_KEY);
    const isFresh = Date.now() - stored.createdAt < 10 * 60 * 1000;
    if (!isFresh || stored.state !== callbackState) return null;
    return stored;
  } catch {
    return null;
  }
}
