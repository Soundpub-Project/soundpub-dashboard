import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Music, Upload, AlertCircle, User } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface LabelAddArtistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LabelAddArtistDialog({ open, onOpenChange, onSuccess }: LabelAddArtistDialogProps) {
  const { user: currentUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [genre, setGenre] = useState('');
  const [artistType, setArtistType] = useState('');
  const [hasSpotify, setHasSpotify] = useState(false);
  const [hasAppleMusic, setHasAppleMusic] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Ukuran file maksimal 2MB');
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!fullName) {
      toast.error('Nama artist harus diisi');
      return;
    }
    if (!genre) {
      toast.error('Pilih genre utama');
      return;
    }
    if (!artistType) {
      toast.error('Pilih jenis konten');
      return;
    }
    if (!agreed) {
      toast.error('Anda harus menyetujui pernyataan kebenaran data');
      return;
    }

    setLoading(true);
    try {
      // Create user using edge function (this will generate dummy email & password)
      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: '', // empty to trigger auto-generation in Edge Function
          password: '', // empty to trigger auto-generation
          full_name: fullName,
          role: 'artist',
          parent_label_id: currentUser?.id,
          artist_type: artistType,
          genre,
          social_links: {
            spotify: hasSpotify,
            apple_music: hasAppleMusic,
          },
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || response.error?.message || 'Gagal menambahkan artist');
      }

      const newUserId = response.data.user.id;

      // Handle avatar upload if any
      let profileImageUrl = null;
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const filePath = `${newUserId}/${Math.random()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, selectedImage);

        if (!uploadError) {
          const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          profileImageUrl = data.publicUrl;
          
          // Update profile with avatar_url
          await supabase.from('profiles')
            .update({ avatar_url: profileImageUrl })
            .eq('id', newUserId);
        }
      }
      // Artist profile metadata is created in create-user Edge Function to avoid client RLS issues.
      // artist_profile_completed is set in create-user Edge Function.

      toast.success('Artist berhasil ditambahkan');
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating artist:', error);
      toast.error(error.message || 'Gagal menambahkan artist');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setGenre('');
    setArtistType('');
    setHasSpotify(false);
    setHasAppleMusic(false);
    setAgreed(false);
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Tambah Artis Baru
          </DialogTitle>
          <DialogDescription>
            Isi detail artist yang akan Anda kelola.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nama Artist / Cari Artist</Label>
            <Input
              id="fullName"
              placeholder="Ketik nama artist atau band..."
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Genre</Label>
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Genre Utama" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pop">Pop</SelectItem>
                <SelectItem value="rock">Rock</SelectItem>
                <SelectItem value="indie">Indie</SelectItem>
                <SelectItem value="hiphop">Hip Hop</SelectItem>
                <SelectItem value="electronic">Electronic / EDM</SelectItem>
                <SelectItem value="rnb">R&B / Soul</SelectItem>
                <SelectItem value="jazz">Jazz</SelectItem>
                <SelectItem value="acoustic">Acoustic</SelectItem>
                <SelectItem value="dangdut">Dangdut</SelectItem>
                <SelectItem value="metal">Metal</SelectItem>
                <SelectItem value="classical">Classical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Jenis Konten (Harus Berizin)</Label>
            <Select value={artistType} onValueChange={setArtistType}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Jenis Konten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original Music</SelectItem>
                <SelectItem value="cover">Cover Song</SelectItem>
                <SelectItem value="remix">Remix</SelectItem>
                <SelectItem value="instrumental">Instrumental</SelectItem>
                <SelectItem value="podcast">Podcast / Audio Spoken</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
            <Label className="text-base">Profil Streaming (Opsional)</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="spotify" 
                  checked={hasSpotify} 
                  onCheckedChange={(checked) => setHasSpotify(!!checked)} 
                />
                <Label htmlFor="spotify" className="font-normal">Terdaftar di Spotify</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="apple" 
                  checked={hasAppleMusic} 
                  onCheckedChange={(checked) => setHasAppleMusic(!!checked)} 
                />
                <Label htmlFor="apple" className="font-normal">Terdaftar di Apple Music</Label>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-100/50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 p-3 rounded-md flex items-start gap-3 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>Jika artist Anda belum tersedia di platform manapun, secara otomatis Anda mengizinkan platform untuk mendaftarkan dan membuat profil artist baru di platform digital.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Foto Artist</Label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full justify-start text-left font-normal"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedImage ? selectedImage.name : 'Choose file'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Format: JPG, PNG. Maksimal 2MB. (Opsional)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start space-x-2 pt-2">
            <Checkbox 
              id="terms" 
              checked={agreed} 
              onCheckedChange={(checked) => setAgreed(!!checked)} 
            />
            <Label htmlFor="terms" className="font-normal leading-snug">
              Saya menyetujui bahwa data yang saya masukkan adalah benar dan saya memiliki hak untuk mendaftarkan artist ini.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !fullName || !genre || !artistType || !agreed}
            className="gradient-primary w-full sm:w-auto"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Daftarkan Artist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

