import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  initKeycloakSilent,
  initKeycloakAndLogin,
  initSsoPromptNone,
  getToken,
  keycloakLogout,
  isSsoCallback,
  getSsoCallbackParams,
  consumeStoredPkceState,
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
const SSO_PROMPT_NONE_TRIED_KEY = 'Soundpub_iccn_prompt_none_tried';
const SSO_EXCHANGE_KEY = 'Soundpub_iccn_exchange_key';

export function SsoAuthProvider({ children }: { children: ReactNode }) {
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoAuthenticated, setSsoAuthenticated] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoChecking, setSsoChecking] = useState(false);
  const exchangedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const exchangeToken = useCallback(async (payload: { keycloakToken?: string; code?: string; redirectUri?: string; codeVerifier?: string | null }) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/sso-login`;

      console.log('SSO: Exchanging token with edge function:', functionUrl);
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(payload.keycloakToken ? { keycloak_token: payload.keycloakToken } : {}),
          ...(payload.code ? { code: payload.code } : {}),
          ...(payload.redirectUri ? { redirect_uri: payload.redirectUri } : {}),
          ...(payload.codeVerifier ? { code_verifier: payload.codeVerifier } : {}),
        }),
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
      // Clean up both query string AND hash fragment (Keycloak fragment mode)
      window.history.replaceState({}, '', window.location.pathname);
      console.log('SSO: Token exchange success — Supabase session established');
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
      if (location.pathname === '/iccn/iframe') return;

      // Guard against React StrictMode double-invocation reusing the same code
      if (exchangedRef.current) return;
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
        console.log('SSO: Callback detected (query or hash) — processing with Keycloak...');
      } else {
        setSsoChecking(true);
      }
      setSsoError(null);

      try {
        if (isCallback) {
          exchangedRef.current = true;
          const callback = getSsoCallbackParams();
          if (callback.error) {
            if (callback.error === 'login_required') {
              sessionStorage.setItem(SSO_PROMPT_NONE_TRIED_KEY, 'true');
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
            throw new Error(callback.errorDescription || callback.error);
          }

          if (!callback.code) throw new Error('SSO: Authorization code tidak ditemukan');

          const exchangeKey = `${callback.state || 'no-state'}:${callback.code}`;
          if (sessionStorage.getItem(SSO_EXCHANGE_KEY) === exchangeKey) {
            console.warn('SSO: Authorization code was already processed; clearing stale callback URL');
            window.history.replaceState({}, '', window.location.pathname);
            setSsoError('Sesi SSO sudah diproses. Silakan klik Login via SSO lagi.');
            return;
          }

          const storedPkce = consumeStoredPkceState(callback.state);
          console.log('SSO: Callback params parsed, exchanging authorization code...', 'hasPkce:', !!storedPkce?.codeVerifier);
          if (!storedPkce?.codeVerifier) {
            console.warn('SSO: Missing PKCE verifier for callback state; not exchanging stale authorization code');
            window.history.replaceState({}, '', window.location.pathname);
            sessionStorage.removeItem(SSO_PROMPT_NONE_TRIED_KEY);
            setSsoError('Sesi SSO kedaluwarsa. Silakan klik Login via SSO lagi.');
            return;
          }

          sessionStorage.setItem(SSO_EXCHANGE_KEY, exchangeKey);
          window.history.replaceState({}, '', window.location.pathname);

          const ok = await exchangeToken({
            code: callback.code,
            redirectUri: storedPkce.redirectUri,
            codeVerifier: storedPkce.codeVerifier,
          });

          if (ok && !cancelled) {
            if (window.location.pathname === '/' || window.location.pathname === '/auth') {
              navigate('/dashboard', { replace: true });
            }
          }
          return;
        }

        const authenticated = (console.log('SSO: Running silent SSO check on mount...'), await initKeycloakSilent());

        if (cancelled) return;

        if (authenticated) {
          const token = getToken();
          console.log('SSO: Keycloak authenticated, token exists:', !!token);
          if (token) {
            const ok = await exchangeToken({ keycloakToken: token });
            if (ok) {
              // Set up periodic token refresh; sync Supabase when Keycloak refreshes.
              setupTokenRefresh(async (newToken) => {
                console.log('SSO: Re-exchanging refreshed Keycloak token...');
                await exchangeToken({ keycloakToken: newToken });
              });
              if (!cancelled) {
                // After a successful callback exchange, send the user into the app.
                const path = window.location.pathname;
                if (path === '/' || path === '/auth') {
                  navigate('/dashboard', { replace: true });
                }
              }
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
          // IMPORTANT: do NOT auto-redirect to ICCN login here. User must
          // explicitly click "Login via SSO" to be sent to the SSO page.
          clearSsoActive();
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
  }, [exchangeToken, navigate, location.pathname]);

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
    // Bersihkan semua cache data dari React Query sebelum mengalihkan user
    queryClient.clear();
    clearSsoActive();
    keycloakLogout();
  }, [queryClient]);

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
