import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { paymentsApi, type AdminPaymentInvoice } from '@/api/payments';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BackendPaymentStatus } from './BackendPaymentStatus';

const amount = (minor: string) => `Rp ${new Intl.NumberFormat('id-ID').format(Number(BigInt(minor) / 100n))}`;
const date = (value: string | null) => value ? new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date(value)) : '-';
const statusLabel: Record<string, string> = { PENDING: 'Belum Bayar', PAID: 'Lunas', FAILED: 'Gagal', REFUNDED: 'Dikembalikan' };

export function BackendAdminInvoices() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['admin-payment-invoices', status, offset], enabled: isAdmin,
    queryFn: ({ signal }) => paymentsApi.adminInvoices(status, offset, signal), retry: false });
  if (!authLoading && !isAdmin) return <BackendPaymentStatus />;

  const invoices = (query.data?.invoices ?? []).filter((invoice: AdminPaymentInvoice) =>
    [invoice.release_title, invoice.release_artist, invoice.user_name, invoice.user_email ?? '']
      .some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const download = async (id: string) => {
    const target = window.open('about:blank', '_blank');
    if (!target) {
      toast.error('Izinkan pop-up untuk mengunduh invoice');
      return;
    }
    target.opener = null;
    setDownloadingId(id);
    try {
      const result = await paymentsApi.downloadInvoice(id);
      target.location.replace(result.url);
    } catch {
      target.close();
      toast.error('Gagal menyiapkan PDF invoice');
    } finally {
      setDownloadingId(null);
    }
  };

  return <DashboardLayout><div className="space-y-6">
    <div><h1 className="text-2xl md:text-3xl font-bold">Invoice Pembayaran</h1>
      <p className="text-muted-foreground">Daftar pembayaran release dari backend. PDF hanya tersedia setelah pembayaran lunas.</p></div>
    <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
      <CardTitle>Daftar Invoice ({query.data?.total ?? 0})</CardTitle>
      <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Cari invoice" placeholder="Cari release, artis, atau user..." value={search}
          onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
    </CardHeader><CardContent>
      <Tabs value={status} onValueChange={value => { setStatus(value); setOffset(0); }} className="mb-4"><TabsList>
        <TabsTrigger value="all">Semua</TabsTrigger><TabsTrigger value="pending">Belum Bayar</TabsTrigger>
        <TabsTrigger value="paid">Lunas</TabsTrigger><TabsTrigger value="failed">Gagal</TabsTrigger>
        <TabsTrigger value="refunded">Dikembalikan</TabsTrigger>
      </TabsList></Tabs>
      {query.isLoading || authLoading ? <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin" /></div>
        : query.isError ? <div role="alert" className="py-8 text-center text-destructive">Daftar invoice tidak dapat dimuat. Muat ulang halaman atau periksa akses admin.</div>
        : invoices.length === 0 ? <div className="py-12 text-center text-muted-foreground"><FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />Tidak ada invoice.</div>
        : <><div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>Release</TableHead><TableHead>User</TableHead><TableHead>Track</TableHead>
          <TableHead className="text-right">Jumlah</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead>PDF</TableHead>
        </TableRow></TableHeader><TableBody>{invoices.map(invoice => <TableRow key={invoice.id}>
          <TableCell><p className="font-medium">{invoice.release_title || '-'}</p><p className="text-xs text-muted-foreground">{invoice.release_artist || '-'}</p></TableCell>
          <TableCell><p>{invoice.user_name || '-'}</p><p className="text-xs text-muted-foreground">{invoice.user_email || '-'}</p></TableCell>
          <TableCell>{invoice.track_count}</TableCell><TableCell className="text-right font-medium">{amount(invoice.amount_minor)}</TableCell>
          <TableCell><Badge variant={invoice.status === 'PAID' ? 'default' : 'secondary'}>{statusLabel[invoice.status] ?? invoice.status}</Badge></TableCell>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{date(invoice.paid_at || invoice.created_at)}</TableCell>
          <TableCell>{invoice.status === 'PAID' ? <Button variant="ghost" size="sm" aria-label={`Unduh invoice ${invoice.id}`}
            disabled={downloadingId === invoice.id} onClick={() => void download(invoice.id)}>
            {downloadingId === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          </Button> : '-'}</TableCell>
        </TableRow>)}</TableBody></Table></div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Menampilkan {offset + 1}–{Math.min(offset + invoices.length, query.data?.total ?? 0)} dari {query.data?.total ?? 0}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0 || query.isFetching}
            onClick={() => setOffset(value => Math.max(0, value - 100))}>Sebelumnya</Button>
            <Button variant="outline" size="sm" disabled={offset + 100 >= (query.data?.total ?? 0) || query.isFetching}
              onClick={() => setOffset(value => value + 100)}>Berikutnya</Button></div>
        </div></>}
    </CardContent></Card>
  </div></DashboardLayout>;
}
