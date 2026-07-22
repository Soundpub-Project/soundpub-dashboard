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

export function DeleteReleaseDialog({ open, onOpenChange, release, onSuccess }: DeleteReleaseDialogProps) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const isPaid = release?.status === 'pending_paid' || release?.status === 'active';

  const handleDelete = async () => {
    if (!release) return;
    setLoading(true);
    try {
      // If release was paid, handle refund by crediting back to user's balance
      if (isPaid && isAdmin) {
        const { data: payment } = await supabase
          .from('release_payments')
          .select('amount, user_id')
          .eq('release_id', release.id)
          .eq('status', 'paid')
          .maybeSingle();

        if (payment) {
          // Credit balance back
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', payment.user_id)
            .single();

          if (profile) {
            await supabase
              .from('profiles')
              .update({ balance: profile.balance + payment.amount })
              .eq('id', payment.user_id);
          }

          // Update payment status to refunded
          await supabase
            .from('release_payments')
            .update({ status: 'refunded' })
            .eq('release_id', release.id)
            .eq('status', 'paid');

          // Notify user about refund
          await supabase.from('notifications').insert({
            user_id: payment.user_id,
            type: 'success',
            title: 'Dana Dikembalikan',
            message: `Dana sebesar Rp ${Number(payment.amount).toLocaleString('id-ID')} untuk release "${release.title}" telah dikembalikan ke saldo Anda.`,
            metadata: { release_id: release.id, amount: payment.amount },
          });
        }
      }

      // Delete payment records
      await supabase.from('release_payments').delete().eq('release_id', release.id);

      // Delete tracks
      const { error: tracksError } = await supabase.from('tracks').delete().eq('release_id', release.id);
      if (tracksError) throw tracksError;

      // Delete release
      const { error: releaseError } = await supabase.from('releases').delete().eq('id', release.id);
      if (releaseError) throw releaseError;

      toast.success(isPaid ? 'Release dihapus dan dana dikembalikan' : 'Release berhasil dihapus');
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
