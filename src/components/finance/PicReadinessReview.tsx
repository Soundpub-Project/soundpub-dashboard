import { useRef, useState } from 'react';
import { payoutsApi, type ReadinessReview } from '@/api/payouts';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PicReadinessReview() {
  const { user, isAdmin } = useAuth();
  const [owner, setOwner] = useState('');
  const [target, setTarget] = useState('');
  const [action, setAction] = useState<ReadinessReview['action']>('verify_destination');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  if (!isAdmin) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    setError(''); setMessage('');
    if (owner === user?.id) { setError('Review wajib dilakukan admin independen, bukan PIC pemilik.'); return; }
    const body: ReadinessReview = action === 'verify_destination' ? { action, destination_id: target, evidence }
      : action === 'approve_reconciliation' ? { action, evidence }
      : action === 'revoke_destination' ? { action, destination_id: target, reason: evidence }
      : { action, approval_id: target, reason: evidence };
    const fingerprint = JSON.stringify([owner, body]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    const idempotencyKey = attempt.current.key;
    lock.current = true; setBusy(true);
    try {
      const result = await payoutsApi.reviewReadiness(owner, body, idempotencyKey);
      setMessage(`Review backend dikonfirmasi: ${result.action} (${result.id}).`);
      attempt.current = null;
      setEvidence('');
    } catch {
      setError('Review belum dikonfirmasi. Periksa ID PIC, bukti, izin, dan hasil rekonsiliasi. Jangan menganggap rekening terverifikasi.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { lock.current = false; setBusy(false); }
  };
  return <section className="space-y-3 rounded-lg border p-4" aria-label="Verifikasi PIC dan persetujuan rekonsiliasi">
    <h2 className="text-lg font-semibold">Review keuangan PIC</h2>
    <p>Admin independen memverifikasi kepemilikan rekening PIC dan menyetujui bukti rekonsiliasi. Persetujuan ini tidak menandai payout lunas.</p>
    <p>Gunakan ID PIC dan ID rekening dari bukti review. Daftar rekening lintas PIC belum disediakan backend.</p>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <label>ID PIC<Input required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={owner} disabled={busy} onChange={event => setOwner(event.target.value)} /></label>
      <label>Aksi review<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={action} disabled={busy} onChange={event => { setAction(event.target.value as ReadinessReview['action']); setTarget(''); }}>
        <option value="verify_destination">Verifikasi rekening PIC</option><option value="approve_reconciliation">Setujui rekonsiliasi</option><option value="revoke_destination">Cabut verifikasi rekening</option><option value="revoke_reconciliation">Cabut persetujuan rekonsiliasi</option>
      </select></label>
      {action !== 'approve_reconciliation' && <label>{action === 'revoke_reconciliation' ? 'ID persetujuan' : 'ID rekening PIC'}<Input required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={target} disabled={busy} onChange={event => setTarget(event.target.value)} /></label>}
      <label>{action.startsWith('revoke') ? 'Alasan pencabutan' : 'Referensi bukti review'}<Input required maxLength={200} value={evidence} disabled={busy} onChange={event => setEvidence(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim keputusan review'}</Button>
    </form>
    {error && <p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
