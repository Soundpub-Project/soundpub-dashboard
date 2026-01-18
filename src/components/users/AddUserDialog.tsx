import { useState, useEffect } from 'react';
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
import { Loader2, Shield, Music, Building2, User, UserPlus, Crown, ShieldCheck } from 'lucide-react';

type AppRole = 'superadmin' | 'admin' | 'label' | 'artist' | 'user' | 'copyright' | 'whitelabel';

interface LabelOption {
  id: string;
  full_name: string;
}

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  allowedRoles?: AppRole[];
  defaultParentLabelId?: string;
  isWhitelabelMode?: boolean;
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
    value: 'whitelabel', 
    label: 'White Label', 
    icon: <Crown className="h-4 w-4 text-yellow-500" />,
    description: 'Label dengan branding sendiri, artis tidak bisa login'
  },
  { 
    value: 'copyright', 
    label: 'Copyright (Hak Cipta)', 
    icon: <ShieldCheck className="h-4 w-4 text-blue-500" />,
    description: 'Pemilik hak cipta lagu, menerima royalty composer'
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
  isWhitelabelMode = false,
}: AddUserDialogProps) {
  const { user: currentUser, isAdmin, isLabel, isWhitelabel } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>(allowedRoles?.[0] || 'user');
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch labels when dialog opens and role is artist
  useEffect(() => {
    if (open && isAdmin) {
      fetchLabels();
    }
  }, [open, isAdmin]);

  const fetchLabels = async () => {
    setLoadingLabels(true);
    try {
      // Fetch all users with label role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'label');

      if (rolesError) throw rolesError;

      const labelUserIds = roles?.map(r => r.user_id) || [];

      if (labelUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', labelUserIds)
          .eq('status', 'active');

        if (profilesError) throw profilesError;

        setLabels(profiles || []);
      } else {
        setLabels([]);
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
    } finally {
      setLoadingLabels(false);
    }
  };

  // Filter role options based on allowedRoles or user permissions
  const roleOptions = ALL_ROLE_OPTIONS.filter(role => {
    if (allowedRoles) {
      return allowedRoles.includes(role.value);
    }
    // Admin can add all roles except superadmin
    if (isAdmin) {
      return true;
    }
    // Label or Whitelabel can only add artists
    if (isLabel || isWhitelabel) {
      return role.value === 'artist';
    }
    return false;
  });

  const handleSave = async () => {
    // For whitelabel mode, password is not required
    if (!email || !fullName) {
      toast.error('Email dan nama lengkap harus diisi');
      return;
    }

    // Password only required if not in whitelabel mode
    if (!isWhitelabelMode && !password) {
      toast.error('Password harus diisi');
      return;
    }

    if (!isWhitelabelMode && password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    // Validate label selection for artist role
    if (selectedRole === 'artist' && isAdmin && !selectedLabelId && !defaultParentLabelId) {
      toast.error('Pilih label untuk artist');
      return;
    }

    setLoading(true);
    try {
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Determine parent_label_id
      let parentLabelId = defaultParentLabelId || null;
      if (selectedRole === 'artist') {
        if ((isLabel || isWhitelabel) && currentUser) {
          parentLabelId = currentUser.id;
        } else if (isAdmin && selectedLabelId) {
          parentLabelId = selectedLabelId;
        }
      }

      // Use different edge function for whitelabel mode
      if (isWhitelabelMode) {
        const response = await supabase.functions.invoke('create-whitelabel-artist', {
          body: {
            email,
            full_name: fullName,
            phone: phone || null,
            parent_label_id: parentLabelId,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || 'Gagal membuat artist');
        }

        if (!response.data.success) {
          throw new Error(response.data.error || 'Gagal membuat artist');
        }
      } else {
        // Call edge function to create user without logging in as them
        const response = await supabase.functions.invoke('create-user', {
          body: {
            email,
            password,
            full_name: fullName,
            phone: phone || '',
            role: selectedRole,
            parent_label_id: parentLabelId,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || 'Gagal membuat user');
        }

        if (!response.data.success) {
          throw new Error(response.data.error || 'Gagal membuat user');
        }
      }

      toast.success(`${isWhitelabelMode ? 'Artist' : 'User'} ${fullName} berhasil ditambahkan${isWhitelabelMode ? '' : ` sebagai ${selectedRole}`}`);
      
      // Reset form
      setEmail('');
      setFullName('');
      setPassword('');
      setPhone('');
      setSelectedRole(allowedRoles?.[0] || (isLabel ? 'artist' : 'user'));
      setSelectedLabelId('');
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
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
      setPhone('');
      setSelectedRole(allowedRoles?.[0] || (isLabel ? 'artist' : 'user'));
      setSelectedLabelId('');
    }
    onOpenChange(open);
  };

  const dialogTitle = isLabel ? 'Tambah Artist' : 'Tambah User';
  const dialogDescription = isLabel 
    ? 'Tambahkan artist baru di bawah label Anda'
    : 'Tambahkan user baru ke platform';

  const showLabelSelect = isAdmin && selectedRole === 'artist' && !defaultParentLabelId;

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
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">No. Telepon <span className="text-muted-foreground">(opsional)</span></Label>
            <Input
              id="phone"
              type="tel"
              placeholder="08123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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

          {showLabelSelect && (
            <div className="space-y-2">
              <Label>Label</Label>
              <Select value={selectedLabelId} onValueChange={setSelectedLabelId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingLabels ? "Memuat..." : "Pilih label"} />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((label) => (
                    <SelectItem key={label.id} value={label.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span>{label.full_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {labels.length === 0 && !loadingLabels && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Tidak ada label tersedia
                    </div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Artist akan otomatis muncul di halaman My Artists label yang dipilih
              </p>
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
            disabled={loading || !email || !fullName || !password || (showLabelSelect && !selectedLabelId)}
            className="gradient-primary"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLabel ? 'Tambah Artist' : 'Tambah User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
