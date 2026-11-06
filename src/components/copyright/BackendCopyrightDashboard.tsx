import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Download, FileText, Music, TrendingUp, Wallet } from 'lucide-react';
import { copyrightApi, type CopyrightRoyaltySummary } from '@/api/copyright';
import { copyrightRegistrationsApi, type CopyrightRegistration } from '@/api/copyright-registrations';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric',
}) : '-';

// Preserve whole-rupiah display rounding without converting money to floating point.
export const formatRoyaltyMinor = (value: string) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format((BigInt(value) + 50n) / 100n);

export function BackendCopyrightDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [registration, setRegistration] = useState<CopyrightRegistration | null>(null);
  const [summary, setSummary] = useState<CopyrightRoyaltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationError, setRegistrationError] = useState('');
  const [financeError, setFinanceError] = useState('');
  const loadSequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    setLoading(true); setRegistrationError(''); setFinanceError('');
    setRegistration(null); setSummary(null);
    const [registrationResult, royaltyResult] = await Promise.allSettled([
      copyrightRegistrationsApi.current(signal), copyrightApi.summary(signal),
    ]);
    if (signal?.aborted || sequence !== loadSequence.current) return;
    if (registrationResult.status === 'fulfilled') setRegistration(registrationResult.value);
    else setRegistrationError('Status pendaftaran belum dapat dimuat dari backend.');
    if (royaltyResult.status === 'fulfilled') setSummary(royaltyResult.value);
    else setFinanceError('Data royalti backend belum tersedia untuk akun ini.');
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const latestRoyalty = summary?.latest;
  const openContract = async () => {
    const reference = registration?.contract?.download_reference;
    if (!reference) return;
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const capability = await copyrightRegistrationsApi.downloadEvidence(reference);
      const url = new URL(capability.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid download URL');
      if (popup) popup.location.replace(url.href);
      else window.location.assign(url.href);
    } catch { popup?.close(); toast.error('Kontrak privat belum dapat diunduh.'); }
  };

  if (loading) return <DashboardLayout><main className="space-y-6"><h1 className="text-3xl font-bold">Dashboard Hak Cipta</h1>
    <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(item => <Card key={item}><CardHeader><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-24" /></CardHeader></Card>)}</div>
  </main></DashboardLayout>;

  return <DashboardLayout><main className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><Badge variant="outline">Backend</Badge>
      <h1 className="mt-2 text-3xl font-bold">Dashboard Hak Cipta</h1><p className="text-muted-foreground">Pendaftaran, karya, kontrak, dan royalti dari backend Soundpub.</p></div>
      {!registration && !registrationError && <Button onClick={() => navigate('/dashboard/copyright-registration')}><FileText className="mr-2 h-4 w-4" />Daftar Hak Cipta</Button>}
    </header>
    {registrationError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Data pendaftaran tidak tersedia</AlertTitle><AlertDescription>{registrationError} <Button variant="link" className="h-auto p-0" onClick={() => void load()}>Coba lagi</Button></AlertDescription></Alert>}
    <section className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">Total Royalti</CardTitle><Wallet className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{financeError || !summary ? '—' : formatRoyaltyMinor(summary.total_minor)}</p><p className="text-xs text-muted-foreground">{financeError || `${summary?.entry_count ?? '0'} earning backend`}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">Royalti Terbaru</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{latestRoyalty ? formatRoyaltyMinor(latestRoyalty.amount_minor) : '—'}</p><p className="text-xs text-muted-foreground">{financeError || (latestRoyalty ? `Periode ${latestRoyalty.period}` : 'Belum ada data')}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">Karya Terdaftar</CardTitle><Music className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{registration?.works.length ?? 0}</p><p className="text-xs text-muted-foreground">{registration ? registration.status : 'Belum mendaftar'}</p></CardContent></Card>
    </section>
    {registration ? <>
      <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Status Pendaftaran</CardTitle><CardDescription>{registration.legal_name}</CardDescription></div><Badge>{registration.status}</Badge></div></CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2"><p><span className="text-muted-foreground">Tipe pemohon:</span> {registration.applicant_type}</p><p><span className="text-muted-foreground">Composer code:</span> {registration.composer_code || '-'}</p><p><span className="text-muted-foreground">Diajukan:</span> {date(registration.submitted_at)}</p><p><span className="text-muted-foreground">Disetujui:</span> {date(registration.approved_at)}</p></CardContent></Card>
      {registration.contract && <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Kontrak</CardTitle><CardDescription>{registration.contract.contract_number || 'Nomor belum tersedia'}</CardDescription></div><Badge variant="secondary">{registration.contract.status}</Badge></div></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Ditandatangani: {date(registration.contract.signed_at)}</p>{registration.contract.download_reference && <Button variant="outline" onClick={() => void openContract()}><Download className="mr-2 h-4 w-4" />Download kontrak</Button>}</CardContent></Card>}
      <Card><CardHeader><CardTitle>Karya Terdaftar</CardTitle><CardDescription>{registration.works.length} karya pada pendaftaran aktif.</CardDescription></CardHeader><CardContent className="space-y-3">{registration.works.length ? registration.works.map(work => <article key={work.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{work.title}</p><p className="text-sm text-muted-foreground">{work.composer_name}{work.lyricist_name ? ` · Lirik: ${work.lyricist_name}` : ''}</p></div><Badge variant="outline">{work.ownership_percentage}%</Badge></div><p className="mt-2 text-xs text-muted-foreground">{work.release_status}{work.release_date ? ` · ${date(work.release_date)}` : ''}</p></article>) : <p className="text-sm text-muted-foreground">Belum ada karya pada draft ini.</p>}</CardContent></Card>
    </> : !registrationError && <Card><CardContent className="flex flex-col items-center py-12 text-center"><FileText className="mb-4 h-12 w-12 text-muted-foreground" /><h2 className="text-lg font-semibold">Belum Ada Pendaftaran</h2><p className="mb-4 max-w-md text-sm text-muted-foreground">Mulai pendaftaran untuk menampilkan status, karya, dan kontrak pada dashboard ini.</p><Button onClick={() => navigate('/dashboard/copyright-registration')}>Mulai Pendaftaran</Button></CardContent></Card>}
  </main></DashboardLayout>;
}
