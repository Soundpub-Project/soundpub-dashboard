import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    full_name: string;
    role?: string;
  } | null;
  onSuccess?: () => void;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.id },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        const errorMsg = response.error.message || 'Failed to delete user';
        if (errorMsg.includes('503') || errorMsg.includes('FunctionsRelayError') || errorMsg.includes('FunctionsFetchError')) {
          throw new Error(
            'Edge Function tidak tersedia (Error 503). Silakan hubungi administrator untuk deploy edge functions. Lihat file DEPLOY_EDGE_FUNCTIONS.md untuk panduan.'
          );
        }
        throw new Error(errorMsg);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to delete user');
      }

      toast.success(`User ${user.full_name} berhasil dihapus`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Hapus User
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Apakah Anda yakin ingin menghapus user berikut? Tindakan ini tidak dapat dibatalkan.
              </p>
              {user && (
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <p className="font-medium text-foreground">{user.full_name}</p>
                  <p className="text-sm">{user.email}</p>
                  {user.role && (
                    <p className="text-xs mt-1 capitalize">Role: {user.role}</p>
                  )}
                </div>
              )}
              <p className="text-destructive font-medium">
                Semua data terkait user ini akan dihapus permanen!
              </p>
            </div>
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
            Hapus User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

