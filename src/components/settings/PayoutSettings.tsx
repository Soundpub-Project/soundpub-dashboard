import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Banknote } from 'lucide-react';

export function PayoutSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minPayout, setMinPayout] = useState('50000');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('key', 'min_payout_amount')
        .maybeSingle();
      if (data?.value) setMinPayout(data.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('update-app-settings', {
        body: { settings: [{ key: 'min_payout_amount', value: minPayout }] },
      });
      if (error) throw error;
      toast({ title: 'Berhasil', description: 'Batas minimal payout berhasil disimpan' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Gagal menyimpan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: string) => {
    const num = parseInt(val) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          Pengaturan Payout
        </CardTitle>
        <CardDescription>Atur batas minimal penarikan dana</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Minimal Payout (IDR)</Label>
          <Input type="number" value={minPayout} onChange={e => setMinPayout(e.target.value)} min="0" />
          <p className="text-xs text-muted-foreground">
            User harus memiliki saldo minimal {formatCurrency(minPayout)} untuk mengajukan payout
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Menyimpan...</> : <><Save className="h-4 w-4 mr-2" />Simpan</>}
        </Button>
      </CardContent>
    </Card>
  );
}
