import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { copyrightApi, type CopyrightRoyaltyPreview, type CopyrightRoyaltyPreviewRequest } from '@/api/copyright';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { parseCsvDocument } from '@/lib/csv';
import { toast } from 'sonner';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_HEADERS = ['composer_code', 'composer_name', 'total_net_royalti', 'period'] as const;
const MONEY = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const SAFE_TEXT = /^[^\x00-\x1f\x7f]+$/;

const blockerLabels: Record<string, string> = {
  COMPOSER_IDENTITY_MAPPING_REQUIRED: 'Pemetaan identitas komposer belum disetujui.',
  WORK_ALLOCATION_CONTRACT_REQUIRED: 'Kontrak alokasi karya belum tersedia.',
};

function formatIdr(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${grouped}${fraction ? `,${fraction.padEnd(2, '0')}` : ',00'}`;
}

function parseStatement(text: string, filename: string): CopyrightRoyaltyPreviewRequest {
  if (!filename || filename.length > 200 || !SAFE_TEXT.test(filename)) throw new Error('Nama file tidak valid atau melebihi 200 karakter.');
  const document = parseCsvDocument(text.replace(/^\uFEFF/, ''));
  if (document.length < 2) throw new Error('CSV harus memiliki header dan minimal satu baris data.');
  const headers = document[0].map(value => value.toLowerCase());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`Header duplikat tidak diperbolehkan: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(', ')}.`);
  const index = (header: typeof REQUIRED_HEADERS[number]) => headers.indexOf(header);
  const periods = new Set<string>();
  const codes = new Set<string>();
  const rows = document.slice(1).map((values, offset) => {
    const rowNumber = offset + 2;
    if (values.length !== headers.length) throw new Error(`Baris ${rowNumber}: jumlah kolom tidak sesuai header.`);
    const composer_code = values[index('composer_code')];
    const composer_name = values[index('composer_name')];
    const total_net_royalti = values[index('total_net_royalti')];
    const period = values[index('period')];
    if (!composer_code || !composer_name) throw new Error(`Baris ${rowNumber}: kode dan nama komposer wajib diisi.`);
    if (composer_code.length > 200 || composer_name.length > 200 || !SAFE_TEXT.test(composer_code) || !SAFE_TEXT.test(composer_name)) throw new Error(`Baris ${rowNumber}: kode atau nama komposer tidak valid.`);
    if (!MONEY.test(total_net_royalti)) throw new Error(`Baris ${rowNumber}: total_net_royalti harus angka positif dengan maksimal 2 desimal.`);
    if (!PERIOD.test(period)) throw new Error(`Baris ${rowNumber}: period harus berformat YYYY-MM.`);
    if (codes.has(composer_code)) throw new Error(`Baris ${rowNumber}: composer_code ${composer_code} duplikat.`);
    codes.add(composer_code);
    periods.add(period);
    return { composer_code, composer_name, total_net_royalti };
  });
  if (rows.length > MAX_ROWS) throw new Error(`CSV maksimal ${MAX_ROWS} baris.`);
  if (periods.size !== 1) throw new Error('Semua baris harus memakai period yang sama.');
  return { source: 'copyright-dashboard', source_batch: filename, period: [...periods][0], currency: 'IDR', rows };
}

export function BackendCopyrightRoyaltyPreview() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [statement, setStatement] = useState<CopyrightRoyaltyPreviewRequest | null>(null);
  const [preview, setPreview] = useState<CopyrightRoyaltyPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [postedBatchId, setPostedBatchId] = useState('');

  const selectFile = async (selected: File) => {
    abortRef.current?.abort();
    setPreview(null);
    setPostedBatchId('');
    setStatement(null);
    setError('');
    setFile(selected);
    if (!selected.name.toLowerCase().endsWith('.csv')) return setError('File wajib berformat CSV.');
    if (!selected.size || selected.size > MAX_BYTES) return setError('CSV harus berisi data dan berukuran maksimal 10 MB.');
    try {
      setStatement(parseStatement(await selected.text(), selected.name));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV tidak dapat dibaca.');
    }
  };

  const postImport = async () => {
    if (!statement || !preview?.posting_allowed || posting) return;
    setPosting(true);
    setError('');
    try {
      const result = await copyrightApi.postImport({ expected_checksum: preview.checksum, statement });
      setPostedBatchId(result.batch.id);
      setConfirmOpen(false);
      toast.success(result.replayed ? 'Batch sudah pernah diposting.' : 'Royalti berhasil diposting.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Posting royalti gagal.');
    } finally {
      setPosting(false);
    }
  };

  const submitPreview = async () => {
    if (!statement || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await copyrightApi.previewRoyalties(statement, controller.signal));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Preview backend gagal.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  return <DashboardLayout><div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">Preview Royalti Hak Cipta</h1><p className="mt-1 text-muted-foreground">Validasi satu batch CSV melalui backend tanpa membuat posting keuangan.</p></div>
    <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Validasi sebelum posting</AlertTitle><AlertDescription>Posting dinonaktifkan sampai semua kode komposer memiliki mapping penerima aktif untuk periode batch.</AlertDescription></Alert>
    <Card><CardHeader><CardTitle>Pilih batch CSV</CardTitle><CardDescription>Kolom wajib: composer_code, composer_name, total_net_royalti, period. Maksimal 1.000 baris dan satu period per batch.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="copyright-royalty-csv">File CSV</Label><Input ref={inputRef} id="copyright-royalty-csv" type="file" accept=".csv,text/csv" disabled={loading} onChange={event => { const selected = event.target.files?.[0]; if (selected) void selectFile(selected); }} /></div>
      {file && <Badge variant="secondary"><FileText className="mr-2 h-3 w-3" />{file.name} ({Math.ceil(file.size / 1024)} KB)</Badge>}
      {statement && <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Period</p><p className="font-medium">{statement.period}</p></div><div><p className="text-xs text-muted-foreground">Baris</p><p className="font-medium">{statement.rows.length}</p></div><div><p className="text-xs text-muted-foreground">Mata uang</p><p className="font-medium">IDR</p></div></div>}
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Preview tidak tersedia</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-2"><Button onClick={() => void submitPreview()} disabled={!statement || loading || posting}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? 'Memvalidasi...' : 'Kirim preview ke backend'}</Button></div>
    </CardContent></Card>
    {preview && <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Hasil preview backend</CardTitle><CardDescription>{preview.rows.length} baris dinormalisasi. Status {preview.status}.</CardDescription></div><Badge variant="outline">Total {formatIdr(preview.total_amount)}</Badge></div></CardHeader><CardContent className="space-y-5">
      {preview.posting_allowed ? <Alert><CheckCircle className="h-4 w-4" /><AlertTitle>Siap diposting</AlertTitle><AlertDescription>Semua mapping lengkap. Periksa total dan penerima sebelum konfirmasi.</AlertDescription></Alert> : <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Posting diblokir</AlertTitle><AlertDescription><ul className="mt-1 list-disc space-y-1 pl-5">{preview.blockers.map(blocker => <li key={blocker}>{blockerLabels[blocker] ?? blocker}</li>)}</ul></AlertDescription></Alert>}
      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Kebijakan posting</p><p className="break-all text-sm font-medium">{preview.policy_code}</p></div><div><p className="text-xs text-muted-foreground">Checksum kebijakan</p><p className="break-all font-mono text-xs">{preview.policy_checksum}</p></div></div>
      <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Kode komposer</TableHead><TableHead>Nama komposer</TableHead><TableHead>Penerima backend</TableHead><TableHead>Status mapping</TableHead><TableHead className="text-right">Royalti bersih</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map(row => <TableRow key={row.composer_code}><TableCell className="font-mono text-sm">{row.composer_code}</TableCell><TableCell>{row.composer_name}</TableCell><TableCell>{row.canonical_name ?? "-"}</TableCell><TableCell><Badge variant={row.status === "MATCHED" ? "default" : "destructive"}>{row.status}</Badge></TableCell><TableCell className="text-right tabular-nums">{formatIdr(row.total_net_royalti)}</TableCell></TableRow>)}</TableBody></Table></div>
      {postedBatchId ? <Alert><CheckCircle className="h-4 w-4" /><AlertTitle>Posting selesai</AlertTitle><AlertDescription>ID batch: <span className="font-mono">{postedBatchId}</span></AlertDescription></Alert> : <Button className="w-full sm:w-auto" disabled={!preview.posting_allowed || posting} onClick={() => setConfirmOpen(true)}>{posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Posting batch royalti</Button>}
    </CardContent></Card>}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Posting batch royalti?</AlertDialogTitle><AlertDialogDescription>Tindakan ini membuat posting keuangan untuk {preview?.rows.length ?? 0} baris senilai {preview ? formatIdr(preview.total_amount) : '-'}. Mapping dan checksum preview akan divalidasi ulang oleh backend.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={posting}>Batal</AlertDialogCancel><AlertDialogAction disabled={posting || !preview?.posting_allowed} onClick={event => { event.preventDefault(); void postImport(); }}>{posting ? 'Memposting...' : 'Ya, posting batch'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></DashboardLayout>;
}
