import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

type Prefs = {
  email_notif_payout: boolean;
  email_notif_release: boolean;
  email_notif_payment: boolean;
  email_notif_announcement: boolean;
};

const FIELDS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: 'email_notif_payout', label: 'Payout', desc: 'Pengajuan, persetujuan, penolakan, dan transfer dana payout.' },
  { key: 'email_notif_release', label: 'Release', desc: 'Status review, approve, atau reject release Anda.' },
  { key: 'email_notif_payment', label: 'Pembayaran', desc: 'Konfirmasi pembayaran release berhasil diproses.' },
  { key: 'email_notif_announcement', label: 'Pengumuman', desc: 'Pengumuman dan informasi dari tim Soundpub.' },
];

export function EmailNotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_notif_payout, email_notif_release, email_notif_payment, email_notif_announcement')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.error(error);
        toast.error('Gagal memuat preferensi email');
      } else if (data) {
        setPrefs(data as Prefs);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const toggle = async (key: keyof Prefs, value: boolean) => {
    if (!user || !prefs) return;
    setSavingKey(key);
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: value });
    const { error } = await supabase
      .from('profiles')
      .update({ [key]: value })
      .eq('id', user.id);
    setSavingKey(null);
    if (error) {
      setPrefs({ ...prefs, [key]: prev });
      toast.error('Gagal menyimpan preferensi');
    } else {
      toast.success('Preferensi tersimpan');
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Notifikasi Email</CardTitle>
        <CardDescription>
          Pilih jenis email yang ingin Anda terima. Notifikasi in-app (lonceng) tetap aktif walaupun email dimatikan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || !prefs ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          FIELDS.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/30">
              <div className="flex-1 min-w-0">
                <Label htmlFor={f.key} className="font-medium cursor-pointer">{f.label}</Label>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </div>
              <Switch
                id={f.key}
                checked={prefs[f.key]}
                onCheckedChange={(v) => toggle(f.key, v)}
                disabled={savingKey === f.key}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}