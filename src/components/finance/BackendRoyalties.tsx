import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { royaltiesApi, type RoyaltyReportRow } from '@/api/royalties';
import { balanceApi } from '@/api/balance';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAGE_SIZE = 50;

export function BackendRoyalties() {
  const { user, role } = useAuth();
  const custom = role === 'label_custom';
  const admin = role === 'admin' || role === 'superadmin';
  const [draft, setDraft] = useState({ period: '', search: '', artist_id: '', release_id: '' });
  const [filters, setFilters] = useState({ ...draft });
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const report = useQuery({
    queryKey: ['backend-royalty-report', user?.id, filters, offset], enabled: !!user,
    queryFn: ({ signal }) => royaltiesApi.report({ ...filters, limit: PAGE_SIZE, offset }, signal), retry: false,
  });
  const periods = useQuery({ queryKey: ['backend-royalty-periods', user?.id], enabled: !!user,
    queryFn: ({ signal }) => royaltiesApi.periods(signal), retry: false });
  const balance = useQuery({ queryKey: ['backend-finance-balance', user?.id], enabled: !!user && custom,
    queryFn: ({ signal }) => balanceApi.get(signal), retry: false });
  const loading = report.isFetching || periods.isFetching || balance.isFetching;
  const reload = () => { void report.refetch(); void periods.refetch(); if (custom) void balance.refetch(); };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: RoyaltyReportRow[] = [];
      for (let exportOffset = 0;; exportOffset += 200) {
        const page = await royaltiesApi.report({ ...filters, limit: 200, offset: exportOffset });
        rows.push(...page.items);
        if (page.items.length < 200) break;
      }
      const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const header = ['period','isrc','upc','release_title','track_title','artist_name','label_name','platform','country',
        'sales_type','sales_unit','net_revenue','owner_revenue','corrected'];
      const csv = [header, ...rows.map(row => header.map(key => row[key as keyof RoyaltyReportRow]))]
        .map(row => row.map(quote).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `royalti-${filters.period || 'semua'}-${new Date().toISOString().slice(0,10)}.csv`;
      anchor.click(); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };
  const summary = report.data?.summary;
  return <DashboardLayout><section className="min-w-0 space-y-5">
    <header><h1 className="text-2xl font-bold">{custom ? 'Royalti unit / PIC' : admin ? 'Laporan royalti global' : 'Royalti'}</h1>
      <p className="text-muted-foreground">Data berasal dari ledger royalti backend dan mengikuti scope role akun aktif.</p></header>
    {custom && <p>Rincian artis hanya laporan internal. Saldo dan payout tetap milik PIC; artis katalog tidak memiliki login atau wallet.</p>}
    {custom && (!balance.data || balance.data.status !== 'RECONCILED') && <p role="status">RECONCILIATION_REQUIRED: payout diblokir sampai rekonsiliasi backend disetujui.</p>}
    {loading && <p role="status">Memuat...</p>}
    {(report.isError || periods.isError || balance.isError) && <p role="alert">Gagal memuat laporan atau akses role tidak tersedia.</p>}
    {summary && <dl className="grid gap-4 sm:grid-cols-3">{[
      ['Pendapatan bruto scope', summary.owner_gross_revenue], ['Koreksi scope', summary.owner_corrections],
      ['Pendapatan aktif scope', summary.owner_revenue],
    ].map(([title, amount]) => <div key={title} className="rounded-lg border p-4"><dt>{title}</dt><dd className="break-all font-semibold">IDR {amount}</dd></div>)}</dl>}
    {custom && balance.data && <dl className="grid gap-4 sm:grid-cols-3">{[
      ['Saldo tersedia', balance.data.status === 'RECONCILED' && balance.data.available !== null ? `IDR ${balance.data.available}` : 'Belum dikonfirmasi'],
      ['Dicadangkan', `IDR ${balance.data.reserved}`], ['Dibayar', `IDR ${balance.data.settled}`],
    ].map(([title, value]) => <div key={title} className="rounded-lg border p-4"><dt>{title}</dt><dd className="break-all">{value}</dd></div>)}</dl>}
    <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-5" onSubmit={event => {
      event.preventDefault(); setFilters({ ...draft }); setOffset(0);
    }}>
      <label>Periode<select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.period}
        onChange={event => setDraft({ ...draft, period: event.target.value })}><option value="">Semua periode</option>
        {periods.data?.items.map(period => <option key={period} value={period}>{period}</option>)}</select></label>
      <label>Pencarian<Input value={draft.search} placeholder="ISRC, judul, artis, platform" onChange={event => setDraft({ ...draft, search: event.target.value })} /></label>
      <label>ID artis<Input value={draft.artist_id} onChange={event => setDraft({ ...draft, artist_id: event.target.value })} /></label>
      <label>ID release<Input value={draft.release_id} onChange={event => setDraft({ ...draft, release_id: event.target.value })} /></label>
      <Button className="self-end" type="submit" disabled={loading}>Terapkan filter</Button>
    </form>
    {report.data && <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><caption className="sr-only">Laporan royalti sesuai scope role</caption>
      <thead><tr>{['Periode','ISRC','Release / Track','Artis / Label','Platform','Negara','Unit','Net DSP','Hak akun','Status'].map(title => <th scope="col" className="p-3 text-left" key={title}>{title}</th>)}</tr></thead>
      <tbody>{report.data.items.map(item => <tr className="border-t" key={item.id}>{[
        item.period,item.isrc || '-',`${item.release_title} / ${item.track_title}`,`${item.artist_name} / ${item.label_name || '-'}`,
        item.platform || '-',item.country || '-',item.sales_unit ?? '-',`IDR ${item.net_revenue}`,`IDR ${item.owner_revenue}`,
        item.corrected ? 'Dikoreksi' : 'Aktif',
      ].map((value,index) => <td className="min-w-28 p-3 align-top" key={index}>{value}</td>)}</tr>)}</tbody></table>
      {!report.data.items.length && <p className="p-4">Belum ada data royalti sesuai filter.</p>}</div>}
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Sebelumnya</Button>
      <Button variant="outline" disabled={loading || !report.data || offset + PAGE_SIZE >= report.data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya</Button>
      <Button variant="outline" disabled={loading || exporting || report.isError} onClick={() => void exportCsv()}>{exporting ? 'Mengekspor...' : 'Export CSV sesuai filter'}</Button>
      <Button variant="outline" disabled={loading} onClick={reload}>Muat ulang</Button>
      {report.data && <span className="text-sm text-muted-foreground">{report.data.total.toLocaleString('id-ID')} baris</span>}</div>
  </section></DashboardLayout>;
}