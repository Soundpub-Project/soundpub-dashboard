import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Upload, 
  Image as ImageIcon, 
  BarChart3, 
  Cloud,
  Check,
  X,
  Trash2
} from 'lucide-react';

interface AppSettings {
  dashboard_logo: string | null;
  favicon: string | null;
  ga4_enabled: string;
  gcs_enabled: string;
}

export function SuperAdminSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    dashboard_logo: null,
    favicon: null,
    ga4_enabled: 'false',
    gcs_enabled: 'false',
  });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

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

      setSettings({
        dashboard_logo: settingsMap.dashboard_logo || null,
        favicon: settingsMap.favicon || null,
        ga4_enabled: settingsMap.ga4_enabled || 'false',
        gcs_enabled: settingsMap.gcs_enabled || 'false',
      });

      // Apply favicon if exists
      if (settingsMap.favicon) {
        updateFaviconLink(settingsMap.favicon);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const updateSettings = async (key: string, value: string | null) => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('update-app-settings', {
        body: { settings: [{ key, value }] },
      });

      if (error) throw error;

      setSettings(prev => ({ ...prev, [key]: value }));
      
      toast({
        title: 'Berhasil',
        description: 'Pengaturan berhasil diperbarui',
      });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal memperbarui pengaturan',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'File harus berupa gambar',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Ukuran file maksimal 1MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingLogo(true);
    try {
      // Check if GCS is enabled
      if (settings.gcs_enabled === 'true') {
        // Upload to GCS
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          const { data, error } = await supabase.functions.invoke('gcs-upload', {
            body: {
              file_name: `logo-${Date.now()}.${file.name.split('.').pop()}`,
              file_type: file.type,
              file_data: base64,
              folder: 'logos',
            },
          });

          if (error) throw error;

          await updateSettings('dashboard_logo', data.url);
        };
        reader.readAsDataURL(file);
      } else {
        // Upload to Supabase Storage
        const fileName = `dashboard-logo-${Date.now()}.${file.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('release-covers')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('release-covers')
          .getPublicUrl(fileName);

        await updateSettings('dashboard_logo', urlData.publicUrl);
      }
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengupload logo',
        variant: 'destructive',
      });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    await updateSettings('dashboard_logo', null);
  };

  const updateFaviconLink = (url: string) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = url;
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (only ico, png, svg)
    const validTypes = ['image/x-icon', 'image/png', 'image/svg+xml', 'image/vnd.microsoft.icon'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.ico')) {
      toast({
        title: 'Error',
        description: 'Format file harus ICO, PNG, atau SVG',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 500KB for favicon)
    if (file.size > 500 * 1024) {
      toast({
        title: 'Error',
        description: 'Ukuran favicon maksimal 500KB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingFavicon(true);
    try {
      if (settings.gcs_enabled === 'true') {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          const { data, error } = await supabase.functions.invoke('gcs-upload', {
            body: {
              file_name: `favicon-${Date.now()}.${file.name.split('.').pop()}`,
              file_type: file.type,
              file_data: base64,
              folder: 'favicons',
            },
          });

          if (error) throw error;

          await updateSettings('favicon', data.url);
          updateFaviconLink(data.url);
        };
        reader.readAsDataURL(file);
      } else {
        const fileName = `favicon-${Date.now()}.${file.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('release-covers')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('release-covers')
          .getPublicUrl(fileName);

        await updateSettings('favicon', urlData.publicUrl);
        updateFaviconLink(urlData.publicUrl);
      }
    } catch (error: any) {
      console.error('Error uploading favicon:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengupload favicon',
        variant: 'destructive',
      });
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFavicon = async () => {
    await updateSettings('favicon', null);
    // Reset to default favicon
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) {
      link.href = '/favicon.ico';
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Logo Dashboard
          </CardTitle>
          <CardDescription>
            Upload logo untuk ditampilkan di sidebar, halaman login, dan header dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.dashboard_logo ? (
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 border rounded-lg overflow-hidden bg-muted">
                <img 
                  src={settings.dashboard_logo} 
                  alt="Dashboard Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Badge variant="outline" className="w-fit">
                  <Check className="h-3 w-3 mr-1" />
                  Logo Aktif
                </Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveLogo}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus Logo
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-4">
                Belum ada logo. Upload logo untuk dashboard.
              </p>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              id="logo-upload"
            />
            <Button
              variant="outline"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Mengupload...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {settings.dashboard_logo ? 'Ganti Logo' : 'Upload Logo'}
                </>
              )}
            </Button>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium">📐 Ketentuan Gambar:</p>
            <ul className="text-muted-foreground mt-1 space-y-1 list-disc list-inside">
              <li>Ukuran rekomendasi: <strong>512 x 512 px</strong> (rasio 1:1)</li>
              <li>Ukuran minimal: 128 x 128 px</li>
              <li>Ukuran maksimal file: <strong>1 MB</strong></li>
              <li>Format: PNG, JPG, SVG</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Favicon Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Favicon
          </CardTitle>
          <CardDescription>
            Upload favicon untuk ditampilkan di tab browser
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.favicon ? (
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                <img 
                  src={settings.favicon} 
                  alt="Favicon"
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Badge variant="outline" className="w-fit">
                  <Check className="h-3 w-3 mr-1" />
                  Favicon Aktif
                </Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveFavicon}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus Favicon
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-4">
                Belum ada favicon. Upload favicon untuk browser tab.
              </p>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <input
              ref={faviconInputRef}
              type="file"
              accept=".ico,.png,.svg,image/x-icon,image/png,image/svg+xml"
              onChange={handleFaviconUpload}
              className="hidden"
              id="favicon-upload"
            />
            <Button
              variant="outline"
              onClick={() => faviconInputRef.current?.click()}
              disabled={uploadingFavicon}
            >
              {uploadingFavicon ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Mengupload...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {settings.favicon ? 'Ganti Favicon' : 'Upload Favicon'}
                </>
              )}
            </Button>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium">📐 Ketentuan Gambar:</p>
            <ul className="text-muted-foreground mt-1 space-y-1 list-disc list-inside">
              <li>Ukuran rekomendasi: <strong>32 x 32 px</strong> atau <strong>64 x 64 px</strong></li>
              <li>Ukuran maksimal file: <strong>500 KB</strong></li>
              <li>Format: ICO, PNG, SVG</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Google Analytics 4 Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Google Analytics 4
          </CardTitle>
          <CardDescription>
            Aktifkan tracking analitik dengan Google Analytics 4
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Status GA4</Label>
              <p className="text-sm text-muted-foreground">
                {settings.ga4_enabled === 'true' 
                  ? 'GA4 tracking aktif'
                  : 'GA4 tracking tidak aktif'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={settings.ga4_enabled === 'true' ? 'default' : 'secondary'}
              >
                {settings.ga4_enabled === 'true' ? (
                  <><Check className="h-3 w-3 mr-1" /> Aktif</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Nonaktif</>
                )}
              </Badge>
              <Switch
                checked={settings.ga4_enabled === 'true'}
                onCheckedChange={(checked) => 
                  updateSettings('ga4_enabled', checked ? 'true' : 'false')
                }
                disabled={loading}
              />
            </div>
          </div>
          
          {settings.ga4_enabled === 'true' && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium text-chart-3">✓ GA4 Tracking Aktif</p>
              <p className="text-muted-foreground mt-1">
                Measurement ID sudah dikonfigurasi melalui secrets.
                Data analitik akan dikirim ke Google Analytics.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Cloud Storage Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Google Cloud Storage
          </CardTitle>
          <CardDescription>
            Gunakan Google Cloud Storage sebagai primary storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Status GCS</Label>
              <p className="text-sm text-muted-foreground">
                {settings.gcs_enabled === 'true' 
                  ? 'File akan disimpan ke Google Cloud Storage'
                  : 'File disimpan ke Lovable Cloud Storage'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={settings.gcs_enabled === 'true' ? 'default' : 'secondary'}
              >
                {settings.gcs_enabled === 'true' ? (
                  <><Check className="h-3 w-3 mr-1" /> Aktif</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Nonaktif</>
                )}
              </Badge>
              <Switch
                checked={settings.gcs_enabled === 'true'}
                onCheckedChange={(checked) => 
                  updateSettings('gcs_enabled', checked ? 'true' : 'false')
                }
                disabled={loading}
              />
            </div>
          </div>

          {settings.gcs_enabled === 'true' && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium text-chart-4">✓ Google Cloud Storage Aktif</p>
              <p className="text-muted-foreground mt-1">
                Bucket dan credentials sudah dikonfigurasi melalui secrets.
                Semua file baru akan disimpan ke GCS.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}