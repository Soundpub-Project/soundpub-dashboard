import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, DollarSign } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PricingConfig {
  release_pricing_mode: string;
  release_price_per_track: string;
  release_price_single: string;
  release_price_ep: string;
  release_price_album: string;
  release_price_custom_label: string;
}

export function PricingSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PricingConfig>({
    release_pricing_mode: 'per_track',
    release_price_per_track: '50000',
    release_price_single: '50000',
    release_price_ep: '150000',
    release_price_album: '300000',
    release_price_custom_label: '75000',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');

      if (error) throw error;

      const settingsMap: Record<string, string | null> = {};
      data?.forEach((row: { key: string; value: string | null }) => {
        settingsMap[row.key] = row.value;
      });

      setConfig({
        release_pricing_mode: settingsMap.release_pricing_mode || 'per_track',
        release_price_per_track: settingsMap.release_price_per_track || '50000',
        release_price_single: settingsMap.release_price_single || '50000',
        release_price_ep: settingsMap.release_price_ep || '150000',
        release_price_album: settingsMap.release_price_album || '300000',
        release_price_custom_label: settingsMap.release_price_custom_label || '75000',
      });
    } catch (error) {
      console.error('Error fetching pricing settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = Object.entries(config).map(([key, value]) => ({
        key,
        value: String(value),
      }));

      const { error } = await supabase.functions.invoke('update-app-settings', {
        body: { settings },
      });

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Pengaturan harga berhasil disimpan',
      });
    } catch (error: any) {
      console.error('Error saving pricing:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menyimpan pengaturan harga',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseInt(value) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Harga Release
        </CardTitle>
        <CardDescription>
          Atur mode dan harga pembayaran untuk release baru
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pricing Mode */}
        <div className="space-y-2">
          <Label>Mode Penentuan Harga</Label>
          <Select
            value={config.release_pricing_mode}
            onValueChange={(val) => setConfig(prev => ({ ...prev, release_pricing_mode: val }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_track">Per Track</SelectItem>
              <SelectItem value="per_category">Per Kategori (Single/EP/Album)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {config.release_pricing_mode === 'per_track'
              ? 'Harga dihitung berdasarkan jumlah track × harga per track'
              : 'Harga ditentukan berdasarkan tipe release (Single, EP, atau Album)'}
          </p>
        </div>

        {config.release_pricing_mode === 'per_track' ? (
          <div className="space-y-2">
            <Label>Harga Per Track (IDR)</Label>
            <Input
              type="number"
              value={config.release_price_per_track}
              onChange={(e) => setConfig(prev => ({ ...prev, release_price_per_track: e.target.value }))}
              min="0"
            />
            <p className="text-xs text-muted-foreground">
              Contoh: 3 track = {formatCurrency(String(parseInt(config.release_price_per_track || '0') * 3))}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Harga Single (IDR)</Label>
              <Input
                type="number"
                value={config.release_price_single}
                onChange={(e) => setConfig(prev => ({ ...prev, release_price_single: e.target.value }))}
                min="0"
              />
              <Badge variant="outline" className="text-xs">{formatCurrency(config.release_price_single)}</Badge>
            </div>
            <div className="space-y-2">
              <Label>Harga EP (IDR)</Label>
              <Input
                type="number"
                value={config.release_price_ep}
                onChange={(e) => setConfig(prev => ({ ...prev, release_price_ep: e.target.value }))}
                min="0"
              />
              <Badge variant="outline" className="text-xs">{formatCurrency(config.release_price_ep)}</Badge>
            </div>
            <div className="space-y-2">
              <Label>Harga Album (IDR)</Label>
              <Input
                type="number"
                value={config.release_price_album}
                onChange={(e) => setConfig(prev => ({ ...prev, release_price_album: e.target.value }))}
                min="0"
              />
              <Badge variant="outline" className="text-xs">{formatCurrency(config.release_price_album)}</Badge>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Label>Harga Custom Label Soundpub per Track (IDR)</Label>
          <Input
            type="number"
            value={config.release_price_custom_label}
            onChange={(e) => setConfig(prev => ({ ...prev, release_price_custom_label: e.target.value }))}
            min="0"
          />
          <p className="text-xs text-muted-foreground">
            Khusus artis yang login dan terdaftar di bawah label Soundpub. Contoh: 3 track = {formatCurrency(String(parseInt(config.release_price_custom_label || '0') * 3))}
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Simpan Harga
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
