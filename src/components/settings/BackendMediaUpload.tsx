import { useRef, useState } from 'react';
import { mediaApi, type MediaBinding } from '@/api/media';
import { mediaIdFromReference, resolveMediaDownload, uploadBackendMedia } from '@/services/media';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function BackendMediaUpload({ binding, reference, label, disabled, onChange, onBusyChange }: { binding: MediaBinding; reference?: string | null; label: string; disabled?: boolean; onChange: () => Promise<void>; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const audioCategory = binding.category === 'TRACK_AUDIO' || binding.category === 'TRACK_CLIP';
  const preview = useMediaUrl(reference, !audioCategory);
  const id = mediaIdFromReference(reference);
  const renewing = useRef(false);
  const latestReference = useRef(reference);
  latestReference.current = reference;
  const playback = useRef<{ reference: string; expires: number } | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    if (busy || disabled) return;
    setBusy(true); onBusyChange?.(true); setError(''); setMessage('');
    try { await action(); await onChange(); setMessage('Media tersimpan'); }
    catch (caught) { setError(`${caught instanceof Error ? caught.message : 'Gagal menyimpan media'}. Muat ulang untuk memeriksa hasil.`); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  return <section className="space-y-2 rounded-lg border p-3" aria-label={label}>
    {preview && (audioCategory ? <audio controls src={preview} preload="none" aria-label={label} onPlay={async event => {
      if (!reference || renewing.current || (playback.current?.reference === reference && playback.current.expires > Date.now())) return;
      const audio = event.currentTarget;
      const original = reference;
      const position = audio.currentTime;
      audio.pause(); renewing.current = true;
      try {
        const url = await resolveMediaDownload(original);
        if (!audio.isConnected || latestReference.current !== original) return;
        audio.src = url;
        audio.currentTime = position;
        playback.current = { reference: original, expires: Date.now() + 45000 };
        await audio.play();
      } catch { setError('Gagal memuat audio. Coba lagi.'); }
      finally { renewing.current = false; }
    }} /> : <img className="h-24 w-24 object-contain" src={preview} alt={label} />)}
    <label className="block">{label}<Input type="file" disabled={busy || disabled} accept={binding.category === 'TRACK_AUDIO' ? '.wav,.flac,.aiff,.aif,.mp3' : binding.category === 'TRACK_CLIP' ? '.mp3,.m4a,.ogg,.wav' : '.png,.jpg,.jpeg,.webp'} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { setProgress(0); try { await uploadBackendMedia(file, binding, setProgress); } finally { setProgress(null); } }); }} /></label>
    {id && <Button type="button" variant="destructive" disabled={busy || disabled} onClick={() => void run(() => mediaApi.remove(id))}>Hapus {label}</Button>}
    {busy && <p role="status">Mengupload dan memverifikasi{progress === null ? '…' : `… ${progress}%`}</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
