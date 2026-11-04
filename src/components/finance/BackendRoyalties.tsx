import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { royaltiesApi, type RoyaltyBreakdown } from '@/api/royalties';
import { balanceApi } from '@/api/balance';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function BackendRoyalties() {
  const { user, role } = useAuth();
  const custom = role === 'label_custom';
  const [period, setPeriod] = useState('');
  const [ids, setIds] = useState({ artist_id: '', release_id: '' });
  const [filters, setFilters] = useState({ artist_id: '', release_id: '' });
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const query = useQuery({ queryKey: ['backend-royalties', user?.id], enabled: !!user,
    queryFn: ({ signal }) => royaltiesApi.summary(signal), retry: false });
  const balance = useQuery({ queryKey: ['backend-finance-balance', user?.id], enabled: !!user && custom,
    queryFn: ({ signal }) => balanceApi.get(signal), retry: false });
  const breakdown = useQuery({ queryKey: ['backend-royalty-breakdown', user?.id, period, filters, offset], enabled: !!user && custom,
    queryFn: ({ signal }) => royaltiesApi.breakdown({ period, offset, ...filters }, signal), retry: false });
  const loading = query.isFetching || balance.isFetching || breakdown.isFetching;
  const reload = () => { void query.refetch(); if (custom) { void balance.refetch(); void breakdown.refetch(); } };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: RoyaltyBreakdown['items'] = [];
      for (let exportOffset = 0;; exportOffset += 50) {
        const page = await royaltiesApi.breakdown({ period, offset: exportOffset, ...filters });
        rows.push(...page.items);
        if (page.items.length < 50) break;
      }
      const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
      const header = ['artist_id','release_id','track_id','platform','period','gross_earnings','corrections','net_earnings'];
      const csv = [header, ...rows.map(row => header.map(key => row[key as keyof typeof row]))]
        .map(row => row.map(quote).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `royalti-label-custom-${period || 'semua'}.csv`;
      anchor.click(); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };
  return <DashboardLayout><section className="min-w-0 space-y-4">
    <h1 className="text-2xl font-bold">{custom ? 'Royalti unit / PIC' : 'Royalti'}</h1>
    {custom && <p>Rincian artis adalah laporan internal. Seluruh saldo dan pencairan dimiliki PIC. Artis katalog tidak memiliki wallet, login, atau payout.</p>}
    <p>Jumlah laporan royalti bukan saldo tersedia untuk pencairan.</p>
    {(!custom || balance.isError || !balance.data || balance.data.status !== 'RECONCILED') && <p role="status">RECONCILIATION_REQUIRED: Saldo belum dikonfirmasi. Pencairan diblokir sampai rekonsiliasi disetujui backend.</p>}
    {loading && <p role="status">Memuat…</p>}
    {(query.isError || balance.isError || breakdown.isError) && <p role="alert">Gagal memuat keuangan atau akses tidak tersedia. Saldo belum dapat dikonfirmasi. Muat ulang untuk mencoba lagi.</p>}
    {query.data && !query.isError && <dl className="grid gap-4 sm:grid-cols-3">{[
      [custom ? 'Pendapatan bruto PIC' : 'Pendapatan bruto', query.data.gross_earnings], ['Koreksi', query.data.corrections],
      [custom ? 'Pendapatan bersih PIC' : 'Pendapatan bersih', query.data.net_earnings],
    ].map(([title, amount]) => <div key={title} className="rounded-lg border p-4"><dt>{title}</dt><dd className="break-all font-semibold">{query.data.currency} {amount}</dd></div>)}</dl>}
    {custom && balance.data && !balance.isError && <dl className="grid gap-4 sm:grid-cols-3">{[
      ['Saldo tersedia', balance.data.status === 'RECONCILED' && balance.data.available !== null ? `IDR ${balance.data.available}` : 'Belum dikonfirmasi — rekonsiliasi diperlukan'],
      ['Dicadangkan', `IDR ${balance.data.reserved}`], ['Dibayar', `IDR ${balance.data.settled}`],
    ].map(([title, value]) => <div key={title} className="rounded-lg border p-4"><dt>{title}</dt><dd className="break-all">{value}</dd></div>)}</dl>}
    {custom && <section className="space-y-3" aria-label="Laporan internal per artis, release, dan periode">
      <h2 className="text-xl font-semibold">Rincian internal</h2>
      <label className="block max-w-xs">Periode (semua jika kosong)<Input type="month" value={period} onChange={event => { setPeriod(event.target.value); setOffset(0); }} /></label>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); setFilters({ ...ids }); setOffset(0); }}>
        {(['artist_id', 'release_id'] as const).map(key => <label key={key}>{key === 'artist_id' ? 'ID artis (opsional)' : 'ID release (opsional)'}<Input pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={ids[key]} onChange={event => setIds({ ...ids, [key]: event.target.value })} /></label>)}
        <Button type="submit" disabled={loading}>Terapkan filter</Button>
      </form>
      {breakdown.data && !breakdown.isError && <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Royalti per artis, release, track, platform, dan periode; bukan wallet artis</caption><thead><tr>{['ID artis', 'ID release', 'ID track', 'Platform', 'Periode', 'Bruto', 'Koreksi', 'Bersih IDR'].map(title => <th scope="col" className="p-2 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{breakdown.data.items.map(item => <tr key={`${item.artist_id}:${item.release_id}:${item.track_id}:${item.platform}:${item.period}`}>{[item.artist_id, item.release_id, item.track_id, item.platform, item.period, item.gross_earnings, item.corrections, item.net_earnings].map((value, index) => <td key={index} className="min-w-32 break-all p-2">{value}</td>)}</tr>)}</tbody></table>{!breakdown.data.items.length && <p>Belum ada royalti untuk periode ini.</p>}</div>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</Button><Button variant="outline" disabled={loading || breakdown.isError || !breakdown.data || breakdown.data.items.length < 50} onClick={() => setOffset(offset + 50)}>Berikutnya</Button><Button variant="outline" disabled={loading || exporting || breakdown.isError} onClick={() => void exportCsv()}>{exporting ? 'Mengekspor…' : 'Export CSV sesuai filter'}</Button></div>
    </section>}
    <Button variant="outline" disabled={loading} onClick={reload}>Muat ulang</Button>
  </section></DashboardLayout>;
}
