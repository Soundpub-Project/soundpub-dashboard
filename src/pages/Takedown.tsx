import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, FileText, Loader2, Search, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const DSP_OPTIONS = ['Semua DSP', 'Spotify', 'Apple Music', 'YouTube Music', 'Meta', 'TikTok', 'Deezer', 'Amazon Music', 'Tidal'];
const REASON_OPTIONS = ['Permintaan pemilik karya', 'Kesalahan metadata', 'Rilis duplikat', 'Pindah distributor', 'Hak distribusi berakhir', 'Sengketa hak cipta', 'Pelanggaran copyright', 'Streaming manipulation atau fraud', 'Unauthorized upload', 'Pelanggaran kebijakan DSP', 'Perintah hukum', 'Lainnya'];
const REQUEST_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED', 'SENT_TO_DSP', 'PROCESSING_DSP', 'PARTIALLY_COMPLETED', 'COMPLETED', 'REJECTED'];
const TARGET_STATUSES = ['PENDING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED'];
const STATUS_LABEL: Record<string, string> = { SUBMITTED: 'Diajukan', UNDER_REVIEW: 'Ditinjau', NEED_DOCUMENT: 'Butuh Dokumen', APPROVED: 'Disetujui', SENT_TO_DSP: 'Dikirim ke DSP', PROCESSING_DSP: 'Diproses DSP', PARTIALLY_COMPLETED: 'Selesai Sebagian', COMPLETED: 'Selesai', REJECTED: 'Ditolak', CANCEL_REQUESTED: 'Batal Diminta', CANCELLED: 'Dibatalkan', PENDING: 'Menunggu', PROCESSING: 'Diproses' };

type Release = { id: string; title: string; artist_name: string; upc: string | null; label_id: string; artist_user_id: string | null; created_by: string | null };
type Target = { id: string; dsp_name: string; status: string; external_reference: string | null; submitted_at: string | null; completed_at: string | null; failure_reason: string | null; admin_note: string | null };
type Document = { id: string; file_name: string; document_type: string | null; file_size: number | null; created_at: string };
type History = { id: string; old_status: string | null; new_status: string; note: string | null; created_at: string };
type Track = { id: string; title: string; artist_name: string; isrc: string | null; genre: string | null; composer: string | null; lyricist: string | null; duration: number | null; explicit_lyrics: boolean | null };
type RequestItem = { title_snapshot: string; artist_name_snapshot: string; upc_snapshot: string | null; isrc_snapshot: string | null; release_id: string; track_id?: string | null; tracks?: Track[] };
type RequestRow = { id: string; status: string; request_type: string; reason_category: string; reason_detail: string; other_reason: string | null; created_at: string; updated_at: string; requester_id: string; sent_to_dsp_at: string | null; review_note: string | null; rejection_reason: string | null; items: RequestItem[]; targets: Target[]; documents?: Document[]; history?: History[] };

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('id-ID') : '-';
const requestCode = (request: RequestRow) => `TD-${new Date(request.created_at).toISOString().slice(0, 10).replaceAll('-', '')}-${request.id.slice(0, 6).toUpperCase()}`;
const badgeVariant = (status: string) => status === 'REJECTED' ? 'destructive' : status === 'COMPLETED' ? 'default' : 'secondary';
const durationLabel = (seconds?: number | null) => {
  if (!seconds) return '-';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};



