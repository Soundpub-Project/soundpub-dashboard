import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usesBackendDomain } from '@/api/routing';
import { usersApi } from '@/api/users';
import { SoundpubApiError } from '@/api/client';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    status?: string;
  } | null;
  onSuccess?: () => void;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: DeleteUserDialogProps) {
  const backendUsers = usesBackendDomain('users');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const handleDelete = async () => {
    if (!user) return;
    if (backendUsers && confirmation !== user.email) {
      toast.error('Ketik email user untuk konfirmasi penghapusan');
      return;
    }

    setLoading(true);
    try {
      if (backendUsers) {
        await usersApi.delete(user.id);
      } else {
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
      }

      toast.success(`User ${user.full_name} berhasil dihapus`);
      setConfirmation('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(error instanceof SoundpubApiError && error.status === 409
        ? 'User masih memiliki relasi data bisnis yang harus dipertahankan'
        : error instanceof Error ? error.message : 'Gagal menghapus user');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setConfirmation('');
    onOpenChange(nextOpen);
  };

  const backendDeleteDisabled = backendUsers && (
    user?.status !== 'inactive' || confirmation !== user?.email
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
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
              {backendUsers ? (
                <>
                  <p className="text-destructive font-medium">
                    Hanya user berstatus inactive tanpa relasi data bisnis yang dapat dihapus.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="delete-user-confirmation">
                      Ketik email user untuk konfirmasi
                    </Label>
                    <Input
                      id="delete-user-confirmation"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={user?.email ?? ''}
                      autoComplete="off"
                    />
                  </div>
                </>
              ) : (
                <p className="text-destructive font-medium">
                  Semua data terkait user ini akan dihapus permanen!
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
            disabled={loading || backendDeleteDisabled}
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

