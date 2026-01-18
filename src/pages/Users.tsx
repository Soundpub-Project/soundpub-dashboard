import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Users as UsersIcon, Search, Loader2, Shield, Music, Building2, User, Edit, UserPlus, KeyRound, MoreHorizontal, UserCog, Trash2, Filter, X } from 'lucide-react';
import { ChangeRoleDialog } from '@/components/users/ChangeRoleDialog';
import { AddUserDialog } from '@/components/users/AddUserDialog';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { ChangeStatusDialog } from '@/components/users/ChangeStatusDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AppRole = 'superadmin' | 'admin' | 'label' | 'artist' | 'user' | 'copyright' | 'whitelabel';
type UserStatus = 'active' | 'inactive' | 'suspended';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  balance: number;
  created_at: string;
  role?: AppRole;
  parent_label_id?: string | null;
  parent_label_name?: string | null;
}

const ROLE_ICONS: Record<AppRole, React.ReactNode> = {
  superadmin: <Shield className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  label: <Building2 className="h-3 w-3" />,
  artist: <Music className="h-3 w-3" />,
  user: <User className="h-3 w-3" />,
  copyright: <Shield className="h-3 w-3" />,
  whitelabel: <Building2 className="h-3 w-3" />,
};

const ROLE_COLORS: Record<AppRole, string> = {
  superadmin: 'bg-red-500/20 text-red-400 border-red-500/30',
  admin: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  label: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  artist: 'bg-green-500/20 text-green-400 border-green-500/30',
  user: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  copyright: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  whitelabel: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const ALL_ROLES: AppRole[] = ['superadmin', 'admin', 'label', 'whitelabel', 'artist', 'user', 'copyright'];
const ALL_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

export default function Users() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);


  useEffect(() => {
    // Only fetch users if user is logged in AND is admin
    if (user && isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, user]);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Map roles to users
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role as AppRole]) || []);
      
      // Create a map of user IDs to their names for label lookup
      const profilesMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      const usersWithRoles = (profiles || []).map(profile => ({
        ...profile,
        role: rolesMap.get(profile.id) || 'user' as AppRole,
        parent_label_name: profile.parent_label_id ? profilesMap.get(profile.parent_label_id) || null : null,
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      inactive: 'secondary',
      suspended: 'destructive',
    };
    return variants[status] || 'secondary';
  };

  const handleEditRole = (user: UserProfile) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleEditPassword = (user: UserProfile) => {
    setSelectedUser(user);
    setPasswordDialogOpen(true);
  };

  const handleEditStatus = (user: UserProfile) => {
    setSelectedUser(user);
    setStatusDialogOpen(true);
  };

  const handleDeleteUser = (user: UserProfile) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchTerm || roleFilter !== 'all' || statusFilter !== 'all';

  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // If user just logged out while staying on this route, ensure we leave this page.
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Logged in but not admin → kick to dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Kelola pengguna platform</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Daftar Users</CardTitle>
                  <CardDescription>
                    {filteredUsers.length} dari {users.length} users
                    {hasActiveFilters && ' (filtered)'}
                  </CardDescription>
                </div>
                <Button onClick={() => setAddUserDialogOpen(true)} className="gradient-primary">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Tambah User
                </Button>
              </div>
              
              {/* Filter Section */}
              <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <span>Filter:</span>
                </div>
                <div className="flex flex-1 flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama atau email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | 'all')}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Semua Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Role</SelectItem>
                      {ALL_ROLES.map((role) => (
                        <SelectItem key={role} value={role} className="capitalize">
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      {ALL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada users</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Bergabung</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role || 'user']}`}>
                            {ROLE_ICONS[user.role || 'user']}
                            <span className="capitalize">{user.role || 'user'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.role === 'artist' && user.parent_label_name ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{user.parent_label_name}</span>
                            </div>
                          ) : user.role === 'artist' ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(user.status)} className="capitalize">
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          Rp {Number(user.balance).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleEditRole(user)}
                                disabled={user.role === 'superadmin'}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Ubah Role
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleEditPassword(user)}
                                disabled={user.role === 'superadmin'}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Ubah Password
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleEditStatus(user)}
                                disabled={user.role === 'superadmin'}
                              >
                                <UserCog className="mr-2 h-4 w-4" />
                                Ubah Status
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteUser(user)}
                                disabled={user.role === 'superadmin'}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Hapus User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ChangeRoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        currentRole={selectedUser?.role || 'user'}
        onSuccess={fetchUsers}
      />

      <AddUserDialog
        open={addUserDialogOpen}
        onOpenChange={setAddUserDialogOpen}
        onSuccess={fetchUsers}
      />

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />

      <ChangeStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
    </DashboardLayout>
  );
}
