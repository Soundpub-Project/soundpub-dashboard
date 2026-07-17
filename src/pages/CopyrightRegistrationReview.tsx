import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, Clock3, Download, FileText, Loader2, Search, Shield, Sparkles, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CopyrightRegistration {
  id: string;
  legal_name: string;
  email: string;
  status: string;
  composer_code: string | null;
  contract_number: string | null;
  applicant_type: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  admin_notes: string | null;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CopyrightContract {
  id: string;
  registration_id: string;
  contract_sequence: number | null;
  contract_month_roman: string | null;
  contract_code: string | null;
  contract_year: number | null;
  contract_number: string | null;
  status: string;
  template_version: string;
  preview_html_url: string | null;
  draft_pdf_url: string | null;
  generated_pdf_url: string | null;
  stamped_pdf_url: string | null;
  signed_at: string | null;
  stamped_at: string | null;
  stamp_provider: string | null;
  stamp_status: string | null;
}

const contractStageButtons = [
  { status: 'generated', label: 'Generate Contract' },
  { status: 'stamping_pending', label: 'Stamp Pending' },
  { status: 'stamped', label: 'Stamped' },
  { status: 'signed', label: 'Signed' },
  { status: 'active', label: 'Activate' },
] as const;

const contractStatusOrder = ['draft', 'generated', 'stamping_pending', 'stamped', 'signed', 'active', 'void'] as const;

const pdfServiceUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_PDF_SERVICE_URL || 'http://localhost:3001';
const contractBucket = (import.meta as { env?: Record<string, string> }).env?.VITE_CONTRACT_BUCKET || 'contracts';

const templatePath = 'FINAL%20-%20DRAFT%20KONTRAK%20SOUNDPUB%20COMPLETE.docx';

const getContractStatusIndex = (status?: string | null) => {
  if (!status) return -1;
  return contractStatusOrder.indexOf(status as (typeof contractStatusOrder)[number]);
};

const buildContractData = (registration: CopyrightRegistration, contract: CopyrightContract | null) => ({
  nama_pihak_kedua: registration.legal_name,
  nomor_surat: registration.contract_number || contract?.contract_number || '-',
  nomor_ktp: '-',
  alamat: '-',
  tempat_lahir: '-',
  tanggal_lahir: '-',
  email: registration.email,
  composer_code: registration.composer_code || '-',
  applicant_type: registration.applicant_type,
  contract_status: contract?.status || registration.status,
});

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-500',
  awaiting_payment: 'bg-amber-500/20 text-amber-500',
  paid_pending_review: 'bg-blue-500/20 text-blue-500',
  in_review: 'bg-cyan-500/20 text-cyan-500',
  revision_requested: 'bg-orange-500/20 text-orange-500',
  approved: 'bg-emerald-500/20 text-emerald-500',
  rejected: 'bg-red-500/20 text-red-500',
  contract_generated: 'bg-violet-500/20 text-violet-500',
  stamping_pending: 'bg-fuchsia-500/20 text-fuchsia-500',
  stamped: 'bg-green-500/20 text-green-500',
  contract_signed: 'bg-indigo-500/20 text-indigo-500',
  active: 'bg-primary/20 text-primary',
};

