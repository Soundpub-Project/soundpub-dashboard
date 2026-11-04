import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react';
import { SoundpubApiError } from '@/api/client';
import { royaltiesApi, type RoyaltyBatch, type RoyaltyCsvPreview, type RoyaltyImportDetail } from '@/api/royalties';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MAX_CSV_BYTES = 1_000_000;
const PAGE_SIZE = 50;
const TEMPLATE = `period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue\n2026-01,IDABC2600001,123456789012,Judul Lagu,Nama Artis,Nama Label,Spotify,ID,stream,1,1000.00\n`;

function formatIdr(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `IDR ${value}`;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(number);
}

function errorMessage(error: unknown) {
  if (!(error instanceof SoundpubApiError)) return 'Operasi gagal. Periksa koneksi lalu coba kembali.';
  const messages: Record<string, string> = {
    ROYALTY_IMPORT_INVALID: 'CSV berubah atau masih memiliki baris tidak valid. Jalankan preview ulang.',
    ROYALTY_PREVIEW_STALE: 'Data katalog berubah setelah preview. Jalankan preview ulang sebelum menyimpan.',
    ROYALTY_PERIOD_CONFLICT: 'Sumber dan periode ini sudah memiliki batch aktif. Koreksi batch lama diperlukan sebelum impor pengganti.',
    FORBIDDEN: 'Akun ini tidak memiliki izin admin untuk impor royalti.',
    UNAUTHORIZED: 'Sesi berakhir. Silakan login kembali.',
  };
  const request = error.requestId ? ` Request ID: ${error.requestId}.` : '';
  return `${messages[error.code] ?? error.serverMessage ?? error.code}.${request}`;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'soundpub-royalty-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ batch }: { batch: RoyaltyBatch }) {
  const voided = batch.status === 'VOIDED_WITH_OFFSET';
  return <Badge variant={voided ? 'secondary' : 'outline'}>{voided ? 'Dikoreksi' : 'Belum direkonsiliasi'}</Badge>;
}

