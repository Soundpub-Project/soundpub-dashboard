import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { apiRequest, maintenanceModeEvent } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export function MaintenanceModeScreen({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const queryClient = useQueryClient();
  const { role } = useAuth();

  useEffect(() => {
    const activate = () => setMaintenance(true);
    window.addEventListener(maintenanceModeEvent, activate);
    return () => window.removeEventListener(maintenanceModeEvent, activate);
  }, []);

  const retry = async () => {
    setRetrying(true);
    try {
      await apiRequest<{ id: string }>('/api/v1/me');
      setMaintenance(false);
      await queryClient.refetchQueries({ type: 'active' });
    } catch {
      setMaintenance(true);
    } finally {
      setRetrying(false);
    }
  };

  const bypassesMaintenance = role === 'admin' || role === 'superadmin';

  return (
    <>
      {children}
      {maintenance && !bypassesMaintenance && (
        <div className="fixed inset-0 z-[1000] min-h-dvh overflow-y-auto bg-background/95 px-4 py-8 backdrop-blur-md sm:px-6" role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title" aria-describedby="maintenance-description">
          <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl items-center justify-center">
            <section className="relative w-full overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-10">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <Wrench className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-sm font-medium text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Sesi Anda tetap aman
                  </div>
                </div>

                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Pemeliharaan sistem</p>
                <h1 id="maintenance-title" className="max-w-2xl text-balance text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Soundpub sedang menjalani pemeliharaan</h1>
                <p id="maintenance-description" className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Akses sementara dibatasi agar tim dapat menjaga sistem tetap stabil. Anda tidak perlu login ulang. Silakan coba lagi beberapa saat lagi.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button size="lg" className="min-h-12 gap-2" disabled={retrying} onClick={() => void retry()}>
                    <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {retrying ? 'Memeriksa kembali...' : 'Coba lagi'}
                  </Button>
                  <Button size="lg" variant="outline" className="min-h-12" onClick={() => window.location.reload()}>
                    Muat ulang halaman
                  </Button>
                </div>
              </div>
            </section>
          </main>
        </div>
      )}
    </>
  );
}
