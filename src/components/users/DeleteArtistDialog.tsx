import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface ArtistProfile {
  id: string;
  email: string;
  full_name: string;
}

interface DeleteArtistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: ArtistProfile | null;
  onSuccess: () => void;
}

export function DeleteArtistDialog({ 
  open, 
  onOpenChange, 
  artist,
  onSuccess 
}: DeleteArtistDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!artist) return;

    setLoading(true);
    try {
      // Call edge function to remove artist and log the action
      const { data, error } = await supabase.functions.invoke('remove-artist-from-label', {
        body: { artist_id: artist.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${artist.full_name} telah dihapus dari label Anda`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error removing artist:', error);
      toast.error(error.message || 'Gagal menghapus artist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Artist dari Label?</AlertDialogTitle>
          <AlertDialogDescription>
            Apakah Anda yakin ingin menghapus <strong>{artist?.full_name}</strong> dari label Anda?
            <br /><br />
            Artist tidak akan dihapus secara permanen, hanya dikeluarkan dari label Anda. 
            Mereka masih bisa login dan data mereka tetap tersimpan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete} 
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Hapus dari Label
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}