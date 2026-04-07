import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnnouncementDialog({ open, onOpenChange }: AnnouncementDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Judul dan pesan wajib diisi');
      return;
    }

    setLoading(true);
    try {
      // Insert global notification
      const { error } = await supabase.from('notifications').insert({
        user_id: user?.id,
        type: 'announcement',
        title: title.trim(),
        message: message.trim(),
        is_global: true,
        created_by: user?.id,
        metadata: { send_email: sendEmail },
      });

      if (error) throw error;

      // Optionally send email to all users
      if (sendEmail) {
        await supabase.functions.invoke('send-royalty-notification', {
          body: {
            type: 'announcement',
            title: title.trim(),
            message: message.trim(),
          },
        });
      }

      toast.success('Pengumuman berhasil dikirim');
      setTitle('');
      setMessage('');
      setSendEmail(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error sending announcement:', error);
      toast.error(error.message || 'Gagal mengirim pengumuman');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kirim Pengumuman</DialogTitle>
          <DialogDescription>
            Kirim pengumuman ke semua pengguna di dashboard
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Judul</Label>
            <Input
              placeholder="Judul pengumuman..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Pesan</Label>
            <Textarea
              placeholder="Isi pengumuman..."
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
            <Label className="cursor-pointer">Kirim juga via email ke semua user</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Kirim Pengumuman
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
