import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { paymentsApi } from '@/api/payments';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function BackendPaymentStatus() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [releaseId, setReleaseId] = useState(params.get('release_id') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creating = useRef(false);
  const valid = z.string().uuid().safeParse(releaseId).success;
  const query = useQuery({ queryKey: ['backend-payment-status', user?.id, releaseId], enabled: !!user && valid,
    queryFn: ({ signal }) => paymentsApi.status(releaseId, signal), retry: false,
    refetchInterval: query => query.state.data?.invoice?.status === 'CREATING' ? 1500 : false });
  const invoice = query.data?.invoice;
  const create = async () => {
    if (!valid || !user || creating.current) return;
    creating.current = true; setBusy(true); setError('');
    try { await paymentsApi.create(releaseId); await query.refetch(); }
    catch { setError('Pembuatan invoice belum dikonfirmasi. Periksa status atau coba lagi untuk release yang sama.'); }
    finally { creating.current = false; setBusy(false); }
  };
  return <DashboardLayout><section className="space-y-4"><h1 className="text-2xl font-bold">Status pembayaran</h1>
    <p>Status diverifikasi melalui backend. Parameter URL tidak mengonfirmasi pembayaran. Provider mock hanya untuk pengujian.</p>
    <label className="block">ID release<Input value={releaseId} disabled={busy} onChange={event => setReleaseId(event.target.value)} aria-invalid={!!releaseId && !valid} /></label>
    {releaseId && !valid && <p role="alert">Masukkan UUID release yang valid.</p>}
    {error && <p role="alert">{error}</p>}
    {query.isFetching && <p role="status">Memuat…</p>}
    {query.isError && <p role="alert">Status pembayaran belum dapat dikonfirmasi.</p>}
    {query.data && !query.isError && (invoice ? <dl className="space-y-2"><div><dt>Invoice</dt><dd className="break-all">{invoice.id}</dd></div><div><dt>Jumlah dalam unit terkecil (presisi 2)</dt><dd>{invoice.currency} {invoice.amount_minor}</dd></div><div><dt>Pemilik pembayaran</dt><dd>{invoice.ownership_policy === 'LABEL_CUSTOM_PIC' ? 'PIC Label Custom' : 'Akun artis'}</dd></div><div><dt>Status backend</dt><dd>{invoice.status}</dd></div>{invoice.provider_invoice_url && <div><dt>Halaman pembayaran</dt><dd><a className="underline" href={invoice.provider_invoice_url} target="_blank" rel="noreferrer">Buka invoice Xendit</a></dd></div>}<div><dt>Rekonsiliasi</dt><dd>{query.data.reconciliation?.reconciled ? 'Terverifikasi' : 'Belum terverifikasi'}</dd></div>{query.data.reconciliation?.issues.length ? <div><dt>Isu</dt><dd>{query.data.reconciliation.issues.join(', ')}</dd></div> : null}</dl> : <p>Invoice belum tersedia.</p>)}
    {query.data && !query.isError && !invoice && <Button disabled={busy || query.isFetching} onClick={() => void create()}>Buat invoice</Button>}
    <Button variant="outline" disabled={!user || !valid || query.isFetching || busy} onClick={() => void query.refetch()}>Periksa status</Button>
  </section></DashboardLayout>;
}
