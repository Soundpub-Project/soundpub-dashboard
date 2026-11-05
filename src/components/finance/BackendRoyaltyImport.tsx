import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react';
import { SoundpubApiError } from '@/api/client';
import { royaltiesApi, type RoyaltyBatch, type RoyaltyCsvPreview, type RoyaltyImportDetail, type RoyaltyImportSession, type RoyaltyReconciliation } from '@/api/royalties';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { sha256File } from '@/lib/fileChecksum';

const MAX_CSV_BYTES = 100 * 1024 ** 2;
const PAGE_SIZE = 50;
const DETAIL_PAGE_SIZE = 100;
const TEMPLATE = `period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue\n2026-01,IDABC2600001,123456789012,Judul Lagu,Nama Artis,Nama Label,Spotify,ID,stream,1,1000.00\n`;

function capabilityUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Kapabilitas upload tidak valid.');
  return url.href;
}

async function waitForPreview(id: string): Promise<RoyaltyImportSession> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const session = await royaltiesApi.fileSession(id);
    if (session.status === 'PREVIEW_READY') return session;
    if (session.status === 'FAILED') throw new Error(session.error_code ?? 'Pemrosesan file gagal.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Preview masih diproses. Muat ulang beberapa saat lagi.');
}

function formatIdr(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `IDR ${value}`;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(number);
}

function errorMessage(error: unknown) {
  if (!(error instanceof SoundpubApiError)) return error instanceof Error ? error.message : 'Operasi gagal. Periksa koneksi lalu coba kembali.';
  const messages: Record<string, string> = {
    ROYALTY_IMPORT_INVALID: 'CSV masih memiliki baris tidak valid. Perbaiki file lalu upload ulang.',
    ROYALTY_PREVIEW_STALE: 'Data katalog berubah setelah preview. Upload dan preview ulang sebelum menyimpan.',
    ROYALTY_PERIOD_CONFLICT: 'Sumber dan periode ini sudah memiliki batch aktif. Koreksi batch lama diperlukan sebelum impor pengganti.',
    ROYALTY_IMPORT_NOT_READY: 'Preview file belum siap untuk disimpan.',
    ROYALTY_REPLACEMENT_PERIOD_MISMATCH: 'Periode file pengganti harus sama dengan batch lama.',
    ROYALTY_REPLACEMENT_UNCHANGED: 'File pengganti sama dengan batch lama.',
    ROYALTY_REPLACEMENT_CONFLICT: 'Batch sudah dikoreksi/diganti atau replacement berbeda sudah tercatat.',
    ROYALTY_REPLACEMENT_POLICY_MISMATCH: 'Batch ini bukan impor CSV legacy dan tidak dapat diganti melalui alur ini.',
    ROYALTY_REPLACEMENT_OWNER_MISMATCH: 'Replacement mengubah pemilik historis track. Periksa katalog atau gunakan rekonsiliasi manual.',
    ROYALTY_RECONCILIATION_STALE: 'Batch berubah atau checksum tidak lagi cocok. Muat ulang detail sebelum menyetujui.',
    ROYALTY_RECONCILIATION_REVIEWER_REQUIRED: 'Pengunggah batch tidak boleh menyetujui rekonsiliasinya sendiri. Gunakan admin reviewer lain.',
    FORBIDDEN: 'Akun ini tidak memiliki izin admin untuk impor royalti.',
    UNAUTHORIZED: 'Sesi berakhir. Silakan login kembali.',
  };
  const request = error.requestId ? ` Request ID: ${error.requestId}.` : '';
  return `${messages[error.code] ?? error.serverMessage ?? error.code}${request}`;
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
  const label = batch.replacement_batch_id ? 'Diganti' : voided ? 'Dikoreksi' : batch.status === 'RECONCILED' ? 'Direkonsiliasi' : 'Belum direkonsiliasi';
  return <Badge variant={voided ? 'secondary' : 'outline'}>{label}</Badge>;
}

