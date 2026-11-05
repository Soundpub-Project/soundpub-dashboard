import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, FileText, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { copyrightRegistrationsApi, type CopyrightApplicantType, type CopyrightDocumentType,
  type CopyrightRegistration, type CopyrightWorkInput } from '@/api/copyright-registrations';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Mode = 'onboarding' | 'form' | 'status';
const blankWork = (): CopyrightWorkInput => ({ title: '', alternate_title: null, composer_name: '', lyricist_name: null,
  ownership_percentage: 100, is_collaboration: false, cowriters: [], release_status: 'unreleased', release_date: null,
  isrc: null, upc: null, links: [], lyrics: null, notes: null });
const labels: Record<string,string> = { draft:'Draft', awaiting_payment:'Menunggu Pembayaran', paid_pending_review:'Pembayaran Diverifikasi',
  in_review:'Sedang Direview', revision_requested:'Perlu Revisi', approved:'Disetujui', rejected:'Ditolak',
  contract_generated:'Kontrak Dibuat', stamping_pending:'Proses E-Meterai', stamped:'Bermeterai', contract_signed:'Ditandatangani', active:'Aktif' };
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle:'long', timeStyle:'short' }).format(new Date(value)) : '-';

export function BackendCopyrightRegistration({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [registration,setRegistration] = useState<CopyrightRegistration | null>(null);
  const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [error,setError] = useState('');
  const [legalName,setLegalName] = useState(''); const [email,setEmail] = useState(''); const [phone,setPhone] = useState('');
  const [applicantType,setApplicantType] = useState<CopyrightApplicantType>('personal');
  const [stageName,setStageName] = useState(''); const [nik,setNik] = useState(''); const [address,setAddress] = useState('');
  const [npwp,setNpwp] = useState(''); const [bankName,setBankName] = useState('');
  const [bankNumber,setBankNumber] = useState(''); const [bankAccountName,setBankAccountName] = useState('');
  const [works,setWorks] = useState<CopyrightWorkInput[]>([blankWork()]);
  const [identity,setIdentity] = useState<File | null>(null); const [evidence,setEvidence] = useState<File | null>(null);
  const [documentType,setDocumentType] = useState<CopyrightDocumentType>('WORK_EVIDENCE'); const [accepted,setAccepted] = useState(false);

  const hydrate = useCallback((item: CopyrightRegistration | null) => {
    setRegistration(item); if (!item) return;
    setLegalName(item.legal_name); setEmail(item.email); setPhone(item.phone); setApplicantType(item.applicant_type);
    setStageName(item.stage_name ?? ''); setNik(item.nik ?? ''); setAddress(item.address ?? ''); setNpwp(item.npwp ?? '');
    setBankName(item.bank_name ?? ''); setBankNumber(item.bank_account_number ?? ''); setBankAccountName(item.bank_account_name ?? '');
    setWorks(item.works.length ? item.works.map(({ id: _id, ...work }) => work) : [blankWork()]);
  }, []);
  const load = useCallback(async () => { setLoading(true); setError(''); try { hydrate(await copyrightRegistrationsApi.current()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Pendaftaran tidak dapat dimuat.'); } finally { setLoading(false); } }, [hydrate]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!legalName.trim() || !email.trim() || !phone.trim()) return setError('Nama legal, email, dan telepon wajib diisi.');
    setSaving(true); setError(''); try { const item = await copyrightRegistrationsApi.create({ legal_name:legalName,email,phone,applicant_type:applicantType });
      hydrate(item); navigate('/dashboard/copyright-registration/new'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft tidak dapat dibuat.'); } finally { setSaving(false); }
  };
  const draftBody = useMemo(() => registration ? ({ version:registration.version,legal_name:legalName,stage_name:stageName || null,
    nik:nik || null,email,phone:phone || null,address,applicant_type:applicantType,npwp:npwp || null,bank_name:bankName,
    bank_account_number:bankNumber,bank_account_name:bankAccountName,works:works.filter(work => work.title.trim()) }) : null,
  [address,applicantType,bankAccountName,bankName,bankNumber,email,legalName,nik,npwp,phone,registration,stageName,works]);
  const save = async () => {
    if (!registration || !draftBody) return null;
    setSaving(true); setError(''); try { let item = await copyrightRegistrationsApi.saveDraft(registration.id,draftBody);
      for (const [file,type] of [[identity,'IDENTITY'],[evidence,documentType]] as const) if (file) await copyrightRegistrationsApi.uploadEvidence(item.id,file,type);
      item = await copyrightRegistrationsApi.detail(item.id); hydrate(item); setIdentity(null); setEvidence(null);
      toast({ title:'Draft tersimpan', description:'Data dan bukti private sudah diperbarui.' }); return item;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft tidak dapat disimpan.'); return null; } finally { setSaving(false); }
  };
  const submit = async () => {
    if (!accepted) return setError('Persetujuan deklarasi wajib dicentang.');
    const saved=await save(); if(!saved)return; setSaving(true);
    try { hydrate(await copyrightRegistrationsApi.submit(saved.id,saved.version)); navigate('/dashboard/copyright-registration/status'); }
    catch(cause){setError(cause instanceof Error?cause.message:'Pendaftaran tidak dapat dikirim.');}finally{setSaving(false);}
  };
  const requestInvoice = async () => {
    if (!registration) return;
    setSaving(true); setError('');
    try {
      await copyrightRegistrationsApi.requestInvoice(registration.id);
      hydrate(await copyrightRegistrationsApi.detail(registration.id));
      toast({ title:'Invoice dibuat', description:'Invoice pembayaran sudah tersedia pada status pendaftaran.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice pembayaran tidak dapat dibuat.');
    } finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (mode==='onboarding') return <DashboardLayout><div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6"><Header title="Registrasi Hak Cipta" subtitle="Mulai profil publishing dengan data pemohon terverifikasi." />
    {error&&<ErrorAlert text={error}/>} {registration?<Card><CardHeader><CardTitle>Profil sudah terdaftar</CardTitle><CardDescription>Status: {labels[registration.status]??registration.status}</CardDescription></CardHeader><CardContent><Button onClick={()=>navigate(['draft','revision_requested'].includes(registration.status)?'/dashboard/copyright-registration/new':'/dashboard/copyright-registration/status')}>Lanjutkan <ArrowRight className="ml-2 h-4 w-4"/></Button></CardContent></Card>:<Card><CardHeader><CardTitle>Data awal pemohon</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="Nama legal"><Input value={legalName} onChange={e=>setLegalName(e.target.value)}/></Field><Field label="Email"><Input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Telepon"><Input value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="Tipe pemohon"><Applicant value={applicantType} set={setApplicantType}/></Field><div className="sm:col-span-2"><Button className="min-h-11" disabled={saving} onClick={()=>void create()}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Buat Draft</Button></div></CardContent></Card>}</div></DashboardLayout>;
  if (mode==='status') return <DashboardLayout><div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><Header title="Status Pendaftaran" subtitle="Pembayaran, review, dan kontrak dalam satu tampilan."/><Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Muat Ulang</Button></div>{error&&<ErrorAlert text={error}/>} {!registration?<Card><CardContent className="pt-6"><Button onClick={()=>navigate('/dashboard/copyright-registration')}>Mulai Pendaftaran</Button></CardContent></Card>:<><Card><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>{registration.legal_name}</CardTitle><CardDescription>Dikirim {date(registration.submitted_at)}</CardDescription></div><Badge>{labels[registration.status]??registration.status}</Badge></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Stat label="Review" value={date(registration.reviewed_at)}/><Stat label="Pembayaran" value={registration.payment?.payment_status??'Belum tersedia'}/><Stat label="Kontrak" value={registration.contract?.status??'Belum dibuat'}/></CardContent></Card>{registration.status==='revision_requested'&&<Alert><FileText className="h-4 w-4"/><AlertTitle>Revisi diperlukan</AlertTitle><AlertDescription><p className="mb-3">{registration.revision_notes||registration.admin_notes}</p><Button size="sm" onClick={()=>navigate('/dashboard/copyright-registration/new')}>Perbaiki draft</Button></AlertDescription></Alert>}<div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5"/>Pembayaran</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{registration.payment?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR'}).format(Number(registration.payment.amount)):'-'}</p><p className="mt-2 text-sm text-muted-foreground">Buat invoice setelah pendaftaran terkirim. Status dibayar hanya berubah setelah callback provider terverifikasi.</p>{registration.status==='awaiting_payment'&&!registration.payment?.provider_invoice_url&&<Button className="mt-4" disabled={saving} onClick={()=>void requestInvoice()}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Buat Invoice</Button>}{registration.payment?.provider_invoice_url&&<Button className="mt-4" onClick={()=>window.open(registration.payment!.provider_invoice_url!,'_blank','noopener,noreferrer')}>Buka Invoice</Button>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5"/>Kontrak</CardTitle></CardHeader><CardContent><p>Nomor: {registration.contract?.contract_number??'-'}</p><p className="text-sm text-muted-foreground">Ditandatangani: {date(registration.contract?.signed_at)}</p></CardContent></Card></div></>}</div></DashboardLayout>;
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"><div className="flex items-start justify-between gap-4"><Header title="Form Registrasi Hak Cipta" subtitle="Simpan draft atomik dan unggah bukti melalui storage private."/><Badge variant="outline">{labels[registration?.status??'draft']??'Draft'}</Badge></div>{error&&<ErrorAlert text={error}/>} {!registration?<Card><CardContent className="pt-6"><Button onClick={()=>navigate('/dashboard/copyright-registration')}>Buat profil awal</Button></CardContent></Card>:<><Card><CardHeader><CardTitle>Data pemohon</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Nama legal"><Input value={legalName} onChange={e=>setLegalName(e.target.value)}/></Field><Field label="Nama panggung"><Input value={stageName} onChange={e=>setStageName(e.target.value)}/></Field><Field label="NIK"><Input value={nik} onChange={e=>setNik(e.target.value)}/></Field><Field label="Email"><Input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Telepon"><Input value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="Tipe pemohon"><Applicant value={applicantType} set={setApplicantType}/></Field><Field label="Alamat" className="md:col-span-2"><Textarea value={address} onChange={e=>setAddress(e.target.value)}/></Field><Field label="NPWP"><Input value={npwp} onChange={e=>setNpwp(e.target.value)}/></Field><Field label="Bank"><Input value={bankName} onChange={e=>setBankName(e.target.value)}/></Field><Field label="Nomor rekening"><Input value={bankNumber} onChange={e=>setBankNumber(e.target.value)}/></Field><Field label="Nama rekening"><Input value={bankAccountName} onChange={e=>setBankAccountName(e.target.value)}/></Field></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Daftar karya</CardTitle><CardDescription>Minimal satu karya.</CardDescription></div><Button variant="outline" onClick={()=>setWorks(v=>[...v,blankWork()])}><Plus className="mr-2 h-4 w-4"/>Tambah</Button></CardHeader><CardContent className="space-y-4">{works.map((work,index)=><div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"><Field label={`Judul karya ${index+1}`}><Input value={work.title} onChange={e=>setWorks(v=>v.map((w,i)=>i===index?{...w,title:e.target.value}:w))}/></Field><Field label="Nama komposer"><Input value={work.composer_name} onChange={e=>setWorks(v=>v.map((w,i)=>i===index?{...w,composer_name:e.target.value}:w))}/></Field><Field label="Kepemilikan (%)"><Input type="number" min="0.01" max="100" value={work.ownership_percentage} onChange={e=>setWorks(v=>v.map((w,i)=>i===index?{...w,ownership_percentage:Number(e.target.value)}:w))}/></Field><div className="flex items-end justify-end"><Button variant="ghost" size="icon" aria-label={`Hapus karya ${index+1}`} disabled={works.length===1} onClick={()=>setWorks(v=>v.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4"/></Button></div></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/>Bukti private</CardTitle><CardDescription>PDF, gambar, atau audio. Maksimum 25 MB per file.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field label="Identitas (wajib)"><Input type="file" accept="application/pdf,image/*" onChange={e=>setIdentity(e.target.files?.[0]??null)}/></Field><div className="space-y-2"><Label>Jenis bukti karya</Label><Select value={documentType} onValueChange={v=>setDocumentType(v as CopyrightDocumentType)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="WORK_EVIDENCE">Bukti karya</SelectItem><SelectItem value="AUDIO_DEMO">Demo audio</SelectItem><SelectItem value="LYRICS">Dokumen lirik</SelectItem><SelectItem value="TAX">NPWP</SelectItem><SelectItem value="POWER_OF_ATTORNEY">Surat kuasa</SelectItem></SelectContent></Select><Input type="file" accept="application/pdf,image/*,audio/*" onChange={e=>setEvidence(e.target.files?.[0]??null)}/></div><div className="md:col-span-2 text-sm text-muted-foreground">Tersimpan: {registration.files.map(file=>file.file_name).join(', ')||'belum ada'}</div></CardContent></Card><Card><CardContent className="space-y-4 pt-6"><label className="flex items-start gap-3"><input className="mt-1 h-4 w-4" type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span className="text-sm">Saya menyatakan data dan bukti karya benar serta menyetujui ketentuan registrasi.</span></label><div className="flex flex-col gap-3 sm:flex-row"><Button variant="outline" className="min-h-11" disabled={saving} onClick={()=>void save()}><Save className="mr-2 h-4 w-4"/>Simpan Draft</Button><Button className="min-h-11" disabled={saving||!accepted} onClick={()=>void submit()}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Upload className="mr-2 h-4 w-4"/>}Kirim Pendaftaran</Button></div></CardContent></Card></>}</div></DashboardLayout>;
}
function Header({title,subtitle}:{title:string;subtitle:string}){return <div><p className="text-sm font-medium text-primary">Perlindungan Hak Cipta</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 text-muted-foreground">{subtitle}</p></div>}
function ErrorAlert({text}:{text:string}){return <Alert variant="destructive"><AlertTitle>Permintaan gagal</AlertTitle><AlertDescription>{text}</AlertDescription></Alert>}
function Field({label,children,className=''}:{label:string;children:React.ReactNode;className?:string}){return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>}
function Stat({label,value}:{label:string;value:string}){return <div><p className="text-sm text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>}
function Applicant({value,set}:{value:CopyrightApplicantType;set:(value:CopyrightApplicantType)=>void}){return <Select value={value} onValueChange={v=>set(v as CopyrightApplicantType)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="personal">Pribadi</SelectItem><SelectItem value="band_representative">Perwakilan band</SelectItem><SelectItem value="company_label">Perusahaan/label</SelectItem></SelectContent></Select>}
