import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { payoutsApi } from '@/api/payouts';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PicDestinationStatus() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const destination = useQuery({ queryKey: ['backend-pic-destination', user?.id], enabled: !!user,
    queryFn: ({ signal }) => payoutsApi.destination(signal), retry: false });
  const [draft, setDraft] = useState({ bank_name: '', account_number: '', account_holder_name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || !user || uncertain) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await payoutsApi.updateDestination(draft);
      setDraft({ bank_name: '', account_number: '', account_holder_name: '' });
      setMessage('Rekening tersimpan. Verifikasi admin independen diperlukan sebelum pencairan.');
      await Promise.all([cache.invalidateQueries({ queryKey: ['backend-pic-destination', user.id] }), cache.invalidateQueries({ queryKey: ['backend-payout-eligibility', user.id] })]);
    } catch {
      setUncertain(true);
      setError('Rekening belum dikonfirmasi. Muat ulang status sebelum mengirim ulang.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { lock.current = false; setBusy(false); }
  };
  const current = destination.isError ? null : destination.data?.destination;
  return <section aria-label="Tujuan pencairan PIC" className="space-y-3 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Rekening PIC</h2>
    <p className="break-all text-sm">ID PIC: {user?.id}</p>
    <p>Saldo dan pencairan hanya milik PIC. Artis katalog tidak memiliki wallet, login, atau payout. Rekening wajib milik PIC; nama artis bukan penerima.</p>
    {destination.isFetching && <p role="status">Memuat rekening…</p>}
    {destination.isError && <p role="alert">Status rekening tidak tersedia. Pencairan dinonaktifkan.</p>}
    {current && <p role="status">{current.verified ? 'Terverifikasi' : 'Menunggu verifikasi admin'}: {current.bank_name} · {current.account_holder_name} · ••••{current.account_number.slice(-4)}</p>}
    {current && <p className="break-all text-sm">ID rekening untuk review admin: {current.id}</p>}
    {destination.data && !destination.isError && !current && <p role="status">Belum ada rekening PIC.</p>}
    <p>Mengganti rekening memerlukan verifikasi baru. Rekonsiliasi dan persetujuan backend tetap diperlukan.</p>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
      {([['bank_name', 'Bank'], ['account_number', 'Nomor rekening PIC'], ['account_holder_name', 'Nama pemilik rekening PIC']] as const).map(([key, label]) => <label key={key}>{label}<Input required maxLength={key === 'account_number' ? 40 : 200} minLength={key === 'account_number' ? 4 : 1} pattern={key === 'account_number' ? '[0-9]{4,40}' : undefined} inputMode={key === 'account_number' ? 'numeric' : 'text'} autoComplete="off" value={draft[key]} disabled={busy} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
      <Button type="submit" disabled={busy || uncertain || destination.isFetching || destination.isError}>{busy ? 'Menyimpan…' : 'Simpan rekening untuk verifikasi'}</Button>
    </form>
    {error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <Button variant="outline" disabled={busy || destination.isFetching} onClick={() => { void destination.refetch().then(result => { if (!result.isError) setUncertain(false); }); }}>Muat ulang rekening</Button>
  </section>;
}
