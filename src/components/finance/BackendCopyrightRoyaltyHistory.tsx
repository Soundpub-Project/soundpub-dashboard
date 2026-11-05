import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { copyrightApi, type CopyrightRoyaltyBatch, type CopyrightRoyaltyImportDetail } from '@/api/copyright';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const money = (value: string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const statusLabel = (status: CopyrightRoyaltyBatch['status']) => status === 'RECONCILED' ? 'Terekonsiliasi'
  : status === 'CORRECTED' ? 'Dikoreksi penuh' : 'Belum direkonsiliasi';

export function BackendCopyrightRoyaltyHistory() {
  const [items, setItems] = useState<CopyrightRoyaltyBatch[]>([]);
  const [selected, setSelected] = useState<CopyrightRoyaltyImportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'detail' | 'correction' | 'reconciliation' | null>(null);
  const [error, setError] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setItems((await copyrightApi.listImports(100)).items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Riwayat gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const showDetail = async (id: string) => {
    setBusy('detail'); setError('');
    try { setSelected(await copyrightApi.getImport(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Detail gagal dimuat.'); }
    finally { setBusy(null); }
  };
  const correct = async () => {
    if (!selected || !reason.trim()) return;
    setBusy('correction');
    try {
      await copyrightApi.correctImport(selected.id, reason.trim());
      toast.success('Koreksi batch penuh berhasil dibuat.'); setCorrectionOpen(false); setReason(''); setSelected(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Koreksi gagal.'); }
    finally { setBusy(null); }
  };
  const reconcile = async () => {
    if (!selected || !evidence.trim()) return;
    setBusy('reconciliation');
    try {
      const result = await copyrightApi.reconcileImport(selected.id, evidence.trim());
      toast[result.result === 'MATCHED' ? 'success' : 'error'](result.result === 'MATCHED' ? 'Rekonsiliasi cocok.' : 'Rekonsiliasi menemukan ketidaksesuaian.');
      setEvidence(''); setSelected(await copyrightApi.getImport(selected.id)); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Rekonsiliasi gagal.'); }
    finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Riwayat Upload Royalti Hak Cipta</h1><p className="mt-1 text-muted-foreground">Batch backend, koreksi penuh, dan status rekonsiliasi.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Muat ulang</Button></div>
    {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Operasi gagal</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>Batch royalti</CardTitle><CardDescription>Status berasal langsung dari integritas rekonsiliasi backend.</CardDescription></CardHeader><CardContent>
      {loading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Memuat riwayat" /></div> : items.length === 0 ? <p className="py-10 text-center text-muted-foreground">Belum ada batch royalti.</p> : <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Sumber batch</TableHead><TableHead>Waktu</TableHead><TableHead className="text-right">Baris</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}><TableCell className="font-mono font-medium">{item.period}</TableCell><TableCell className="max-w-52 truncate" title={item.source_batch}>{item.source_batch}</TableCell><TableCell className="whitespace-nowrap">{date(item.created_at)}</TableCell><TableCell className="text-right tabular-nums">{item.row_count}</TableCell><TableCell className="text-right tabular-nums">{money(item.total_amount)}</TableCell><TableCell><Badge variant={item.status === 'RECONCILED' ? 'default' : item.status === 'CORRECTED' ? 'destructive' : 'secondary'}>{statusLabel(item.status)}</Badge></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => void showDetail(item.id)} disabled={busy === 'detail'} aria-label={`Lihat detail batch ${item.period}`}><Eye className="mr-2 h-4 w-4" />Detail</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>
    {selected && <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Detail batch {selected.period}</CardTitle><CardDescription className="break-all">ID {selected.id} · {selected.policy_code}</CardDescription></div><Badge variant={selected.status === 'RECONCILED' ? 'default' : selected.status === 'CORRECTED' ? 'destructive' : 'secondary'}>{statusLabel(selected.status)}</Badge></div></CardHeader><CardContent className="space-y-5">
      <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Komposer</TableHead><TableHead>Penerima</TableHead><TableHead className="text-right">Jumlah</TableHead></TableRow></TableHeader><TableBody>{selected.entries.map(entry => <TableRow key={entry.id}><TableCell className="font-mono">{entry.composer_code}</TableCell><TableCell>{entry.composer_name}</TableCell><TableCell>{entry.canonical_name}</TableCell><TableCell className="text-right tabular-nums">{money(entry.amount)}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2 rounded-lg border p-4"><Label htmlFor="reconciliation-evidence">Bukti rekonsiliasi</Label><Input id="reconciliation-evidence" value={evidence} maxLength={500} disabled={!!busy || selected.status !== 'UNRECONCILED'} onChange={event => setEvidence(event.target.value)} placeholder="Contoh: total batch dan ledger telah diverifikasi" /><Button className="w-full sm:w-auto" disabled={!evidence.trim() || !!busy || selected.status !== 'UNRECONCILED'} onClick={() => void reconcile()}>{busy === 'reconciliation' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rekonsiliasi dengan bukti</Button></div><div className="space-y-2 rounded-lg border border-destructive/30 p-4"><p className="font-medium">Koreksi batch penuh</p><p className="text-sm text-muted-foreground">Membuat penyesuaian balik untuk seluruh penerima dalam batch. Tidak dapat dibatasi per baris.</p><Button variant="destructive" className="w-full sm:w-auto" disabled={!!busy || selected.status === 'CORRECTED'} onClick={() => setCorrectionOpen(true)}><RotateCcw className="mr-2 h-4 w-4" />{selected.status === 'CORRECTED' ? 'Batch sudah dikoreksi' : 'Koreksi seluruh batch'}</Button></div></div>
    </CardContent></Card>}
    <AlertDialog open={correctionOpen} onOpenChange={setCorrectionOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Koreksi seluruh batch?</AlertDialogTitle><AlertDialogDescription>Backend akan membalik seluruh posting batch {selected?.period}. Tindakan ini permanen dan tidak dapat diterapkan hanya ke satu komposer.</AlertDialogDescription></AlertDialogHeader><div className="space-y-2"><Label htmlFor="correction-reason">Alasan koreksi</Label><Input id="correction-reason" value={reason} maxLength={500} disabled={busy === 'correction'} onChange={event => setReason(event.target.value)} /></div><AlertDialogFooter><AlertDialogCancel disabled={busy === 'correction'}>Batal</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!reason.trim() || busy === 'correction'} onClick={event => { event.preventDefault(); void correct(); }}>{busy === 'correction' ? 'Memproses...' : 'Ya, koreksi seluruh batch'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
