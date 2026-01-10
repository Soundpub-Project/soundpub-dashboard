import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, Music, Building2, User, UserPlus } from 'lucide-react';

type AppRole = 'admin' | 'label' | 'artist' | 'user';

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  allowedRoles?: AppRole[];
  defaultParentLabelId?: string;
}

interface RoleOption {
  value: AppRole;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const ALL_ROLE_OPTIONS: RoleOption[] = [
  { 
    value: 'user', 
    label: 'User', 
    icon: <User className="h-4 w-4" />,
    description: 'Akses dasar ke platform'
  },
  { 
    value: 'artist', 
    label: 'Artist', 
    icon: <Music className="h-4 w-4" />,
    description: 'Dapat melihat lagu dan royalti mereka'
  },
  { 
    value: 'label', 
    label: 'Label', 
    icon: <Building2 className="h-4 w-4" />,
    description: 'Dapat manage releases dan artis'
  },
  { 
    value: 'admin', 
    label: 'Admin', 
    icon: <Shield className="h-4 w-4" />,
    description: 'Akses penuh ke semua fitur'
  },
];

export function AddUserDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  allowedRoles,
  defaultParentLabelId,
}: AddUserDialogProps) {
  const { user: currentUser, isAdmin, isLabel } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('user');
  const [loading, setLoading] = useState(false);

  // Filter role options based on allowedRoles or user permissions
  const roleOptions = ALL_ROLE_OPTIONS.filter(role => {
    if (allowedRoles) {
      return allowedRoles.includes(role.value);
    }
    // Admin can add all roles except superadmin
    if (isAdmin) {
      return true;
    }
    // Label can only add artists
    if (isLabel) {
      return role.value === 'artist';
    }
    return false;
  });

  const handleSave = async () => {
    if (!email || !fullName || !password) {
      toast.error('Semua field harus diisi');
      return;
    }

    if (password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    setLoading(true);
    try {
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Gagal membuat user');
      }

      // Wait a moment for the trigger to create profile and role
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the role
      const { error: roleError } = await supabase
        .from('user_roles')
        .update({ role: selectedRole })
        .eq('user_id', authData.user.id);

      if (roleError) {
        console.error('Error updating role:', roleError);
      }

      // If Label is adding Artist, set parent_label_id
      if (isLabel && selectedRole === 'artist' && currentUser) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ parent_label_id: currentUser.id })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error('Error setting parent label:', profileError);
        }
      }

      // If admin is adding with default parent label
      if (defaultParentLabelId && selectedRole === 'artist') {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ parent_label_id: defaultParentLabelId })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error('Error setting parent label:', profileError);
        }
      }

      toast.success(`User ${fullName} berhasil ditambahkan sebagai ${selectedRole}`);
      
      // Reset form
      setEmail('');
      setFullName('');
      setPassword('');
      setSelectedRole('user');
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.message?.includes('already registered')) {
        toast.error('Email sudah terdaftar');
      } else {
        toast.error(error.message || 'Gagal menambahkan user');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setEmail('');
      setFullName('');
      setPassword('');
      setSelectedRole(isLabel ? 'artist' : 'user');
    }
    onOpenChange(open);
  };

  const dialogTitle = isLabel ? 'Tambah Artist' : 'Tambah User';
  const dialogDescription = isLabel 
    ? 'Tambahkan artist baru di bawah label Anda'
    : 'Tambahkan user baru ke platform';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nama Lengkap</Label>
            <Input
              id="fullName"
              placeholder="Masukkan nama lengkap"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimal 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {roleOptions.length > 1 && (
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        {role.icon}
                        <div>
                          <span className="font-medium">{role.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            - {role.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-sm text-muted-foreground">
              User akan menerima email konfirmasi untuk verifikasi akun. 
              Password di atas akan digunakan untuk login pertama.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !email || !fullName || !password}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tambah User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
