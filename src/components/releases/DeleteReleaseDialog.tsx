import { usesBackendReleases, releaseWorkflowUnavailable } from '@/services/releases';
import { usesBackendFinance } from '@/components/finance/mode';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface Release {
  id: string;
  title: string;
  artist_name: string;
  status?: string;
}

interface DeleteReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release | null;
  onSuccess: () => void;
}

function LegacyDeleteReleaseDialog({ open, onOpenChange, release, onSuccess }: DeleteReleaseDialogProps) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const isPaid = release?.status === 'pending_paid' || release?.status === 'active';

  const handleDelete = async () => {
    if (!release) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_release_with_refund' as never, {
        p_release_id: release.id,
      } as never);
      if (error) throw error;

      const refundAmount = Number((data as { refundAmount?: number } | null)?.refundAmount || 0);

      toast.success(refundAmount > 0 ? `Release dihapus dan Rp ${refundAmount.toLocaleString('id-ID')} dikembalikan` : 'Release berhasil dihapus');
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error deleting release:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus release');
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
            <br /><br />
            {isPaid && isAdmin ? (
              <span className="text-yellow-600">
                ⚠️ Release ini sudah dibayar. Dana akan dikembalikan ke saldo pengguna secara otomatis.
              </span>
            ) : (
              <span className="text-destructive">
                Tindakan ini tidak dapat dibatalkan dan akan menghapus semua track terkait.
              </span>
            )}
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
            {isPaid ? 'Hapus & Refund' : 'Hapus Permanen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteReleaseDialog(props: Parameters<typeof LegacyDeleteReleaseDialog>[0]) {
  if (usesBackendReleases() || usesBackendFinance()) return props.open ? <p role="alert">{releaseWorkflowUnavailable}</p> : null;
  return <LegacyDeleteReleaseDialog {...props} />;
}
