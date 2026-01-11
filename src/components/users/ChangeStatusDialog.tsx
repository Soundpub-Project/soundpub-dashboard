import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserCog, CheckCircle, XCircle, Ban } from 'lucide-react';
import { toast } from 'sonner';

type UserStatus = 'active' | 'inactive' | 'suspended';

interface ChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    full_name: string;
    status: string;
  } | null;
  onSuccess?: () => void;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'active',
    label: 'Active',
    icon: <CheckCircle className="h-4 w-4 text-green-500" />,
    description: 'User dapat login dan menggunakan aplikasi',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    icon: <XCircle className="h-4 w-4 text-yellow-500" />,
    description: 'User tidak aktif tapi masih bisa login',
  },
  {
    value: 'suspended',
    label: 'Suspended',
    icon: <Ban className="h-4 w-4 text-red-500" />,
    description: 'User diblokir dan tidak bisa login',
  },
];

export function ChangeStatusDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ChangeStatusDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>('active');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('update-user-status', {
        body: {
          user_id: user.id,
          status: selectedStatus,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update status');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to update status');
      }

      toast.success(`Status ${user.full_name} berhasil diubah menjadi ${selectedStatus}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal mengubah status');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && user) {
      setSelectedStatus(user.status as UserStatus);
    }
    onOpenChange(newOpen);
  };

  const selectedOption = STATUS_OPTIONS.find(opt => opt.value === selectedStatus);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Ubah Status User
          </DialogTitle>
          <DialogDescription>
            Ubah status untuk user berikut
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 border">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs mt-1">
                Status saat ini: <span className="capitalize font-medium">{user.status}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status Baru</Label>
              <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as UserStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {option.icon}
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOption && (
                <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
              )}
            </div>

            {selectedStatus === 'suspended' && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">⚠️ Peringatan</p>
                <p className="text-xs text-destructive/80 mt-1">
                  User yang di-suspend tidak akan bisa login ke aplikasi sampai statusnya diubah kembali.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || selectedStatus === user?.status}
            className="gradient-primary"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