export default function Takedown() {
  const { user, profile, isAdmin, isLabel, isArtist } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dspFilter, setDspFilter] = useState('all');
  const [slaFilter, setSlaFilter] = useState('all');
  const [releaseId, setReleaseId] = useState('');
  const [requestType, setRequestType] = useState('standard');
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [detail, setDetail] = useState('');
  const [contactName, setContactName] = useState(profile?.full_name || '');
  const [contactPosition, setContactPosition] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactAddress, setContactAddress] = useState('');
  const [dsps, setDsps] = useState<string[]>(['Semua DSP']);
  const [accepted, setAccepted] = useState(false);
  const [torOpen, setTorOpen] = useState(false);
  const [torReadToEnd, setTorReadToEnd] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const allowed = useMemo(() => isAdmin || isLabel || (isArtist && Boolean(profile?.parent_label_id)), [isAdmin, isLabel, isArtist, profile?.parent_label_id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: releaseData, error: releaseError }, { data: requestData, error: requestError }] = await Promise.all([
        (supabase as any).from('releases').select('id,title,artist_name,upc,label_id,artist_user_id,created_by').order('created_at', { ascending: false }),
        (supabase as any).from('takedown_requests').select('id,status,request_type,reason_category,reason_detail,other_reason,created_at,updated_at,requester_id,sent_to_dsp_at,review_note,rejection_reason,items:takedown_request_items(title_snapshot,artist_name_snapshot,upc_snapshot,isrc_snapshot,release_id),targets:takedown_request_targets(id,dsp_name,status,external_reference,submitted_at,completed_at,failure_reason,admin_note)').order('created_at', { ascending: false })
      ]);
      if (releaseError) throw releaseError;
      if (requestError) throw requestError;
      setReleases((releaseData || []).filter((release: Release) => isAdmin || release.label_id === user.id || release.artist_user_id === user.id || release.created_by === user.id));
      setRequests(requestData || []);
    } catch (error: any) { toast.error(error.message || 'Gagal memuat data takedown'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);
  useEffect(() => {
    setContactName((current) => current || profile?.full_name || '');
    setContactEmail((current) => current || user?.email || '');
  }, [profile?.full_name, user?.email]);

  const openDetail = async (request: RequestRow) => {
    setDetailLoading(true); setSelected(request);
    try {
      const { data, error } = await (supabase as any).from('takedown_requests').select('id,status,request_type,reason_category,reason_detail,other_reason,created_at,updated_at,requester_id,sent_to_dsp_at,review_note,rejection_reason,items:takedown_request_items(title_snapshot,artist_name_snapshot,upc_snapshot,isrc_snapshot,release_id,track_id),targets:takedown_request_targets(id,dsp_name,status,external_reference,submitted_at,completed_at,failure_reason,admin_note),documents:takedown_request_documents(id,file_name,document_type,file_size,created_at),history:takedown_status_history(id,old_status,new_status,note,created_at)').eq('id', request.id).single();
      if (error) throw error;
      const releaseIds = Array.from(new Set((data.items || []).map((item: RequestItem) => item.release_id).filter(Boolean)));
      const { data: tracks, error: trackError } = releaseIds.length ? await (supabase as any).from('tracks').select('id,release_id,title,artist_name,isrc,genre,composer,lyricist,duration,explicit_lyrics').in('release_id', releaseIds).order('created_at', { ascending: true }) : { data: [], error: null };
      if (trackError) throw trackError;
      const tracksByRelease = (tracks || []).reduce((result: Record<string, Track[]>, track: Track & { release_id: string }) => {
        result[track.release_id] = [...(result[track.release_id] || []), track];
        return result;
      }, {});
      setSelected({ ...data, items: (data.items || []).map((item: RequestItem) => ({ ...item, tracks: tracksByRelease[item.release_id] || [] })) });
    } catch (error: any) { toast.error(error.message || 'Gagal memuat detail request'); }
    finally { setDetailLoading(false); }
  };

  const sla = (request: RequestRow) => {
    if (!request.sent_to_dsp_at || ['COMPLETED', 'REJECTED'].includes(request.status)) return null;
    const due = new Date(request.sent_to_dsp_at); due.setMonth(due.getMonth() + 2);
    const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    return { due, days, state: days < 0 ? 'late' : days <= 14 ? 'near' : 'safe' };
  };

  const filteredRequests = useMemo(() => requests.filter((request) => {
    const text = `${requestCode(request)} ${request.items?.[0]?.title_snapshot || ''} ${request.items?.[0]?.artist_name_snapshot || ''} ${request.items?.[0]?.upc_snapshot || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesDsp = dspFilter === 'all' || request.targets.some((target) => target.dsp_name === dspFilter);
    const requestSla = sla(request);
    const matchesSla = slaFilter === 'all' || (slaFilter === 'not_sent' && !request.sent_to_dsp_at) || requestSla?.state === slaFilter;
    return matchesSearch && matchesStatus && matchesDsp && matchesSla;
  }), [requests, search, statusFilter, dspFilter, slaFilter]);

  const toggleDsp = (dsp: string) => setDsps((current) => dsp === 'Semua DSP' ? current.includes(dsp) ? [] : ['Semua DSP'] : (current.filter((item) => item !== 'Semua DSP').includes(dsp) ? current.filter((item) => item !== dsp) : [...current.filter((item) => item !== 'Semua DSP'), dsp]));
  const onFiles = (event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files || []).slice(0, 5));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); const release = releases.find((item) => item.id === releaseId);
    const otherReasonWordCount = otherReason.trim().split(/\s+/).filter(Boolean).length;
    if (reason === 'Lainnya' && otherReasonWordCount < 5) { toast.error('Alasan lainnya wajib diisi minimal 5 kata.'); return; }
    if (!user || !release || !reason || !detail.trim() || !contactName.trim() || !contactPosition.trim() || !contactPhone.trim() || !contactEmail.trim() || !contactAddress.trim() || !dsps.length || !accepted) { toast.error('Lengkapi release, kontak pemohon, alasan, DSP, detail, dan pernyataan.'); return; }
    setSubmitting(true);
    try {
      const { data: request, error } = await (supabase as any).from('takedown_requests').insert({ requester_id: user.id, label_id: release.label_id, request_type: requestType, priority: requestType === 'urgent' ? 'urgent' : 'normal', reason_category: reason, reason_detail: detail.trim(), other_reason: reason === 'Lainnya' ? otherReason.trim() : null, contact_name: contactName.trim(), contact_position: contactPosition.trim(), contact_phone: contactPhone.trim(), contact_email: contactEmail.trim(), contact_address: contactAddress.trim(), declaration_accepted: true, declaration_accepted_at: new Date().toISOString() }).select('id').single();
      if (error) throw error;
      await (supabase as any).from('takedown_request_items').insert({ request_id: request.id, release_id: release.id, title_snapshot: release.title, artist_name_snapshot: release.artist_name, upc_snapshot: release.upc });
      await (supabase as any).from('takedown_request_targets').insert(dsps.map((dsp_name) => ({ request_id: request.id, dsp_name })));
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} melebihi batas 10 MB`);
        const path = `${user.id}/${request.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('takedown-documents').upload(path, file, { upsert: false }); if (uploadError) throw uploadError;
        await (supabase as any).from('takedown_request_documents').insert({ request_id: request.id, uploaded_by: user.id, file_name: file.name, storage_path: path, file_type: file.type, file_size: file.size, document_type: 'Pendukung' });
      }
      await (supabase as any).from('takedown_status_history').insert({ request_id: request.id, new_status: 'SUBMITTED', changed_by: user.id, note: 'Permohonan takedown diajukan.' });
      await (supabase as any).from('notifications').insert({ user_id: user.id, type: 'info', title: 'Permohonan Takedown Dikirim', message: 'Permohonan takedown sedang menunggu review.', metadata: { takedown_request_id: request.id, release_id: release.id } });
      toast.success('Permohonan terkirim. Proses DSP maksimal 2 bulan setelah pengiriman.');
      setReleaseId(''); setRequestType('standard'); setReason(''); setOtherReason(''); setDetail(''); setContactName(profile?.full_name || ''); setContactPosition(''); setContactPhone(''); setContactEmail(user.email || ''); setContactAddress(''); setDsps(['Semua DSP']); setAccepted(false); setFiles([]); await load();
    } catch (error: any) { toast.error(error.message || 'Gagal mengirim permohonan'); }
    finally { setSubmitting(false); }
  };

  const updateRequestStatus = async (status: string) => {
    if (!selected || !user) return;
    const needsNote = ['NEED_DOCUMENT', 'REJECTED'].includes(status);
    const note = window.prompt(needsNote ? (status === 'REJECTED' ? 'Alasan penolakan:' : 'Dokumen yang dibutuhkan:') : 'Catatan admin (opsional):');
    if (needsNote && !note?.trim()) { toast.error('Catatan wajib diisi.'); return; }
    try {
      const values: Record<string, unknown> = { status, reviewer_id: user.id, reviewed_at: new Date().toISOString(), review_note: note || null };
      if (status === 'REJECTED') values.rejection_reason = note;
      if (status === 'SENT_TO_DSP') values.sent_to_dsp_at = new Date().toISOString();
      if (status === 'COMPLETED') values.completed_at = new Date().toISOString();
      const { error } = await (supabase as any).from('takedown_requests').update(values).eq('id', selected.id); if (error) throw error;
      await (supabase as any).from('takedown_status_history').insert({ request_id: selected.id, old_status: selected.status, new_status: status, changed_by: user.id, note: note || null });
      await (supabase as any).from('notifications').insert({ user_id: selected.requester_id, type: status === 'REJECTED' ? 'error' : 'info', title: 'Status Takedown Diperbarui', message: `Status permohonan berubah menjadi ${STATUS_LABEL[status]}.`, metadata: { takedown_request_id: selected.id, status } });
      toast.success('Status diperbarui.'); await load(); await openDetail({ ...selected, status });
    } catch (error: any) { toast.error(error.message || 'Gagal memperbarui status'); }
  };

  const updateTarget = async (target: Target, status: string) => {
    if (!selected) return;
    const reference = status === 'SUBMITTED' ? window.prompt('Nomor tiket/referensi DSP (opsional):', target.external_reference || '') : target.external_reference;
    try {
      const values: Record<string, unknown> = { status, external_reference: reference || null };
      if (status === 'SUBMITTED') values.submitted_at = new Date().toISOString();
      if (status === 'COMPLETED') values.completed_at = new Date().toISOString();
      const { error } = await (supabase as any).from('takedown_request_targets').update(values).eq('id', target.id); if (error) throw error;
      toast.success(`${target.dsp_name} diperbarui.`); await load(); await openDetail(selected);
    } catch (error: any) { toast.error(error.message || 'Gagal memperbarui DSP'); }
  };

  if (loading) return <DashboardLayout><div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!allowed) return <DashboardLayout><Card><CardHeader><CardTitle className="flex gap-2"><ShieldAlert /> Fitur tidak tersedia</CardTitle><CardDescription>Fitur takedown tersedia untuk role label dan artis/user di bawah label.</CardDescription></CardHeader></Card></DashboardLayout>;

  return <DashboardLayout><div className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Takedown Rilis</h1><p className="text-muted-foreground">Pantau penurunan rilis dari DSP. Batas proses DSP maksimal 2 bulan setelah dikirim.</p></div>
    <Tabs defaultValue="requests"><TabsList><TabsTrigger value="requests">Permohonan</TabsTrigger><TabsTrigger value="new">Ajukan Takedown</TabsTrigger></TabsList>
      <TabsContent value="requests" className="space-y-4"><Card><CardContent className="grid gap-3 pt-6 md:grid-cols-4"><div className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor request, rilis, artis, UPC" /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger><SelectContent><SelectItem value="all">Semua status</SelectItem>{REQUEST_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>)}</SelectContent></Select><Select value={dspFilter} onValueChange={setDspFilter}><SelectTrigger><SelectValue placeholder="Semua DSP" /></SelectTrigger><SelectContent><SelectItem value="all">Semua DSP</SelectItem>{DSP_OPTIONS.filter((dsp) => dsp !== 'Semua DSP').map((dsp) => <SelectItem key={dsp} value={dsp}>{dsp}</SelectItem>)}</SelectContent></Select><Select value={slaFilter} onValueChange={setSlaFilter}><SelectTrigger><SelectValue placeholder="Semua SLA" /></SelectTrigger><SelectContent><SelectItem value="all">Semua SLA</SelectItem><SelectItem value="not_sent">Belum dikirim DSP</SelectItem><SelectItem value="safe">SLA aman</SelectItem><SelectItem value="near">Dekat batas 2 bulan</SelectItem><SelectItem value="late">Melewati batas 2 bulan</SelectItem></SelectContent></Select></CardContent></Card>
        <Card><CardHeader><CardTitle>Riwayat Permohonan</CardTitle><CardDescription>Klik detail untuk melihat alasan, lampiran, timeline, dan status setiap DSP.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Request / Rilis</TableHead><TableHead>Tipe</TableHead><TableHead>DSP Progress</TableHead><TableHead>Status</TableHead><TableHead>SLA DSP</TableHead><TableHead>Tanggal</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{filteredRequests.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Tidak ada permohonan sesuai filter.</TableCell></TableRow> : filteredRequests.map((request) => { const info = sla(request); const completed = request.targets.filter((target) => target.status === 'COMPLETED').length; return <TableRow key={request.id}><TableCell><div className="font-medium">{request.items?.[0]?.title_snapshot || '-'}</div><div className="text-xs text-muted-foreground">{requestCode(request)} · {request.items?.[0]?.artist_name_snapshot}</div></TableCell><TableCell className="capitalize">{request.request_type}</TableCell><TableCell><div className="font-medium">{completed}/{request.targets.length} selesai</div><div className="text-xs text-muted-foreground">{request.targets.map((target) => `${target.dsp_name}: ${STATUS_LABEL[target.status]}`).join(' · ')}</div></TableCell><TableCell><Badge variant={badgeVariant(request.status)}>{STATUS_LABEL[request.status]}</Badge></TableCell><TableCell>{!info ? <span className="text-muted-foreground">{request.sent_to_dsp_at ? '-' : 'Belum dikirim'}</span> : <span className={info.state === 'late' ? 'text-destructive' : info.state === 'near' ? 'text-amber-600' : 'text-emerald-600'}>{info.state === 'late' ? `${Math.abs(info.days)} hari lewat` : `${info.days} hari tersisa`}<br /><span className="text-xs text-muted-foreground">Target {dateLabel(info.due.toISOString())}</span></span>}</TableCell><TableCell>{dateLabel(request.created_at)}</TableCell><TableCell><Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/takedown/${request.id}`)}><Eye className="mr-2 h-4 w-4" />Detail</Button></TableCell></TableRow>; })}</TableBody></Table></div></CardContent></Card></TabsContent>
      <TabsContent value="new"><Card><CardHeader><CardTitle>Ajukan Takedown</CardTitle><CardDescription>Pastikan Anda memiliki kewenangan atas rilis. Request yang sudah dikirim ke DSP mungkin tidak dapat dibatalkan.</CardDescription></CardHeader><CardContent><form className="space-y-6" onSubmit={submit}><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Rilis</Label><Select value={releaseId} onValueChange={setReleaseId}><SelectTrigger><SelectValue placeholder="Pilih rilis" /></SelectTrigger><SelectContent>{releases.map((release) => <SelectItem key={release.id} value={release.id}>{release.title} — {release.artist_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Jenis</Label><Select value={requestType} onValueChange={setRequestType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Alasan</Label><Select value={reason} onValueChange={(value) => { setReason(value); if (value !== 'Lainnya') setOtherReason(''); }}><SelectTrigger><SelectValue placeholder="Pilih alasan" /></SelectTrigger><SelectContent>{REASON_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Lampiran Bukti Pendukung</Label><Input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={onFiles} /><p className="text-xs text-muted-foreground">Surat permohonan, bukti hak, surat kuasa, atau dokumen hukum. Maksimal 5 file, masing-masing 10 MB.</p></div></div>{reason === 'Lainnya' && <div className="space-y-2"><Label>Alasan lainnya *</Label><Textarea value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Tuliskan alasan lainnya minimal 5 kata." required minLength={5} /><p className="text-xs text-muted-foreground">Minimal 5 kata.</p></div>}<div className="space-y-2"><h3 className="font-semibold">Kontak Pemohon</h3><p className="text-xs text-muted-foreground">Data ini wajib diisi untuk korespondensi dan verifikasi permohonan.</p><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Nama Lengkap *</Label><Input value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div><div className="space-y-2"><Label>Jabatan *</Label><Input value={contactPosition} onChange={(event) => setContactPosition(event.target.value)} required /></div><div className="space-y-2"><Label>Nomor Telp *</Label><Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required /></div><div className="space-y-2"><Label>Email *</Label><Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required /></div><div className="space-y-2 md:col-span-2"><Label>Alamat *</Label><Textarea value={contactAddress} onChange={(event) => setContactAddress(event.target.value)} required className="min-h-24" /></div></div></div><div className="space-y-2"><Label>DSP Target</Label><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{DSP_OPTIONS.map((dsp) => <label key={dsp} className="flex items-center gap-2 text-sm"><Checkbox checked={dsps.includes(dsp)} onCheckedChange={() => toggleDsp(dsp)} />{dsp}</label>)}</div></div><div className="space-y-2"><Label>Detail alasan</Label><Textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Jelaskan alasan dan konteks takedown." className="min-h-28" /></div><button type="button" className="flex w-full items-start gap-3 rounded-md border p-4 text-left text-sm transition-colors hover:bg-muted/40" onClick={() => { setTorReadToEnd(false); setTorOpen(true); }}><Checkbox checked={accepted} tabIndex={-1} className="pointer-events-none" /><span><span className="font-medium">Persetujuan TOR Takedown</span><span className="mt-1 block text-muted-foreground">Klik untuk membaca seluruh TOR. Persetujuan hanya aktif setelah dokumen dibaca sampai akhir.</span></span></button><Button type="submit" disabled={submitting}><Send className="mr-2 h-4 w-4" />{submitting ? 'Mengirim...' : 'Kirim Permohonan'}</Button></form></CardContent></Card></TabsContent>
    </Tabs>
    <Dialog open={torOpen} onOpenChange={(open) => { setTorOpen(open); if (!open && !accepted) setTorReadToEnd(false); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Term of Reference Permohonan Takedown</DialogTitle><DialogDescription>Baca seluruh ketentuan sampai akhir sebelum memberikan persetujuan.</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-4 text-sm leading-6" onScroll={(event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 24) setTorReadToEnd(true); }}>
          <section><h3 className="font-semibold">1. Tujuan Permohonan</h3><p>Pemohon meminta Soundpub meneruskan proses penurunan rilis atau track dari DSP berdasarkan kewenangan, kepemilikan hak, kontrak distribusi, atau dasar hukum yang sah.</p></section>
          <section><h3 className="font-semibold">2. Pernyataan dan Tanggung Jawab Pemohon</h3><ol className="list-decimal space-y-2 pl-5"><li>Pemohon menyatakan nama, jabatan, nomor telepon, email, alamat, identitas rilis, track, UPC, ISRC, alasan, serta dokumen pendukung yang diberikan benar dan dapat dipertanggungjawabkan.</li><li>Pemohon menjamin memiliki hak, kuasa, mandat, kontrak, atau kewenangan sah untuk meminta takedown atas seluruh materi yang dipilih.</li><li>Pemohon memahami bahwa informasi palsu, dokumen tidak sah, pemalsuan kewenangan, atau klaim menyesatkan menjadi tanggung jawab hukum pemohon.</li><li>Pemohon bertanggung jawab atas sengketa, klaim, kerugian, tuntutan, biaya, atau konsekuensi dari pemilik hak, artis, label, publisher, distributor, DSP, dan pihak ketiga.</li><li>Pemohon wajib memastikan tidak ada kewajiban kontrak, pembayaran, lisensi, pembagian royalti, atau persetujuan pihak lain yang masih menghalangi proses takedown.</li><li>Pemohon wajib memberikan dokumen tambahan jika Soundpub atau DSP membutuhkan bukti kepemilikan, surat kuasa, identitas, kontrak, korespondensi, atau keputusan hukum.</li><li>Pemohon memahami bahwa takedown dapat memengaruhi seluruh rilis, track, statistik, playlist, tautan, monetisasi, laporan, serta pendapatan yang belum diproses oleh DSP.</li></ol></section>
          <section><h3 className="font-semibold">3. Proses dan Waktu DSP</h3><ol className="list-decimal space-y-2 pl-5"><li>Soundpub melakukan pemeriksaan administratif sebelum meneruskan request.</li><li>Soundpub dapat meminta perbaikan data, menunda, atau menolak request yang tidak lengkap, tidak konsisten, atau berisiko hukum.</li><li>Setelah dikirim, keputusan dan waktu penyelesaian berada pada kebijakan masing-masing DSP. Estimasi maksimal operasional adalah 2 bulan, tetapi dapat lebih lama karena review DSP atau sengketa.</li><li>Penghapusan pada satu DSP tidak menjamin penghapusan serentak pada DSP lain.</li></ol></section>
          <section><h3 className="font-semibold">4. Pembatalan dan Pemulihan</h3><ol className="list-decimal space-y-2 pl-5"><li>Request yang belum dikirim ke DSP dapat dimintakan pembatalan, sesuai hasil review admin.</li><li>Request yang sudah dikirim belum tentu dapat dibatalkan.</li><li>Rilis yang sudah turun tidak otomatis dapat dipulihkan. Pengunggahan ulang dapat menghasilkan URL, statistik, playlist placement, atau pengaitan katalog yang berbeda.</li></ol></section>
          <section><h3 className="font-semibold">5. Bukti dan Komunikasi</h3><p>Pemohon setuju menggunakan kontak yang dicantumkan untuk verifikasi. Pemohon wajib merespons permintaan klarifikasi dan menyimpan bukti komunikasi selama proses berlangsung.</p></section>
          <section><h3 className="font-semibold">6. Persetujuan Akhir</h3><p>Dengan menyetujui TOR, pemohon menyatakan telah membaca seluruh ketentuan, memahami akibat takedown, menerima proses review Soundpub dan DSP, serta bertanggung jawab penuh atas dasar permohonan.</p><a className="mt-2 inline-block text-primary underline" href="https://docs.google.com/document/d/11NmkkGK7E5UOp9aw496UxdkqUcQ3dZk068jFpYRPHAU/edit?tab=t.0#heading=h.9ve5ywkz1dwh" target="_blank" rel="noreferrer">Buka dokumen TOR sumber</a></section>
          <p className="rounded-md bg-muted p-3 font-medium">Anda sudah mencapai akhir TOR. Tombol persetujuan sekarang dapat digunakan.</p>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setTorOpen(false)}>Belum Setuju</Button><Button type="button" disabled={!torReadToEnd} onClick={() => { setAccepted(true); setTorOpen(false); }}>Saya Sudah Membaca dan Memahami</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div></DashboardLayout>;
}
