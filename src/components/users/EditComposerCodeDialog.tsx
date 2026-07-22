import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Loader2, Hash } from 'lucide-react';
import { toast } from 'sonner';

interface EditComposerCodeDialogProps {
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

export function EditComposerCodeDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditComposerCodeDialogProps) {
  const [composerCode, setComposerCode] = useState('');
  const [originalCode, setOriginalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchComposerCode();
    }
  }, [open, user]);

  const fetchComposerCode = async () => {
    if (!user) return;
    
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('composer_code')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const code = data?.composer_code || '';
      setComposerCode(code);
      setOriginalCode(code);
    } catch (error) {
      console.error('Error fetching composer code:', error);
      toast.error('Gagal mengambil data composer code');
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ composer_code: composerCode.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      toast.success(`Composer Code untuk ${user.full_name} berhasil diperbarui`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating composer code:', error);
      toast.error('Gagal memperbarui composer code');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setComposerCode('');
      setOriginalCode('');
    }
    onOpenChange(newOpen);
  };

  const hasChanges = composerCode !== originalCode;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            Edit Composer Code
          </DialogTitle>
          <DialogDescription>
            Composer code digunakan untuk mencocokkan data royalti hak cipta
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 border">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs mt-1 capitalize">
                Role: <span className="font-medium">{user.role || 'user'}</span>
              </p>
            </div>

            {fetching ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="composer-code">Composer Code</Label>
                <Input
                  id="composer-code"
                  placeholder="Contoh: UTR0001"
                  value={composerCode}
                  onChange={(e) => setComposerCode(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted-foreground">
                  Kode unik yang digunakan untuk mencocokkan data royalti dari file upload. 
                  Data royalti akan ditampilkan jika nama atau kode composer cocok.
                </p>
              </div>
            )}

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-sm font-medium text-primary">ℹ️ Info</p>
              <p className="text-xs text-muted-foreground mt-1">
                User dengan role Copyright akan melihat data royalti yang cocok dengan nama lengkap mereka 
                ATAU composer code ini di halaman Copyright Dashboard.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !hasChanges || fetching}
            className="gradient-primary"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
