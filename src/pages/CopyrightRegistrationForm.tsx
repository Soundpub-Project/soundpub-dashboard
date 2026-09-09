import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Download, FileText, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ApplicantType = 'personal' | 'band_representative' | 'company_label';
type ReleaseStatus = 'unreleased' | 'released' | 'unknown';
type FileKey = 'ktp' | 'npwp' | 'powerOfAttorney' | 'audioDemo' | 'lyricsDocument' | 'workEvidence';

interface WorkForm {
  title: string;
  alternate_title: string;
  composer_name: string;
  lyricist_name: string;
  ownership_percentage: string;
  is_collaboration: boolean;
  release_status: ReleaseStatus;
  release_date: string;
  isrc: string;
  upc: string;
  links: string;
  lyrics: string;
  notes: string;
}

interface PendingFileGroup {
  ktp: File | null;
  npwp: File | null;
  powerOfAttorney: File | null;
  audioDemo: File | null;
  lyricsDocument: File | null;
  workEvidence: File | null;
}

interface DraftFileMetadata {
  key: FileKey;
  label: string;
  file_type: 'ktp' | 'npwp' | 'power_of_attorney' | 'audio_demo' | 'lyrics_document' | 'work_evidence';
  required?: boolean;
}

interface ExistingFileSummary {
  file_type: DraftFileMetadata['file_type'];
  file_name: string | null;
  file_url: string | null;
}

const emptyWork = (): WorkForm => ({
  title: '',
  alternate_title: '',
  composer_name: '',
  lyricist_name: '',
  ownership_percentage: '100',
  is_collaboration: false,
  release_status: 'unreleased',
  release_date: '',
  isrc: '',
  upc: '',
  links: '',
  lyrics: '',
  notes: '',
});

const steps = [
  'Data Pemohon',
  'Pajak & Pembayaran',
  'Data Karya',
  'Hak & Royalti',
  'Review',
];

