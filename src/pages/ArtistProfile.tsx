import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Loader2, Music, User, Save, Upload, BadgeCheck, ExternalLink, RefreshCw, Unlink } from 'lucide-react';

interface ArtistProfileData {
  id: string;
  user_id: string;
  artist_name: string;
  artist_type: string;
  legal_name: string | null;
  profile_image_url: string | null;
  country: string | null;
  city: string | null;
  language: string | null;
  gender: string | null;
  date_of_birth: string | null;
  genre: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  spotify_artist_id: string | null;
  spotify_artist_url: string | null;
  spotify_data: any;
  spotify_synced_at: string | null;
  verified: boolean;
}

const REQUIRED_FIELDS: (keyof ArtistProfileData)[] = ['artist_name', 'artist_type', 'genre', 'country'];

export default function ArtistProfile() {
  const { userId } = useParams<{ userId?: string }>();
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [syncingSpotify, setSyncingSpotify] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfileData | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [spotifyInput, setSpotifyInput] = useState('');

  const [formData, setFormData] = useState({
    artist_name: '',
    legal_name: '',
    artist_type: 'solo',
    genre: '',
    country: '',
    city: '',
    language: '',
    gender: '',
    date_of_birth: '',
    bio: '',
    instagram: '',
    youtube: '',
    tiktok: '',
    twitter: '',
    website: '',
  });

  const targetUserId = userId || user?.id;
  const isViewingOther = !!userId && userId !== user?.id;
  const canEdit = !isViewingOther || isAdmin;

  useEffect(() => {
    if (targetUserId) {
      fetchArtistProfile();
      if (isViewingOther) fetchOwnerName();
    }
  }, [targetUserId]);

  const fetchOwnerName = async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    if (data) setOwnerName(data.full_name);
  };

  const fetchArtistProfile = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('artist_profiles')
        .select('*')
        .eq('user_id', targetUserId!)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setArtistProfile(data as ArtistProfileData);
        const social = (data.social_links as Record<string, string>) || {};
        setFormData({
          artist_name: data.artist_name || '',
          legal_name: data.legal_name || '',
          artist_type: data.artist_type || 'solo',
          genre: data.genre || '',
          country: data.country || '',
          city: data.city || '',
          language: data.language || '',
          gender: data.gender || '',
          date_of_birth: data.date_of_birth || '',
          bio: data.bio || '',
          instagram: social.instagram || '',
          youtube: social.youtube || '',
          tiktok: social.tiktok || '',
          twitter: social.twitter || '',
          website: social.website || '',
        });
      } else if (!isViewingOther) {
        setFormData(prev => ({ ...prev, artist_name: profile?.full_name || '' }));
      }
    } catch (error) {
      console.error('Error fetching artist profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUserId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran maksimal 5MB');
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `artist-photos/${targetUserId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub.publicUrl;

      const { error } = await (supabase as any)
        .from('artist_profiles')
        .update({ profile_image_url: url })
        .eq('user_id', targetUserId);
      if (error) throw error;

      setArtistProfile(prev => prev ? { ...prev, profile_image_url: url } : prev);
      toast.success('Foto artis berhasil diupload');
    } catch (err: any) {
      toast.error(err.message || 'Gagal upload foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSpotifySync = async () => {
    const input = spotifyInput.trim() || artistProfile?.spotify_artist_url || artistProfile?.spotify_artist_id || '';
    if (!input) {
      toast.error('Masukkan URL atau ID Spotify Artist');
      return;
    }
    setSyncingSpotify(true);
    try {
      const { data, error } = await supabase.functions.invoke('spotify-fetch-artist', {
        body: { artist_url_or_id: input },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sp = data.data;

      const { error: updErr } = await (supabase as any)
        .from('artist_profiles')
        .update({
          spotify_artist_id: sp.id,
          spotify_artist_url: sp.url,
          spotify_data: sp,
          spotify_synced_at: new Date().toISOString(),
        })
        .eq('user_id', targetUserId);
      if (updErr) throw updErr;

      toast.success(`Berhasil sync data Spotify: ${sp.name}`);
      fetchArtistProfile();
    } catch (err: any) {
      toast.error(err.message || 'Gagal sync Spotify');
    } finally {
      setSyncingSpotify(false);
    }
  };

  const handleSpotifyDisconnect = async () => {
    if (!targetUserId) return;
    const { error } = await (supabase as any)
      .from('artist_profiles')
      .update({
        spotify_artist_id: null,
        spotify_artist_url: null,
        spotify_data: null,
        spotify_synced_at: null,
      })
      .eq('user_id', targetUserId);
    if (error) {
      toast.error('Gagal disconnect');
      return;
    }
    setSpotifyInput('');
    toast.success('Spotify disconnected');
    fetchArtistProfile();
  };

  const handleSave = async () => {
    if (!targetUserId || !canEdit) return;
    if (!formData.artist_name.trim()) {
      toast.error('Nama artis wajib diisi');
      return;
    }

    setSaving(true);
    try {
      const socialLinks: Record<string, string> = {};
      ['instagram', 'youtube', 'tiktok', 'twitter', 'website'].forEach((k) => {
        const v = (formData as any)[k];
        if (v) socialLinks[k] = v;
      });

      const profileData: any = {
        user_id: targetUserId,
        artist_name: formData.artist_name.trim(),
        artist_type: formData.artist_type,
        legal_name: formData.legal_name || null,
        genre: formData.genre || null,
        country: formData.country || null,
        city: formData.city || null,
        language: formData.language || null,
        gender: formData.gender || null,
        date_of_birth: formData.date_of_birth || null,
        bio: formData.bio || null,
        social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      };

      const { error } = await (supabase as any)
        .from('artist_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

      // Mark complete only if all required fields are filled
      const isComplete = REQUIRED_FIELDS.every((f) => {
        const v = (profileData as any)[f];
        return v && String(v).trim() !== '';
      });

      await supabase
        .from('profiles')
        .update({ artist_profile_completed: isComplete })
        .eq('id', targetUserId);

      if (!isViewingOther) await refreshProfile();
      toast.success('Profil artis berhasil disimpan');
      fetchArtistProfile();
    } catch (error: any) {
      console.error('Error saving artist profile:', error);
      toast.error(error.message || 'Gagal menyimpan profil artis');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const isComplete = REQUIRED_FIELDS.every((f) => {
    const v = (formData as any)[f];
    return v && String(v).trim() !== '';
  });

  const sp = artistProfile?.spotify_data;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Music className="h-7 w-7 text-primary" />
            {isViewingOther ? `Profil Artis — ${ownerName}` : 'Profil Artis'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Profil ini jadi sumber data utama (nama, foto, dll) untuk semua release musik Anda.
          </p>
        </div>

        {/* Status */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg">Status Profil</CardTitle>
                <CardDescription>
                  {isComplete ? 'Profil sudah lengkap dan siap untuk release' : 'Lengkapi data wajib (nama, tipe, genre, negara) untuk membuat release'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {artistProfile?.verified && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
                <Badge variant={isComplete ? 'default' : 'secondary'}>
                  {isComplete ? 'Lengkap' : 'Belum Lengkap'}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Foto Artis */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Foto Artis</CardTitle>
            <CardDescription>Foto resmi yang dipakai untuk metadata DSP. Maks 5MB.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage src={artistProfile?.profile_image_url || undefined} />
                <AvatarFallback className="text-xl">
                  {formData.artist_name?.[0]?.toUpperCase() || <User />}
                </AvatarFallback>
              </Avatar>
              {canEdit && (
                <div>
                  <input
                    type="file"
                    id="artist-photo"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                  />
                  <label htmlFor="artist-photo">
                    <Button asChild variant="outline" size="sm" disabled={uploadingPhoto}>
                      <span className="cursor-pointer">
                        {uploadingPhoto ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-2" />Upload Foto</>
                        )}
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profile Form */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Artis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama Artis / Stage Name *</Label>
                <Input
                  value={formData.artist_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, artist_name: e.target.value }))}
                  placeholder="Nama panggung"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Legal / Asli</Label>
                <Input
                  value={formData.legal_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                  placeholder="Untuk kontrak (opsional)"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Artis</Label>
                <Select value={formData.artist_type} onValueChange={(v) => setFormData(prev => ({ ...prev, artist_type: v }))} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="band">Band</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Genre Utama *</Label>
                <Input
                  value={formData.genre}
                  onChange={(e) => setFormData(prev => ({ ...prev, genre: e.target.value }))}
                  placeholder="Pop, Rock, Hip-Hop, dll."
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Negara *</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="Indonesia"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Kota</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Jakarta"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Bahasa Utama</Label>
                <Input
                  value={formData.language}
                  onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                  placeholder="Indonesia, English, dll."
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={formData.gender || 'unspecified'} onValueChange={(v) => setFormData(prev => ({ ...prev, gender: v === 'unspecified' ? '' : v }))} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Tidak ditentukan</SelectItem>
                    <SelectItem value="male">Laki-laki</SelectItem>
                    <SelectItem value="female">Perempuan</SelectItem>
                    <SelectItem value="other">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tanggal Lahir / Berdiri</Label>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Ceritakan tentang artis ini..."
                className="min-h-[100px]"
                disabled={!canEdit}
              />
            </div>

            <Separator />

            <h3 className="text-sm font-medium">Tautan Sosial Media</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input value={formData.instagram} onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))} placeholder="@username" disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input value={formData.youtube} onChange={(e) => setFormData(prev => ({ ...prev, youtube: e.target.value }))} placeholder="https://youtube.com/@channel" disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input value={formData.tiktok} onChange={(e) => setFormData(prev => ({ ...prev, tiktok: e.target.value }))} placeholder="@username" disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label>Twitter / X</Label>
                <Input value={formData.twitter} onChange={(e) => setFormData(prev => ({ ...prev, twitter: e.target.value }))} placeholder="@username" disabled={!canEdit} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Website</Label>
                <Input value={formData.website} onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))} placeholder="https://yourwebsite.com" disabled={!canEdit} />
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving} className="gradient-primary">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Menyimpan...</> : <><Save className="h-4 w-4 mr-2" />Simpan Profil</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spotify Integration */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg className="h-5 w-5 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                Spotify Artist
            </CardTitle>
            <CardDescription>Hubungkan Spotify Artist untuk auto-sync data publik (foto, follower, top tracks).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sp ? (
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  {sp.images?.[0]?.url && (
                    <img src={sp.images[0].url} alt={sp.name} className="h-20 w-20 rounded-full object-cover" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{sp.name}</h3>
                      <a href={sp.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {sp.followers?.toLocaleString()} followers · Popularity {sp.popularity}/100
                    </p>
                    {sp.genres?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sp.genres.slice(0, 4).map((g: string) => (
                          <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {sp.top_tracks?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Top Tracks</h4>
                    <div className="space-y-1">
                      {sp.top_tracks.map((t: any) => (
                        <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition">
                          {t.image && <img src={t.image} alt={t.name} className="h-10 w-10 rounded object-cover" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{t.album}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {artistProfile?.spotify_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(artistProfile.spotify_synced_at).toLocaleString()}
                  </p>
                )}

                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleSpotifySync} disabled={syncingSpotify}>
                      {syncingSpotify ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Refresh Data
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSpotifyDisconnect}>
                      <Unlink className="h-4 w-4 mr-2" />Disconnect
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              canEdit && (
                <div className="space-y-2">
                  <Label>URL atau ID Spotify Artist</Label>
                  <div className="flex gap-2">
                    <Input
                      value={spotifyInput}
                      onChange={(e) => setSpotifyInput(e.target.value)}
                      placeholder="https://open.spotify.com/artist/..."
                    />
                    <Button onClick={handleSpotifySync} disabled={syncingSpotify || !spotifyInput.trim()}>
                      {syncingSpotify ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Buka profil artis di Spotify, klik tombol "..." → Share → Copy link to artist.
                  </p>
                </div>
              )
            )}
          </CardContent>
        </Card>

        {!isViewingOther && (
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Penting:</strong> Nama artis di sini akan dipakai sebagai Main Artist untuk semua release baru.
                Featured artist tetap bisa ditambahkan bebas saat membuat release.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
