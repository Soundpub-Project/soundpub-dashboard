import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { updateUserRole, type AppRole } from '@/services/users';
import { usesBackendDomain } from '@/api/routing';
import { usesBackendArtistLabels, listLabels } from '@/services/labels';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, Shield, Music, Building2, User, Crown, ShieldCheck } from 'lucide-react';

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
    value: 'label_custom',
    label: 'Label Custom',
    icon: <Building2 className="h-4 w-4" />,
    description: 'Kelola artis tanpa akun login'
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
  {
    value: 'superadmin',
    label: 'Super Admin',
    icon: <Crown className="h-4 w-4 text-amber-500" />,
    description: 'Akses tertinggi untuk administrasi platform'
  },
];

export function ChangeRoleDialog({ 
  open, 
  onOpenChange, 
  user, 
  currentRole,
  onSuccess 
}: ChangeRoleDialogProps) {
  const { isAdmin, isSuperadmin } = useAuth();
  const backendUsers = usesBackendDomain('users');
  const [selectedRole, setSelectedRole] = useState<AppRole>(currentRole);
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transferConfirmation, setTransferConfirmation] = useState('');

  // Fetch labels when dialog opens
  useEffect(() => {
    if (open && isAdmin) {
      fetchLabels();
    }
  }, [open, isAdmin]);

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
      setLabels(await listLabels());
    } catch (error) {
      setLabels([]);
      toast.error('Gagal memuat label. Tutup dialog dan coba lagi.');
    } finally {
      setLoadingLabels(false);
    }
  };

  const handleSave = async () => {
    if (!user || !isAdmin || (selectedRole === 'label_custom' && !backendUsers)) return;
    if (['admin', 'superadmin'].includes(selectedRole) && !isSuperadmin) return;
    
    // Validate that artist role requires a label
    if (selectedRole === 'artist' && !selectedLabelId) {
      toast.error('Pilih label untuk artist');
      return;
    }

    // Check if nothing changed
    const roleChanged = selectedRole !== currentRole;
    const labelChanged = selectedRole === 'artist' && selectedLabelId !== (user.parent_label_id || '');
    const transferringArtist = currentRole === 'artist' && selectedRole === 'artist' && labelChanged;
    
    if (!roleChanged && !labelChanged) {
      onOpenChange(false);
      return;
    }

    setLoading(true);
    try {
      const newParentLabelId = selectedRole === 'artist' ? selectedLabelId : null;
      if (transferringArtist) {
        if (transferConfirmation !== 'PINDAH LABEL') {
          toast.error('Ketik PINDAH LABEL untuk konfirmasi perpindahan label artist');
          setLoading(false);
          return;
        }
      }
      await updateUserRole({
        userId: user.id, fullName: user.full_name, role: selectedRole,
        previousRole: currentRole, parentLabelId: newParentLabelId,
        previousParentLabelId: user.parent_label_id ?? null, transferConfirmation,
      });

      toast.success(roleChanged
        ? `Role ${user.full_name} berhasil diubah menjadi ${selectedRole === 'label_custom' ? 'Label Custom' : selectedRole}`
        : `Label ${user.full_name} berhasil dipindahkan`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal mengubah role user');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setSelectedLabelId('');
      setTransferConfirmation('');
    }
    onOpenChange(open);
  };

  const showLabelSelect = selectedRole === 'artist';
  const currentLabelName = labels.find(l => l.id === user?.parent_label_id)?.full_name;

  if (!isAdmin) return null;

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
          {backendUsers && <p role="status" className="text-sm text-muted-foreground">Promosi user menjadi artist dibuat bersama relasi label. Perpindahan artist yang sudah ada tetap memakai konfirmasi khusus.</p>}
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
                {ROLE_OPTIONS.filter(role => role.value !== 'label_custom' || backendUsers).map((role) => (
                  <SelectItem
                    key={role.value}
                    value={role.value}
                    disabled={['admin', 'superadmin'].includes(role.value) && !isSuperadmin}
                  >
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
                    Role akan diubah dari <span className="font-semibold capitalize">{currentRole === 'label_custom' ? 'Label Custom' : currentRole}</span>{' '}
                    menjadi <span className="font-semibold capitalize">{selectedRole === 'label_custom' ? 'Label Custom' : selectedRole}</span>
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

          {currentRole === 'artist' && selectedRole === 'artist' && selectedLabelId && selectedLabelId !== (user?.parent_label_id || '') && (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Konfirmasi perpindahan label artist</p>
                  <p className="text-muted-foreground">
                    Histori release, track, royalty, dan balance lama tetap di label lama. Label baru hanya berlaku untuk relasi artist dan data baru ke depan.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ketik PINDAH LABEL</Label>
                <Input
                  value={transferConfirmation}
                  onChange={(event) => setTransferConfirmation(event.target.value)}
                  placeholder="PINDAH LABEL"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || (selectedRole === currentRole && (!showLabelSelect || selectedLabelId === (user?.parent_label_id || ''))) || (showLabelSelect && !selectedLabelId) || (currentRole === 'artist' && selectedRole === 'artist' && selectedLabelId !== (user?.parent_label_id || '') && transferConfirmation !== 'PINDAH LABEL')}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
