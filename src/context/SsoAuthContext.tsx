import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { initKeycloak, getToken, keycloakLogin, keycloakLogout, isKeycloakAuthenticated } from '@/lib/keycloak';

interface SsoAuthContextType {
  ssoLoading: boolean;
  ssoAuthenticated: boolean;
  ssoError: string | null;
  triggerSsoLogin: () => void;
  triggerSsoLogout: () => void;
}

const SsoAuthContext = createContext<SsoAuthContextType | undefined>(undefined);

export function SsoAuthProvider({ children }: { children: ReactNode }) {
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoAuthenticated, setSsoAuthenticated] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);

  const exchangeToken = useCallback(async (keycloakToken: string) => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/sso-login`;

      console.log('SSO: Exchanging token with edge function:', functionUrl);
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_token: keycloakToken }),
      });

      const data = await resp.json();
      console.log('SSO: Edge function response status:', resp.status, 'data:', JSON.stringify(data).substring(0, 200));

      if (!resp.ok) {
        const detail = data.details ? ` (${JSON.stringify(data.details)})` : '';
        throw new Error(`${data.error || 'SSO login failed'}${detail}`);
      }

      // Set Supabase session
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (error) throw error;

      setSsoAuthenticated(true);
      return true;
    } catch (err) {
      console.error('SSO token exchange error:', err);
      setSsoError(err instanceof Error ? err.message : 'SSO login failed');
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const authenticated = await initKeycloak();
        
        if (cancelled) return;

        if (authenticated) {
          const token = getToken();
          if (token) {
            await exchangeToken(token);
          }
        }
      } catch (err) {
        console.error('SSO init error:', err);
        if (!cancelled) {
          setSsoError('SSO initialization failed');
        }
      } finally {
        if (!cancelled) {
          setSsoLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [exchangeToken]);

  const triggerSsoLogin = useCallback(() => {
    keycloakLogin();
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
        triggerSsoLogin,
        triggerSsoLogout,
      }}
    >
      {children}
    </SsoAuthContext.Provider>
  );
}

export function useSsoAuth() {
  const context = useContext(SsoAuthContext);
  if (!context) {
    throw new Error('useSsoAuth must be used within SsoAuthProvider');
  }
  return context;
}
