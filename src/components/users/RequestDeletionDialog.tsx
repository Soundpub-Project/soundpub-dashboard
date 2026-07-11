import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";

interface ArtistProfile {
  id: string;
  email: string;
  full_name: string;
}

interface RequestDeletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: ArtistProfile | null;
  onSuccess: () => void;
}

export function RequestDeletionDialog({
  open,
  onOpenChange,
  artist,
  onSuccess,
}: RequestDeletionDialogProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    if (!artist) return;
    if (!reason.trim()) {
      toast.error("Silakan isi alasan penghapusan");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { error } = await supabase
        .from("artist_deletion_requests")
        .insert({
          artist_id: artist.id,
          label_id: user.id,
          reason: reason,
          status: "pending"
        });

      if (error) throw error;

      toast.success("Permintaan penghapusan profil artis berhasil dikirim ke Admin");
      setReason("");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error requesting artist deletion:", error);
      toast.error(error.message || "Gagal mengirim permintaan penghapusan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Minta Penghapusan Profile
          </DialogTitle>
          <DialogDescription>
            Kirim permintaan penghapusan profil artis untuk <strong>{artist?.full_name}</strong> kepada Admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Alasan Penghapusan</Label>
            <Textarea
              id="reason"
              placeholder="Tuliskan alasan mengapa profil artis ini ingin dihapus secara permanen..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <p className="text-xs text-muted-foreground bg-muted p-2 rounded border">
            Catatan: Penghapusan profil artis tidak dilakukan langsung untuk menjaga integritas data katalog dan royalty di bawah label Anda. Admin akan meninjau permintaan ini.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleRequest} 
            disabled={loading || !reason.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Permintaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

