import { useAuth } from '@/hooks/useAuth';
import { listLabelCustomArtists, type LabelCustomArtist } from '@/services/label-custom';
import { usesBackendDomain } from '@/api/routing';
import { BackendMediaUpload } from '@/components/settings/BackendMediaUpload';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { releasesApi, type BackendRelease, type ReleaseMetadata, type SubmissionReadiness } from '@/api/releases';
import { tracksApi } from '@/api/tracks';
import { usesBackendReleases } from '@/services/releases';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type DraftTrack = { id?: string; version?: number; title: string; artist_name: string; lyrics: string | null; audio_url?: string | null };
const blankTrack = (): DraftTrack => ({ title: '', artist_name: '', lyrics: null });

export function BackendReleaseForm({ releaseId }: { releaseId?: string }) {
  const navigate = useNavigate();
  const { isLabelCustom } = useAuth();
  const [artists, setArtists] = useState<LabelCustomArtist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(isLabelCustom && !releaseId);
  const [artistsError, setArtistsError] = useState('');
  const [artistRetry, setArtistRetry] = useState(0);
  useEffect(() => {
    if (!usesBackendReleases() || !isLabelCustom || releaseId) return;
    let active = true;
    setArtistsLoading(true); setArtistsError(''); setArtists([]);
    listLabelCustomArtists({ status: 'active' }).then(rows => {
      if (active) setArtists(rows.filter(row => row.status === 'active'));
    }).catch(caught => { if (active) setArtistsError(caught instanceof Error ? caught.message : 'Gagal memuat artis'); })
      .finally(() => { if (active) setArtistsLoading(false); });
    return () => { active = false; };
  }, [isLabelCustom, releaseId, artistRetry]);
  const [release, setRelease] = useState<BackendRelease | null>(null);
  const [tracks, setTracks] = useState<DraftTrack[]>([]);
  const [busy, setBusy] = useState(Boolean(releaseId));
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [readiness, setReadiness] = useState<SubmissionReadiness | null>(null);
  const [metadata, setMetadata] = useState<ReleaseMetadata>({ title: '', artist_name: '', release_type: 'single', genre: '', release_date: '' });
  const [artistId, setArtistId] = useState('');
  const [track, setTrack] = useState<DraftTrack>(blankTrack);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!releaseId) return;
    const [row, page] = await Promise.all([releasesApi.detail(releaseId), tracksApi.list(releaseId)]);
    setRelease({ ...row, version: page.release_version });
    setMetadata({ title: row.title, artist_name: row.artist_name, release_type: (row.release_type || 'single') as ReleaseMetadata['release_type'], genre: row.genre || '', release_date: row.release_date || '' });
    setTracks(page.items.map(item => ({ id: item.id, version: item.version, title: item.title, artist_name: item.artist_name, lyrics: item.lyrics, audio_url: item.audio_url })));
    setReadiness(await releasesApi.readiness(releaseId));
    setDirty(false);
    setTrackIndex(null); setTrack(blankTrack);
  }, [releaseId]);
  useEffect(() => {
    if (!usesBackendReleases()) return;
    load().catch(caught => setError(caught instanceof Error ? caught.message : 'Gagal memuat release')).finally(() => setBusy(false));
  }, [load]);
  const run = async (action: () => Promise<void>) => {
    if (!usesBackendReleases() || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (caught) { setError(`${caught instanceof Error ? caught.message : 'Gagal menyimpan'}. Muat ulang sebelum mencoba lagi jika terjadi konflik.`); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const fields = { ...metadata, title: metadata.title.trim(), artist_name: metadata.artist_name.trim(), genre: metadata.genre || null, release_date: metadata.release_date || null };
      if (releaseId && !release) throw new Error('Release belum dimuat');
      if (!release && isLabelCustom && (artistsLoading || artistsError || !artists.some(artist => artist.id === artistId))) throw new Error('Pilih artis aktif terlebih dahulu.');
      const result = release
        ? await releasesApi.updateAggregate(release.id, { ...fields, version: release.version, tracks: tracks.map(({ audio_url, ...item }) => item) })
        : await releasesApi.createAggregate({ ...fields, ...(isLabelCustom ? { artist_id: artistId } : { artist_user_id: artistId.trim() }), status: 'draft', tracks });
      setRelease(result.release);
      setTracks(result.tracks.map(item => ({ id: item.id, version: item.version, title: item.title, artist_name: item.artist_name, lyrics: item.lyrics, audio_url: item.audio_url })));
      setReadiness(await releasesApi.readiness(result.release.id));
      setDirty(false);
      setMessage('Release dan tracks tersimpan dalam satu transaksi.');
      if (!releaseId) navigate(`/dashboard/releases/${result.release.id}/edit`);
    });
  };
  const stageTrack = (event: FormEvent) => {
    event.preventDefault();
    setDirty(true);
    const next = { ...track, title: track.title.trim(), artist_name: track.artist_name.trim() };
    if (trackIndex === null) setTracks(current => [...current, next]);
    else setTracks(current => current.map((item, index) => index === trackIndex ? next : item));
    setTrackIndex(null); setTrack(blankTrack);
    setMessage('Track siap disimpan bersama release.');
  };
  if (!usesBackendReleases()) return null;
  return <div className="space-y-6">
    <h1 className="text-2xl font-bold">{releaseId ? 'Edit Release' : 'Tambah Release'} — Metadata</h1>
    <p role="status">Simpan release dan tracks sebelum mengupload media. Submission memerlukan seluruh syarat terpenuhi; pembayaran dan aktivasi belum tersedia.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {release?.archived_at && <p role="status">Release diarsipkan. Metadata dan tracks hanya dapat dilihat.</p>}
    {releaseId && <Button disabled={busy} onClick={() => void run(load)}>Muat ulang</Button>}
    <form id="release-aggregate-form" onChange={() => setDirty(true)} onSubmit={save} className="space-y-3"><fieldset disabled={busy || Boolean(releaseId && !release) || Boolean(release?.archived_at)} className="space-y-3">
      {!releaseId && !isLabelCustom && <label className="block">Artist user ID<Input required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={artistId} onChange={event => setArtistId(event.target.value)} /></label>}
      {!releaseId && isLabelCustom && <div className="space-y-2">
        <label htmlFor="release-artist">Artis</label>
        <select id="release-artist" required className="block w-full rounded-md border bg-background p-2" value={artistId}
          disabled={artistsLoading || Boolean(artistsError) || artists.length === 0}
          onChange={event => { const artist = artists.find(row => row.id === event.target.value); setArtistId(event.target.value); if (artist) setMetadata(current => ({ ...current, artist_name: artist.name })); }}>
          <option value="">Pilih artis aktif</option>
          {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
        </select>
        {artistsLoading && <p role="status">Memuat artis…</p>}
        {artistsError && <><p role="alert">{artistsError}</p><Button type="button" onClick={() => setArtistRetry(value => value + 1)}>Coba lagi</Button></>}
        {!artistsLoading && !artistsError && artists.length === 0 && <p role="status">Belum ada artis aktif. Tambahkan artis di My Artists sebelum membuat release.</p>}
      </div>}
      {release && <p>Artis: {release.artist_name}. Identitas artis tidak dapat diubah.</p>}
      <label className="block">Judul<Input required maxLength={200} value={metadata.title} onChange={event => setMetadata({ ...metadata, title: event.target.value })} /></label>
      <label className="block">Artist<Input required maxLength={200} value={metadata.artist_name} onChange={event => setMetadata({ ...metadata, artist_name: event.target.value })} /></label>
      <label className="block">Jenis release<select className="block border bg-background" value={metadata.release_type} onChange={event => setMetadata({ ...metadata, release_type: event.target.value as ReleaseMetadata['release_type'] })}>{['single', 'ep', 'album', 'compilation'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="block">Genre<Input maxLength={100} value={metadata.genre || ''} onChange={event => setMetadata({ ...metadata, genre: event.target.value })} /></label>
      <label className="block">Tanggal rilis<Input type="date" value={metadata.release_date || ''} onChange={event => setMetadata({ ...metadata, release_date: event.target.value })} /></label>
      <Button type="submit" disabled={!releaseId && isLabelCustom && (artistsLoading || Boolean(artistsError) || !artistId || !artists.some(artist => artist.id === artistId))}>Simpan release dan tracks</Button>
    </fieldset></form>
    {release && usesBackendDomain('storage') && <BackendMediaUpload label="Cover release" binding={{ category: 'RELEASE_COVER', resource_type: 'release', resource_id: release.id }} reference={release.cover_url} disabled={busy || Boolean(release?.archived_at) || dirty || !['draft', 'rejected'].includes(release.status)} onChange={load} onBusyChange={setBusy} />}
    {release && <section aria-label="Kesiapan pengajuan"><h2 className="text-xl font-semibold">Kesiapan pengajuan</h2>
      <p>{readiness?.ready ? 'Siap diajukan' : 'Belum siap diajukan'}</p>
      <ul>{readiness?.blockers.map(blocker => <li key={blocker.code}>{blocker.code} ({blocker.owner})</li>)}</ul>
      {['draft', 'rejected'].includes(release.status) && <Button disabled={busy || dirty || Boolean(release?.archived_at) || !readiness?.ready} onClick={() => void run(async () => {
        const row = await releasesApi.submit(release.id, { version: release.version });
        setRelease(row); setReadiness(await releasesApi.readiness(row.id)); setMessage('Release diajukan.');
      })}>Ajukan release</Button>}
    </section>}
    <section aria-label="Tracks" className="space-y-3"><h2 className="text-xl font-semibold">Tracks</h2>
      <ol className="space-y-2">{tracks.map((item, index) => <li key={item.id || `draft-${index}`} className="flex flex-wrap items-center gap-2">
        <span>{index + 1}. {item.title} — {item.artist_name}</span>
        {release && item.id && usesBackendDomain('storage') && <BackendMediaUpload label={`Audio ${item.title}`} binding={{ category: 'TRACK_AUDIO', resource_type: 'track', resource_id: item.id }} reference={item.audio_url} disabled={busy || Boolean(release?.archived_at) || dirty || !['draft', 'rejected'].includes(release.status)} onChange={load} onBusyChange={setBusy} />}

        <Button type="button" disabled={busy || Boolean(release?.archived_at) || index === 0} onClick={() => { setDirty(true); setTracks(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); }}>Naik</Button>
        <Button type="button" disabled={busy || Boolean(release?.archived_at) || index === tracks.length - 1} onClick={() => { setDirty(true); setTracks(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; }); }}>Turun</Button>
        <Button type="button" disabled={busy || Boolean(release?.archived_at)} onClick={() => { setTrackIndex(index); setTrack(item); }}>Edit</Button>
        <Button type="button" disabled={busy || Boolean(release?.archived_at)} variant="destructive" onClick={() => { setDirty(true); setTracks(current => current.filter((_, position) => position !== index)); setTrackIndex(null); setTrack(blankTrack()); }}>Hapus</Button>
      </li>)}</ol>
      <form onChange={() => setDirty(true)} onSubmit={stageTrack}><fieldset disabled={busy || Boolean(release?.archived_at) || Boolean(release && !['draft', 'rejected'].includes(release.status))} className="space-y-3">
        <label className="block">Judul track<Input required maxLength={200} value={track.title} onChange={event => setTrack({ ...track, title: event.target.value })} /></label>
        <label className="block">Artist track<Input required maxLength={200} value={track.artist_name} onChange={event => setTrack({ ...track, artist_name: event.target.value })} /></label>
        <label className="block">Lyrics<textarea className="block w-full border bg-background" maxLength={50000} value={track.lyrics || ''} onChange={event => setTrack({ ...track, lyrics: event.target.value || null })} /></label>
        <Button type="submit">{trackIndex === null ? 'Tambah track' : 'Perbarui track'}</Button>
      </fieldset></form><p>Track ditambahkan, diurutkan, atau dihapus saat menyimpan release.</p>
    </section>
  </div>;
}
