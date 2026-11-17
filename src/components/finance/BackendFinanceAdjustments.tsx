import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeAdjustmentsApi, type FinanceAdjustment } from '@/api/finance-adjustments';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const formatMoney = (minor: string) => {
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${(absolute / 100n).toLocaleString('id-ID')}.${String(absolute % 100n).padStart(2, '0')}`;
};

export function BackendFinanceAdjustments() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState<'ALL' | FinanceAdjustment['status']>('PENDING');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestOperation = useRef<{ fingerprint: string; key: string } | null>(null);
  const reviewOperations = useRef(new Map<string, { fingerprint: string; key: string }>());
  const enabled = !!user && isAdmin;
  const owners = useQuery({ queryKey: ['finance-adjustment-owners', user?.id, search], enabled,
    queryFn: ({ signal }) => financeAdjustmentsApi.owners(search.trim(), signal), retry: false });
  const adjustments = useQuery({ queryKey: ['finance-adjustments', user?.id, filter], enabled,
    queryFn: ({ signal }) => financeAdjustmentsApi.list(filter === 'ALL' ? undefined : filter, signal), retry: false });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance-adjustments', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['finance-adjustment-owners', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['backend-payout-eligibility'] }),
      queryClient.invalidateQueries({ queryKey: ['backend-finance-balance'] }),
    ]);
  };
  const createRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enabled || busy || !ownerId) return;
    setBusy(true); setError(''); setMessage('');
    const payload = { owner_id: ownerId, amount: amount.trim(), reason: reason.trim() };
    const fingerprint = JSON.stringify(payload);
    if (requestOperation.current?.fingerprint !== fingerprint) {
      requestOperation.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      await financeAdjustmentsApi.request(payload, requestOperation.current.key);
      requestOperation.current = null;
      setAmount(''); setReason('');
      setMessage('Adjustment tersimpan sebagai pending. Admin lain harus memeriksa permintaan ini.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal membuat adjustment.'); }
    finally { setBusy(false); }
  };
  const review = async (item: FinanceAdjustment, decision: 'APPROVE' | 'REJECT') => {
    const note = (notes[item.id] ?? '').trim();
    if (!enabled || busy || note.length < 10) return;
    setBusy(true); setError(''); setMessage('');
    const payload = { version: item.version, decision, note };
    const fingerprint = JSON.stringify([item.id, payload]);
    let operation = reviewOperations.current.get(item.id);
    if (operation?.fingerprint !== fingerprint) {
      operation = { fingerprint, key: crypto.randomUUID() };
      reviewOperations.current.set(item.id, operation);
    }
    try {
      await financeAdjustmentsApi.review(item.id, payload, operation.key);
      reviewOperations.current.delete(item.id);
      setNotes(current => ({ ...current, [item.id]: '' }));
      setMessage(decision === 'APPROVE' ? 'Adjustment disetujui dan masuk ke ledger.' : 'Adjustment ditolak.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal memproses adjustment.'); }
    finally { setBusy(false); }
  };

  if (!enabled) return null;
  return <section className="space-y-5 rounded-lg border bg-card p-5" aria-labelledby="finance-adjustments-title">
    <header className="space-y-1">
      <h2 id="finance-adjustments-title" className="text-lg font-semibold">Penyesuaian saldo manual</h2>
      <p className="text-sm text-muted-foreground">Permintaan memerlukan alasan dan persetujuan admin berbeda. Persetujuan membuat entri ledger yang tidak dapat diubah.</p>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <form className="grid gap-3 rounded-md border p-4 sm:grid-cols-2" onSubmit={event => void createRequest(event)}>
      <label className="grid gap-1 text-sm sm:col-span-2">Cari pemilik saldo
        <Input value={search} onChange={event => setSearch(event.target.value)} maxLength={120} placeholder="Nama atau email" disabled={busy} />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">Pemilik saldo
        <select className="h-10 rounded-md border bg-background px-3" value={ownerId} onChange={event => setOwnerId(event.target.value)} disabled={busy || owners.isLoading} required>
          <option value="">Pilih artis, label, Whitelabel, atau PIC</option>
          {owners.data?.items.map(owner => <option key={owner.id} value={owner.id}>
            {(owner.full_name || owner.email || owner.id) + ' - ' + owner.roles.join(', ')}
          </option>)}
        </select>
      </label>
      {owners.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">Daftar pemilik saldo gagal dimuat.</p>}
      <label className="grid gap-1 text-sm">Jumlah IDR (+/-)
        <Input required inputMode="decimal" pattern="-?(0|[1-9][0-9]{0,15})[.][0-9]{2}" placeholder="100000.00 atau -100000.00"
          value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} />
      </label>
      <label className="grid gap-1 text-sm">Alasan permintaan
        <Input required minLength={10} maxLength={240} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
      </label>
      <Button type="submit" className="sm:col-span-2" disabled={busy || owners.isError || !ownerId}>Ajukan untuk persetujuan</Button>
      <p className="text-xs text-muted-foreground sm:col-span-2">Nilai positif menambah saldo; nilai negatif mengurangi saldo. Pengurangan melebihi saldo tersedia ditolak.</p>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-medium">Riwayat permintaan</h3>
      <select aria-label="Filter status adjustment" className="h-9 rounded-md border bg-background px-3 text-sm"
        value={filter} onChange={event => setFilter(event.target.value as typeof filter)} disabled={busy}>
        <option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option>
        <option value="REJECTED">Ditolak</option><option value="ALL">Semua</option>
      </select>
    </div>
    {adjustments.isFetching && <p role="status" className="text-sm">Memuat adjustment…</p>}
    {adjustments.isError && <p role="alert" className="text-sm text-destructive">Riwayat adjustment gagal dimuat.</p>}
    {!adjustments.isError && adjustments.data && <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Daftar penyesuaian saldo manual</caption>
        <thead><tr className="border-b text-muted-foreground"><th className="p-2">Pemilik / alasan</th><th className="p-2">Jumlah</th><th className="p-2">Status</th><th className="p-2">Pemohon / reviewer</th><th className="p-2">Tindakan</th></tr></thead>
        <tbody>{adjustments.data.items.map(item => <tr key={item.id} className="border-b align-top">
          <td className="p-2"><strong>{item.owner_name || item.owner_id}</strong><p className="mt-1 max-w-xs whitespace-normal text-muted-foreground">{item.reason}</p></td>
          <td className="p-2 tabular-nums">IDR {formatMoney(item.amount_minor)}</td>
          <td className="p-2">{item.status}</td>
          <td className="p-2">{item.requester_name || item.requested_by}<p className="text-muted-foreground">{item.reviewer_name || 'Belum ditinjau'}</p></td>
          <td className="p-2">{item.status === 'PENDING' ? <div className="grid min-w-52 gap-2">
            <label className="grid gap-1 text-xs">Catatan review
              <Input minLength={10} maxLength={240} value={notes[item.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} disabled={busy} />
            </label>
            <div className="flex gap-2"><Button size="sm" disabled={busy || item.requested_by === user?.id || (notes[item.id] ?? '').trim().length < 10} onClick={() => void review(item, 'APPROVE')}>Setujui</Button>
              <Button size="sm" variant="outline" disabled={busy || item.requested_by === user?.id || (notes[item.id] ?? '').trim().length < 10} onClick={() => void review(item, 'REJECT')}>Tolak</Button></div>
          </div> : <span className="text-muted-foreground">{item.decision_note || '—'}</span>}</td>
        </tr>)}</tbody>
      </table>
      {!adjustments.data.items.length && <p className="p-3 text-sm text-muted-foreground">Belum ada permintaan untuk filter ini.</p>}
    </div>}
    <Button variant="outline" disabled={busy || adjustments.isFetching} onClick={() => void Promise.all([adjustments.refetch(), owners.refetch()])}>Muat ulang</Button>
  </section>;
}
