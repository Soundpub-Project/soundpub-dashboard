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
  archived_at?: string | null;
}

interface ArchiveReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release | null;
  onSuccess: () => void;
}

export function ArchiveReleaseDialog({
  open,
  onOpenChange,
  release,
  onSuccess,
}: ArchiveReleaseDialogProps) {
  const [loading, setLoading] = useState(false);

  const isArchived = !!release?.archived_at;

  const handleToggleArchive = async () => {
    if (!release) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('releases')
        .update({
          archived_at: isArchived ? null : new Date().toISOString(),
          status: isArchived ? 'pending' : 'inactive',
        })
        .eq('id', release.id);

      if (error) throw error;

      toast.success(
        isArchived 
          ? 'Release berhasil dipulihkan dari arsip' 
          : 'Release berhasil diarsipkan'
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error archiving release:', error);
      toast.error(error.message || 'Gagal mengarsipkan release');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArchived ? 'Pulihkan Release' : 'Arsipkan Release'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchived ? (
              <>
                Apakah Anda yakin ingin memulihkan release{' '}
                <strong>"{release?.title}"</strong> dari arsip?
                <br />
                <br />
                Release akan kembali aktif dan dapat dilihat di daftar release.
              </>
            ) : (
              <>
                Apakah Anda yakin ingin mengarsipkan release{' '}
                <strong>"{release?.title}"</strong> oleh{' '}
                <strong>{release?.artist_name}</strong>?
                <br />
                <br />
                Release yang diarsipkan tidak akan dihapus, tetapi akan disembunyikan
                dari daftar utama. Anda dapat memulihkannya kapan saja.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleToggleArchive}
            disabled={loading}
            className={isArchived ? '' : 'bg-amber-600 hover:bg-amber-700'}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isArchived ? 'Pulihkan' : 'Arsipkan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
