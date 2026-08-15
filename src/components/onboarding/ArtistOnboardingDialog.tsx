import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Music, Users, Mic2 } from 'lucide-react';

interface ArtistOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowSkip?: boolean;
  onComplete?: () => void;
}

export function ArtistOnboardingDialog({
  open,
  onOpenChange,
  allowSkip = true,
  onComplete,
}: ArtistOnboardingDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    artist_name: profile?.full_name || '',
    artist_type: 'solo',
    phone: profile?.phone || '',
    bio: '',
    genre: '',
    social_links: {
      instagram: '',
      spotify: '',
      youtube: '',
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const requiredFields = [
      { value: formData.artist_name, message: 'Nama artis/band wajib diisi' },
      { value: formData.artist_type, message: 'Tipe artis wajib dipilih' },
      { value: formData.phone, message: 'Nomor telepon wajib diisi' },
      { value: formData.genre, message: 'Genre wajib diisi' },
      { value: formData.bio, message: 'Bio/keterangan artis wajib diisi' },
    ];

    const missingField = requiredFields.find((field) => !field.value.trim());
    if (missingField) {
      toast({ title: 'Error', description: missingField.message, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Insert artist profile - cast needed since table not yet in generated types
      const { error: insertError } = await (supabase as any)
        .from('artist_profiles')
        .upsert({
          user_id: user.id,
          artist_name: formData.artist_name.trim(),
          artist_type: formData.artist_type,
          bio: formData.bio.trim() || null,
          genre: formData.genre.trim() || null,
          social_links: formData.social_links,
        }, { onConflict: 'user_id' });

      if (insertError) throw insertError;

      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({
          phone: formData.phone.trim(),
          artist_profile_completed: true,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast({ title: 'Berhasil!', description: 'Data artis berhasil disimpan' });
      onComplete?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving artist profile:', err);
      toast({ title: 'Error', description: 'Gagal menyimpan data artis', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={allowSkip ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic2 className="h-5 w-5" />
            Lengkapi Data Artis / Band
          </DialogTitle>
          <DialogDescription>
            {allowSkip
              ? 'Isi data artis/band Anda untuk mulai distribusi musik. Bisa dilewati untuk saat ini.'
              : 'Anda harus melengkapi data artis/band terlebih dahulu sebelum membuat release.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="artist_name">Nama Artis / Band *</Label>
            <Input
              id="artist_name"
              value={formData.artist_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, artist_name: e.target.value }))}
              placeholder="Masukkan nama artis atau band"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="artist_type">Tipe *</Label>
            <Select
              value={formData.artist_type}
              onValueChange={(val) => setFormData((prev) => ({ ...prev, artist_type: val }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solo">
                  <div className="flex items-center gap-2"><Mic2 className="h-4 w-4" /> Solo</div>
                </SelectItem>
                <SelectItem value="band">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Band</div>
                </SelectItem>
                <SelectItem value="group">
                  <div className="flex items-center gap-2"><Music className="h-4 w-4" /> Group</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Nomor Telepon *</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Masukkan nomor telepon aktif"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="genre">Genre *</Label>
            <Input
              id="genre"
              value={formData.genre}
              onChange={(e) => setFormData((prev) => ({ ...prev, genre: e.target.value }))}
              placeholder="Pop, Rock, Jazz, dll"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio / Keterangan *</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
              placeholder="Ceritakan tentang artis/band Anda..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Sosial Media (opsional)</Label>
            <Input
              value={formData.social_links.instagram}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  social_links: { ...prev.social_links, instagram: e.target.value },
                }))
              }
              placeholder="Instagram URL"
              className="mb-2"
            />
            <Input
              value={formData.social_links.spotify}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  social_links: { ...prev.social_links, spotify: e.target.value },
                }))
              }
              placeholder="Spotify URL"
              className="mb-2"
            />
            <Input
              value={formData.social_links.youtube}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  social_links: { ...prev.social_links, youtube: e.target.value },
                }))
              }
              placeholder="YouTube URL"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            {allowSkip && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Nanti Saja
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
