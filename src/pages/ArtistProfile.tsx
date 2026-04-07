import { useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import { Loader2, Music, User, Save } from 'lucide-react';

interface ArtistProfileData {
  id: string;
  artist_name: string;
  artist_type: string;
  genre: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function ArtistProfile() {
  const { user, profile, isArtist, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfileData | null>(null);
  const [formData, setFormData] = useState({
    artist_name: '',
    artist_type: 'solo',
    genre: '',
    bio: '',
    spotify: '',
    instagram: '',
    youtube: '',
    tiktok: '',
    website: '',
  });

  useEffect(() => {
    if (user) fetchArtistProfile();
  }, [user]);

  const fetchArtistProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setArtistProfile(data as ArtistProfileData);
        const social = (data.social_links as Record<string, string>) || {};
        setFormData({
          artist_name: data.artist_name || '',
          artist_type: data.artist_type || 'solo',
          genre: data.genre || '',
          bio: data.bio || '',
          spotify: social.spotify || '',
          instagram: social.instagram || '',
          youtube: social.youtube || '',
          tiktok: social.tiktok || '',
          website: social.website || '',
        });
      } else {
        // Pre-fill from profile
        setFormData(prev => ({
          ...prev,
          artist_name: profile?.full_name || '',
        }));
      }
    } catch (error) {
      console.error('Error fetching artist profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!formData.artist_name.trim()) {
      toast.error('Nama artis wajib diisi');
      return;
    }

    setSaving(true);
    try {
      const socialLinks = {
        spotify: formData.spotify || undefined,
        instagram: formData.instagram || undefined,
        youtube: formData.youtube || undefined,
        tiktok: formData.tiktok || undefined,
        website: formData.website || undefined,
      };

      // Remove empty values
      const cleanSocial = Object.fromEntries(
        Object.entries(socialLinks).filter(([_, v]) => v)
      );

      const profileData = {
        user_id: user.id,
        artist_name: formData.artist_name.trim(),
        artist_type: formData.artist_type,
        genre: formData.genre || null,
        bio: formData.bio || null,
        social_links: Object.keys(cleanSocial).length > 0 ? cleanSocial : null,
      };

      const { error } = await supabase
        .from('artist_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

      // Mark profile as completed
      await supabase
        .from('profiles')
        .update({ artist_profile_completed: true })
        .eq('id', user.id);

      await refreshProfile();
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

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Music className="h-7 w-7 text-primary" />
            Profil Artis
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola informasi artis Anda yang akan ditampilkan di releases
          </p>
        </div>

        {/* Status */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Status Profil</CardTitle>
                <CardDescription>Profil ini digunakan untuk release musik Anda</CardDescription>
              </div>
              <Badge variant={artistProfile ? 'default' : 'secondary'}>
                {artistProfile ? 'Lengkap' : 'Belum Lengkap'}
              </Badge>
            </div>
          </CardHeader>
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
                <Label>Nama Artis / Band *</Label>
                <Input
                  value={formData.artist_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, artist_name: e.target.value }))}
                  placeholder="Nama panggung Anda"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Artis</Label>
                <Select
                  value={formData.artist_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, artist_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="band">Band</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Genre</Label>
              <Input
                value={formData.genre}
                onChange={(e) => setFormData(prev => ({ ...prev, genre: e.target.value }))}
                placeholder="Pop, Rock, Hip-Hop, dll."
              />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Ceritakan tentang diri Anda sebagai artis..."
                className="min-h-[100px]"
              />
            </div>

            <Separator />

            <h3 className="text-sm font-medium">Tautan Sosial Media</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Spotify</Label>
                <Input
                  value={formData.spotify}
                  onChange={(e) => setFormData(prev => ({ ...prev, spotify: e.target.value }))}
                  placeholder="https://open.spotify.com/artist/..."
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={formData.instagram}
                  onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input
                  value={formData.youtube}
                  onChange={(e) => setFormData(prev => ({ ...prev, youtube: e.target.value }))}
                  placeholder="https://youtube.com/@channel"
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input
                  value={formData.tiktok}
                  onChange={(e) => setFormData(prev => ({ ...prev, tiktok: e.target.value }))}
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://yourwebsite.com"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving} className="gradient-primary">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Simpan Profil
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info about how profile is used */}
        <Card className="bg-muted/30 border-border/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Info:</strong> Nama artis yang Anda atur di sini akan digunakan sebagai nama utama
              di semua release musik Anda. Pastikan data sudah benar sebelum menyimpan.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