export default function CopyrightRegistrationReview() {
  const { isAdmin } = useAuth();
  const [registrations, setRegistrations] = useState<CopyrightRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<CopyrightContract | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const query = supabase
        .from('copyright_registrations')
        .select('id, legal_name, email, status, composer_code, contract_number, applicant_type, submitted_at, reviewed_at, approved_at, rejected_at, admin_notes, revision_notes, created_at, updated_at')
        .order('updated_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      setRegistrations((data ?? []) as CopyrightRegistration[]);
      setSelectedId((data?.[0] as CopyrightRegistration | undefined)?.id ?? null);
      setLoading(false);
    };

    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    return registrations.filter((item) => {
      const matchesSearch = [item.legal_name, item.email, item.composer_code ?? '', item.contract_number ?? '']
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [registrations, search, statusFilter]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    const loadContract = async () => {
      if (!selected?.id) {
        setSelectedContract(null);
        return;
      }

      const fullQuery = await supabase
        .from('copyright_contracts')
        .select('id, registration_id, contract_sequence, contract_month_roman, contract_code, contract_year, contract_number, status, template_version, preview_html_url, draft_pdf_url, generated_pdf_url, stamped_pdf_url, signed_at, stamped_at, stamp_provider, stamp_status')
        .eq('registration_id', selected.id)
        .maybeSingle();

      if (!fullQuery.error) {
        setSelectedContract((fullQuery.data as CopyrightContract | null) ?? null);
        return;
      }

      const fallbackQuery = await supabase
        .from('copyright_contracts')
        .select('id, registration_id, contract_number, status, template_version')
        .eq('registration_id', selected.id)
        .maybeSingle();

      if (fallbackQuery.error) {
        console.error('Error loading copyright contract:', fullQuery.error, fallbackQuery.error);
        setSelectedContract(null);
        return;
      }

      setSelectedContract((fallbackQuery.data as CopyrightContract | null) ?? null);
    };

    loadContract();
  }, [selected?.id]);

  const updateStatus = async (status: string) => {
    if (!selected) return;
    setSavingId(selected.id);
    const { error } = await supabase.rpc('admin_review_copyright_registration', {
      _registration_id: selected.id,
      _status: status,
      _admin_notes: null,
      _revision_notes: status === 'revision_requested' ? 'Mohon lengkapi data yang diminta.' : null,
      _composer_code: status === 'approved' || status === 'active' ? selected.composer_code ?? null : null,
      _contract_number: null,
    });

    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Status pendaftaran diperbarui');
    const { data } = await supabase
      .from('copyright_registrations')
      .select('id, legal_name, email, status, composer_code, contract_number, applicant_type, submitted_at, reviewed_at, approved_at, rejected_at, admin_notes, revision_notes, created_at, updated_at')
      .order('updated_at', { ascending: false });
    const nextRows = (data ?? []) as CopyrightRegistration[];
    setRegistrations(nextRows);
    setSelectedId((current) => nextRows.find((item) => item.id === current)?.id ?? nextRows[0]?.id ?? null);
  };

  const updateContractStatus = async (status: string) => {
    if (!selected) return;
    setSavingId(selected.id);

    const { error } = await supabase.rpc('admin_update_copyright_contract', {
      _registration_id: selected.id,
      _status: status,
      _preview_html_url: selectedContract?.preview_html_url ?? null,
      _draft_pdf_url: selectedContract?.draft_pdf_url ?? null,
      _generated_pdf_url: selectedContract?.generated_pdf_url ?? null,
      _stamped_pdf_url: selectedContract?.stamped_pdf_url ?? null,
    });

    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Status kontrak diperbarui');
    const [{ data: registrationsData }, { data: contractData }] = await Promise.all([
      supabase
        .from('copyright_registrations')
        .select('id, legal_name, email, status, composer_code, contract_number, applicant_type, submitted_at, reviewed_at, approved_at, rejected_at, admin_notes, revision_notes, created_at, updated_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('copyright_contracts')
        .select('id, registration_id, contract_sequence, contract_month_roman, contract_code, contract_year, contract_number, status, template_version, preview_html_url, draft_pdf_url, generated_pdf_url, stamped_pdf_url, signed_at, stamped_at, stamp_provider, stamp_status')
        .eq('registration_id', selected.id)
        .maybeSingle(),
    ]);

    setRegistrations((registrationsData ?? []) as CopyrightRegistration[]);
    setSelectedContract((contractData as CopyrightContract | null) ?? null);
  };

  const contractLabel = selectedContract?.contract_number ?? selected?.contract_number ?? 'Belum digenerate';
  const contractUrlRows = [
    { label: 'Preview HTML', value: selectedContract?.preview_html_url },
    { label: 'Draft PDF', value: selectedContract?.draft_pdf_url },
    { label: 'Generated PDF', value: selectedContract?.generated_pdf_url },
    { label: 'Stamped PDF', value: selectedContract?.stamped_pdf_url },
  ];
  const selectedContractStatusIndex = getContractStatusIndex(selectedContract?.status);
  const canGenerateContract = !selectedContract || selectedContract.status === 'draft';
  const canStampContract = selectedContract?.status === 'generated' || selectedContract?.status === 'stamping_pending';
  const canSignContract = selectedContract?.status === 'stamped';
  const canActivateContract = selectedContract?.status === 'signed';

  const downloadDraftPdf = async () => {
    if (!selected) return;

    try {
      const response = await fetch(`${pdfServiceUrl}/api/contracts/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatePath,
          registrationId: selected.id,
          contractData: buildContractData(selected, selectedContract),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Gagal generate PDF draft');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `soundpub-contract-draft-${selected.id}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      toast.success('Draft PDF berhasil diunduh');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal download PDF draft');
    }
  };

  const uploadStampedPdf = async (file: File | null) => {
    if (!selected || !file) return;
    setSavingId(selected.id);

    try {
      const filePath = `stamped/${selected.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(contractBucket).upload(filePath, file, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(contractBucket).getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const { error: contractError } = await supabase.rpc('admin_update_copyright_contract', {
        _registration_id: selected.id,
        _status: 'stamped',
        _preview_html_url: selectedContract?.preview_html_url ?? null,
        _draft_pdf_url: selectedContract?.draft_pdf_url ?? null,
        _generated_pdf_url: selectedContract?.generated_pdf_url ?? null,
        _stamped_pdf_url: publicUrl,
      });

      if (contractError) throw contractError;

      toast.success('PDF bermeterai berhasil diupload');
      const [{ data: registrationsData }, { data: contractData }] = await Promise.all([
        supabase
          .from('copyright_registrations')
          .select('id, legal_name, email, status, composer_code, contract_number, applicant_type, submitted_at, reviewed_at, approved_at, rejected_at, admin_notes, revision_notes, created_at, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('copyright_contracts')
          .select('id, registration_id, contract_sequence, contract_month_roman, contract_code, contract_year, contract_number, status, template_version, preview_html_url, draft_pdf_url, generated_pdf_url, stamped_pdf_url, signed_at, stamped_at, stamp_provider, stamp_status')
          .eq('registration_id', selected.id)
          .maybeSingle(),
      ]);

      setRegistrations((registrationsData ?? []) as CopyrightRegistration[]);
      setSelectedContract((contractData as CopyrightContract | null) ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal upload PDF bermeterai');
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 border-cyan-500/30 bg-cyan-500/10 text-cyan-500">Admin Review</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Review Registrasi Hak Cipta</h1>
            <p className="text-muted-foreground">Pantau pendaftaran, nomor kontrak, composer code, dan aksi review.</p>
          </div>
          <Alert className="max-w-xl">
            <Shield className="h-4 w-4" />
            <AlertTitle>Flow</AlertTitle>
            <AlertDescription>Approve akan memicu nomor kontrak otomatis. Revision akan menyimpan catatan revisi.</AlertDescription>
          </Alert>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardDescription>Total</CardDescription><CardTitle>{registrations.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Approved</CardDescription><CardTitle>{registrations.filter((r) => r.status === 'approved' || r.status === 'active').length}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Need Review</CardDescription><CardTitle>{registrations.filter((r) => ['paid_pending_review','in_review','revision_requested'].includes(r.status)).length}</CardTitle></CardHeader></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Pendaftaran</CardTitle>
              <CardDescription>Filter dan pilih satu item untuk detail review.</CardDescription>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, email, kode, kontrak" className="pl-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Filter status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="paid_pending_review">Paid Pending Review</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="revision_requested">Revision Requested</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kontrak</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                    ) : filtered.map((item) => (
                      <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelectedId(item.id)}>
                        <TableCell className="font-medium">{item.legal_name}</TableCell>
                        <TableCell><Badge className={statusStyles[item.status] ?? ''}>{item.status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{item.contract_number ?? '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{item.composer_code ?? '-'}</TableCell>
                        <TableCell>{new Date(item.updated_at).toLocaleString('id-ID')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detail Review</CardTitle>
              <CardDescription>{selected ? 'Siap review status dan nomor kontrak.' : 'Pilih satu data.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected ? (
                <>
                  <div className="grid gap-3 text-sm">
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Nama</p><p className="font-medium">{selected.legal_name}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Email</p><p className="font-medium">{selected.email}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Status</p><p className="font-medium">{selected.status}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Nomor Surat</p><p className="font-mono text-xs">{contractLabel}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Composer Code</p><p className="font-mono text-xs">{selected.composer_code ?? 'Belum ada'}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-muted-foreground">Tipe Pemohon</p><p className="font-medium">{selected.applicant_type}</p></div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="mb-2 font-medium">Detail Kontrak</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div><span className="text-muted-foreground">Sequence:</span> {selectedContract?.contract_sequence ?? '-'}</div>
                      <div><span className="text-muted-foreground">Bulan:</span> {selectedContract?.contract_month_roman ?? '-'}</div>
                      <div><span className="text-muted-foreground">Kode:</span> {selectedContract?.contract_code ?? '-'}</div>
                      <div><span className="text-muted-foreground">Tahun:</span> {selectedContract?.contract_year ?? '-'}</div>
                      <div><span className="text-muted-foreground">Status Kontrak:</span> {selectedContract?.status ?? 'Belum ada'}</div>
                      <div><span className="text-muted-foreground">Template:</span> {selectedContract?.template_version ?? '-'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="mb-2 font-medium">URL Kontrak</p>
                    <div className="space-y-2">
                      {contractUrlRows.map((row) => (
                        <div key={row.label} className="flex flex-col gap-1 rounded-md bg-muted/30 p-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="max-w-full break-all font-mono text-xs">{row.value ?? '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="mb-2 font-medium">Tahap Kontrak</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div><span className="text-muted-foreground">Review:</span> approval awal</div>
                      <div><span className="text-muted-foreground">Kontrak:</span> generate ? stamp ? sign ? active</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={savingId === selected.id} onClick={() => updateStatus('in_review')}><Clock3 className="mr-2 h-4 w-4" />In Review</Button>
                    <Button variant="outline" disabled={savingId === selected.id} onClick={() => updateStatus('revision_requested')}><FileText className="mr-2 h-4 w-4" />Request Revision</Button>
                    <Button variant="secondary" disabled={savingId === selected.id} onClick={() => updateStatus('approved')}><CheckCircle2 className="mr-2 h-4 w-4" />Approve</Button>
                    <Button variant="destructive" disabled={savingId === selected.id} onClick={() => updateStatus('rejected')}><XCircle className="mr-2 h-4 w-4" />Reject</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contractStageButtons.map((button) => (
                      <Button
                        key={button.status}
                        variant={selectedContract?.status === button.status ? 'secondary' : 'outline'}
                        disabled={savingId === selected.id || (selectedContractStatusIndex >= 0 && getContractStatusIndex(button.status) < selectedContractStatusIndex)}
                        onClick={() => updateContractStatus(button.status)}
                      >
                        {button.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {contractUrlRows.map((row) => (
                      row.value ? (
                        <div key={row.label} className="flex items-center gap-2">
                          <Button variant="outline" onClick={() => window.open(row.value!, '_blank', 'noopener,noreferrer')}>
                            <FileText className="mr-2 h-4 w-4" />
                            Buka {row.label}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(row.value!).then(() => toast.success('URL disalin'))}>
                            Salin
                          </Button>
                        </div>
                      ) : null
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={downloadDraftPdf} disabled={!selected || savingId === selected.id}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Draft PDF
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
                      <Upload className="h-4 w-4" />
                      Upload PDF Bermeterai
                      <input type="file" accept="application/pdf" className="hidden" onChange={(event) => uploadStampedPdf(event.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                  {selected.revision_notes && <Alert><Sparkles className="h-4 w-4" /><AlertTitle>Catatan Revisi</AlertTitle><AlertDescription>{selected.revision_notes}</AlertDescription></Alert>}
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Belum ada data terpilih.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}


