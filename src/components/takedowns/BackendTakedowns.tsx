import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { takedownsApi, type TakedownDsp, type TakedownRelease, type TakedownRequest } from '@/api/takedowns';
import { tracksApi, type BackendTrack } from '@/api/tracks';
import { uploadBackendMedia } from '@/services/media';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { FileWarning, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const dspOptions: TakedownDsp[] = ['Semua DSP', 'Spotify', 'Apple Music', 'YouTube Music', 'Meta', 'TikTok', 'Deezer', 'Amazon Music', 'Tidal'];
const reasonOptions = ['Permintaan pemilik karya', 'Kesalahan metadata', 'Rilis duplikat', 'Pindah distributor', 'Hak distribusi berakhir', 'Sengketa hak cipta', 'Pelanggaran copyright', 'Streaming manipulation atau fraud', 'Unauthorized upload', 'Pelanggaran kebijakan DSP', 'Perintah hukum', 'Lainnya'];
export const takedownStatusLabel: Record<string, string> = { SUBMITTED: 'Diajukan', UNDER_REVIEW: 'Ditinjau', NEED_DOCUMENT: 'Butuh dokumen', APPROVED: 'Disetujui', SENT_TO_DSP: 'Dikirim ke DSP', PROCESSING_DSP: 'Diproses DSP', PARTIALLY_COMPLETED: 'Selesai sebagian', COMPLETED: 'Selesai', REJECTED: 'Ditolak', CANCEL_REQUESTED: 'Pembatalan diminta', CANCELLED: 'Dibatalkan' };

export function BackendTakedowns() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<TakedownRequest[]>([]);
  const [releases, setReleases] = useState<TakedownRelease[]>([]);
  const [tracks, setTracks] = useState<BackendTrack[]>([]);
  const [releaseId, setReleaseId] = useState('');
  const [requestType, setRequestType] = useState<'standard' | 'partial' | 'urgent'>('standard');
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [detail, setDetail] = useState('');
  const [contactName, setContactName] = useState(profile?.full_name ?? '');
  const [contactPosition, setContactPosition] = useState('');
  const [contactPhone, setContactPhone] = useState(profile?.phone ?? '');
  const [contactEmail, setContactEmail] = useState(profile?.email ?? '');
  const [contactAddress, setContactAddress] = useState(profile?.address ?? '');
  const [selectedDsps, setSelectedDsps] = useState<TakedownDsp[]>(['Semua DSP']);
  const [accepted, setAccepted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => { void (async () => {
    setLoading(true);
    try {
      const [requestPage, releasePage] = await Promise.all([takedownsApi.list(), takedownsApi.eligibleReleases()]);
      setRequests(requestPage.items); setReleases(releasePage.items);
    } catch (error: any) { toast.error(error.serverMessage || 'Gagal memuat takedown'); }
    finally { setLoading(false); }
  })(); }, []);
  useEffect(() => {
    if (requestType !== 'partial' || !releaseId) { setTracks([]); setTrackIds([]); return; }
    tracksApi.list(releaseId).then(result => setTracks(result.items)).catch(() => toast.error('Gagal memuat track rilis'));
  }, [releaseId, requestType]);
  const selectedRelease = useMemo(() => releases.find(release => release.id === releaseId), [releases, releaseId]);

  const toggleDsp = (dsp: TakedownDsp) => setSelectedDsps(current => dsp === 'Semua DSP' ? ['Semua DSP']
    : current.includes(dsp) ? current.filter(item => item !== dsp) : [...current.filter(item => item !== 'Semua DSP'), dsp]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!releaseId || !reason || !detail.trim() || !accepted || !selectedDsps.length ||
      (requestType === 'partial' && !trackIds.length)) { toast.error('Lengkapi data wajib sebelum mengirim.'); return; }
    setSaving(true);
    try {
      const created = await takedownsApi.create({ release_id: releaseId, request_type: requestType,
        ...(requestType === 'partial' ? { track_ids: trackIds } : {}), reason_category: reason,
        reason_detail: detail.trim(), other_reason: reason === 'Lainnya' ? otherReason.trim() : null,
        contact_name: contactName.trim(), contact_position: contactPosition.trim(), contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim(), contact_address: contactAddress.trim(), declaration_accepted: true,
        declaration_version: 'takedown-tor-v1', targets: selectedDsps });
      let failed = 0;
      for (const file of files) {
        try { await uploadBackendMedia(file, { category: 'TAKEDOWN_DOCUMENT', resource_type: 'takedown', resource_id: created.id }); }
        catch { failed += 1; }
      }
      toast.success(failed ? `Request tersimpan. ${failed} dokumen gagal; unggah ulang dari detail.` : 'Permohonan takedown terkirim.');
      navigate(`/dashboard/takedown/${created.id}`);
    } catch (error: any) { toast.error(error.serverMessage || 'Gagal mengirim takedown'); }
    finally { setSaving(false); }
  };

  return <DashboardLayout><div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
    <div><p className="text-sm font-medium text-primary">Distribusi & kepatuhan</p><h1 className="text-3xl font-semibold tracking-tight">Takedown</h1><p className="mt-1 text-muted-foreground">Permintaan tercatat dan dilacak per DSP.</p></div>
    <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Alur backend aktif</AlertTitle><AlertDescription>Kepemilikan rilis, snapshot metadata, status, timeline, dan notifikasi ditentukan server.</AlertDescription></Alert>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card><CardHeader><CardTitle>Daftar permohonan</CardTitle><CardDescription>{requests.length} request dalam scope akun ini.</CardDescription></CardHeader><CardContent>
        {loading ? <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat data...</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Rilis</TableHead><TableHead>Status</TableHead><TableHead>Target</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {requests.map(request => <TableRow key={request.id}><TableCell className="font-mono text-xs">{request.request_code}</TableCell><TableCell><p className="font-medium">{request.items[0]?.title_snapshot ?? '-'}</p><p className="text-xs text-muted-foreground">{request.items[0]?.artist_name_snapshot}</p></TableCell><TableCell><Badge variant={request.status === 'REJECTED' ? 'destructive' : request.status === 'COMPLETED' ? 'default' : 'secondary'}>{takedownStatusLabel[request.status]}</Badge></TableCell><TableCell>{request.targets.length} DSP</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/takedown/${request.id}`)}>Detail</Button></TableCell></TableRow>)}
          {!requests.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Belum ada permohonan.</TableCell></TableRow>}
        </TableBody></Table></div>}
      </CardContent></Card>
      <Card className="h-fit"><CardHeader><CardTitle>Buat permohonan</CardTitle><CardDescription>Pilih rilis, ruang lingkup, alasan, dan target DSP.</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={submit}>
        <div className="space-y-2"><Label>Rilis</Label><Select value={releaseId} onValueChange={setReleaseId}><SelectTrigger><SelectValue placeholder="Pilih rilis" /></SelectTrigger><SelectContent>{releases.map(release => <SelectItem key={release.id} value={release.id}>{release.title} - {release.artist_name}</SelectItem>)}</SelectContent></Select>{selectedRelease && <p className="text-xs text-muted-foreground">UPC {selectedRelease.upc || 'belum tersedia'} · status {selectedRelease.status}</p>}</div>
        <div className="space-y-2"><Label>Jenis request</Label><Select value={requestType} onValueChange={value => setRequestType(value as typeof requestType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="partial">Partial per track</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
        {requestType === 'partial' && <div className="space-y-2 rounded-lg border p-3"><Label>Track yang diturunkan</Label>{tracks.map(track => <label key={track.id} className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-muted"><Checkbox checked={trackIds.includes(track.id)} onCheckedChange={() => setTrackIds(current => current.includes(track.id) ? current.filter(id => id !== track.id) : [...current, track.id])} /><span className="text-sm">{track.position}. {track.title}</span></label>)}{!tracks.length && <p className="text-sm text-muted-foreground">Pilih rilis dengan track tersedia.</p>}</div>}
        <div className="space-y-2"><Label>Alasan</Label><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue placeholder="Pilih alasan" /></SelectTrigger><SelectContent>{reasonOptions.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        {reason === 'Lainnya' && <div className="space-y-2"><Label>Alasan lainnya</Label><Textarea value={otherReason} onChange={event => setOtherReason(event.target.value)} placeholder="Minimal lima kata" /></div>}
        <div className="space-y-2"><Label>Detail permohonan</Label><Textarea className="min-h-28" value={detail} onChange={event => setDetail(event.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Nama PIC" value={contactName} setValue={setContactName} /><Field label="Jabatan" value={contactPosition} setValue={setContactPosition} /><Field label="Telepon" value={contactPhone} setValue={setContactPhone} /><Field label="Email" value={contactEmail} setValue={setContactEmail} type="email" /></div>
        <div className="space-y-2"><Label>Alamat</Label><Textarea value={contactAddress} onChange={event => setContactAddress(event.target.value)} /></div>
        <div className="space-y-2"><Label>Target DSP</Label><div className="grid grid-cols-2 gap-2">{dspOptions.map(dsp => <label key={dsp} className="flex min-h-11 items-center gap-2 rounded-md border px-3"><Checkbox checked={selectedDsps.includes(dsp)} onCheckedChange={() => toggleDsp(dsp)} /><span className="text-sm">{dsp}</span></label>)}</div></div>
        <div className="space-y-2"><Label htmlFor="takedown-files">Dokumen pendukung</Label><Input id="takedown-files" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setFiles(Array.from(event.target.files || []))} /><p className="text-xs text-muted-foreground">PDF/JPG/PNG/WebP, maksimal 10 MB per file.</p></div>
        <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"><Checkbox className="mt-0.5" checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span className="text-sm">Saya memiliki kewenangan meminta penurunan distribusi dan menyatakan data benar.</span></label>
        <Button className="w-full" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengirim...</> : <><FileWarning className="mr-2 h-4 w-4" />Kirim permohonan</>}</Button>
      </form></CardContent></Card>
    </div>
  </div></DashboardLayout>;
}

function Field({ label, value, setValue, type = 'text' }: { label: string; value: string; setValue: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={event => setValue(event.target.value)} /></div>;
}
