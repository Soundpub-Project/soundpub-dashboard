import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import { Label } from '@/components/ui/label';
import { Loader2, Shield, Music, Building2, User, Crown, ShieldCheck } from 'lucide-react';

type AppRole = 'superadmin' | 'admin' | 'label' | 'artist' | 'user' | 'copyright' | 'whitelabel';

interface LabelOption {
  id: string;
  full_name: string;
}

interface ChangeRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    email: string;
    parent_label_id?: string | null;
  } | null;
  currentRole: AppRole;
  onSuccess: () => void;
}

const ROLE_OPTIONS: { value: AppRole; label: string; icon: React.ReactNode; description: string }[] = [
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
    description: 'Label dengan branding sendiri'
  },
  { 
    value: 'copyright', 
    label: 'Copyright', 
    icon: <ShieldCheck className="h-4 w-4 text-blue-500" />,
    description: 'Pemilik hak cipta'
  },
  { 
    value: 'admin', 
    label: 'Admin', 
    icon: <Shield className="h-4 w-4" />,
    description: 'Akses penuh ke semua fitur'
  },
];

export function ChangeRoleDialog({ 
  open, 
  onOpenChange, 
  user, 
  currentRole,
  onSuccess 
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(currentRole);
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch labels when dialog opens
  useEffect(() => {
    if (open) {
      fetchLabels();
    }
  }, [open]);

  // Reset state when dialog opens with new user
  useEffect(() => {
    if (open && user) {
      setSelectedRole(currentRole);
      setSelectedLabelId(user.parent_label_id || '');
    }
  }, [open, user, currentRole]);

  const fetchLabels = async () => {
    setLoadingLabels(true);
    try {
      // Fetch all users with label or whitelabel role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['label', 'whitelabel']);

      if (rolesError) throw rolesError;

      const labelUserIds = roles?.map(r => r.user_id) || [];

      if (labelUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', labelUserIds)
          .eq('status', 'active');

        if (profilesError) throw profilesError;

        // Add role info to distinguish labels from whitelabels
        const profilesWithRole = (profiles || []).map(profile => {
          const roleInfo = roles?.find(r => r.user_id === profile.id);
          return {
            ...profile,
            full_name: roleInfo?.role === 'whitelabel' 
              ? `${profile.full_name} (Whitelabel)` 
              : profile.full_name
          };
        });

        setLabels(profilesWithRole);
      } else {
        setLabels([]);
      }
    } catch (error) {
      console.error('Error fetching labels:', error);
    } finally {
      setLoadingLabels(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    // Validate that artist role requires a label
    if (selectedRole === 'artist' && !selectedLabelId) {
      toast.error('Pilih label untuk artist');
      return;
    }

    // Check if nothing changed
    const roleChanged = selectedRole !== currentRole;
    const labelChanged = selectedRole === 'artist' && selectedLabelId !== (user.parent_label_id || '');
    
    if (!roleChanged && !labelChanged) {
      onOpenChange(false);
      return;
    }

    setLoading(true);
    try {
      // Update the user's role in user_roles table if changed
      if (roleChanged) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: selectedRole })
          .eq('user_id', user.id);

        if (roleError) throw roleError;
      }

      // Update parent_label_id in profiles table
      // Set it for artists, clear it for other roles
      const newParentLabelId = selectedRole === 'artist' ? selectedLabelId : null;
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ parent_label_id: newParentLabelId })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast.success(`Role ${user.full_name} berhasil diubah menjadi ${selectedRole}`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Gagal mengubah role user');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setSelectedLabelId('');
    }
    onOpenChange(open);
  };

  const showLabelSelect = selectedRole === 'artist';
  const currentLabelName = labels.find(l => l.id === user?.parent_label_id)?.full_name;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah Role User</DialogTitle>
          <DialogDescription>
            Pilih role baru untuk {user?.full_name || 'user ini'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>User</Label>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">{user?.full_name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {currentRole === 'artist' && currentLabelName && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span>Label: {currentLabelName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
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

          {showLabelSelect && (
            <div className="space-y-2">
              <Label>Label *</Label>
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

          {(selectedRole !== currentRole || (showLabelSelect && selectedLabelId !== (user?.parent_label_id || ''))) && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm">
                {selectedRole !== currentRole ? (
                  <>
                    Role akan diubah dari <span className="font-semibold capitalize">{currentRole}</span>{' '}
                    menjadi <span className="font-semibold capitalize">{selectedRole}</span>
                  </>
                ) : null}
                {selectedRole === 'artist' && selectedLabelId && selectedLabelId !== (user?.parent_label_id || '') && (
                  <>
                    {selectedRole !== currentRole && <br />}
                    Label: <span className="font-semibold">{labels.find(l => l.id === selectedLabelId)?.full_name}</span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || (selectedRole === currentRole && (!showLabelSelect || selectedLabelId === (user?.parent_label_id || ''))) || (showLabelSelect && !selectedLabelId)}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
