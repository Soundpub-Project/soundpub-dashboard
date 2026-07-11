import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPen } from 'lucide-react';

interface ArtistProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  address: string | null;
}

interface EditArtistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: ArtistProfile | null;
  onSuccess: () => void;
}

export function EditArtistDialog({ 
  open, 
  onOpenChange, 
  artist,
  onSuccess 
}: EditArtistDialogProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (artist) {
      setFullName(artist.full_name);
      setPhone(artist.phone || '');
      setAddress(artist.address || '');
      setStatus(artist.status);
    }
  }, [artist]);

  const handleSave = async () => {
    if (!artist) return;
    
    if (!fullName.trim()) {
      toast.error('Nama lengkap harus diisi');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          status,
        })
        .eq('id', artist.id);

      if (error) throw error;

      toast.success('Data artist berhasil diupdate');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating artist:', error);
      toast.error(error.message || 'Gagal mengupdate data artist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPen className="h-5 w-5" />
            Edit Artist
          </DialogTitle>
          <DialogDescription>
            Update informasi artist
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editFullName">Nama Lengkap</Label>
            <Input
              id="editFullName"
              placeholder="Masukkan nama lengkap"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editEmail">Email</Label>
            <Input
              id="editEmail"
              type="email"
              value={artist?.email?.includes('@managed.soundpub.local') ? 'Managed Artist (Tanpa Email)' : artist?.email || ''}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">Email tidak dapat diubah</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editPhone">Nomor Telepon</Label>
            <Input
              id="editPhone"
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editAddress">Alamat</Label>
            <Input
              id="editAddress"
              placeholder="Alamat lengkap"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih status" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={loading || !fullName.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}