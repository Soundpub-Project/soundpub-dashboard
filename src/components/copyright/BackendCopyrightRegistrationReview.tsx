import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileCheck2, Loader2, RefreshCw, Search, ShieldCheck, Upload } from 'lucide-react';
import { copyrightRegistrationsApi, type CopyrightDocumentType, type CopyrightRegistration,
  type CopyrightRegistrationStatus, type CopyrightRegistrationSummary } from '@/api/copyright-registrations';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type ReviewStatus = 'in_review' | 'revision_requested' | 'approved' | 'rejected';
type ContractStatus = 'generated' | 'stamping_pending' | 'stamped' | 'signed' | 'active' | 'void';
const statuses: CopyrightRegistrationStatus[] = ['draft', 'awaiting_payment', 'paid_pending_review', 'in_review',
  'revision_requested', 'approved', 'rejected', 'contract_draft', 'contract_generated', 'stamping_pending',
  'stamped', 'contract_signed', 'active'];
const artifactType: Partial<Record<ContractStatus, CopyrightDocumentType>> = {
  generated: 'CONTRACT_GENERATED', stamped: 'CONTRACT_STAMPED', signed: 'CONTRACT_SIGNED',
};
const money = (value?: string, currency = 'IDR') => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency, minimumFractionDigits: 0,
}).format(Number(value ?? 0));
const date = (value?: string | null) => value ? new Date(value).toLocaleString('id-ID') : '-';

