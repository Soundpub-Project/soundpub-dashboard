import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { StorageSettings } from './StorageSettings';
import { PricingSettings } from './PricingSettings';
import { 
  Loader2, 
  Upload, 
  Image as ImageIcon, 
  Check,
  Trash2,
  Sun,
  Moon,
  Settings
} from 'lucide-react';

interface AppSettings {
  dashboard_logo_light: string | null;
  dashboard_logo_dark: string | null;
  favicon: string | null;
}

export function SuperAdminSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingLogoLight, setUploadingLogoLight] = useState(false);
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    dashboard_logo_light: null,
    dashboard_logo_dark: null,
    favicon: null,
  });
  const logoLightInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);
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
        dashboard_logo_light: settingsMap.dashboard_logo_light || settingsMap.dashboard_logo || null,
        dashboard_logo_dark: settingsMap.dashboard_logo_dark || null,
        favicon: settingsMap.favicon || null,
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

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'light' | 'dark'
  ) => {
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

    const setUploading = type === 'light' ? setUploadingLogoLight : setUploadingLogoDark;
    const inputRef = type === 'light' ? logoLightInputRef : logoDarkInputRef;
    const settingsKey = type === 'light' ? 'dashboard_logo_light' : 'dashboard_logo_dark';

    setUploading(true);
    try {
      // Upload to Supabase Storage (label-logos bucket)
      const fileName = `dashboard-logo-${type}-${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('label-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('label-logos')
        .getPublicUrl(fileName);

      await updateSettings(settingsKey, urlData.publicUrl);
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengupload logo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async (type: 'light' | 'dark') => {
    const settingsKey = type === 'light' ? 'dashboard_logo_light' : 'dashboard_logo_dark';
    await updateSettings(settingsKey, null);
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
      // Upload to Supabase Storage (label-logos bucket)
      const fileName = `favicon-${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('label-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('label-logos')
        .getPublicUrl(fileName);

      await updateSettings('favicon', urlData.publicUrl);
      updateFaviconLink(urlData.publicUrl);
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
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) {
      link.href = '/favicon.ico';
    }
  };

  const renderLogoSection = (
    type: 'light' | 'dark',
    logo: string | null,
    uploading: boolean,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    const icon = type === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />;
    const label = type === 'light' ? 'Tema Terang' : 'Tema Gelap';
    const bgClass = type === 'light' ? 'bg-white' : 'bg-gray-900';

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        
        {logo ? (
          <div className="flex items-center gap-4">
            <div className={`relative w-20 h-20 border rounded-lg overflow-hidden ${bgClass}`}>
              <img 
                src={logo} 
                alt={`Logo ${label}`}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit">
                <Check className="h-3 w-3 mr-1" />
                Aktif
              </Badge>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRemoveLogo(type)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hapus
              </Button>
            </div>
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg ${bgClass}`}>
            <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Belum ada logo</p>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleLogoUpload(e, type)}
            className="hidden"
            id={`logo-${type}-upload`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mengupload...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {logo ? 'Ganti' : 'Upload'}
              </>
            )}
          </Button>
        </div>
      </div>
    );
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
            Upload logo untuk tema terang dan gelap. Logo akan ditampilkan di sidebar, halaman login, dan header dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderLogoSection('light', settings.dashboard_logo_light, uploadingLogoLight, logoLightInputRef)}
            {renderLogoSection('dark', settings.dashboard_logo_dark, uploadingLogoDark, logoDarkInputRef)}
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

      {/* Pricing moved to /dashboard/payment-settings */}

      {/* Storage & Analytics Settings - using separate component */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Storage & Analytics
          </CardTitle>
          <CardDescription>
            Konfigurasi penyimpanan file dan tracking analitik
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StorageSettings />
        </CardContent>
      </Card>
    </div>
  );
}
