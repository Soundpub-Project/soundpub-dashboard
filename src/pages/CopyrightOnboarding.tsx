import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type ApplicantType = 'personal' | 'company' | 'label' | 'representative';
const nextStepStatuses = new Set(['draft', 'revision_requested', 'awaiting_payment']);

export default function CopyrightOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [legalName, setLegalName] = useState('');
  const [phone, setPhone] = useState('');
  const [applicantType, setApplicantType] = useState<ApplicantType>('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRegistration, setExistingRegistration] = useState<any>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      if (!user.email_confirmed_at) {
        navigate('/verify-email-required', { replace: true });
        return;
      }
      const Soundpub = (supabase as any).schema('soundpub');
      const { data, error } = await Soundpub.from('copyright_registrations')
        .select('id, status, legal_name, phone, applicant_type')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) toast({ title: 'Profil tidak dapat dimuat', description: error.message, variant: 'destructive' });
      if (data) {
        setExistingRegistration(data);
        setLegalName(data.legal_name || '');
        setPhone(data.phone || '');
        setApplicantType(data.applicant_type || 'personal');
      }
      setLoading(false);
    };
    void loadProfile();
  }, [navigate, toast, user]);

  const continueRegistration = () => {
    if (existingRegistration && nextStepStatuses.has(existingRegistration.status)) {
      navigate('/dashboard/copyright-registration/new'); return;
    }
    if (existingRegistration) { navigate('/dashboard/copyright-registration/status'); return; }
    if (!legalName.trim()) { toast({ title: 'Nama legal wajib diisi', variant: 'destructive' }); return; }
    setSaving(true);
    void (async () => {
      try {
        const Soundpub = (supabase as any).schema('soundpub');
        const { error } = await Soundpub.from('copyright_registrations').insert({
          user_id: user?.id, status: 'draft', legal_name: legalName.trim(), email: user?.email || null,
          phone: phone.trim() || null, applicant_type: applicantType,
        });
        if (error) throw error;
        toast({ title: 'Profil hak cipta tersimpan', description: 'Lengkapi data karya dan dokumen.' });
        navigate('/dashboard/copyright-registration/new');
      } catch (error: any) {
        toast({ title: 'Pendaftaran gagal', description: error.message, variant: 'destructive' });
      } finally { setSaving(false); }
    })();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div><p className="text-sm font-medium text-primary">Perlindungan Hak Cipta</p><h1 className="text-3xl font-bold tracking-tight">Pendaftaran awal</h1><p className="mt-2 text-muted-foreground">Buat satu profil hak cipta yang terhubung dengan akun Soundpub Anda.</p></div>
        <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Satu akun, banyak layanan</AlertTitle><AlertDescription>Email yang sudah terdaftar sebagai Artist atau Label akan memakai akun yang sama. Sistem tidak membuat akun duplikat.</AlertDescription></Alert>
        {existingRegistration && !nextStepStatuses.has(existingRegistration.status) ? (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" />Profil sudah terdaftar</CardTitle><CardDescription>Status saat ini: {existingRegistration.status}</CardDescription></CardHeader><CardContent><Button onClick={() => navigate('/dashboard/copyright-registration/status')}>Buka Status Pendaftaran <ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
        ) : (
          <Card><CardHeader><CardTitle>Data pemohon</CardTitle><CardDescription>Data ini menjadi identitas awal untuk pengajuan kontrak hak cipta.</CardDescription></CardHeader><CardContent className="space-y-4">
            <div className="space-y-2"><Label>Email</Label><Input value={user?.email || ''} disabled /></div>
            <div className="space-y-2"><Label htmlFor="copyright-legal-name">Nama legal</Label><Input id="copyright-legal-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Nama sesuai identitas atau badan usaha" disabled={Boolean(existingRegistration)} /></div>
            <div className="space-y-2"><Label htmlFor="copyright-phone">Nomor telepon</Label><Input id="copyright-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08xxxxxxxxxx" disabled={Boolean(existingRegistration)} /></div>
            <div className="space-y-2"><Label>Tipe pemohon</Label><Select value={applicantType} onValueChange={(value) => setApplicantType(value as ApplicantType)} disabled={Boolean(existingRegistration)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Individu</SelectItem><SelectItem value="company">Badan usaha</SelectItem><SelectItem value="label">Label</SelectItem><SelectItem value="representative">Kuasa pemegang hak</SelectItem></SelectContent></Select></div>
            <Button onClick={continueRegistration} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lanjutkan Pendaftaran <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent></Card>
        )}
      </div>
    </DashboardLayout>
  );
}