export function BackendRoyaltyImport() {
  const { user, isAdmin } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [source, setSource] = useState('soundpub-dashboard');
  const [preview, setPreview] = useState<RoyaltyCsvPreview | null>(null);
  const [selected, setSelected] = useState<RoyaltyImportDetail | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | 'detail' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [offset, setOffset] = useState(0);

  const history = useQuery({
    queryKey: ['backend-royalty-imports', user?.id, offset],
    enabled: !!user && isAdmin,
    queryFn: ({ signal }) => royaltiesApi.history(offset, signal),
    retry: false,
  });

  const resetPreview = () => {
    setPreview(null);
    setError('');
    setResult('');
  };

  const selectFile = async (file: File) => {
    resetPreview();
    setSelected(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsv('');
      setFilename('');
      setError('File wajib berformat CSV.');
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setCsv('');
      setFilename('');
      setError('CSV maksimum 1 MB untuk tahap impor langsung ini.');
      return;
    }
    try {
      const text = await file.text();
      setCsv(text);
      setFilename(file.name);
    } catch {
      setCsv('');
      setFilename('');
      setError('File tidak dapat dibaca.');
    }
  };

  const runPreview = async () => {
    if (!isAdmin || !csv || inFlight.current) return;
    inFlight.current = true;
    setBusy('preview');
    setError('');
    setResult('');
    try {
      setPreview(await royaltiesApi.previewRoyaltyCsv(csv));
    } catch (failure) {
      setPreview(null);
      setError(errorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const runCommit = async () => {
    if (!isAdmin || !csv || !filename || !preview?.checksum || preview.invalid_rows || preview.file_errors || inFlight.current) return;
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      setError('Kode sumber wajib diisi.');
      return;
    }
    inFlight.current = true;
    setBusy('commit');
    setError('');
    setResult('');
    try {
      const saved = await royaltiesApi.commitRoyaltyCsv({ csv, source: normalizedSource, filename, expected_checksum: preview.checksum });
      setResult(saved.replayed ? `Batch ${saved.id} sudah pernah tersimpan.` : `Batch ${saved.id} berhasil disimpan secara atomik.`);
      setPreview(null);
      setCsv('');
      setFilename('');
      if (fileInput.current) fileInput.current.value = '';
      await history.refetch();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const loadDetail = async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('detail');
    setError('');
    try {
      setSelected(await royaltiesApi.detail(id));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const readyToCommit = Boolean(preview?.checksum && preview.valid_rows > 0 && preview.invalid_rows === 0 && preview.file_errors === 0);

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Impor royalti</h1>
          <p className="text-sm text-muted-foreground">Validasi CSV dan pencocokan katalog dijalankan backend. Tidak ada fallback atau write ke Supabase.</p>
        </div>
        <Button type="button" variant="outline" onClick={downloadTemplate}>Unduh template CSV</Button>
      </div>

      {!isAdmin ? <Card><CardContent className="pt-6"><p role="alert">Akses admin diperlukan.</p></CardContent></Card> : <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Pilih pernyataan royalti</CardTitle>
            <CardDescription>Maksimum 1 MB dan 1.000 baris. Kolom wajib: period, isrc, platform, country, sales_unit, net_revenue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
              <label className="space-y-2 text-sm font-medium">Kode sumber
                <Input value={source} maxLength={200} disabled={!!busy} onChange={event => { setSource(event.target.value); setResult(''); }} placeholder="contoh: spotify-fuga" />
              </label>
              <label className="space-y-2 text-sm font-medium">File CSV
                <Input ref={fileInput} type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; if (file) void selectFile(file); }} />
              </label>
            </div>
            {filename && <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm"><FileSpreadsheet className="h-5 w-5" /><span className="font-medium">{filename}</span><span className="text-muted-foreground">{new Blob([csv]).size.toLocaleString('id-ID')} byte</span></div>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!csv || !!busy} onClick={() => void runPreview()}>{busy === 'preview' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Preview backend</Button>
              <Button disabled={!readyToCommit || !!busy || !source.trim()} onClick={() => void runCommit()}>{busy === 'commit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan batch tervalidasi</Button>
              <Button type="button" variant="ghost" disabled={!!busy || (!csv && !preview)} onClick={() => { setCsv(''); setFilename(''); resetPreview(); if (fileInput.current) fileInput.current.value = ''; }}>Bersihkan</Button>
            </div>
            {error && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
            {result && <div role="status" className="flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{result}</span></div>}
          </CardContent>
        </Card>

        {preview && <Card>
          <CardHeader><CardTitle>Hasil preview</CardTitle><CardDescription>Policy {preview.policy_code} · periode {preview.period ?? 'tidak konsisten'}</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Baris valid</p><p className="text-xl font-semibold">{preview.valid_rows.toLocaleString('id-ID')}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Baris bermasalah</p><p className="text-xl font-semibold">{preview.invalid_rows + preview.file_errors}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Royalti bersih</p><p className="text-xl font-semibold">{formatIdr(preview.total_net_amount)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1">{readyToCommit ? <Badge>Siap disimpan</Badge> : <Badge variant="destructive">Perlu diperbaiki</Badge>}</p></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian artis</p><p className="font-semibold">{formatIdr(preview.artist_amount)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian label</p><p className="font-semibold">{formatIdr(preview.label_amount)}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian SoundPub</p><p className="font-semibold">{formatIdr(preview.soundpub_amount)}</p></div>
            </div>
            {preview.issues.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Masalah CSV</h3><div className="max-h-64 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>Kolom</TableHead><TableHead>Kode</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader><TableBody>{preview.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${issue.field}-${index}`}><TableCell>{issue.row || 'File'}</TableCell><TableCell>{issue.field}</TableCell><TableCell><code>{issue.code}</code></TableCell><TableCell>{issue.message}</TableCell></TableRow>)}</TableBody></Table></div>{preview.issues.length > 100 && <p className="text-xs text-muted-foreground">Menampilkan 100 dari {preview.issues.length} masalah.</p>}</div>}
            {preview.sample_rows.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Sampel hasil pencocokan</h3><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>ISRC</TableHead><TableHead>Artis</TableHead><TableHead>Label</TableHead><TableHead>Platform</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader><TableBody>{preview.sample_rows.map(row => <TableRow key={row.source_row_number}><TableCell>{row.source_row_number}</TableCell><TableCell className="font-mono">{row.isrc}</TableCell><TableCell>{row.artist}</TableCell><TableCell>{row.label_name}</TableCell><TableCell>{row.platform}</TableCell><TableCell className="text-right">{formatIdr(row.net_revenue)}</TableCell></TableRow>)}</TableBody></Table></div></div>}
          </CardContent>
        </Card>}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Riwayat impor</CardTitle><CardDescription>Batch bersifat immutable. Penghapusan dan replacement belum diaktifkan.</CardDescription></div><Button type="button" size="icon" variant="outline" aria-label="Muat ulang riwayat" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw className={`h-4 w-4 ${history.isFetching ? 'animate-spin' : ''}`} /></Button></CardHeader>
          <CardContent className="space-y-4">
            {history.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(history.error)}</p>}
            <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Sumber</TableHead><TableHead>File</TableHead><TableHead>Baris</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{history.data?.items.map(batch => <TableRow key={batch.id}><TableCell>{batch.period}</TableCell><TableCell>{batch.source}</TableCell><TableCell>{batch.filename}</TableCell><TableCell>{batch.row_count}</TableCell><TableCell>{formatIdr(batch.total_amount)}</TableCell><TableCell><StatusBadge batch={batch} /></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void loadDetail(batch.id)}>Detail</Button></TableCell></TableRow>)}{history.data?.items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada impor.</TableCell></TableRow>}</TableBody></Table></div>
            <div className="flex justify-between"><Button variant="outline" disabled={offset === 0 || history.isFetching} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Sebelumnya</Button><Button variant="outline" disabled={(history.data?.items.length ?? 0) < PAGE_SIZE || history.isFetching} onClick={() => setOffset(value => value + PAGE_SIZE)}>Berikutnya</Button></div>
          </CardContent>
        </Card>

        {selected && <Card>
          <CardHeader><CardTitle>Detail batch {selected.id}</CardTitle><CardDescription>{selected.filename} · {selected.period} · {selected.row_count} baris</CardDescription></CardHeader>
          <CardContent className="space-y-3"><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>ISRC</TableHead><TableHead>Platform</TableHead><TableHead>Komponen</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader><TableBody>{selected.entries.slice(0, 100).map(entry => <TableRow key={entry.id}><TableCell>{entry.source_row_number ?? entry.source_row_id}</TableCell><TableCell className="font-mono">{entry.source_isrc ?? '-'}</TableCell><TableCell>{entry.platform ?? '-'}</TableCell><TableCell>{entry.allocations.map(allocation => `${allocation.component} ${formatIdr(allocation.amount)}`).join(' · ')}</TableCell><TableCell className="text-right">{formatIdr(entry.net_amount)}</TableCell></TableRow>)}</TableBody></Table></div>{selected.entries.length > 100 && <p className="text-xs text-muted-foreground">Menampilkan 100 dari {selected.entries.length} entry.</p>}</CardContent>
        </Card>}
      </>}
    </div>
  </DashboardLayout>;
}