export default function CopyrightRegistrationForm() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [legalName, setLegalName] = useState(profile?.full_name || '');
  const [stageName, setStageName] = useState('');
  const [nik, setNik] = useState('');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [applicantType, setApplicantType] = useState<ApplicantType>('personal');
  const [npwp, setNpwp] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [works, setWorks] = useState<WorkForm[]>([emptyWork()]);
  const [agreementOriginal, setAgreementOriginal] = useState(false);
  const [agreementExclusive, setAgreementExclusive] = useState(false);
  const [agreementRoyalty, setAgreementRoyalty] = useState(false);
  const [files, setFiles] = useState<PendingFileGroup>({
    ktp: null,
    npwp: null,
    powerOfAttorney: null,
    audioDemo: null,
    lyricsDocument: null,
    workEvidence: null,
  });
  const [existingFiles, setExistingFiles] = useState<ExistingFileSummary[]>([]);

  const progress = useMemo(() => (step / steps.length) * 100, [step]);
  const canSubmitAgreement = agreementOriginal && agreementExclusive && agreementRoyalty;

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      if (!legalName.trim()) return 'Nama lengkap wajib diisi.';
      if (!email.trim()) return 'Email wajib diisi.';
      return null;
    }

    if (currentStep === 3) {
      const validWorks = works.filter((work) => work.title.trim());
      if (validWorks.length === 0) return 'Minimal 1 karya wajib diisi.';
      return null;
    }

    if (currentStep === 4 && !canSubmitAgreement) {
      return 'Mohon centang semua pernyataan persetujuan.';
    }

    return null;
  };

  const goNext = () => {
    const errorMessage = validateStep(step);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    setStep((current) => Math.min(steps.length, current + 1));
  };

  const buildDraftPreviewUrl = () => {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
    const workItems = works.filter((work) => work.title.trim()).map((work) => '<li>' + escapeHtml(work.title.trim()) + '</li>').join('') || '<li>-</li>';
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Draft Kontrak Hak Cipta Soundpub</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif;color:#0d1424}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;padding:0 19mm 22mm}.header{height:84px;background:#0d1424;margin:0 -19mm 34px;padding:22px 19mm;color:#fff;position:relative}.brand{font-size:25px;font-weight:700;letter-spacing:-1px}.subtitle{color:#d1d8e4;font-size:9px;letter-spacing:.8px;margin-top:3px}.badge{position:absolute;right:19mm;top:24px;background:#f5630c;padding:8px 18px;color:#fff;font-size:10px;font-weight:700}.watermark{position:absolute;top:44%;left:10%;right:10%;transform:rotate(-25deg);font-size:42px;opacity:.08;font-weight:700;text-align:center;pointer-events:none}.eyebrow{font-size:10px;color:#f5630c;font-weight:700;letter-spacing:.8px}.title{font-size:22px;font-weight:700;margin:8px 0 5px}.number{font-size:11px;font-weight:700;color:#f5630c;margin-bottom:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 38px;border:1px solid #d9dee8;padding:18px;margin-bottom:25px}.label{font-size:10px;font-weight:700;margin-bottom:4px}.value{font-size:10px;line-height:1.45}.section-title{font-size:13px;font-weight:700;margin:26px 0 10px}.works{border:1px solid #d9dee8;padding:14px 18px;font-size:10px;line-height:1.7}.footer{position:absolute;bottom:14mm;left:19mm;right:19mm;font-size:8px;color:#656d7a;border-top:1px solid #d9dee8;padding-top:8px}@media print{body{background:#fff}.page{margin:0}.no-print{display:none}}</style></head><body><main class="page"><header class="header"><div class="brand">soundpub</div><div class="subtitle">DRAFT KONTRAK PUBLISHING HAK CIPTA</div><div class="badge">DRAFT / BELUM DIBAYAR</div></header><div class="watermark">DRAFT KONTRAK</div><div class="eyebrow">SOUNDPUB PUBLISHING</div><h1 class="title">Draft Kontrak Hak Cipta</h1><p class="number">P00001/Soundpub/I/PBLSR/2026 · Format final setelah persetujuan</p><section class="grid"><div><div class="label">PIHAK PERTAMA</div><div class="value">PT UTERO KREATIF INDONESIA (Soundpub)</div></div><div><div class="label">PIHAK KEDUA</div><div class="value">' + escapeHtml(legalName || '-') + '</div></div><div><div class="label">WILAYAH</div><div class="value">Seluruh Dunia</div></div><div><div class="label">MASA KONTRAK</div><div class="value">3 Tahun + perpanjangan otomatis</div></div><div><div class="label">BIAYA REGISTRASI</div><div class="value">Rp100.000</div></div><div><div class="label">EMAIL PEMOHON</div><div class="value">' + escapeHtml(email || '-') + '</div></div></section><h2 class="section-title">Daftar Karya</h2><ol class="works">' + workItems + '</ol><p class="footer">Dokumen draft ini dibuat otomatis oleh Soundpub. Gunakan fitur cetak browser untuk menyimpan sebagai PDF.</p></main></body></html>';
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  };

  const downloadDraftPreview = async () => {
    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const navy = rgb(0.05, 0.08, 0.14);
      const orange = rgb(0.96, 0.39, 0.05);
      const gray = rgb(0.35, 0.39, 0.46);
      const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim() || '-';
      const row = (label: string, value: string, y: number) => {
        page.drawText(label, { x: 54, y, size: 10, font: bold, color: navy });
        page.drawText(clean(value), { x: 210, y, size: 10, font: regular, color: navy, maxWidth: 320 });
      };
      page.drawRectangle({ x: 0, y: 758, width: 595, height: 84, color: navy });
      page.drawText('soundpub', { x: 54, y: 793, size: 25, font: bold, color: rgb(1, 1, 1) });
      page.drawText('DRAFT KONTRAK PUBLISHING HAK CIPTA', { x: 54, y: 775, size: 9, font: regular, color: rgb(0.82, 0.86, 0.91) });
      page.drawRectangle({ x: 385, y: 779, width: 156, height: 26, color: orange });
      page.drawText('DRAFT / BELUM DIBAYAR', { x: 397, y: 788, size: 9, font: bold, color: rgb(1, 1, 1) });
      page.drawText('Draft Kontrak Hak Cipta', { x: 54, y: 710, size: 20, font: bold, color: navy });
      page.drawText('P00001/Soundpub/I/PBLSR/2026', { x: 54, y: 688, size: 11, font: bold, color: orange });
      page.drawText('Format final setelah persetujuan admin', { x: 54, y: 671, size: 9, font: regular, color: gray });
      page.drawRectangle({ x: 54, y: 565, width: 487, height: 82, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 });
      row('Pihak Pertama', 'PT UTERO KREATIF INDONESIA (Soundpub)', 625);
      row('Pihak Kedua', legalName, 604);
      row('Email', email, 583);
      page.drawText('Detail Kontrak', { x: 54, y: 526, size: 13, font: bold, color: navy });
      page.drawRectangle({ x: 54, y: 402, width: 487, height: 100, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 });
      row('Wilayah', 'Seluruh Dunia', 478);
      row('Masa Kontrak', '3 Tahun + perpanjangan otomatis', 457);
      row('Biaya Registrasi', 'Rp100.000', 436);
      row('Jumlah Karya', String(works.filter((work) => work.title.trim()).length), 415);
      page.drawRectangle({ x: 54, y: 322, width: 487, height: 55, color: rgb(0.96, 0.97, 0.99) });
      page.drawText('STATUS DOKUMEN', { x: 72, y: 350, size: 10, font: bold, color: navy });
      page.drawText('DRAFT - WATERMARK SEBELUM BAYAR', { x: 295, y: 343, size: 11, font: bold, color: orange });
      page.drawText('Daftar Karya', { x: 54, y: 280, size: 13, font: bold, color: navy });
      works.filter((work) => work.title.trim()).slice(0, 12).forEach((work, index) => {
        page.drawText((index + 1) + '. ' + clean(work.title), { x: 72, y: 258 - index * 18, size: 10, font: regular, color: navy, maxWidth: 450 });
      });
      page.drawText('Dokumen draft ini dibuat otomatis oleh Soundpub dan belum menjadi kontrak aktif.', { x: 54, y: 90, size: 8, font: regular, color: gray });
      const bytes = await pdf.save();
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'Soundpub-copyright-draft-' + (legalName || 'registration') + '.pdf';
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to generate copyright draft PDF:', error);
      toast.error('PDF draft gagal dibuat.');
    }
  };

  const setFile = (key: keyof PendingFileGroup, file: File | null) => {
    setFiles((current) => ({ ...current, [key]: file }));
  };

  const parseLinks = (value: string) => value
    .split('\n')
    .map((link) => link.trim())
    .filter(Boolean);

  const buildFileMetadata = (): DraftFileMetadata[] => [
    { key: 'ktp', label: 'KTP', file_type: 'ktp', required: true },
    { key: 'npwp', label: 'NPWP', file_type: 'npwp' },
    { key: 'powerOfAttorney', label: 'Surat Kuasa', file_type: 'power_of_attorney' },
    { key: 'audioDemo', label: 'Audio Demo', file_type: 'audio_demo' },
    { key: 'lyricsDocument', label: 'Dokumen Lirik', file_type: 'lyrics_document' },
    { key: 'workEvidence', label: 'Bukti Karya', file_type: 'work_evidence', required: true },
  ];

  const fileUrlValue = (file: File) => `pending://${encodeURIComponent(file.name)}`;

  useEffect(() => {
    let mounted = true;
    const loadExistingDraft = async () => {
      if (!user) return;
      try {
        const Soundpub = (supabase as any).schema('soundpub');
        const { data: registration } = await Soundpub
          .from('copyright_registrations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;

        if (!registration) {
          navigate('/dashboard/copyright/onboarding', { replace: true });
          return;
        }

        if (registration.status !== 'draft' && registration.status !== 'revision_requested' && registration.status !== 'awaiting_payment') {
          return;
        }

        setRegistrationId(registration.id);
        setLegalName(registration.legal_name || '');
        setStageName(registration.stage_name || '');
        setNik(registration.nik || '');
        setEmail(registration.email || '');
        setPhone(registration.phone || '');
        setAddress(registration.address_json?.raw || '');
        setApplicantType(registration.applicant_type || 'personal');
        setNpwp(registration.npwp || '');
        setBankName(registration.bank_name || '');
        setBankAccountNumber(registration.bank_account_number || '');
        setBankAccountName(registration.bank_account_name || '');

        const { data: workRows } = await Soundpub
          .from('copyright_registration_works')
          .select('*')
          .eq('registration_id', registration.id)
          .order('created_at', { ascending: true });

        if (mounted && workRows?.length) {
          setWorks(workRows.map((row: any) => ({
            title: row.title || '',
            alternate_title: row.alternate_title || '',
            composer_name: row.composer_name || '',
            lyricist_name: row.lyricist_name || '',
            ownership_percentage: String(row.ownership_percentage ?? '100'),
            is_collaboration: Boolean(row.is_collaboration),
            release_status: row.release_status || 'unreleased',
            release_date: row.release_date || '',
            isrc: row.isrc || '',
            upc: row.upc || '',
            links: Array.isArray(row.links_json) ? row.links_json.join('\\n') : '',
            lyrics: row.lyrics || '',
            notes: row.notes || '',
          })));
        }

        const { data: fileRows } = await Soundpub
          .from('copyright_registration_files')
          .select('file_type, file_name, file_url')
          .eq('registration_id', registration.id)
          .order('uploaded_at', { ascending: true });

        if (mounted && fileRows?.length) {
          setExistingFiles(fileRows.map((row: any) => ({
            file_type: row.file_type,
            file_name: row.file_name,
            file_url: row.file_url,
          })));
        }
      } catch (error) {
        console.error('Error loading existing copyright draft:', error);
      }
    };

    loadExistingDraft();
    return () => { mounted = false; };
  }, [navigate, user]);

  const validateDraft = () => {
    if (!user) return 'User belum login.';
    if (!legalName.trim()) return 'Nama lengkap wajib diisi.';
    if (!email.trim()) return 'Email wajib diisi.';
    if (!works.some((work) => work.title.trim())) return 'Minimal 1 judul karya wajib diisi.';
    if (!files.ktp && !existingFiles.some((item) => item.file_type === 'ktp')) return 'Upload KTP wajib diisi.';
    if (!files.workEvidence && !existingFiles.some((item) => item.file_type === 'work_evidence')) return 'Upload bukti karya wajib diisi.';
    return null;
  };

  const saveDraft = async () => {
    const errorMessage = validateDraft();
    if (errorMessage) {
      toast.error(errorMessage);
      return null;
    }

    setSaving(true);
    try {
      const Soundpub = (supabase as any).schema('soundpub');
      const payload = {
        user_id: user!.id,
        status: 'draft',
        legal_name: legalName.trim(),
        stage_name: stageName.trim() || null,
        nik: nik.trim() || null,
        address_json: { raw: address.trim() },
        phone: phone.trim() || null,
        email: email.trim(),
        npwp: npwp.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_account_name: bankAccountName.trim() || null,
        applicant_type: applicantType,
      };

      let currentRegistrationId = registrationId;
      if (currentRegistrationId) {
        const { error } = await Soundpub
          .from('copyright_registrations')
          .update(payload)
          .eq('id', currentRegistrationId);
        if (error) throw error;
      } else {
        const { data, error } = await Soundpub
          .from('copyright_registrations')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        currentRegistrationId = data.id;
        setRegistrationId(data.id);
      }

      await Soundpub
        .from('copyright_registration_works')
        .delete()
        .eq('registration_id', currentRegistrationId);

      const workPayload = works
        .filter((work) => work.title.trim())
        .map((work) => ({
          registration_id: currentRegistrationId,
          title: work.title.trim(),
          alternate_title: work.alternate_title.trim() || null,
          composer_name: work.composer_name.trim() || legalName.trim(),
          lyricist_name: work.lyricist_name.trim() || null,
          ownership_percentage: Number(work.ownership_percentage || 100),
          is_collaboration: work.is_collaboration,
          cowriters_json: [],
          release_status: work.release_status,
          release_date: work.release_date || null,
          isrc: work.isrc.trim() || null,
          upc: work.upc.trim() || null,
          links_json: parseLinks(work.links),
          lyrics: work.lyrics.trim() || null,
          notes: work.notes.trim() || null,
        }));

      if (workPayload.length > 0) {
        const { error } = await Soundpub
          .from('copyright_registration_works')
          .insert(workPayload);
        if (error) throw error;
      }

      const fileMetadata = buildFileMetadata();
      const fileRows = fileMetadata
        .map((item) => {
          const file = files[item.key];
          return file ? {
            registration_id: currentRegistrationId,
            file_type: item.file_type,
            file_url: fileUrlValue(file),
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size,
            uploaded_by: user!.id,
          } : null;
        })
        .filter(Boolean);

      if (fileRows.length > 0) {
        await Soundpub.from('copyright_registration_files').delete().eq('registration_id', currentRegistrationId);
        const { error: fileError } = await Soundpub
          .from('copyright_registration_files')
          .insert(fileRows);
        if (fileError) throw fileError;
      }

      toast.success('Draft pendaftaran berhasil disimpan.');
      return currentRegistrationId;
    } catch (error: any) {
      console.error('Error saving copyright registration draft:', error);
      toast.error(error?.message || 'Gagal menyimpan draft pendaftaran.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submitForPayment = async () => {
    if (!canSubmitAgreement) {
      toast.error('Mohon centang semua pernyataan persetujuan.');
      return;
    }

    const currentRegistrationId = await saveDraft();
    if (!currentRegistrationId || !user) return;

    setSaving(true);
    try {
      const Soundpub = (supabase as any).schema('soundpub');
      const { error: registrationError } = await Soundpub
        .from('copyright_registrations')
        .update({ status: 'awaiting_payment', submitted_at: new Date().toISOString() })
        .eq('id', currentRegistrationId);
      if (registrationError) throw registrationError;

      const { error: paymentError } = await Soundpub
        .from('copyright_registration_payments')
        .insert({
          registration_id: currentRegistrationId,
          user_id: user.id,
          amount: 100000,
          currency: 'IDR',
          payment_status: 'pending',
          includes_emeterai: true,
          emeterai_quantity: 1,
        });
      if (paymentError) throw paymentError;

      toast.success('Pendaftaran siap dibayar. Integrasi pembayaran akan disambungkan pada tahap berikutnya.');
      navigate('/dashboard/copyright-registration/status');
    } catch (error: any) {
      console.error('Error submitting copyright registration:', error);
      toast.error(error?.message || 'Gagal menyiapkan pembayaran registrasi.');
    } finally {
      setSaving(false);
    }
  };

  const addWork = () => setWorks((current) => [...current, emptyWork()]);
  const removeWork = (index: number) => setWorks((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const updateWork = (index: number, key: keyof WorkForm, value: string | boolean) => {
    setWorks((current) => current.map((work, itemIndex) => itemIndex === index ? { ...work, [key]: value } : work));
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" className="mb-2 -ml-3" onClick={() => navigate('/dashboard/copyright-registration')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Informasi
            </Button>
            <h1 className="text-2xl font-bold sm:text-3xl">Form Registrasi Hak Cipta</h1>
            <p className="text-muted-foreground">Lengkapi data pendaftaran. Anda bisa menyimpan draft kapan saja.</p>
          </div>
          <Badge variant="outline">Draft</Badge>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {steps.map((item, index) => (
                <span key={item} className={index + 1 === step ? 'font-semibold text-primary' : ''}>
                  {index + 1}. {item}
                </span>
              ))}
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Data Pemohon</CardTitle>
              <CardDescription>Data ini akan dipakai sebagai data komposer dalam draft kontrak.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama Lengkap Sesuai KTP *</Label>
                <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nama Panggung/Alias</Label>
                <Input value={stageName} onChange={(event) => setStageName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>NIK/KTP</Label>
                <Input value={nik} onChange={(event) => setNik(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>No. WhatsApp/Telepon</Label>
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bertindak Sebagai</Label>
                <Select value={applicantType} onValueChange={(value) => setApplicantType(value as ApplicantType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Pribadi</SelectItem>
                    <SelectItem value="band_representative">Kuasa Grup/Band</SelectItem>
                    <SelectItem value="company_label">Perusahaan/Label</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Alamat Lengkap</Label>
                <Textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Upload KTP</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(event) => setFile('ktp', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.ktp ? files.ktp.name : 'Belum ada file dipilih'}</p>
              </div>
              <div className="space-y-2">
                <Label>Upload NPWP</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(event) => setFile('npwp', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.npwp ? files.npwp.name : 'Belum ada file dipilih'}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Upload Surat Kuasa / Persetujuan</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(event) => setFile('powerOfAttorney', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.powerOfAttorney ? files.powerOfAttorney.name : 'Opsional untuk band/company representative'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Pajak & Pembayaran</CardTitle>
              <CardDescription>Data rekening dipakai untuk pembayaran royalti setelah kontrak aktif.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>NPWP</Label>
                <Input value={npwp} onChange={(event) => setNpwp(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nama Bank</Label>
                <Input value={bankName} onChange={(event) => setBankName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nomor Rekening</Label>
                <Input value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nama Pemilik Rekening</Label>
                <Input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} />
              </div>
              <Alert className="md:col-span-2">
                <FileText className="h-4 w-4" />
                <AlertTitle>Biaya Registrasi</AlertTitle>
                <AlertDescription>
                  Submit final membutuhkan pembayaran Rp100.000 dan sudah termasuk 1 e-Meterai untuk MVP.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Upload Bukti Karya</Label>
                <Input type="file" accept="image/*,application/pdf,audio/*" onChange={(event) => setFile('workEvidence', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.workEvidence ? files.workEvidence.name : 'Contoh: demo, draft lirik, atau bukti penciptaan'}</p>
              </div>
              <div className="space-y-2">
                <Label>Upload Audio Demo</Label>
                <Input type="file" accept="audio/*" onChange={(event) => setFile('audioDemo', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.audioDemo ? files.audioDemo.name : 'Opsional'}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Upload Dokumen Lirik</Label>
                <Input type="file" accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => setFile('lyricsDocument', event.target.files?.[0] || null)} />
                <p className="text-xs text-muted-foreground">{files.lyricsDocument ? files.lyricsDocument.name : 'Opsional'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {works.map((work, index) => (
              <Card key={index}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Karya #{index + 1}</CardTitle>
                    <CardDescription>Tambahkan data lagu/karya yang akan didaftarkan.</CardDescription>
                  </div>
                  {works.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeWork(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Judul Lagu *</Label>
                    <Input value={work.title} onChange={(event) => updateWork(index, 'title', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Alternatif Judul</Label>
                    <Input value={work.alternate_title} onChange={(event) => updateWork(index, 'alternate_title', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nama Komposer</Label>
                    <Input value={work.composer_name} onChange={(event) => updateWork(index, 'composer_name', event.target.value)} placeholder={legalName} />
                  </div>
                  <div className="space-y-2">
                    <Label>Penulis Lirik</Label>
                    <Input value={work.lyricist_name} onChange={(event) => updateWork(index, 'lyricist_name', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Persentase Kepemilikan</Label>
                    <Input type="number" min="0" max="100" value={work.ownership_percentage} onChange={(event) => updateWork(index, 'ownership_percentage', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status Rilis</Label>
                    <Select value={work.release_status} onValueChange={(value) => updateWork(index, 'release_status', value as ReleaseStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unreleased">Belum Rilis</SelectItem>
                        <SelectItem value="released">Sudah Rilis</SelectItem>
                        <SelectItem value="unknown">Tidak Tahu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <Checkbox checked={work.is_collaboration} onCheckedChange={(checked) => updateWork(index, 'is_collaboration', checked === true)} />
                    <Label>Karya kolaborasi/co-writer</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Tanggal Rilis</Label>
                    <Input type="date" value={work.release_date} onChange={(event) => updateWork(index, 'release_date', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>ISRC</Label>
                    <Input value={work.isrc} onChange={(event) => updateWork(index, 'isrc', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>UPC</Label>
                    <Input value={work.upc} onChange={(event) => updateWork(index, 'upc', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Link DSP/YouTube</Label>
                    <Textarea value={work.links} onChange={(event) => updateWork(index, 'links', event.target.value)} rows={3} placeholder="Satu link per baris" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Lirik</Label>
                    <Textarea value={work.lyrics} onChange={(event) => updateWork(index, 'lyrics', event.target.value)} rows={5} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Catatan</Label>
                    <Textarea value={work.notes} onChange={(event) => updateWork(index, 'notes', event.target.value)} rows={3} />
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" onClick={addWork}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Karya
            </Button>
          </div>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Hak, Wilayah, Royalti</CardTitle>
              <CardDescription>Konfirmasi pemahaman sebelum submit final.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-4"><p className="font-semibold">Mechanical</p><p className="text-sm text-muted-foreground">70% Komposer / 30% Publisher</p></div>
                <div className="rounded-lg border p-4"><p className="font-semibold">Synchronization</p><p className="text-sm text-muted-foreground">70% Komposer / 30% Publisher</p></div>
                <div className="rounded-lg border p-4"><p className="font-semibold">Kategori Lain</p><p className="text-sm text-muted-foreground">50% Komposer / 50% Publisher</p></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={agreementOriginal} onCheckedChange={(checked) => setAgreementOriginal(checked === true)} />
                  Saya menjamin karya yang didaftarkan adalah asli dan/atau saya memiliki hak/kuasa yang sah.
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={agreementExclusive} onCheckedChange={(checked) => setAgreementExclusive(checked === true)} />
                  Saya memahami pengelolaan Hak Cipta/Publishing bersifat eksklusif selama masa kontrak.
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={agreementRoyalty} onCheckedChange={(checked) => setAgreementRoyalty(checked === true)} />
                  Saya memahami skema royalti dan biaya registrasi Rp100.000 termasuk 1 e-Meterai.
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Pendaftaran</CardTitle>
              <CardDescription>Periksa ringkasan sebelum simpan draft atau lanjut pembayaran.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="text-sm text-muted-foreground">Nama</p><p className="font-medium">{legalName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-medium">{email || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Bank</p><p className="font-medium">{bankName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Jumlah Karya</p><p className="font-medium">{works.filter((work) => work.title.trim()).length}</p></div>
              </div>
              <Separator />
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">KTP</p><p className="font-medium">{files.ktp?.name || existingFiles.find((item) => item.file_type === 'ktp')?.file_name || '-'}</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">NPWP</p><p className="font-medium">{files.npwp?.name || existingFiles.find((item) => item.file_type === 'npwp')?.file_name || '-'}</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Surat Kuasa</p><p className="font-medium">{files.powerOfAttorney?.name || existingFiles.find((item) => item.file_type === 'power_of_attorney')?.file_name || '-'}</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Bukti Karya</p><p className="font-medium">{files.workEvidence?.name || existingFiles.find((item) => item.file_type === 'work_evidence')?.file_name || '-'}</p></div>
              </div>
              <Separator />
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertTitle>Preview Kontrak PDF</AlertTitle>
                <AlertDescription>
                  Download draft PDF dengan watermark akan dibuat pada tahap kontrak. Data form ini sudah disiapkan untuk mapping kontrak.
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" onClick={downloadDraftPreview}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Draft PDF
                </Button>
                <Button variant="outline" onClick={() => window.open(buildDraftPreviewUrl(), '_blank')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Buka Preview PDF
                </Button>
              </div>
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>Preview Draft Kontrak</CardTitle>
                  <CardDescription>Ringkasan ini akan dipakai untuk generate PDF draft dan kontrak final.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Pihak Pertama</p>
                  <p className="font-medium">PT UTERO KREATIF INDONESIA (Soundpub)</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nomor Surat</p>
                  <p className="font-medium">P00001/Soundpub/I/PBLSR/2026 <span className="text-muted-foreground">(format final saat approve)</span></p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pihak Kedua</p>
                  <p className="font-medium">{legalName || '-'}</p>
                </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Wilayah</p>
                    <p className="font-medium">Seluruh Dunia</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Masa Kontrak</p>
                    <p className="font-medium">3 Tahun + perpanjangan otomatis</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Biaya Registrasi</p>
                    <p className="font-medium">Rp100.000</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status PDF</p>
                    <p className="font-medium">Draft watermark sebelum bayar</p>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep((current) => Math.max(1, current - 1))}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Sebelumnya
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" disabled={saving} onClick={saveDraft}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan Draft
            </Button>
            {step < steps.length ? (
              <Button disabled={saving} onClick={goNext}>
                Lanjut
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={saving || !canSubmitAgreement} onClick={submitForPayment}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Lanjut ke Pembayaran
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

