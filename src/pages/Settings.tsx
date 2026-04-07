import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, EyeOff, KeyRound, Camera, Trash2 } from 'lucide-react';
import { SuperAdminSettings } from '@/components/settings/SuperAdminSettings';
import { LabelLogoSettings } from '@/components/settings/LabelLogoSettings';

export default function Settings() {
  const { profile, user, role, isLabel, isWhitelabel, isSsoUser, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          address: formData.address,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Profil berhasil diperbarui',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Gagal memperbarui profil',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    if (passwordData.newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password minimal 6 karakter',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Password tidak cocok',
        variant: 'destructive',
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('change-own-password', {
        body: { new_password: passwordData.newPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Berhasil',
        description: 'Password berhasil diubah',
      });
      
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengubah password',
        variant: 'destructive',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'File harus berupa gambar', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Ukuran maksimal 2MB', variant: 'destructive' });
      return;
    }

    setAvatarLoading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: 'Berhasil', description: 'Foto profil berhasil diupload' });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast({ title: 'Error', description: error.message || 'Gagal mengupload foto profil', variant: 'destructive' });
    } finally {
      setAvatarLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setAvatarLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: 'Berhasil', description: 'Foto profil berhasil dihapus' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Gagal menghapus foto profil', variant: 'destructive' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const isSuperAdmin = role === 'superadmin';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Kelola pengaturan akun Anda</p>
        </div>

        {/* Super Admin Settings Section */}
        {isSuperAdmin && (
          <>
            <div>
              <h2 className="text-xl font-semibold mb-4">Super Admin Settings</h2>
              <SuperAdminSettings />
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* Label/Whitelabel Logo Settings */}
        {(isLabel || isWhitelabel) && (
          <>
            <LabelLogoSettings />
            <Separator className="my-6" />
          </>
        )}

        {/* Two Column Layout for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Profil</CardTitle>
                <CardDescription>Informasi pribadi Anda</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email tidak dapat diubah
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nama Lengkap</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Nama lengkap Anda"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Nomor Telepon</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+62 xxx xxxx xxxx"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Alamat lengkap"
                      rows={3}
                    />
                  </div>

                  <Button type="submit" className="gradient-primary" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Perubahan
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Password change - hide for SSO users */}
            {!isSsoUser && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle>Ubah Password</CardTitle>
                  <CardDescription>Ubah password akun Anda</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new_password">Password Baru</Label>
                      <div className="relative">
                        <Input
                          id="new_password"
                          type={showPassword ? 'text' : 'password'}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          placeholder="Masukkan password baru"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm_password">Konfirmasi Password</Label>
                      <div className="relative">
                        <Input
                          id="confirm_password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          placeholder="Konfirmasi password baru"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      variant="outline" 
                      disabled={passwordLoading || !passwordData.newPassword || !passwordData.confirmPassword}
                    >
                      {passwordLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Menyimpan...
                        </>
                      ) : (
                        <>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Ubah Password
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* SSO info for SSO users */}
            {isSsoUser && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle>Login SSO</CardTitle>
                  <CardDescription>Akun Anda terhubung via ICCN SSO</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      Password dikelola oleh sistem SSO ICCN. Untuk mengubah password, silakan gunakan portal ICCN.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Akun</CardTitle>
                <CardDescription>Informasi akun Anda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Status Akun</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {profile?.status || 'active'}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm ${
                    profile?.status === 'active' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {profile?.status || 'active'}
                  </div>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Bergabung Sejak</p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.created_at 
                        ? new Date(profile.created_at).toLocaleDateString('id-ID', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
