import { useEffect, useState } from 'react';
import { auditApi, type AuditEntry, type AuditFilter } from '@/api/audit';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function BackendAuditLogs() {
  const { user, isAdmin, loading } = useAuth();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<AuditFilter>({ action: '', resource: '', actor: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const load = async (offset = 0) => {
    setBusy(true); setError(''); setDetail(null);
    try { const page = await auditApi.list({ ...filter, from: filter.from ? new Date(filter.from).toISOString() : undefined, to: filter.to ? new Date(filter.to).toISOString() : undefined, limit: 50, offset }); setItems(page.items); setNextOffset(page.nextOffset); }
    catch { setItems([]); setError('Gagal memuat audit'); }
    finally { setBusy(false); }
  };
  const userId = user?.id;
  useEffect(() => {
    setItems([]); setNextOffset(null);
    if (!userId || !isAdmin) return;
    const controller = new AbortController();
    setBusy(true);
    auditApi.list({ limit: 50 }, controller.signal).then(page => {
      if (!controller.signal.aborted) { setItems(page.items); setNextOffset(page.nextOffset); }
    }).catch(() => { if (!controller.signal.aborted) setError('Gagal memuat audit'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [userId, isAdmin]);
  if (loading) return <DashboardLayout><p role="status">Memuat…</p></DashboardLayout>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <DashboardLayout><div className="space-y-4"><h1 className="text-2xl font-bold">Audit Logs</h1>
    <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void load(); }}>{(['actor', 'action', 'resource', 'from', 'to'] as const).map(key => <label key={key}>{key}<Input type={key === 'from' || key === 'to' ? 'datetime-local' : 'text'} value={filter[key] || ''} onChange={event => setFilter({ ...filter, [key]: event.target.value })} /></label>)}<Button disabled={busy} type="submit">Cari</Button></form>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Memuat…</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Waktu', 'Actor', 'Action', 'Resource', 'ID', 'Detail'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.id}>{[new Date(item.created_at).toLocaleString('id-ID'), item.actor_user_id, item.action, item.resource_type, item.resource_id].map((value, index) => <td key={index} className="p-2 break-all">{value || '—'}</td>)}<td><Button variant="outline" size="sm" onClick={() => { setError(''); void auditApi.detail(item.id).then(setDetail).catch(() => setError('Gagal memuat detail audit')); }}>Detail</Button></td></tr>)}</tbody></table></div>
    {detail && <section aria-label="Detail audit" className="rounded-lg border p-3 text-sm"><h2 className="font-semibold">Detail audit</h2><dl>{(['id', 'created_at', 'actor_user_id', 'action', 'resource_type', 'resource_id'] as const).map(key => <div key={key} className="flex gap-3 break-all"><dt className="font-medium">{key}</dt><dd>{detail[key] ?? '—'}</dd></div>)}</dl></section>}
    {!busy && !error && !items.length && <p>Tidak ada audit</p>}
    <Button disabled={busy || nextOffset === null} onClick={() => nextOffset !== null && void load(nextOffset)}>Berikutnya</Button>
  </div></DashboardLayout>;
}