export function BackendCopyrightRegistrationReview() {
  const { registrationId } = useParams<{ registrationId?: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<CopyrightRegistrationSummary[]>([]);
  const [detail, setDetail] = useState<CopyrightRegistration | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [composerCode, setComposerCode] = useState('');
  const [stampProvider, setStampProvider] = useState('manual');
  const [artifact, setArtifact] = useState<File | null>(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (registrationId) {
        const value = await copyrightRegistrationsApi.detail(registrationId);
        setDetail(value); setComposerCode(value.composer_code ?? '');
      } else {
        const page = await copyrightRegistrationsApi.list({ limit: 100,
          ...(status === 'all' ? {} : { status: status as CopyrightRegistrationStatus }),
          ...(search.trim() ? { search: search.trim() } : {}) });
        setItems(page.items);
      }
    } catch {
      setError('Data review belum dapat dimuat. Periksa sesi admin dan koneksi backend.');
    } finally { setLoading(false); }
  }, [registrationId, search, status]);

  useEffect(() => { void load(); }, [load]);
  const selected = detail;
  const run = async (action: () => Promise<CopyrightRegistration>, success: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = await action();
      setDetail(value); setNote(''); setArtifact(null); toast.success(success);
    } catch {
      setError('Perubahan belum dikonfirmasi backend. Muat ulang sebelum mencoba lagi agar versi tidak tertinggal.');
    } finally { lock.current = false; setBusy(false); }
  };
  const review = (next: ReviewStatus) => {
    if (!selected || !selected.contract) return;
    if (['revision_requested', 'rejected'].includes(next) && !note.trim()) {
      setError('Catatan wajib untuk revisi atau penolakan.'); return;
    }
    void run(() => copyrightRegistrationsApi.review(selected.id, { version: selected.version, status: next,
      note: note.trim() || null, ...(next === 'approved' ? { composer_code: composerCode.trim() || null } : {}) }),
    'Keputusan review dikonfirmasi backend.');
  };
  const transitionContract = async (next: ContractStatus) => {
    if (!selected) return;
    const documentType = artifactType[next];
    if (documentType && !artifact) { setError(`Upload artifact ${documentType} sebelum melanjutkan.`); return; }
    if (next === 'void' && !note.trim()) { setError('Alasan pembatalan kontrak wajib diisi.'); return; }
    await run(async () => {
      let mediaObjectId: string | undefined;
      if (documentType && artifact) {
        const uploaded = await copyrightRegistrationsApi.uploadEvidence(selected.id, artifact, documentType) as { id?: string };
        if (!uploaded.id) throw new Error('Upload tidak menghasilkan media object');
        mediaObjectId = uploaded.id;
      }
      return copyrightRegistrationsApi.transitionContract(selected.id, { version: selected.contract.version, status: next,
        note: note.trim() || null, ...(mediaObjectId ? { media_object_id: mediaObjectId } : {}),
        ...(next === 'stamped' ? { stamp_provider: stampProvider.trim() || 'manual' } : {}) });
    }, `Tahap kontrak ${next} dikonfirmasi backend.`);
  };
  const download = async (mediaId: string) => {
    try {
      const capability = await copyrightRegistrationsApi.downloadEvidence(mediaId);
      const url = new URL(capability.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid URL');
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch { toast.error('Dokumen privat belum dapat dibuka.'); }
  };

  const counts = useMemo(() => ({ total: items.length,
    review: items.filter(item => ['paid_pending_review', 'in_review', 'revision_requested'].includes(item.status)).length,
    active: items.filter(item => item.status === 'active').length }), [items]);

  return <DashboardLayout><main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><Badge variant="outline">Backend Review</Badge><h1 className="mt-2 text-3xl font-bold">Review Registrasi Hak Cipta</h1>
        <p className="text-muted-foreground">Evidence, pembayaran, karya, dan kontrak diproses melalui backend.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 h-4 w-4" />Muat ulang</Button>
    </header>
    {error && <Alert variant="destructive"><AlertTitle>Belum dikonfirmasi</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!registrationId ? <>
      <section className="grid gap-3 sm:grid-cols-3"><Card><CardHeader><CardDescription>Total hasil</CardDescription><CardTitle>{counts.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Butuh review</CardDescription><CardTitle>{counts.review}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Aktif</CardDescription><CardTitle>{counts.active}</CardTitle></CardHeader></Card></section>
      <Card><CardHeader><CardTitle>Antrean review</CardTitle><CardDescription>Filter dijalankan backend.</CardDescription>
        <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama atau email" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua status</SelectItem>
            {statuses.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Button onClick={() => void load()}>Terapkan</Button></div></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow>
          <TableHead>Nama</TableHead><TableHead>Status</TableHead><TableHead>Tipe</TableHead><TableHead>Versi</TableHead><TableHead>Diperbarui</TableHead></TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : items.length ? items.map(item => <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/dashboard/copyright-registration/review/${item.id}`)}>
              <TableCell><p className="font-medium">{item.legal_name}</p><p className="text-xs text-muted-foreground">{item.email}</p></TableCell>
              <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell><TableCell>{item.applicant_type}</TableCell>
              <TableCell>{item.version}</TableCell><TableCell>{date(item.updated_at)}</TableCell></TableRow>)
            : <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Tidak ada registration.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </> : loading ? <div className="py-20 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin" /></div> : selected ? <>
      <Button variant="ghost" onClick={() => navigate('/dashboard/copyright-registration/review')}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button>
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6"><Card><CardHeader><CardTitle>{selected.legal_name}</CardTitle><CardDescription>{selected.email} · versi {selected.version}</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Status:</span> {selected.status}</p>
            <p><span className="text-muted-foreground">Tipe:</span> {selected.applicant_type}</p><p><span className="text-muted-foreground">Telepon:</span> {selected.phone}</p>
            <p><span className="text-muted-foreground">NIK:</span> {selected.nik || '-'}</p><p><span className="text-muted-foreground">NPWP:</span> {selected.npwp || '-'}</p>
            <p><span className="text-muted-foreground">Rekening:</span> {selected.bank_name || '-'} · {selected.bank_account_number || '-'}</p>
            <p className="sm:col-span-2"><span className="text-muted-foreground">Alamat:</span> {selected.address}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Karya ({selected.works.length})</CardTitle></CardHeader><CardContent className="space-y-3">{selected.works.map(work => <article key={work.id} className="rounded-lg border p-3">
            <p className="font-medium">{work.title}</p><p className="text-sm text-muted-foreground">{work.composer_name} · kepemilikan {work.ownership_percentage}% · {work.release_status}</p>
            {work.cowriters.length > 0 && <p className="text-xs text-muted-foreground">Co-writer: {work.cowriters.map(item => `${item.name} (${item.ownership_percentage}%)`).join(', ')}</p>}</article>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Dokumen privat ({selected.files.length})</CardTitle></CardHeader><CardContent className="space-y-2">{selected.files.map(file => <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="font-medium">{file.file_type}</p><p className="text-xs text-muted-foreground">{file.file_name} · {(file.file_size / 1024).toFixed(1)} KB</p></div>
            <Button size="sm" variant="outline" onClick={() => void download(file.media_object_id)}><Download className="mr-2 h-4 w-4" />Buka</Button></div>)}</CardContent></Card></div>
        <aside className="space-y-6"><Card><CardHeader><CardTitle>Evidence pembayaran</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <p>Status: <strong>{selected.payment?.payment_status ?? 'belum ada'}</strong></p><p>Jumlah: {money(selected.payment?.amount, selected.payment?.currency)}</p>
          <p>Dibayar: {date(selected.payment?.paid_at)}</p>
          {selected.payment?.provider_invoice_url && <Button size="sm" variant="outline" asChild><a href={selected.payment.provider_invoice_url} target="_blank" rel="noreferrer">Buka invoice</a></Button>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Keputusan reviewer</CardTitle><CardDescription>Versi dikirim untuk mencegah overwrite review lain.</CardDescription></CardHeader><CardContent className="space-y-3">
            <div><Label htmlFor="review-note">Catatan keputusan</Label><Textarea id="review-note" value={note} onChange={event => setNote(event.target.value)} disabled={busy} /></div>
            <div><Label htmlFor="composer-code">Composer code saat approval</Label><Input id="composer-code" value={composerCode} onChange={event => setComposerCode(event.target.value.toUpperCase())} disabled={busy} /></div>
            <div className="grid grid-cols-2 gap-2"><Button onClick={() => review('in_review')} disabled={busy}>Mulai review</Button><Button variant="outline" onClick={() => review('revision_requested')} disabled={busy}>Minta revisi</Button>
              <Button variant="secondary" onClick={() => review('approved')} disabled={busy}>Approve</Button><Button variant="destructive" onClick={() => review('rejected')} disabled={busy}>Reject</Button></div></CardContent></Card>
          <Card><CardHeader><CardTitle>Lifecycle kontrak</CardTitle><CardDescription>{selected.contract?.contract_number || 'Nomor belum dibuat'} · {selected.contract?.status || 'belum ada'}</CardDescription></CardHeader>
            <CardContent className="space-y-3"><Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Artifact wajib</AlertTitle><AlertDescription>Generate, stamped, dan signed membutuhkan PDF terverifikasi.</AlertDescription></Alert>
              {selected.contract?.download_reference && <Button className="w-full" variant="secondary" onClick={() => void download(selected.contract!.download_reference!)} disabled={busy}><Download className="mr-2 h-4 w-4" />Buka artifact kontrak</Button>}
              <div><Label htmlFor="contract-artifact">Artifact PDF</Label><Input id="contract-artifact" type="file" accept="application/pdf" disabled={busy} onChange={event => setArtifact(event.target.files?.[0] ?? null)} /></div>
              <div><Label htmlFor="stamp-provider">Stamp provider</Label><Input id="stamp-provider" value={stampProvider} disabled={busy} onChange={event => setStampProvider(event.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => void transitionContract('generated')} disabled={busy}><Upload className="mr-2 h-4 w-4" />Generated</Button>
                <Button variant="outline" onClick={() => void transitionContract('stamping_pending')} disabled={busy}>Stamp pending</Button>
                <Button variant="outline" onClick={() => void transitionContract('stamped')} disabled={busy}><FileCheck2 className="mr-2 h-4 w-4" />Stamped</Button>
                <Button variant="outline" onClick={() => void transitionContract('signed')} disabled={busy}>Signed</Button>
                <Button onClick={() => void transitionContract('active')} disabled={busy}>Activate</Button><Button variant="destructive" onClick={() => void transitionContract('void')} disabled={busy}>Void</Button></div>
            </CardContent></Card></aside>
      </section></> : <Alert variant="destructive"><AlertTitle>Registration tidak ditemukan</AlertTitle><AlertDescription>Data tidak tersedia atau akses ditolak.</AlertDescription></Alert>}
  </main></DashboardLayout>;
}