export function BackendRoyaltyImport() {
  const { user, isAdmin } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [source, setSource] = useState('soundpub-dashboard');
  const [preview, setPreview] = useState<RoyaltyCsvPreview | null>(null);
  const [selected, setSelected] = useState<RoyaltyImportDetail | null>(null);
  const [reconciliation, setReconciliation] = useState<RoyaltyReconciliation | null>(null);
  const [reconciliationEvidence, setReconciliationEvidence] = useState('Batch totals and ledger verified');
  const [detailOffset, setDetailOffset] = useState(0);
  const [busy, setBusy] = useState<'preview' | 'commit' | 'detail' | 'reconcile' | 'replace-preview' | 'replace-commit' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [offset, setOffset] = useState(0);
  const [replacementTarget, setReplacementTarget] = useState<RoyaltyBatch | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementPreview, setReplacementPreview] = useState<RoyaltyCsvPreview | null>(null);
  const [replacementReason, setReplacementReason] = useState('');
  const [replacementSessionId, setReplacementSessionId] = useState<string | null>(null);
  const [replacementRequestKey, setReplacementRequestKey] = useState<string | null>(null);

  const history = useQuery({ queryKey: ['backend-royalty-imports', user?.id, offset], enabled: !!user && isAdmin,
    queryFn: ({ signal }) => royaltiesApi.history(offset, signal), retry: false });

  const resetPreview = () => { setPreview(null); setSessionId(null); setError(''); setResult(''); };

  const selectFile = (selectedFile: File) => {
    resetPreview();
    setSelected(null);
    setReconciliation(null);
    setDetailOffset(0);
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) { setFile(null); setError('File wajib berformat CSV.'); return; }
    if (!selectedFile.size || selectedFile.size > MAX_CSV_BYTES) { setFile(null); setError('CSV maksimum 100 MB.'); return; }
    setFile(selectedFile);
  };

  const runPreview = async () => {
    if (!isAdmin || !file || inFlight.current) return;
    const normalizedSource = source.trim();
    if (!normalizedSource) { setError('Kode sumber wajib diisi.'); return; }
    inFlight.current = true; setBusy('preview'); setError(''); setResult('');
    try {
      const intent = await royaltiesApi.requestFileUpload({ source: normalizedSource, filename: file.name,
        mime_type: 'text/csv', size: file.size, checksum: await sha256File(file) });
      if (!intent.url || !intent.method || !intent.headers) throw new Error('Kapabilitas upload tidak tersedia.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      try {
        const response = await fetch(capabilityUrl(intent.url), { method: intent.method, headers: intent.headers, body: file,
          credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Upload file ke storage private gagal.');
      } finally { clearTimeout(timeout); }
      const completed = await royaltiesApi.completeFileUpload(intent.session.id);
      setSessionId(completed.session.id);
      const ready = await waitForPreview(completed.session.id);
      if (!ready.preview_result) throw new Error('Backend tidak menghasilkan preview.');
      setPreview(ready.preview_result);
    } catch (failure) {
      setPreview(null); setError(errorMessage(failure));
    } finally { inFlight.current = false; setBusy(null); }
  };

  const runCommit = async () => {
    if (!isAdmin || !sessionId || !preview?.checksum || preview.invalid_rows || preview.file_errors || inFlight.current) return;
    inFlight.current = true; setBusy('commit'); setError(''); setResult('');
    try {
      const saved = await royaltiesApi.commitFileSession(sessionId);
      setResult(saved.replayed ? `Batch ${saved.id} sudah pernah tersimpan.` : `Batch ${saved.id} berhasil disimpan secara atomik.`);
      setPreview(null); setFile(null); setSessionId(null);
      if (fileInput.current) fileInput.current.value = '';
      await history.refetch();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setBusy(null); }
  };

  const loadDetail = async (id: string, nextOffset = 0) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('detail'); setError('');
    try {
      const detail = await royaltiesApi.detail(id, nextOffset);
      setSelected(detail);
      setReconciliation(detail.status === 'VOIDED_WITH_OFFSET' ? null : await royaltiesApi.reconciliation(id));
      setDetailOffset(nextOffset);
    }
    catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setBusy(null); }
  };

  const reconcileSelected = async () => {
    if (!selected || !reconciliation?.matched || !reconciliationEvidence.trim() || inFlight.current) return;
    inFlight.current = true; setBusy('reconcile'); setError(''); setResult('');
    try {
      const report = await royaltiesApi.reconcile(selected.id, {
        expected_checksum: selected.checksum, evidence: reconciliationEvidence.trim(),
      });
      setReconciliation(report);
      setSelected(await royaltiesApi.detail(selected.id, detailOffset));
      setResult(report.replayed ? 'Batch sudah direkonsiliasi.' : 'Batch berhasil direkonsiliasi dan saldo terkait dapat digunakan.');
      await history.refetch();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setBusy(null); }
  };

  const previewReplacement = async () => {
    if (!replacementTarget || !replacementFile || replacementFile.size > MAX_CSV_BYTES || !replacementReason.trim() || inFlight.current) return;
    inFlight.current = true; setBusy('replace-preview'); setError(''); setResult('');
    try {
      const requestKey = replacementRequestKey ?? crypto.randomUUID();
      setReplacementRequestKey(requestKey);
      const intent = await royaltiesApi.requestReplacementFileUpload(replacementTarget.id, {
        filename: replacementFile.name, mime_type: 'text/csv', size: replacementFile.size,
        checksum: await sha256File(replacementFile), reason: replacementReason.trim(),
      }, requestKey);
      let session = intent.session;
      if (session.status === 'UPLOAD_PENDING') {
        if (!intent.url || !intent.method || !intent.headers) throw new Error('Kapabilitas upload replacement tidak tersedia.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300_000);
        try {
          const response = await fetch(capabilityUrl(intent.url), { method: intent.method, headers: intent.headers,
            body: replacementFile, credentials: 'omit', redirect: 'error', signal: controller.signal });
          if (!response.ok) throw new Error('Upload replacement ke storage private gagal.');
        } finally { clearTimeout(timeout); }
        session = (await royaltiesApi.completeFileUpload(session.id)).session;
      }
      setReplacementSessionId(session.id);
      const ready = await waitForPreview(session.id);
      if (!ready.preview_result) throw new Error('Backend tidak menghasilkan preview replacement.');
      setReplacementPreview(ready.preview_result);
    }
    catch (failure) { setReplacementPreview(null); setError(errorMessage(failure)); }
    finally { inFlight.current = false; setBusy(null); }
  };

  const commitReplacement = async () => {
    if (!replacementTarget || !replacementSessionId || !replacementPreview?.checksum || replacementPreview.invalid_rows ||
        replacementPreview.file_errors || !replacementReason.trim() || inFlight.current) return;
    inFlight.current = true; setBusy('replace-commit'); setError(''); setResult('');
    try {
      const saved = await royaltiesApi.commitFileSession(replacementSessionId);
      setResult(saved.replayed ? `Replacement ${saved.id} sudah pernah diproses.` :
        `Batch ${saved.replaced_id ?? replacementTarget.id} dibalik dan diganti batch ${saved.id} secara atomik.`);
      setReplacementTarget(null); setReplacementFile(null); setReplacementPreview(null); setReplacementReason('');
      setReplacementSessionId(null); setReplacementRequestKey(null);
      await history.refetch();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setBusy(null); }
  };
  const readyToCommit = Boolean(sessionId && preview?.checksum && preview.valid_rows > 0 && preview.invalid_rows === 0 && preview.file_errors === 0);

  return <DashboardLayout><div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Impor royalti</h1><p className="text-sm text-muted-foreground">File disimpan private, diverifikasi checksum, lalu diproses worker backend. Tidak ada fallback ke Supabase.</p></div><Button type="button" variant="outline" onClick={downloadTemplate}>Unduh template CSV</Button></div>
    {!isAdmin ? <Card><CardContent className="pt-6"><p role="alert">Akses admin diperlukan.</p></CardContent></Card> : <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Pilih pernyataan royalti</CardTitle><CardDescription>Maksimum 100 MB atau 100.000 baris. File di-hash dan diproses bertahap tanpa memuat seluruh isi ke memori.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]"><label className="space-y-2 text-sm font-medium">Kode sumber<Input value={source} maxLength={200} disabled={!!busy} onChange={event => { setSource(event.target.value); setResult(''); }} placeholder="contoh: spotify-fuga" /></label><label className="space-y-2 text-sm font-medium">File CSV<Input ref={fileInput} type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => { const selectedFile = event.target.files?.[0]; if (selectedFile) selectFile(selectedFile); }} /></label></div>
        {file && <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm"><FileSpreadsheet className="h-5 w-5" /><span className="font-medium">{file.name}</span><span className="text-muted-foreground">{file.size.toLocaleString('id-ID')} byte</span></div>}
        <div className="flex flex-wrap gap-2"><Button disabled={!file || !!busy} onClick={() => void runPreview()}>{busy === 'preview' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Upload dan preview</Button><Button disabled={!readyToCommit || !!busy} onClick={() => void runCommit()}>{busy === 'commit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan batch tervalidasi</Button><Button type="button" variant="ghost" disabled={!!busy || (!file && !preview)} onClick={() => { setFile(null); resetPreview(); if (fileInput.current) fileInput.current.value = ''; }}>Bersihkan</Button></div>
        {busy === 'preview' && <p role="status" className="text-sm text-muted-foreground">Upload, verifikasi, dan pencocokan katalog sedang berjalan…</p>}
        {error && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {result && <div role="status" className="flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{result}</span></div>}
      </CardContent></Card>
      {preview && <Card><CardHeader><CardTitle>Hasil preview</CardTitle><CardDescription>Policy {preview.policy_code} · periode {preview.period ?? 'tidak konsisten'}</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Baris valid</p><p className="text-xl font-semibold">{preview.valid_rows.toLocaleString('id-ID')}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Baris bermasalah</p><p className="text-xl font-semibold">{preview.invalid_rows + preview.file_errors}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Royalti bersih</p><p className="text-xl font-semibold">{formatIdr(preview.total_net_amount)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1">{readyToCommit ? <Badge>Siap disimpan</Badge> : <Badge variant="destructive">Perlu diperbaiki</Badge>}</p></div></div>
        <div className="grid gap-3 md:grid-cols-3"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian artis</p><p className="font-semibold">{formatIdr(preview.artist_amount)}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian label</p><p className="font-semibold">{formatIdr(preview.label_amount)}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Bagian SoundPub</p><p className="font-semibold">{formatIdr(preview.soundpub_amount)}</p></div></div>
        {preview.issues.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Masalah CSV</h3><div className="max-h-64 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>Kolom</TableHead><TableHead>Kode</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader><TableBody>{preview.issues.slice(0, 100).map((issue, index) => <TableRow key={`${issue.row}-${issue.field}-${index}`}><TableCell>{issue.row || 'File'}</TableCell><TableCell>{issue.field}</TableCell><TableCell><code>{issue.code}</code></TableCell><TableCell>{issue.message}</TableCell></TableRow>)}</TableBody></Table></div></div>}
        {preview.sample_rows.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Sampel hasil pencocokan</h3><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>ISRC</TableHead><TableHead>Artis</TableHead><TableHead>Label</TableHead><TableHead>Platform</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader><TableBody>{preview.sample_rows.map(row => <TableRow key={row.source_row_number}><TableCell>{row.source_row_number}</TableCell><TableCell className="font-mono">{row.isrc}</TableCell><TableCell>{row.artist}</TableCell><TableCell>{row.label_name}</TableCell><TableCell>{row.platform}</TableCell><TableCell className="text-right">{formatIdr(row.net_revenue)}</TableCell></TableRow>)}</TableBody></Table></div></div>}
      </CardContent></Card>}
      <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>Riwayat impor</CardTitle><CardDescription>Batch immutable. Replacement membuat koreksi ledger dan batch baru; data lama tidak dihapus.</CardDescription></div><Button type="button" size="icon" variant="outline" aria-label="Muat ulang riwayat" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw className={`h-4 w-4 ${history.isFetching ? 'animate-spin' : ''}`} /></Button></CardHeader><CardContent className="space-y-4">
        {history.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(history.error)}</p>}
        <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Sumber</TableHead><TableHead>File</TableHead><TableHead>Baris</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{history.data?.items.map(batch => <TableRow key={batch.id}><TableCell>{batch.period}</TableCell><TableCell>{batch.source}</TableCell><TableCell>{batch.filename}</TableCell><TableCell>{batch.row_count}</TableCell><TableCell>{formatIdr(batch.total_amount)}</TableCell><TableCell><StatusBadge batch={batch} /></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void loadDetail(batch.id)}>Detail</Button>{batch.status !== 'VOIDED_WITH_OFFSET' && batch.validation_result.policy_code === 'SOUNDPUB_LEGACY_70_21_9' && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => { setReplacementTarget(batch); setReplacementFile(null); setReplacementPreview(null); setReplacementReason(''); setReplacementSessionId(null); setReplacementRequestKey(null); setError(''); }}>Ganti</Button>}</div></TableCell></TableRow>)}{history.data?.items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada impor.</TableCell></TableRow>}</TableBody></Table></div>
        <div className="flex justify-between"><Button variant="outline" disabled={offset === 0 || history.isFetching} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Sebelumnya</Button><Button variant="outline" disabled={(history.data?.items.length ?? 0) < PAGE_SIZE || history.isFetching} onClick={() => setOffset(value => value + PAGE_SIZE)}>Berikutnya</Button></div>
      </CardContent></Card>
      {replacementTarget && <Card><CardHeader><CardTitle>Ganti batch {replacementTarget.id}</CardTitle><CardDescription>Periode wajib tetap {replacementTarget.period}. Batch lama akan dibalik lewat ledger, bukan dihapus.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Input type="file" accept=".csv,text/csv" onChange={event => { const next = event.target.files?.[0] ?? null; setReplacementFile(next); setReplacementPreview(null); setReplacementSessionId(null); setReplacementRequestKey(null); if (next && next.size > MAX_CSV_BYTES) setError('CSV replacement maksimum 100 MB.'); }} />
        <label className="block text-sm font-medium">Alasan replacement<Input value={replacementReason} maxLength={1000} onChange={event => setReplacementReason(event.target.value)} /></label>
        {replacementPreview && <p>Preview: {replacementPreview.valid_rows} valid, {replacementPreview.invalid_rows} invalid, total {formatIdr(replacementPreview.total_net_amount)}.</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!replacementFile || replacementFile.size > MAX_CSV_BYTES || !replacementReason.trim() || !!busy} onClick={() => void previewReplacement()}>{busy === 'replace-preview' ? 'Mengupload dan memvalidasi...' : 'Upload dan preview replacement'}</Button><Button disabled={!replacementSessionId || !replacementPreview?.checksum || replacementPreview.invalid_rows > 0 || replacementPreview.file_errors > 0 || !replacementReason.trim() || !!busy} onClick={() => void commitReplacement()}>{busy === 'replace-commit' ? 'Mengganti...' : 'Konfirmasi replacement atomik'}</Button><Button variant="ghost" disabled={!!busy} onClick={() => { setReplacementTarget(null); setReplacementFile(null); setReplacementPreview(null); setReplacementReason(''); setReplacementSessionId(null); setReplacementRequestKey(null); }}>Batal</Button></div>
      </CardContent></Card>}
      {selected && <Card><CardHeader><CardTitle>Detail batch {selected.id}</CardTitle><CardDescription>{selected.filename} · {selected.period} · {selected.row_count} baris</CardDescription></CardHeader><CardContent className="space-y-3">
        {(selected.replacement_batch_id || selected.replaces_batch_id) && <div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-medium">{selected.replacement_batch_id ? `Diganti oleh batch ${selected.replacement_batch_id}` : `Menggantikan batch ${selected.replaces_batch_id}`}</p>{selected.change_reason && <p className="mt-1 text-muted-foreground">Alasan: {selected.change_reason}</p>}</div>}
        {selected.status !== 'VOIDED_WITH_OFFSET' && reconciliation && <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Rekonsiliasi batch</p><p className="text-sm text-muted-foreground">Entry, allocation, ledger, audit, dan outbox diperiksa dari backend.</p></div><Badge variant={selected.status === 'RECONCILED' ? 'default' : reconciliation.matched ? 'outline' : 'destructive'}>{selected.status === 'RECONCILED' ? 'Reconciled' : reconciliation.matched ? 'Siap disetujui' : 'Mismatch'}</Badge></div>
          {reconciliation.issues.length > 0 && <ul className="list-disc pl-5 text-sm text-destructive">{reconciliation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
          {selected.status === 'RECONCILED' ? <p className="text-sm">Bukti: {selected.reconciliation_evidence ?? '-'}</p> : <div className="flex flex-col gap-2 sm:flex-row"><Input value={reconciliationEvidence} maxLength={500} disabled={!!busy} onChange={event => setReconciliationEvidence(event.target.value)} /><Button disabled={!reconciliation.matched || !reconciliationEvidence.trim() || !!busy} onClick={() => void reconcileSelected()}>{busy === 'reconcile' ? 'Menyimpan...' : 'Setujui rekonsiliasi'}</Button></div>}
        </div>}
        <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Baris</TableHead><TableHead>ISRC</TableHead><TableHead>Platform</TableHead><TableHead>Komponen</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader><TableBody>{selected.entries.map(entry => <TableRow key={entry.id}><TableCell>{entry.source_row_number ?? entry.source_row_id}</TableCell><TableCell className="font-mono">{entry.source_isrc ?? '-'}</TableCell><TableCell>{entry.platform ?? '-'}</TableCell><TableCell>{entry.allocations.map(allocation => `${allocation.component} ${formatIdr(allocation.amount)}`).join(' · ')}</TableCell><TableCell className="text-right">{formatIdr(entry.net_amount)}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Baris {selected.entry_total === 0 ? 0 : selected.entry_offset + 1}–{selected.entry_offset + selected.entries.length} dari {selected.entry_total}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={detailOffset === 0 || !!busy} onClick={() => void loadDetail(selected.id, Math.max(0, detailOffset - DETAIL_PAGE_SIZE))}>Sebelumnya</Button>
            <Button variant="outline" disabled={detailOffset + selected.entries.length >= selected.entry_total || !!busy} onClick={() => void loadDetail(selected.id, detailOffset + DETAIL_PAGE_SIZE)}>Berikutnya</Button>
          </div>
        </div>
      </CardContent></Card>}
    </>}
  </div></DashboardLayout>;
}
