import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mediaApi } from '@/api/media';
import { takedownsApi, type TakedownRequest, type TakedownTarget } from '@/api/takedowns';
import { uploadBackendMedia, capabilityUrl } from '@/services/media';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { takedownStatusLabel } from './BackendTakedowns';

const reviewerActions: Record<string, Array<'UNDER_REVIEW' | 'NEED_DOCUMENT' | 'APPROVED' | 'SENT_TO_DSP' | 'REJECTED' | 'CANCELLED'>> = {
  SUBMITTED: ['UNDER_REVIEW'], UNDER_REVIEW: ['NEED_DOCUMENT', 'APPROVED', 'REJECTED'],
  NEED_DOCUMENT: ['UNDER_REVIEW', 'REJECTED'], APPROVED: ['SENT_TO_DSP'], CANCEL_REQUESTED: ['CANCELLED'],
};
const targetActions: Record<string, Array<'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'>> = {
  PENDING: ['SUBMITTED'], SUBMITTED: ['PROCESSING', 'COMPLETED', 'REJECTED'], PROCESSING: ['COMPLETED', 'REJECTED'],
};

export function BackendTakedownDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<TakedownRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const load = async () => {
    setLoading(true);
    try { setData(await takedownsApi.detail(id)); }
    catch (error: any) { toast.error(error.serverMessage || 'Gagal memuat detail takedown'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);
  const mutate = async (work: () => Promise<TakedownRequest>) => {
    setSaving(true);
    try { setData(await work()); setNote(''); toast.success('Status diperbarui.'); }
    catch (error: any) { toast.error(error.serverMessage || 'Perubahan gagal'); }
    finally { setSaving(false); }
  };
  const transition = (status: 'UNDER_REVIEW' | 'NEED_DOCUMENT' | 'APPROVED' | 'SENT_TO_DSP' | 'REJECTED' | 'CANCELLED') => {
    if (!data) return;
    if (['NEED_DOCUMENT', 'REJECTED'].includes(status) && !note.trim()) { toast.error('Catatan wajib diisi.'); return; }
    void mutate(() => takedownsApi.transition(data.id, { version: data.version, status, note: note.trim() || null }));
  };
  const transitionTarget = (target: TakedownTarget, status: 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED') => {
    if (!data) return;
    const externalReference = status === 'SUBMITTED' ? window.prompt('Referensi DSP')?.trim() : undefined;
    const failureReason = status === 'REJECTED' ? window.prompt('Alasan gagal')?.trim() : undefined;
    if (status === 'SUBMITTED' && !externalReference || status === 'REJECTED' && !failureReason) return;
    void mutate(() => takedownsApi.transitionTarget(data.id, target.id, { version: target.version, status,
      external_reference: externalReference, failure_reason: failureReason }));
  };
  const upload = async () => {
    if (!data || !files.length) return;
    setSaving(true);
    try {
      for (const file of files) await uploadBackendMedia(file, { category: 'TAKEDOWN_DOCUMENT', resource_type: 'takedown', resource_id: data.id });
      setFiles([]); await load(); toast.success('Dokumen tersimpan.');
    } catch { toast.error('Upload dokumen gagal.'); }
    finally { setSaving(false); }
  };
  const download = async (mediaId: string) => {
    try { const capability = await mediaApi.download(mediaId); window.open(capabilityUrl(capability.url), '_blank', 'noopener,noreferrer'); }
    catch { toast.error('Dokumen tidak dapat dibuka.'); }
  };

  return <DashboardLayout><div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
    <Button variant="ghost" onClick={() => navigate('/dashboard/takedown')}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button>
    {loading ? <div className="flex items-center gap-2 py-20 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat detail...</div> : !data ? <p>Data tidak ditemukan.</p> : <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-sm text-muted-foreground">{data.request_code}</p><h1 className="text-3xl font-semibold tracking-tight">{data.items[0]?.title_snapshot}</h1><p className="text-muted-foreground">{data.items[0]?.artist_name_snapshot} · {data.request_type}</p></div><Badge className="w-fit" variant={data.status === 'REJECTED' ? 'destructive' : data.status === 'COMPLETED' ? 'default' : 'secondary'}>{takedownStatusLabel[data.status]}</Badge></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Permohonan</CardTitle></CardHeader><CardContent className="space-y-4"><Info label="Alasan" value={data.reason_category} /><Info label="Detail" value={data.reason_detail} />{data.other_reason && <Info label="Alasan lainnya" value={data.other_reason} />}<div className="grid gap-4 sm:grid-cols-2"><Info label="PIC" value={`${data.contact_name} · ${data.contact_position}`} /><Info label="Kontak" value={`${data.contact_email} · ${data.contact_phone}`} /></div><Info label="Alamat" value={data.contact_address} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Item katalog</CardTitle><CardDescription>Snapshot saat permohonan dikirim.</CardDescription></CardHeader><CardContent className="space-y-3">{data.items.map(item => <div key={item.id} className="rounded-lg border p-4"><p className="font-medium">{item.title_snapshot}</p><p className="text-sm text-muted-foreground">{item.artist_name_snapshot} · {item.track_id ? `ISRC ${item.isrc_snapshot || '-'}` : `UPC ${item.upc_snapshot || '-'}`}</p></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Status DSP</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{data.targets.map(target => <div key={target.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{target.dsp_name}</p><p className="text-xs text-muted-foreground">{target.external_reference || 'Belum ada referensi'}</p></div><Badge variant="outline">{target.status}</Badge></div>{isAdmin && targetActions[target.status]?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{targetActions[target.status].map(status => <Button key={status} size="sm" variant="outline" disabled={saving} onClick={() => transitionTarget(target, status)}>{status}</Button>)}</div>}{target.failure_reason && <p className="mt-3 text-sm text-destructive">{target.failure_reason}</p>}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Dokumen privat</CardTitle><CardDescription>Hanya requester, label pemilik, dan admin dapat membuka dokumen.</CardDescription></CardHeader><CardContent className="space-y-3">{data.documents.map(document => <div key={document.id} className="flex items-center justify-between rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-medium">{document.file_name}</p><p className="text-xs text-muted-foreground">{document.mime_type} · {(document.file_size / 1024).toFixed(1)} KB</p></div><Button size="sm" variant="outline" onClick={() => download(document.media_object_id)}><Download className="mr-2 h-4 w-4" />Buka</Button></div>)}{!data.documents.length && <p className="text-sm text-muted-foreground">Belum ada dokumen.</p>}<div className="flex flex-col gap-2 sm:flex-row"><Input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setFiles(Array.from(event.target.files || []))} /><Button disabled={saving || !files.length} onClick={upload}><Upload className="mr-2 h-4 w-4" />Unggah</Button></div></CardContent></Card>
        </div>
        <div className="space-y-6">
          {isAdmin && reviewerActions[data.status]?.length > 0 && <Card><CardHeader><CardTitle>Aksi reviewer</CardTitle><CardDescription>Transisi dibatasi state machine dan version terkini.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="space-y-2"><Label>Catatan</Label><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Wajib untuk butuh dokumen atau penolakan" /></div><div className="grid gap-2">{reviewerActions[data.status].map(status => <Button key={status} variant={status === 'REJECTED' ? 'destructive' : 'outline'} disabled={saving} onClick={() => transition(status)}>{takedownStatusLabel[status]}</Button>)}</div></CardContent></Card>}
          {!isAdmin && data.requester_id === user?.id && ['SUBMITTED','UNDER_REVIEW','NEED_DOCUMENT','APPROVED'].includes(data.status) && <Card><CardHeader><CardTitle>Pembatalan</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Alasan pembatalan" /><Button variant="destructive" disabled={saving || !note.trim()} onClick={() => void mutate(() => takedownsApi.cancel(data.id, { version: data.version, reason: note.trim() }))}>Minta pembatalan</Button></CardContent></Card>}
          <Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent><div className="space-y-4 border-l pl-4">{[...data.history].reverse().map(entry => <div key={entry.id}><p className="font-medium">{takedownStatusLabel[entry.new_status]}</p><p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('id-ID')}{entry.note ? ` · ${entry.note}` : ''}</p></div>)}</div></CardContent></Card>
        </div>
      </div>
    </>}
  </div></DashboardLayout>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value}</p></div>;
}
