import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Image as ImageIcon, Check, Trash2, Sun, Moon } from 'lucide-react';

export function LabelLogoSettings() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [logoLight, setLogoLight] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState<string | null>(null);
  const logoLightInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setLogoLight((profile as any).logo_url_light || profile.logo_url || null);
      setLogoDark((profile as any).logo_url_dark || null);
    }
  }, [profile]);

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'light' | 'dark'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'File harus berupa gambar',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Ukuran file maksimal 1MB',
        variant: 'destructive',
      });
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
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ [columnName]: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setLogo(urlData.publicUrl);
      
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
    if (!user) return;

    const setLogo = type === 'light' ? setLogoLight : setLogoDark;
    const columnName = type === 'light' ? 'logo_url_light' : 'logo_url_dark';

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [columnName]: null })
        .eq('id', user.id);

      if (error) throw error;

      setLogo(null);
      
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
            <div className={`relative w-16 h-16 border rounded-lg overflow-hidden ${bgClass}`}>
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
            accept="image/*"
            onChange={(e) => handleLogoUpload(e, type)}
            className="hidden"
            id={`label-logo-${type}-upload`}
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
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Logo Label
        </CardTitle>
        <CardDescription>
          Upload logo label untuk tema terang dan gelap. Logo akan ditampilkan di dashboard untuk Anda dan artis di bawah label Anda.
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
            <li>Ukuran rekomendasi: <strong>512 x 512 px</strong> (rasio 1:1)</li>
            <li>Ukuran minimal: 128 x 128 px</li>
            <li>Ukuran maksimal file: <strong>1 MB</strong></li>
            <li>Format: PNG, JPG, SVG</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
