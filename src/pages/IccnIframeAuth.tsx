import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { initKeycloakSilent, initSsoPromptNone, getToken, isSsoCallback, getSsoCallbackParams, consumeStoredPkceState } from '@/lib/keycloak';
import { Loader2 } from 'lucide-react';

/**
 * Halaman embed untuk ICCN Super App.
 * - Cek session Supabase lokal dulu
 * - Kalau tidak ada, jalankan silent SSO check (user pasti sudah login di ICCN)
 * - Setelah session siap, redirect ke /dashboard
 */
export default function IccnIframeAuth() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Memuat Soundpub...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // 1. Cek session Supabase yang sudah ada
        const { data: { session } } = await supabase.auth.getSession();
        if (session && !cancelled) {
          setStatus('Mengarahkan ke dashboard...');
          navigate('/dashboard', { replace: true });
          return;
        }

        // 2. Tidak ada session — coba SSO
        setStatus('Menghubungkan ke ICCN SSO...');

        // Kalau callback param ada, exchange authorization code langsung via backend.
        if (isSsoCallback()) {
          const callback = getSsoCallbackParams();
          if (callback.error) throw new Error(callback.errorDescription || callback.error);
          if (!callback.code) throw new Error('Authorization code SSO tidak tersedia');

          const storedPkce = consumeStoredPkceState(callback.state);
          setStatus('Memverifikasi akun...');
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const resp = await fetch(`${supabaseUrl}/functions/v1/sso-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: callback.code,
              redirect_uri: storedPkce?.redirectUri || `${window.location.origin}/iccn/iframe`,
              ...(storedPkce?.codeVerifier ? { code_verifier: storedPkce.codeVerifier } : {}),
            }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Gagal exchange token');

          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });

          if (cancelled) return;
          window.history.replaceState({}, '', window.location.pathname);
          setStatus('Mengarahkan ke dashboard...');
          navigate('/dashboard', { replace: true });
          return;
        }

        const authenticated = await initKeycloakSilent();

        if (cancelled) return;

        if (authenticated) {
          const token = getToken();
          if (!token) throw new Error('Token SSO tidak tersedia');

          setStatus('Memverifikasi akun...');
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const resp = await fetch(`${supabaseUrl}/functions/v1/sso-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keycloak_token: token }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Gagal exchange token');

          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });

          if (cancelled) return;
          setStatus('Mengarahkan ke dashboard...');
          navigate('/dashboard', { replace: true });
        } else {
          // Silent check gagal — user belum login di ICCN, redirect manual
          setStatus('Mengarahkan ke halaman login ICCN...');
          await initSsoPromptNone(`${window.location.origin}/iccn/iframe`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
        console.error('IccnIframeAuth error:', err);
        if (!cancelled) setError(msg);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Gagal Memuat</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-primary underline"
            >
              Coba lagi
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
