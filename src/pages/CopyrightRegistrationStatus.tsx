import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createCopyrightInvoice, openXenditInvoice } from '@/lib/xendit';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Registration {
  id: string;
  legal_name: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  revision_notes: string | null;
  admin_notes: string | null;
}

interface Payment {
  payment_status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  xendit_invoice_url: string | null;
}

interface Contract {
  contract_number: string | null;
  status: string;
  signed_at: string | null;
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  awaiting_payment: 'Menunggu Pembayaran',
  paid_pending_review: 'Pembayaran Diverifikasi',
  in_review: 'Sedang Direview',
  revision_requested: 'Perlu Revisi',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  contract_draft: 'Draft Kontrak',
  contract_generated: 'Kontrak Dibuat',
  contract_signed: 'Kontrak Ditandatangani',
  active: 'Aktif',
};

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '-';
const formatCurrency = (amount: number, currency: string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: currency || 'IDR', maximumFractionDigits: 0 }).format(amount);

export default function CopyrightRegistrationStatus() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const Soundpub = (supabase as any).schema('soundpub');
      const { data: registrationData, error: registrationError } = await Soundpub
        .from('copyright_registrations')
        .select('id, legal_name, status, submitted_at, reviewed_at, approved_at, rejected_at, revision_notes, admin_notes')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (registrationError) throw registrationError;
      setRegistration(registrationData);
      if (!registrationData) return;

      const [{ data: paymentData, error: paymentError }, { data: contractData, error: contractError }] = await Promise.all([
        Soundpub.from('copyright_registration_payments').select('payment_status, amount, currency, paid_at, xendit_invoice_url').eq('registration_id', registrationData.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        Soundpub.from('copyright_contracts').select('contract_number, status, signed_at').eq('registration_id', registrationData.id).maybeSingle(),
      ]);
      if (paymentError) throw paymentError;
      if (contractError && contractError.code !== 'PGRST116') throw contractError;
      setPayment(paymentData);
      setContract(contractData);
    } catch (loadError: any) {
      setError(loadError.message || 'Status pendaftaran tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const pay = async () => {
    if (!registration) return;
    setCreatingInvoice(true);
    try { const invoice = await createCopyrightInvoice(registration.id); openXenditInvoice(invoice.invoice_url); await loadStatus(); }
    catch (paymentError: any) { setError(paymentError.message || 'Invoice tidak dapat dibuat.'); }
    finally { setCreatingInvoice(false); }
  };

  if (loading) return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-sm font-medium text-primary">Perlindungan Hak Cipta</p><h1 className="text-3xl font-bold tracking-tight">Status Pendaftaran</h1><p className="mt-2 text-muted-foreground">Pantau pembayaran, review, dan kontrak dalam satu tempat.</p></div>
          <Button variant="outline" onClick={() => void loadStatus()}><RefreshCw className="mr-2 h-4 w-4" />Muat Ulang</Button>
        </div>

        {error && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>Data tidak dapat dimuat</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {!error && !registration && <Card><CardHeader><CardTitle>Belum ada pendaftaran</CardTitle><CardDescription>Mulai dari profil awal sebelum mengajukan karya.</CardDescription></CardHeader><CardContent><Button onClick={() => navigate('/dashboard/copyright/onboarding')}>Mulai Pendaftaran</Button></CardContent></Card>}
        {registration && <>
          <Card><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle>{registration.legal_name}</CardTitle><CardDescription>Dikirim: {formatDate(registration.submitted_at)}</CardDescription></div><Badge>{statusLabels[registration.status] || registration.status}</Badge></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Review</p><p className="font-medium">{formatDate(registration.reviewed_at)}</p></div><div><p className="text-sm text-muted-foreground">Persetujuan</p><p className="font-medium">{formatDate(registration.approved_at)}</p></div><div><p className="text-sm text-muted-foreground">Kontrak</p><p className="font-medium">{contract?.status ? statusLabels[contract.status] || contract.status : 'Belum dibuat'}</p></div></CardContent></Card>

          {registration.status === 'revision_requested' && <Alert><FileText className="h-4 w-4" /><AlertTitle>Revisi diperlukan</AlertTitle><AlertDescription className="space-y-3"><p>{registration.revision_notes || registration.admin_notes || 'Admin meminta perbaikan data pendaftaran.'}</p><Button size="sm" onClick={() => navigate('/dashboard/copyright-registration/new')}>Perbaiki Pendaftaran</Button></AlertDescription></Alert>}

          <div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />Pembayaran</CardTitle><CardDescription>{payment ? statusLabels[registration.status] || 'Status pengajuan' : 'Tagihan belum dibuat'}</CardDescription></CardHeader><CardContent className="space-y-2">{payment ? <><p className="text-2xl font-bold">{formatCurrency(payment.amount, payment.currency)}</p><p className="text-sm text-muted-foreground">Status bayar: {payment.payment_status}</p><p className="text-sm text-muted-foreground">Dibayar: {formatDate(payment.paid_at)}</p>{payment.payment_status === 'pending' && <Button size="sm" onClick={() => void pay()} disabled={creatingInvoice}>{creatingInvoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Bayar Sekarang</Button>}</> : <p className="text-sm text-muted-foreground">Tagihan akan tampil setelah pengajuan dikirim.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Kontrak</CardTitle><CardDescription>Dokumen publishing Soundpub</CardDescription></CardHeader><CardContent className="space-y-2"><p className="text-sm text-muted-foreground">Nomor kontrak: {contract?.contract_number || '-'}</p><p className="text-sm text-muted-foreground">Ditandatangani: {formatDate(contract?.signed_at || null)}</p><p className="text-sm text-muted-foreground">Kontrak final akan tersedia setelah proses admin selesai.</p></CardContent></Card></div>
        </>}
      </div>
    </DashboardLayout>
  );
}
