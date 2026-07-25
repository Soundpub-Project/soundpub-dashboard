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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface RejectReleaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: {
    id: string;
    title: string;
  } | null;
  onSuccess: () => void;
}

export function RejectReleaseModal({
  open,
  onOpenChange,
  release,
  onSuccess,
}: RejectReleaseModalProps) {
  const [loading, setLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleReject = async () => {
    if (!release) return;

    // Validation
    if (!rejectionReason.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase
        .from('releases')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', release.id);

      if (error) throw error;

      toast.success('Release berhasil ditolak');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error rejecting release:', error);
      toast.error(error.message || 'Gagal menolak release');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRejectionReason('');
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Tolak Release
          </DialogTitle>
          <DialogDescription>
            Berikan alasan penolakan untuk release ini
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Release Info */}
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">{release?.title}</p>
          </div>

          {/* Rejection Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Alasan Penolakan <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Jelaskan alasan penolakan release ini..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              disabled={loading}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Alasan ini akan ditampilkan kepada label/artist
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Tolak Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
