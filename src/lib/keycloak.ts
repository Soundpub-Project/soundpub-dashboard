import Keycloak from 'keycloak-js';

const SSO_BASE_URL = import.meta.env.VITE_SSO_BASE_URL || 'https://sso.iccn.or.id';
const SSO_REALM = import.meta.env.VITE_SSO_REALM || 'playground';
const SSO_CLIENT_ID = import.meta.env.VITE_SSO_CLIENT_ID || 'soundpub';

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;
let refreshTimer: number | null = null;

function getRedirectUri(): string {
  return `${window.location.origin}/auth`;
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
  const kc = getKeycloak();
  try {
    if (kc.authenticated === undefined) {
      console.log('SSO: Initializing Keycloak for login redirect...');
      if (!initPromise) {
        initPromise = kc.init({
          checkLoginIframe: false,
          pkceMethod: 'S256',
        });
      }
      await initPromise;
    }
    console.log('SSO: Keycloak initialized, redirecting to login...');
    await kc.login({ redirectUri: getRedirectUri() });
  } catch (error) {
    console.error('SSO: Keycloak init+login error:', error);
    resetKeycloak();
    throw error;
  }
}

export function keycloakLogout(): void {
  const kc = getKeycloak();
  const idToken = kc.idToken;
  resetKeycloak();
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
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}
