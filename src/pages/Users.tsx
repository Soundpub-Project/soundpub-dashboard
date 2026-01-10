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
import { Users as UsersIcon, Search, Loader2, Shield, Music, Building2, User, Edit, UserPlus } from 'lucide-react';
import { ChangeRoleDialog } from '@/components/users/ChangeRoleDialog';
import { AddUserDialog } from '@/components/users/AddUserDialog';

type AppRole = 'superadmin' | 'admin' | 'label' | 'artist' | 'user';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  balance: number;
  created_at: string;
  role?: AppRole;
}

const ROLE_ICONS: Record<AppRole, React.ReactNode> = {
  superadmin: <Shield className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  label: <Building2 className="h-3 w-3" />,
  artist: <Music className="h-3 w-3" />,
  user: <User className="h-3 w-3" />,
};

const ROLE_COLORS: Record<AppRole, string> = {
  superadmin: 'bg-red-500/20 text-red-400 border-red-500/30',
  admin: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  label: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  artist: 'bg-green-500/20 text-green-400 border-green-500/30',
  user: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function Users() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);


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
      
      const usersWithRoles = (profiles || []).map(profile => ({
        ...profile,
        role: rolesMap.get(profile.id) || 'user' as AppRole,
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

  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Users</CardTitle>
                <CardDescription>{users.length} total users</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari user..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => setAddUserDialogOpen(true)} className="gradient-primary">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Tambah User
                </Button>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditRole(user)}
                            disabled={user.role === 'superadmin'}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Ubah Role
                          </Button>
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
    </DashboardLayout>
  );
}