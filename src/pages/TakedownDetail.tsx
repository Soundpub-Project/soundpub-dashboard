import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

const requestStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'NEED_DOCUMENT', 'APPROVED', 'SENT_TO_DSP', 'PROCESSING_DSP', 'PARTIALLY_COMPLETED', 'COMPLETED', 'REJECTED'];
const targetStatuses = ['PENDING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED'];
const statusLabels: Record<string, string> = { SUBMITTED: 'Diajukan', UNDER_REVIEW: 'Ditinjau', NEED_DOCUMENT: 'Butuh Dokumen', APPROVED: 'Disetujui', SENT_TO_DSP: 'Dikirim ke DSP', PROCESSING_DSP: 'Diproses DSP', PARTIALLY_COMPLETED: 'Selesai Sebagian', COMPLETED: 'Selesai', REJECTED: 'Ditolak', PENDING: 'Menunggu', PROCESSING: 'Diproses' };
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('id-ID') : '-';
const badgeVariant = (status: string) => status === 'REJECTED' ? 'destructive' : status === 'COMPLETED' ? 'default' : 'secondary';

export default function TakedownDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timelineNote, setTimelineNote] = useState('');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: request, error } = await (supabase as any).from('takedown_requests').select('id,status,request_type,reason_category,reason_detail,other_reason,created_at,sent_to_dsp_at,review_note,rejection_reason,requester_id,items:takedown_request_items(title_snapshot,artist_name_snapshot,upc_snapshot,isrc_snapshot,release_id),targets:takedown_request_targets(id,dsp_name,status,external_reference,submitted_at,completed_at,failure_reason,admin_note),documents:takedown_request_documents(id,file_name,document_type,file_size,created_at),history:takedown_status_history(id,old_status,new_status,note,created_at)').eq('id', id).single();
      if (error) throw error;
      const releaseIds = [...new Set((request.items || []).map((item: any) => item.release_id))];
      const { data: tracks, error: trackError } = releaseIds.length ? await (supabase as any).from('tracks').select('id,release_id,title,artist_name,isrc,genre,composer,lyricist,explicit_lyrics').in('release_id', releaseIds).order('created_at') : { data: [], error: null };
      if (trackError) throw trackError;
      const tracksByRelease = (tracks || []).reduce((result: Record<string, any[]>, track: any) => ({ ...result, [track.release_id]: [...(result[track.release_id] || []), track] }), {});
      setData({ ...request, items: request.items.map((item: any) => ({ ...item, tracks: tracksByRelease[item.release_id] || [] })) });
    } catch (error: any) { toast.error(error.message || 'Gagal memuat detail takedown'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateRequestStatus = async (status: string, note: string) => {
    if (!data || !user) return;
    const noteRequired = ['NEED_DOCUMENT', 'REJECTED'].includes(status);
    if (noteRequired && !note.trim()) { toast.error('Alasan wajib diisi.'); return; }
    setSaving(true);
    try {
      const values: Record<string, unknown> = { status, reviewer_id: user.id, reviewed_at: new Date().toISOString(), review_note: note.trim() || null };
      if (status === 'REJECTED') values.rejection_reason = note.trim();
      if (status === 'SENT_TO_DSP') values.sent_to_dsp_at = new Date().toISOString();
      if (status === 'COMPLETED') values.completed_at = new Date().toISOString();
      const { error } = await (supabase as any).from('takedown_requests').update(values).eq('id', data.id);
      if (error) throw error;
      await (supabase as any).from('takedown_status_history').insert({ request_id: data.id, old_status: data.status, new_status: status, changed_by: user.id, note: note.trim() || null });
      toast.success('Status request diperbarui.');
      setPendingStatus(null);
      setStatusReason('');
      await load();
    } catch (error: any) { toast.error(error.message || 'Gagal memperbarui status request'); }
    finally { setSaving(false); }
  };

  const updateTarget = async (target: any, status: string) => {
    const reference = status === 'SUBMITTED' ? window.prompt('Nomor tiket/referensi DSP (opsional):', target.external_reference || '') : target.external_reference;
    setSaving(true);
    try {
      const values: Record<string, unknown> = { status, external_reference: reference || null };
      if (status === 'SUBMITTED') values.submitted_at = new Date().toISOString();
      if (status === 'COMPLETED') values.completed_at = new Date().toISOString();
      const { error } = await (supabase as any).from('takedown_request_targets').update(values).eq('id', target.id);
      if (error) throw error;
      toast.success(`${target.dsp_name} diperbarui.`);
      await load();
    } catch (error: any) { toast.error(error.message || 'Gagal memperbarui DSP'); }
    finally { setSaving(false); }
  };

  const addTimelineNote = async () => {
    if (!data || !user || !timelineNote.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('takedown_status_history').insert({ request_id: data.id, old_status: data.status, new_status: data.status, changed_by: user.id, note: timelineNote.trim() });
      if (error) throw error;
      setTimelineNote('');
      toast.success('Catatan timeline ditambahkan.');
      await load();
    } catch (error: any) { toast.error(error.message || 'Gagal menambah catatan timeline'); }
    finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div></DashboardLayout>;
  if (!data) return <DashboardLayout><p>Request tidak ditemukan.</p></DashboardLayout>;

  return <DashboardLayout><div className="space-y-6">
    <Button variant="ghost" onClick={() => navigate('/dashboard/takedown')}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button>
    <div><h1 className="text-3xl font-bold">Detail Takedown</h1><p className="text-muted-foreground">TD-{data.id.slice(0, 8).toUpperCase()} · {dateLabel(data.created_at)}</p></div>
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <Card className="lg:col-start-1 lg:row-start-1"><CardHeader><CardTitle>Informasi Permohonan</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-muted-foreground">Status</p><Badge variant={badgeVariant(data.status)}>{statusLabels[data.status] || data.status}</Badge></div><div><p className="text-muted-foreground">Tipe</p><p className="capitalize">{data.request_type}</p></div><div><p className="text-muted-foreground">Alasan</p><p>{data.reason_category}</p></div><div><p className="text-muted-foreground">Alasan lainnya</p><p>{data.other_reason || '-'}</p></div><div><p className="text-muted-foreground">Dikirim ke DSP</p><p>{dateLabel(data.sent_to_dsp_at)}</p></div><div className="sm:col-span-2"><p className="text-muted-foreground">Keterangan</p><p className="whitespace-pre-wrap">{data.reason_detail}</p></div></CardContent></Card>
    <Card className="lg:col-start-1 lg:row-start-2"><CardHeader><CardTitle>Rilis dan Track</CardTitle><CardDescription>Semua track yang termasuk dalam rilis request.</CardDescription></CardHeader><CardContent className="space-y-5">{data.items.map((item: any) => <div className="rounded-lg border p-4" key={item.release_id}><p className="font-semibold">{item.title_snapshot}</p><p className="text-sm text-muted-foreground">{item.artist_name_snapshot} · UPC {item.upc_snapshot || '-'}</p><div className="mt-4 space-y-2">{item.tracks.length ? item.tracks.map((track: any, index: number) => <div className="rounded-md bg-muted/40 p-3" key={track.id}><div className="flex justify-between"><p className="font-medium">{index + 1}. {track.title}</p><Badge variant="outline">{track.explicit_lyrics ? 'Eksplisit' : 'Non-eksplisit'}</Badge></div><p className="text-sm text-muted-foreground">{track.artist_name} · ISRC {track.isrc || '-'} · Genre {track.genre || '-'}</p><p className="text-xs text-muted-foreground">Komposer: {track.composer || '-'} · Lyricist: {track.lyricist || '-'}</p></div>) : <p className="text-sm text-muted-foreground">Data track belum tersedia.</p>}</div></div>)}</CardContent></Card>
    <Card className="lg:col-span-2 lg:row-start-3"><CardHeader><CardTitle>Status DSP</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.targets.map((target: any) => <div className="rounded border p-3" key={target.id}><div className="flex items-center justify-between gap-4"><div><p className="font-medium">{target.dsp_name}</p><p className="text-xs text-muted-foreground">{target.external_reference || 'Belum ada referensi DSP'}</p></div><Badge variant={badgeVariant(target.status)}>{statusLabels[target.status] || target.status}</Badge></div>{isAdmin && <Select value={target.status} disabled={saving} onValueChange={(status) => updateTarget(target, status)}><SelectTrigger className="mt-3"><SelectValue /></SelectTrigger><SelectContent>{targetStatuses.map((status) => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectContent></Select>}</div>)}</CardContent></Card>
    <Card className="lg:col-start-2 lg:row-start-2"><CardHeader><CardTitle>Timeline</CardTitle><CardDescription>Riwayat perubahan status dan catatan proses.</CardDescription></CardHeader><CardContent><div className="space-y-3 border-l pl-4">{[...(data.history || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((entry: any) => <div key={entry.id}><p className="text-sm font-medium">{statusLabels[entry.new_status] || entry.new_status}</p><p className="text-xs text-muted-foreground">{dateLabel(entry.created_at)}{entry.note ? ` · ${entry.note}` : ''}</p></div>)}</div>{isAdmin && <div className="mt-5 flex gap-2"><div className="flex-1"><Label htmlFor="timeline-note">Catatan timeline</Label><Input id="timeline-note" value={timelineNote} onChange={(event) => setTimelineNote(event.target.value)} placeholder="Contoh: DSP meminta bukti tambahan." /></div><Button className="mt-6" disabled={saving || !timelineNote.trim()} onClick={addTimelineNote}><Save className="mr-2 h-4 w-4" />Tambah</Button></div>}</CardContent></Card>
    {isAdmin && <Card className="lg:col-start-2 lg:row-start-1"><CardHeader><CardTitle>Aksi Admin</CardTitle><CardDescription>Perubahan status otomatis masuk ke timeline.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-3">{requestStatuses.filter((status) => status !== data.status).map((status) => <Button key={status} variant={status === 'REJECTED' ? 'destructive' : 'outline'} disabled={saving} onClick={() => { setStatusReason(''); setPendingStatus(status); }}>{statusLabels[status]}</Button>)}</CardContent></Card>}
    </div>
    <AlertDialog open={Boolean(pendingStatus)} onOpenChange={(open) => { if (!open && !saving) { setPendingStatus(null); setStatusReason(''); } }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Ubah status menjadi {pendingStatus ? statusLabels[pendingStatus] : '-'}</AlertDialogTitle><AlertDialogDescription>Status belum berubah. Isi alasan, lalu tekan Konfirmasi. Tekan Batal untuk menutup tanpa menyimpan perubahan.</AlertDialogDescription></AlertDialogHeader>
        <div className="space-y-2"><Label htmlFor="status-reason">{pendingStatus === 'REJECTED' ? 'Alasan penolakan' : pendingStatus === 'NEED_DOCUMENT' ? 'Dokumen yang dibutuhkan' : 'Catatan perubahan'}</Label><Textarea id="status-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Tuliskan alasan atau catatan perubahan status." className="min-h-28" /></div>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving || (Boolean(pendingStatus && ['NEED_DOCUMENT', 'REJECTED'].includes(pendingStatus)) && !statusReason.trim())} onClick={(event) => { event.preventDefault(); if (pendingStatus) updateRequestStatus(pendingStatus, statusReason); }}>{saving ? 'Menyimpan...' : 'Konfirmasi'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div></DashboardLayout>;
}
