import { useEffect, useState } from 'react';
import { BellRing, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface AuthNoticeConfig { enabled: boolean; title: string; badge: string; message: string; detail: string; buttonText: string; revision: string; }
const DEFAULT_CONFIG: AuthNoticeConfig = { enabled: false, title: 'Informasi Lingkungan Sistem', badge: 'Staging / Development', message: 'Website production sedang dalam mode maintenance. Anda sedang mengakses environment staging/development untuk proses penyempurnaan sistem.', detail: 'Gunakan sistem ini untuk pengujian dan validasi fitur. Beberapa data, tampilan, atau alur kerja masih dapat berubah selama proses development.', buttonText: 'Saya Mengerti', revision: '1' };
function parseConfig(value: string | null): AuthNoticeConfig { try { return value ? { ...DEFAULT_CONFIG, ...(JSON.parse(value) as Partial<AuthNoticeConfig>) } : DEFAULT_CONFIG; } catch { return DEFAULT_CONFIG; } }

export function AuthNoticeSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AuthNoticeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { supabase.from('app_settings').select('value').eq('key', 'auth_notice_config').maybeSingle().then(({ data, error }) => { if (error) toast({ title: 'Error', description: 'Gagal memuat popup auth', variant: 'destructive' }); else setConfig(parseConfig(data?.value ?? null)); setLoading(false); }); }, [toast]);
  const handleSave = async () => {
    if (!config.title.trim() || !config.message.trim() || !config.buttonText.trim()) { toast({ title: 'Data belum lengkap', description: 'Judul, pesan, dan teks tombol wajib diisi', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const nextConfig = { ...config, title: config.title.trim(), badge: config.badge.trim(), message: config.message.trim(), detail: config.detail.trim(), buttonText: config.buttonText.trim(), revision: String(Date.now()) };
      const { data, error } = await supabase.functions.invoke('update-app-settings', { body: { settings: [{ key: 'auth_notice_config', value: JSON.stringify(nextConfig) }] } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConfig(nextConfig);
      toast({ title: 'Berhasil', description: 'Popup auth telah diperbarui' });
    } catch (error: any) { toast({ title: 'Error', description: error.message || 'Gagal menyimpan popup auth', variant: 'destructive' }); } finally { setSaving(false); }
  };
  return <Card className="bg-card/50 border-border/50"><CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />Popup Informasi Auth</CardTitle><CardDescription>Tampil di halaman login sebelum user masuk. Setiap simpan membuat popup muncul kembali untuk semua browser.</CardDescription></CardHeader><CardContent className="space-y-5">{loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : <>
    <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="auth-notice-enabled">Aktifkan popup</Label><p className="text-sm text-muted-foreground">Matikan untuk menyembunyikan popup.</p></div><Switch id="auth-notice-enabled" checked={config.enabled} onCheckedChange={(enabled) => setConfig((current) => ({ ...current, enabled }))} /></div>
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="auth-notice-title">Judul *</Label><Input id="auth-notice-title" value={config.title} onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="auth-notice-badge">Badge</Label><Input id="auth-notice-badge" value={config.badge} onChange={(e) => setConfig((c) => ({ ...c, badge: e.target.value }))} /></div></div>
    <div className="space-y-2"><Label htmlFor="auth-notice-message">Pesan utama *</Label><Textarea id="auth-notice-message" value={config.message} onChange={(e) => setConfig((c) => ({ ...c, message: e.target.value }))} rows={4} /></div>
    <div className="space-y-2"><Label htmlFor="auth-notice-detail">Detail tambahan</Label><Textarea id="auth-notice-detail" value={config.detail} onChange={(e) => setConfig((c) => ({ ...c, detail: e.target.value }))} rows={3} /></div>
    <div className="max-w-sm space-y-2"><Label htmlFor="auth-notice-button">Teks tombol *</Label><Input id="auth-notice-button" value={config.buttonText} onChange={(e) => setConfig((c) => ({ ...c, buttonText: e.target.value }))} /></div>
    <div className="flex justify-end"><Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Simpan Popup Auth</Button></div>
  </>}</CardContent></Card>;
}