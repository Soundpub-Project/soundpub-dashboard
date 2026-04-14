import Keycloak from 'keycloak-js';

const SSO_BASE_URL = import.meta.env.VITE_SSO_BASE_URL || 'https://sso.iccn.or.id';
const SSO_REALM = import.meta.env.VITE_SSO_REALM || 'playground';
const SSO_CLIENT_ID = import.meta.env.VITE_SSO_CLIENT_ID || 'soundpub';

let keycloakInstance: Keycloak | null = null;

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
 * Initialize Keycloak WITHOUT auto-login (no onLoad).
 * Used only to process SSO callback when returning from Keycloak.
 */
export async function initKeycloak(): Promise<boolean> {
  const kc = getKeycloak();
  try {
    const authenticated = await kc.init({
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });
    return authenticated;
  } catch (error) {
    console.error('Keycloak init error:', error);
    return false;
  }
}

/**
 * Initialize Keycloak and immediately trigger login redirect.
 * Used when user explicitly clicks "Login via SSO".
 */
export async function initKeycloakAndLogin(): Promise<void> {
  const kc = getKeycloak();
  try {
    await kc.init({
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });
    kc.login({ redirectUri: window.location.origin + '/auth' });
  } catch (error) {
    console.error('Keycloak init+login error:', error);
    throw error;
  }
}

export function keycloakLogout(): void {
  const kc = getKeycloak();
  kc.logout({ redirectUri: window.location.origin + '/' });
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
