import { useEffect, useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AuthNoticeConfig {
  enabled: boolean;
  title: string;
  badge: string;
  message: string;
  detail: string;
  buttonText: string;
  revision: string;
}

const DEFAULT_NOTICE: AuthNoticeConfig = {
  enabled: false,
  title: 'Informasi Lingkungan Sistem',
  badge: 'Staging / Development',
  message: 'Website production sedang dalam mode maintenance. Anda sedang mengakses environment staging/development untuk proses penyempurnaan sistem.',
  detail: 'Gunakan sistem ini untuk pengujian dan validasi fitur. Beberapa data, tampilan, atau alur kerja masih dapat berubah selama proses development.',
  buttonText: 'Saya Mengerti',
  revision: '1',
};


function parseNoticeConfig(value: string | null): AuthNoticeConfig {
  if (!value) return DEFAULT_NOTICE;
  try {
    const parsed = JSON.parse(value) as Partial<AuthNoticeConfig>;
    return { ...DEFAULT_NOTICE, ...parsed, detail: parsed.detail?.trim() || '' };
  } catch {
    return DEFAULT_NOTICE;
  }
}

export function AuthEnvironmentNotice() {
  const [notice, setNotice] = useState<AuthNoticeConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchNotice = async () => {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'auth_notice_config').maybeSingle();
      if (error) {
        console.error('Error fetching auth notice:', error);
        return;
      }
      const config = parseNoticeConfig(data?.value ?? null);
      setNotice(config);
      if (!config.enabled) return;
      setOpen(true);
    };
    fetchNotice();
  }, []);

  const handleClose = () => {
    setOpen(false);
  };

  if (!notice?.enabled) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : handleClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500"><AlertCircle className="h-5 w-5" /></div>
            <div className="space-y-1"><Badge variant="outline" className="w-fit border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">{notice.badge}</Badge><DialogTitle>{notice.title}</DialogTitle></div>
          </div>
          <DialogDescription className="text-sm leading-6 text-foreground/80">{notice.message}</DialogDescription>
        </DialogHeader>
        {notice.detail && <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-6 whitespace-pre-line">{notice.detail}</p></div>}
        <div className="flex justify-end pt-2"><Button onClick={handleClose}>{notice.buttonText}</Button></div>
      </DialogContent>
    </Dialog>
  );
}