import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  initKeycloak,
  initKeycloakSilent,
  initKeycloakAndLogin,
  getToken,
  keycloakLogout,
  isSsoCallback,
  setupTokenRefresh,
  markSsoActive,
  clearSsoActive,
  wasSsoActive,
} from '@/lib/keycloak';

interface SsoAuthContextType {
  ssoLoading: boolean;
  ssoAuthenticated: boolean;
  ssoError: string | null;
  ssoChecking: boolean;
  triggerSsoLogin: () => void;
  triggerSsoLogout: () => void;
}

const SsoAuthContext = createContext<SsoAuthContextType | undefined>(undefined);

export function SsoAuthProvider({ children }: { children: ReactNode }) {
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoAuthenticated, setSsoAuthenticated] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoChecking, setSsoChecking] = useState(false);
  const exchangedRef = useRef(false);

  const exchangeToken = useCallback(async (keycloakToken: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/sso-login`;

      console.log('SSO: Exchanging token with edge function:', functionUrl);
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_token: keycloakToken }),
      });

      const data = await resp.json();
      console.log('SSO: Edge function response status:', resp.status);

      if (!resp.ok) {
        const detail = data.details ? ` (${JSON.stringify(data.details)})` : '';
        throw new Error(`${data.error || 'SSO login failed'}${detail}`);
      }

      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (error) throw error;

      setSsoAuthenticated(true);
      exchangedRef.current = true;
      markSsoActive();
      // Clean up URL params after successful callback
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    } catch (err) {
      console.error('SSO token exchange error:', err);
      setSsoError(err instanceof Error ? err.message : 'SSO login failed');
      return false;
    }
  }, []);

  // On mount: process callback if URL has code+state, otherwise run silent SSO check.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Don't run silent check if user already has a Supabase session.
      const { data: existingSession } = await supabase.auth.getSession();
      if (cancelled) return;

      const isCallback = isSsoCallback();

      if (!isCallback && existingSession.session) {
        // Already logged in via Supabase — skip silent check to avoid duplicate exchange.
        return;
      }

      if (isCallback) {
        setSsoLoading(true);
      } else {
        setSsoChecking(true);
      }
      setSsoError(null);

      try {
        const authenticated = isCallback
          ? (console.log('SSO: Detected callback params, initializing Keycloak...'), await initKeycloak())
          : (console.log('SSO: Running silent SSO check on mount...'), await initKeycloakSilent());

        if (cancelled) return;

        if (authenticated) {
          const token = getToken();
          console.log('SSO: Keycloak authenticated, token exists:', !!token);
          if (token) {
            const ok = await exchangeToken(token);
            if (ok) {
              // Set up periodic token refresh; sync Supabase when Keycloak refreshes.
              setupTokenRefresh(async (newToken) => {
                console.log('SSO: Re-exchanging refreshed Keycloak token...');
                await exchangeToken(newToken);
              });
            }
          } else {
            if (isCallback) {
              console.error('SSO: Keycloak authenticated but no token available');
              setSsoError('SSO: Token tidak ditemukan setelah autentikasi');
              window.history.replaceState({}, '', window.location.pathname);
            }
          }
        } else if (isCallback) {
          console.warn('SSO: Keycloak callback returned not authenticated');
          setSsoError('SSO: Autentikasi gagal, silakan coba lagi');
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          console.log('SSO: Silent check — no active ICCN session');
          // Clear stale flag — user is not actually logged in at ICCN.
          clearSsoActive();

          // Optional: full-redirect auto login if env enables it AND we're
          // on a public auth route. Avoids loops by not redirecting if we
          // just came back from a callback or are already on a callback URL.
          const autoRedirect = import.meta.env.VITE_SSO_AUTO_REDIRECT === 'true';
          const path = window.location.pathname;
          const onPublicAuthRoute = path === '/' || path === '/auth';
          if (autoRedirect && onPublicAuthRoute && !isCallback) {
            console.log('SSO: Auto-redirect enabled — sending user to ICCN login...');
            try {
              await initKeycloakAndLogin();
              return;
            } catch (err) {
              console.error('SSO: Auto-redirect failed:', err);
            }
          }
        }
      } catch (err) {
        console.error('SSO mount handler error:', err);
        if (!cancelled) {
          if (isCallback) {
            setSsoError(err instanceof Error ? err.message : 'SSO login failed');
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      } finally {
        if (!cancelled) {
          setSsoLoading(false);
          setSsoChecking(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [exchangeToken]);

  const triggerSsoLogin = useCallback(async () => {
    setSsoLoading(true);
    setSsoError(null);
    try {
      console.log('SSO: User triggered SSO login...');
      await initKeycloakAndLogin();
      // If we get here without redirect, something went wrong
    } catch (err) {
      console.error('SSO: triggerSsoLogin error:', err);
      setSsoError('Gagal terhubung ke SSO ICCN. Silakan coba lagi.');
      setSsoLoading(false);
    }
  }, []);

  const triggerSsoLogout = useCallback(async () => {
    await supabase.auth.signOut();
    keycloakLogout();
  }, []);

  return (
    <SsoAuthContext.Provider
      value={{
        ssoLoading,
        ssoAuthenticated,
        ssoError,
        ssoChecking,
        triggerSsoLogin,
        triggerSsoLogout,
      }}
    >
      {children}
    </SsoAuthContext.Provider>
  );
}

const defaultSsoAuth: SsoAuthContextType = {
  ssoLoading: false,
  ssoAuthenticated: false,
  ssoError: null,
  ssoChecking: false,
  triggerSsoLogin: () => { console.warn('SSO: triggerSsoLogin called outside SsoAuthProvider'); },
  triggerSsoLogout: () => { console.warn('SSO: triggerSsoLogout called outside SsoAuthProvider'); },
};

export function useSsoAuth() {
  const context = useContext(SsoAuthContext);
  return context ?? defaultSsoAuth;
}
