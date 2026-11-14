import { PicReadinessReview } from './PicReadinessReview';
import { picPayoutRequest } from './picPayoutRequest';
import { PicDestinationStatus } from './PicDestinationStatus';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { payoutsApi, type BackendPayout, type PayoutRequest } from '@/api/payouts';
import { mediaApi } from '@/api/media';
import { uploadBackendMedia } from '@/services/media';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { z } from 'zod';
import { SoundpubApiError } from '@/api/client';

export function BackendPayouts({ admin = false }: { admin?: boolean }) {
  const { user, isAdmin, role } = useAuth();
  const custom = role === 'label_custom';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [proofFiles, setProofFiles] = useState<Record<string, File | undefined>>({});
  const [proofEvidence, setProofEvidence] = useState<Record<string, string>>({});
  const settlement = useRef<{ payoutId: string; proofId: string; evidence: string; key: string } | null>(null);
  const [draft, setDraft] = useState<PayoutRequest>({ amount: '', currency: 'IDR', bank_name: '', account_number: '', account_holder_name: '' });
  // ponytail: retry keys survive component lifetime only; add persisted operation receipts before cross-session recovery.
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const [offset, setOffset] = useState(0);
  const allowed = !!user && (!admin || isAdmin);
  const query = useQuery({ queryKey: ['backend-payouts', user?.id, admin, offset], enabled: allowed,
    queryFn: () => payoutsApi.list(admin, offset), retry: false });
  const eligibility = useQuery({ queryKey: ['backend-payout-eligibility', user?.id], enabled: allowed && !admin,
    queryFn: payoutsApi.eligibility, retry: false });
  const destination = useQuery({ queryKey: ['backend-pic-destination', user?.id], enabled: allowed && custom && !admin,
    queryFn: ({ signal }) => payoutsApi.destination(signal), retry: false });
  const canRequest = !eligibility.isFetching && !eligibility.isError && eligibility.data?.eligible === true
    && eligibility.data.available !== null && (!custom || (!destination.isFetching && !destination.isError && destination.data?.destination?.verified === true));
  const settlePayout = async (payout: BackendPayout) => {
    const evidence = (proofEvidence[payout.id] ?? '').trim();
    const file = proofFiles[payout.id];
    if (!allowed || !isAdmin || payout.status !== 'approved' || !evidence || inFlight.current || operation.current) return;
    if (settlement.current && (settlement.current.payoutId !== payout.id || settlement.current.evidence !== evidence)) {
      setError('Selesaikan atau muat ulang settlement sebelumnya sebelum mengubah bukti.'); return;
    }
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!settlement.current) {
        if (!file) throw new Error('Pilih bukti transfer terlebih dahulu.');
        const object = await uploadBackendMedia(file, { category: 'PAYOUT_PROOF', resource_type: 'payout', resource_id: payout.id });
        settlement.current = { payoutId: payout.id, proofId: object.id, evidence, key: crypto.randomUUID() };
      }
      const pending = settlement.current;
      if (!pending || pending.payoutId !== payout.id || pending.evidence !== evidence) throw new Error('Settlement tertunda tidak cocok.');
      const row = await payoutsApi.settle(payout.id, { proof_media_id: pending.proofId, evidence }, pending.key);
      settlement.current = null;
      setProofFiles(current => ({ ...current, [payout.id]: undefined }));
      setMessage(`Pencairan ${row.id}: ${row.status}`);
      await query.refetch();
    } catch {
      setError('Settlement belum terkonfirmasi. Coba ulangi aksi yang sama; bukti dan kunci idempotensi dipertahankan.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const downloadProof = async (id: string) => {
    try {
      const capability = await mediaApi.download(id);
      const link = document.createElement('a'); link.href = capability.url; link.rel = 'noopener noreferrer'; link.target = '_blank';
      document.body.append(link); link.click(); link.remove();
    } catch { setError('Bukti pembayaran tidak dapat diunduh.'); }
  };  const perform = async (action: 'request' | 'cancel' | 'approved' | 'rejected' | 'failed', id?: string) => {
    if (inFlight.current || settlement.current || !allowed || (action === 'request' && !canRequest)) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const request = custom ? (action === 'request' ? picPayoutRequest(draft.amount, destination.data?.destination) : draft) : draft;
      if (action === 'request') z.object({ amount: z.string().regex(/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/),
        bank_name: z.string().trim().min(1).max(200), account_number: z.string().regex(/^[0-9]{4,40}$/),
        account_holder_name: z.string().trim().min(1).max(200), currency: z.literal('IDR') }).strict().parse(request);
      const payload = JSON.stringify({ actor: user?.id, action, id, ...(action === 'request' ? request : {}) });
      if (operation.current && operation.current.payload !== payload) throw new Error('Resolve previous operation first');
      operation.current ??= { payload, key: crypto.randomUUID() };
      const key = operation.current.key;
      const row = action === 'request' ? await payoutsApi.request({ ...request, idempotency_key: key })
        : action === 'cancel' ? await payoutsApi.cancel(id!, key) : await payoutsApi.transition(id!, action, key);
      operation.current = null;
      setMessage(`Pencairan ${row.id}: ${row.status}`);
      await query.refetch(); if (!admin) await eligibility.refetch();
    } catch (failure) {
      if (failure instanceof SoundpubApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 429) operation.current = null;
      setError('Operasi belum dikonfirmasi. Periksa input dan muat ulang status. Untuk mencoba lagi, gunakan aksi dan data yang sama.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <DashboardLayout><section className="space-y-4"><h1 className="text-2xl font-bold">Pencairan</h1>
    {admin && !isAdmin && <p role="alert">Akses admin diperlukan.</p>}
    {(query.isFetching || eligibility.isFetching) && <p role="status">Memuat…</p>}
    {(query.isError || eligibility.isError) && <p role="alert">Gagal memuat keuangan. Kelayakan pencairan belum dikonfirmasi. Rekonsiliasi dan verifikasi backend diperlukan sebelum pencairan.</p>}
    {eligibility.data && !eligibility.isError && <div><p>{eligibility.data.available === null ? 'Saldo belum tersedia hingga rekonsiliasi selesai.' : `Saldo tersedia: ${eligibility.data.currency} ${eligibility.data.available}`}</p><p>Minimum: {eligibility.data.currency} {eligibility.data.minimum}</p><p>{eligibility.data.eligible ? 'Memenuhi syarat' : eligibility.data.reasons.map(reason => reason === 'RECONCILIATION_REQUIRED' ? 'Rekonsiliasi diperlukan; pencairan diblokir.' : reason).join(', ')}</p></div>}
    <p>Status lunas hanya berasal dari konfirmasi backend.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {admin && isAdmin && <PicReadinessReview />}
    {custom && !admin && <PicDestinationStatus />}
    {!admin && <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void perform('request'); }}>
      {([['amount', 'Jumlah IDR (contoh 100000.00)'], ['bank_name', 'Bank'], ['account_number', 'Nomor rekening'], ['account_holder_name', 'Nama pemilik rekening']] as const).filter(([key]) => !custom || key === 'amount').map(([key, label]) => <label key={key}>{label}<Input required inputMode={key === 'amount' ? 'decimal' : key === 'account_number' ? 'numeric' : 'text'} pattern={key === 'amount' ? '(0|[1-9][0-9]{0,17})[.][0-9]{2}' : key === 'account_number' ? '[0-9]{4,40}' : undefined} value={draft[key]} disabled={busy || !!operation.current} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
      <Button type="submit" disabled={busy || !canRequest}>Ajukan pencairan</Button>
    </form>}
    {query.data && !query.isError && <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Riwayat pencairan</caption><thead><tr>{['ID', 'Pemilik rekening', 'Jumlah', 'Status', 'Tanggal', 'Aksi'].map(t => <th scope="col" className="p-2 text-left" key={t}>{t}</th>)}</tr></thead><tbody>{query.data.items.map(item => <tr key={item.id}><td className="p-2 break-all">{item.id}</td><td className="p-2 break-all">{item.account_holder_name}<br />{item.bank_name}</td><td className="p-2">{item.currency} {item.amount}</td><td className="p-2">{item.status}</td><td className="p-2">{new Date(item.created_at).toLocaleString('id-ID')}</td><td className="p-2"><div className="flex flex-wrap gap-2">{!admin && item.status === 'pending' && <Button variant="outline" disabled={busy} onClick={() => void perform('cancel', item.id)}>Batalkan</Button>}{admin && ['pending', 'approved'].includes(item.status) && <>{item.status === 'pending' && <Button variant="outline" disabled={busy} onClick={() => void perform('approved', item.id)}>Setujui</Button>}<Button variant="outline" disabled={busy} onClick={() => void perform('rejected', item.id)}>Tolak</Button><Button variant="outline" disabled={busy} onClick={() => void perform('failed', item.id)}>Gagal</Button></>}{admin && item.status === 'approved' && <div className="grid gap-2"><label>Bukti pembayaran <Input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy || (settlement.current !== null && settlement.current.payoutId !== item.id)} onChange={event => setProofFiles(current => ({ ...current, [item.id]: event.target.files?.[0] }))} /></label><label>Catatan transfer <Input required maxLength={200} value={proofEvidence[item.id] ?? ''} disabled={busy || (settlement.current !== null && settlement.current.payoutId !== item.id)} onChange={event => setProofEvidence(current => ({ ...current, [item.id]: event.target.value }))} /></label><Button variant="outline" disabled={busy || !(proofFiles[item.id] || settlement.current?.payoutId === item.id) || !(proofEvidence[item.id] ?? '').trim()} onClick={() => void settlePayout(item)}>Tandai lunas dengan bukti</Button></div>}{item.proof_media_id && <Button variant="outline" disabled={busy} onClick={() => void downloadProof(item.proof_media_id!)}>Lihat bukti</Button>}</div></td></tr>)}</tbody></table>{!query.data.items.length && <p>Belum ada pencairan.</p>}</div>}
    <div className="flex gap-2"><Button variant="outline" disabled={!allowed || query.isFetching || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</Button><Button variant="outline" disabled={!allowed || query.isFetching || !query.data || query.isError || query.data.items.length < 50} onClick={() => setOffset(offset + 50)}>Berikutnya</Button><Button variant="outline" disabled={!allowed || query.isFetching} onClick={() => { void query.refetch(); if (!admin) void eligibility.refetch(); }}>Muat ulang</Button></div>
  </section></DashboardLayout>;
}
