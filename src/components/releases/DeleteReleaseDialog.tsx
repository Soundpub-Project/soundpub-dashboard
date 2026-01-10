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

interface Release {
  id: string;
  title: string;
  artist_name: string;
}

interface DeleteReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release | null;
  onSuccess: () => void;
}

export function DeleteReleaseDialog({
  open,
  onOpenChange,
  release,
  onSuccess,
}: DeleteReleaseDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!release) return;

    setLoading(true);
    try {
      // First delete all tracks associated with the release
      const { error: tracksError } = await supabase
        .from('tracks')
        .delete()
        .eq('release_id', release.id);

      if (tracksError) throw tracksError;

      // Then delete the release
      const { error: releaseError } = await supabase
        .from('releases')
        .delete()
        .eq('id', release.id);

      if (releaseError) throw releaseError;

      toast.success('Release berhasil dihapus');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting release:', error);
      toast.error(error.message || 'Gagal menghapus release');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Release</AlertDialogTitle>
          <AlertDialogDescription>
            Apakah Anda yakin ingin menghapus release{' '}
            <strong>"{release?.title}"</strong> oleh{' '}
            <strong>{release?.artist_name}</strong>?
            <br />
            <br />
            <span className="text-destructive">
              Tindakan ini tidak dapat dibatalkan dan akan menghapus semua track
              yang terkait dengan release ini.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Hapus Permanen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
