import { BackendMediaUpload } from './BackendMediaUpload';
import { useState, useRef, useEffect } from 'react';
import { updateCurrentProfile } from '@/services/users';
import { usesBackendDomain } from '@/api/routing';
import { usesBackendArtistLabels } from '@/services/labels';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Image as ImageIcon, Check, Trash2, Sun, Moon } from 'lucide-react';

const readImageDimensions = (file: File) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Gambar tidak dapat dibaca'));
  };
  image.src = objectUrl;
});

export function LabelLogoSettings() {
  if (usesBackendDomain('storage')) return <BackendLabelLogoSettings />;
  return <LegacyLabelLogoSettings />;
}
function BackendLabelLogoSettings() {
  const { user, profile, refreshProfile } = useAuth();
  if (!user || !profile) return null;
  if (!usesBackendDomain('users')) return <p role="status">Profil backend diperlukan untuk upload logo.</p>;
  return <div className="space-y-3">{(['light', 'dark'] as const).map(variant => <BackendMediaUpload key={variant} label={`Logo ${variant}`} binding={{ category: 'LABEL_LOGO', resource_type: 'label', resource_id: profile.id, variant }} reference={variant === 'light' ? profile?.logo_url_light : profile?.logo_url_dark} onChange={refreshProfile} />)}</div>;
}
function LegacyLabelLogoSettings() {
  const backendUsers = usesBackendArtistLabels();
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [logoLight, setLogoLight] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState<string | null>(null);
  const logoLightInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setLogoLight(profile.logo_url_light || profile.logo_url || null);
      setLogoDark(profile.logo_url_dark || null);
    }
  }, [profile]);

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'light' | 'dark'
  ) => {
    if (backendUsers) return;
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Gunakan PNG, JPG, atau SVG',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Ukuran file maksimal 1MB',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    try {
      const { width, height } = await readImageDimensions(file);
      const ratio = width / height;
      if (width < 256 || height < 64 || ratio < 2 || ratio > 5) {
        toast({
          title: 'Rasio logo tidak sesuai',
          description: 'Gunakan logo horizontal dengan rasio 2:1 sampai 5:1. Rekomendasi 600 x 200 px (3:1).',
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }
    } catch (error: any) {
      toast({
        title: 'Gambar tidak valid',
        description: error.message || 'File tidak dapat dibaca sebagai gambar',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    const setUploading = type === 'light' ? setUploadingLight : setUploadingDark;
    const setLogo = type === 'light' ? setLogoLight : setLogoDark;
    const inputRef = type === 'light' ? logoLightInputRef : logoDarkInputRef;
    const columnName = type === 'light' ? 'logo_url_light' : 'logo_url_dark';

    setUploading(true);
    try {
      const fileName = `label-logo-${type}-${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('label-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('label-logos')
        .getPublicUrl(fileName);

      // Update profile with new logo
      await updateCurrentProfile(user.id, { [columnName]: urlData.publicUrl });

      setLogo(urlData.publicUrl);
      await refreshProfile();
      
      toast({
        title: 'Berhasil',
        description: `Logo tema ${type === 'light' ? 'terang' : 'gelap'} berhasil diupload`,
      });
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
    if (backendUsers && !usesBackendDomain('users')) return;
    if (!user) return;

    const setLogo = type === 'light' ? setLogoLight : setLogoDark;
    const columnName = type === 'light' ? 'logo_url_light' : 'logo_url_dark';

    try {
      await updateCurrentProfile(user.id, { [columnName]: null });

      setLogo(null);
      await refreshProfile();
      
      toast({
        title: 'Berhasil',
        description: `Logo tema ${type === 'light' ? 'terang' : 'gelap'} berhasil dihapus`,
      });
    } catch (error: any) {
      console.error('Error removing logo:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menghapus logo',
        variant: 'destructive',
      });
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
          <span className="font-medium text-sm">{label}</span>
        </div>
        
        {logo ? (
          <div className="flex items-center gap-3">
            <div className={`relative w-48 h-16 border rounded-lg overflow-hidden ${bgClass}`}>
              <img 
                src={logo} 
                alt={`Logo ${label}`}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit text-xs">
                <Check className="h-3 w-3 mr-1" />
                Aktif
              </Badge>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRemoveLogo(type)}
                disabled={backendUsers && !usesBackendDomain('users')}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Hapus
              </Button>
            </div>
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg ${bgClass}`}>
            <ImageIcon className="h-8 w-8 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Belum ada logo</p>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => handleLogoUpload(e, type)}
            className="hidden"
            id={`label-logo-${type}-upload`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={backendUsers || uploading}
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
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Logo Label
        </CardTitle>
        <CardDescription>
          {backendUsers ? 'Upload logo ditunda sampai penyimpanan media backend tersedia. Penghapusan URL logo memerlukan layanan Users backend.' : 'Upload logo label untuk tema terang dan gelap. Logo akan ditampilkan di dashboard untuk Anda dan artis di bawah label Anda.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderLogoSection('light', logoLight, uploadingLight, logoLightInputRef)}
          {renderLogoSection('dark', logoDark, uploadingDark, logoDarkInputRef)}
        </div>
        
        <div className="p-3 rounded-lg bg-muted/50 text-sm">
          <p className="font-medium">📐 Ketentuan Gambar:</p>
          <ul className="text-muted-foreground mt-1 space-y-1 list-disc list-inside">
            <li>Rasio horizontal: <strong>2:1 sampai 5:1</strong> (rekomendasi 600 x 200 px / 3:1)</li>
            <li>Ukuran minimal: 256 x 64 px</li>
            <li>Ukuran maksimal file: <strong>1 MB</strong></li>
            <li>Format: PNG, JPG, SVG</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Logo persegi lama tidak diregangkan agar tetap proporsional. Ganti dengan logo horizontal agar tampil jelas di sidebar.</p>
        </div>
      </CardContent>
    </Card>
  );
}
