import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Image as ImageIcon, Check, Trash2 } from 'lucide-react';

export function LabelLogoSettings() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(profile?.logo_url || null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Ukuran file maksimal 2MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const fileName = `label-logo-${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('release-covers')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('release-covers')
        .getPublicUrl(fileName);

      // Update profile with new logo
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ logo_url: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setLogoUrl(urlData.publicUrl);
      
      toast({
        title: 'Berhasil',
        description: 'Logo label berhasil diupload',
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
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ logo_url: null })
        .eq('id', user.id);

      if (error) throw error;

      setLogoUrl(null);
      
      toast({
        title: 'Berhasil',
        description: 'Logo label berhasil dihapus',
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

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Logo Label
        </CardTitle>
        <CardDescription>
          Upload logo label Anda yang akan ditampilkan di profil dan releases
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {logoUrl ? (
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 border rounded-lg overflow-hidden bg-muted">
              <img 
                src={logoUrl} 
                alt="Label Logo"
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
              Belum ada logo. Upload logo untuk label Anda.
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
            id="label-logo-upload"
          />
          <Button
            variant="outline"
            onClick={() => logoInputRef.current?.click()}
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
                {logoUrl ? 'Ganti Logo' : 'Upload Logo'}
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Format: PNG, JPG, SVG. Maks 2MB
          </span>
        </div>
      </CardContent>
    </Card>
  );
}