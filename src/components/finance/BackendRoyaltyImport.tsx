import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { royaltiesApi, type RoyaltyImport, type RoyaltyPreview } from '@/api/royalties';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const amount = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/);
const text = z.string().trim().min(1).max(200).refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
const statement = z.object({ source: text, period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('IDR'), filename: text,
  rows: z.array(z.object({ source_row_id: text, beneficiary_id: z.string().uuid().optional(), artist_id: z.string().uuid().optional(), release_id: z.string().uuid(),
    track_id: z.string().uuid(), platform: text.optional(), gross_amount: amount, deduction_amount: amount, net_amount: amount }).strict()
    .refine(row => Boolean(row.beneficiary_id || row.artist_id), 'beneficiary_id atau artist_id wajib diisi.')).min(1).max(1000),
}).strict();

export function BackendRoyaltyImport() {
  const { user, isAdmin } = useAuth();
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<RoyaltyPreview | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [offset, setOffset] = useState(0);
  const history = useQuery({ queryKey: ['backend-royalty-imports', user?.id, offset], enabled: !!user && isAdmin,
    queryFn: () => royaltiesApi.history(offset), retry: false });
  const run = async (commit: boolean) => {
    if (!isAdmin || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(''); setResult('');
    try {
      if (source.length > 900000) throw new Error('Pernyataan terlalu besar.');
      const body = statement.parse(JSON.parse(source)) as RoyaltyImport;
      if (commit) {
        if (!preview?.checksum || preview.invalid_rows || preview.unknown_mappings || preview.duplicates) throw new Error('Validasi backend diperlukan.');
        const saved = await royaltiesApi.commit(body);
        setResult(`Batch ${saved.id}: ${saved.replayed ? 'sudah tersimpan' : 'tersimpan'}, belum direkonsiliasi.`);
        setPreview(null); await history.refetch();
      } else setPreview(await royaltiesApi.preview(body));
    } catch { setError('Operasi gagal. Periksa format, pemetaan ID, hak akses dan koneksi. Tidak ada keberhasilan yang dikonfirmasi.'); if (!commit) setPreview(null); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <DashboardLayout><section className="space-y-4"><h1 className="text-2xl font-bold">Impor royalti</h1>
    <p>Impor pernyataan JSON IDR, maksimum 1000 baris. Gunakan ID backend eksplisit dan nominal string desimal. Impor tidak menambah saldo tersedia sebelum rekonsiliasi.</p>
    {!isAdmin ? <p role="alert">Akses admin diperlukan.</p> : <>
      <label className="block">Pernyataan JSON<Textarea className="min-h-48 font-mono" value={source} disabled={busy} onChange={event => { setSource(event.target.value); setPreview(null); setError(''); setResult(''); }} /></label>
      <div className="flex gap-2"><Button disabled={busy || !source} onClick={() => void run(false)}>Validasi</Button><Button disabled={busy || !preview?.checksum || !!preview.invalid_rows || !!preview.unknown_mappings || !!preview.duplicates} onClick={() => void run(true)}>Simpan impor tervalidasi</Button></div>
      {busy && <p role="status">Memproses…</p>}{error && <p role="alert">{error}</p>}{result && <p role="status">{result}</p>}
      {preview && <section aria-label="Hasil validasi"><p>Valid: {preview.valid_rows}; tidak valid: {preview.invalid_rows}; duplikat: {preview.duplicates}; pemetaan tidak dikenal: {preview.unknown_mappings}</p><p>Total: {preview.currency} {preview.total_amount}</p>{preview.warnings.map(w => <p key={w}>{w}</p>)}{preview.errors.map((e, i) => <p key={i}>Baris {e.row}: {e.code}</p>)}</section>}
      <h2 className="text-lg font-semibold">Riwayat impor</h2>
      {history.isFetching && <p role="status">Memuat…</p>}{history.isError && <p role="alert">Gagal memuat riwayat impor.</p>}
      {history.data && !history.isError && <ul className="space-y-2">{history.data.items.map(item => <li key={item.id} className="break-all rounded border p-3">{item.period} · {item.filename} · {item.currency} {item.total_amount} · {item.status} · {item.id}</li>)}</ul>}
      {history.data?.items.length === 0 && !history.isError && <p>Belum ada impor.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={busy || history.isFetching || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</Button><Button variant="outline" disabled={busy || history.isFetching || history.isError || !history.data || history.data.items.length < 50} onClick={() => setOffset(offset + 50)}>Berikutnya</Button></div>
    </>}
  </section></DashboardLayout>;
}
