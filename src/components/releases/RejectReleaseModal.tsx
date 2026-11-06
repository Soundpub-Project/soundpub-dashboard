import { usesBackendReleases } from '@/services/releases';
import { releasesApi } from '@/api/releases';
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
    version?: number;
  } | null;
  onSuccess: () => void;
}

function BackendRejectReleaseModal({ open,onOpenChange,release,onSuccess }: RejectReleaseModalProps) {
  const [loading,setLoading]=useState(false); const [reason,setReason]=useState('');
  const close=()=>{if(!loading){setReason('');onOpenChange(false);}};
  const reject=async()=>{if(!release)return;const note=reason.trim();if(!note)return toast.error('Alasan penolakan wajib diisi');setLoading(true);
    try{const current=await releasesApi.detail(release.id);await releasesApi.update(release.id,{version:current.version,status:'rejected',rejection_reason:note});toast.success('Release berhasil ditolak');onSuccess();setReason('');onOpenChange(false);}
    catch(error){toast.error(error instanceof Error?error.message:'Gagal menolak release');}finally{setLoading(false);}};
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive"/>Tolak Release</DialogTitle><DialogDescription>Alasan tersimpan sebagai bukti review dan ditampilkan kepada pemilik release.</DialogDescription></DialogHeader><div className="space-y-2 py-4"><Label htmlFor="backend-reject-reason">Alasan penolakan</Label><Textarea id="backend-reject-reason" value={reason} onChange={event=>setReason(event.target.value)} disabled={loading} maxLength={2000} rows={5}/></div><DialogFooter><Button variant="outline" onClick={close} disabled={loading}>Batal</Button><Button variant="destructive" onClick={()=>void reject()} disabled={loading}>{loading&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Tolak Release</Button></DialogFooter></DialogContent></Dialog>;
}

function LegacyRejectReleaseModal({
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
    } catch (error: unknown) {
      console.error('Error rejecting release:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal menolak release');
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

export function RejectReleaseModal(props: Parameters<typeof LegacyRejectReleaseModal>[0]) {
  if (usesBackendReleases()) return <BackendRejectReleaseModal {...props} />;
  return <LegacyRejectReleaseModal {...props} />;
}
