import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, type AppRole } from "@/services/users";
import { usesBackendDomain } from "@/api/routing";
import { usesBackendArtistLabels } from "@/services/labels";
import { SoundpubApiError } from "@/api/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users as UsersIcon,
  Search,
  Loader2,
  Shield,
  Music,
  Building2,
  User,
  Edit,
  UserPlus,
  KeyRound,
  MoreHorizontal,
  UserCog,
  Trash2,
  Filter,
  X,
  Hash,
  UserX,
  UsersRound,
  Link2,
} from "lucide-react";
import { ChangeRoleDialog } from "@/components/users/ChangeRoleDialog";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { ChangePasswordDialog } from "@/components/users/ChangePasswordDialog";
import { ChangeStatusDialog } from "@/components/users/ChangeStatusDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { EditComposerCodeDialog } from "@/components/users/EditComposerCodeDialog";
import { IccnIdentityDialog } from "@/components/users/IccnIdentityDialog";
import {
  LabelCustomArtistsAdminDialog,
  type LabelCustomAdminOwner,
} from "@/components/users/LabelCustomArtistsAdminDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserStatus = "active" | "inactive" | "suspended";

type LoginMethod = "email" | "iccn" | "google" | "none";

interface UserProfile {
  id: string;
  email: string;
  account_kind?: 'STANDARD' | 'MANAGED_ARTIST';
  full_name: string;
  phone: string | null;
  status: string;
  balance: number;
  created_at: string;
  role?: AppRole;
  roles?: string[];
  parent_label_id?: string | null;
  parent_label_name?: string | null;
  composer_code?: string | null;
  sso_provider?: string | null;
}

const ROLE_ICONS: Record<AppRole, React.ReactNode> = {
  superadmin: <Shield className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  label: <Building2 className="h-3 w-3" />,
  label_custom: <Building2 className="h-3 w-3" />,
  artist: <Music className="h-3 w-3" />,
  user: <User className="h-3 w-3" />,
  copyright: <Shield className="h-3 w-3" />,
  whitelabel: <Building2 className="h-3 w-3" />,
};

const ROLE_COLORS: Record<AppRole, string> = {
  superadmin: "bg-red-500/20 text-red-400 border-red-500/30",
  admin: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  label: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  label_custom: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  artist: "bg-green-500/20 text-green-400 border-green-500/30",
  user: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  copyright: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  whitelabel: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const ALL_ROLES: AppRole[] = [
  "superadmin",
  "admin",
  "label",
  "label_custom",
  "whitelabel",
  "artist",
  "user",
  "copyright",
];
const ALL_STATUSES: UserStatus[] = ["active", "inactive", "suspended"];

export default function Users() {
  const backendUsers = usesBackendDomain('users');
  const { isAdmin, isSuperadmin, loading: authLoading, user, startImpersonation } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id ?? null;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [loginMethodFilter, setLoginMethodFilter] = useState<
    LoginMethod | "all"
  >("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [composerCodeDialogOpen, setComposerCodeDialogOpen] = useState(false);
  const [labelCustomOwner, setLabelCustomOwner] = useState<UserProfile | null>(null);
  const [labelCustomArtistsOpen, setLabelCustomArtistsOpen] = useState(false);
  const [iccnIdentityOpen, setIccnIdentityOpen] = useState(false);
  const [impersonationTarget, setImpersonationTarget] = useState<UserProfile | null>(null);
  const [impersonationReason, setImpersonationReason] = useState("");
  const [impersonationPassword, setImpersonationPassword] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    // Only fetch users if user is logged in AND is admin
    if (user && isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, user]);

  const fetchUsers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const items = await listUsers();
      setUsers(items.map(item => ({
        ...item, email: item.email ?? '', full_name: item.full_name ?? '',
        phone: item.phone ?? null, balance: Number(item.balance ?? 0),
        composer_code: item.composer_code ?? null,
      })));
    } catch (error) {
      setUsers([]);
      setLoadError(error instanceof SoundpubApiError && error.status === 401
        ? 'Sesi tidak valid. Silakan login kembali.'
        : error instanceof SoundpubApiError && error.status === 403
          ? 'Anda tidak memiliki akses ke daftar user.'
          : 'Gagal memuat daftar user. Silakan coba lagi.');
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      active: "default",
      inactive: "secondary",
      suspended: "destructive",
    };
    return variants[status] || "secondary";
  };

  const handleImpersonate = async (target: UserProfile) => {
    if (backendUsers) {
      setImpersonationTarget(target);
      return;
    }
    if (!isSuperadmin || !user) return;
    if (
      !window.confirm(
        "Masuk sebagai " +
          target.full_name +
          "? Sesi superadmin disimpan sementara untuk tombol kembali.",
      )
    )
      return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesi superadmin tidak ditemukan");
      const response = await supabase.functions.invoke(
        "start-user-impersonation",
        {
          body: {
            user_id: target.id,
            redirect_to: window.location.origin + "/auth/impersonate",
          },
        },
      );
      if (response.error) throw response.error;
      if (!response.data?.success || !response.data.action_link)
        throw new Error(response.data?.error || "Gagal memulai akses user");
      sessionStorage.setItem(
        "soundpub_impersonation_origin",
        JSON.stringify({
          actorName: user.email || "Superadmin",
          targetId: target.id,
          targetName: target.full_name,
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          },
        }),
      );
      window.location.assign(response.data.action_link);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal masuk sebagai user",
      );
    }
  };

  const closeBackendImpersonation = (open: boolean) => {
    if (open || impersonating) return;
    setImpersonationTarget(null);
    setImpersonationReason("");
    setImpersonationPassword("");
  };

  const confirmBackendImpersonation = async () => {
    if (!impersonationTarget || impersonationReason.trim().length < 10 || !impersonationPassword) return;
    setImpersonating(true);
    try {
      await startImpersonation(impersonationTarget.id, impersonationReason.trim(), impersonationPassword);
      setImpersonationPassword("");
      setImpersonationReason("");
      setImpersonationTarget(null);
      window.location.assign('/dashboard');
    } catch (error) {
      toast.error(error instanceof SoundpubApiError && error.status === 401
        ? 'Password saat ini salah atau sesi tidak valid.'
        : error instanceof SoundpubApiError && error.status === 403
          ? 'Impersonasi hanya tersedia untuk superadmin.'
          : 'Gagal memulai impersonasi. Silakan coba lagi.');
    } finally {
      setImpersonationPassword("");
      setImpersonating(false);
    }
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

  const handleEditComposerCode = (user: UserProfile) => {
    setSelectedUser(user);
    setComposerCodeDialogOpen(true);
  };

  const handleManageLabelCustomArtists = (target: UserProfile) => {
    setLabelCustomOwner(target);
    setLabelCustomArtistsOpen(true);
  };

  const handleManageIccnIdentity = (target: UserProfile) => {
    setSelectedUser(target);
    setIccnIdentityOpen(true);
  };

  const canMutateLabelCustomOwner = (target: UserProfile | null) => {
    if (!target) return false;
    if (isSuperadmin) return true;
    return !(target.roles ?? [target.role]).some(role => role === "admin" || role === "superadmin");
  };

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
    setLoginMethodFilter("all");
  };

  const hasActiveFilters =
    searchTerm ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    loginMethodFilter !== "all";

  const getLoginMethod = (
    ssoProvider: string | null | undefined,
    accountKind?: UserProfile["account_kind"],
  ): LoginMethod => {
    if (accountKind === "MANAGED_ARTIST") return "none";
    if (ssoProvider === "iccn") return "iccn";
    if (ssoProvider === "google") return "google";
    return "email";
  };

  const getLoginMethodBadge = (ssoProvider: string | null | undefined, accountKind?: UserProfile['account_kind']) => {
    if (accountKind === 'MANAGED_ARTIST') return <Badge variant="outline">Artis managed - tanpa login</Badge>;
    const method = getLoginMethod(ssoProvider, accountKind);
    switch (method) {
      case "iccn":
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs"
          >
            SSO ICCN
          </Badge>
        );
      case "none":
        return <Badge variant="outline">Artis managed - tanpa login</Badge>;
      case "google":
        return (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-xs"
          >
            Google
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground border-border text-xs"
          >
            Email
          </Badge>
        );
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || user.roles?.includes(roleFilter) || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" || user.status === statusFilter;
    const matchesLoginMethod =
      loginMethodFilter === "all" ||
      getLoginMethod(user.sso_provider, user.account_kind) === loginMethodFilter;

    return matchesSearch && matchesRole && matchesStatus && matchesLoginMethod;
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

  // Logged in but not admin â†’ kick to dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Kelola pengguna platform</p>
          {backendUsers && <p className="text-sm text-muted-foreground">Backend mandiri aktif. Pengelolaan akun dan impersonasi superadmin menggunakan sesi backend.</p>}
          {loadError && <div role="alert"><p>{loadError}</p><Button onClick={fetchUsers}>Coba lagi</Button></div>}
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="users">Daftar User</TabsTrigger>
            <TabsTrigger value="requests" disabled={usesBackendArtistLabels()}>Permintaan Hapus Artis</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle>Daftar Users</CardTitle>
                      <CardDescription>
                        {filteredUsers.length} dari {users.length} users
                        {hasActiveFilters && " (filtered)"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={backendUsers}
                        onClick={() =>
                          navigate("/dashboard/users/orphan-audit")
                        }
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Audit Orphan User
                      </Button>
                      <Button
                        onClick={() => setAddUserDialogOpen(true)}
                        className="gradient-primary"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Tambah User
                      </Button>
                    </div>
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
                      <Select
                        value={roleFilter}
                        onValueChange={(v) =>
                          setRoleFilter(v as AppRole | "all")
                        }
                      >
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Semua Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Role</SelectItem>
                          {ALL_ROLES.map((role) => (
                            <SelectItem
                              key={role}
                              value={role}
                              className="capitalize"
                            >
                              {role === "label_custom" ? "Label Custom" : role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={statusFilter}
                        onValueChange={(v) =>
                          setStatusFilter(v as UserStatus | "all")
                        }
                      >
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Semua Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Status</SelectItem>
                          {ALL_STATUSES.map((status) => (
                            <SelectItem
                              key={status}
                              value={status}
                              className="capitalize"
                            >
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={loginMethodFilter}
                        onValueChange={(v) =>
                          setLoginMethodFilter(v as LoginMethod | "all")
                        }
                      >
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Semua Login" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Login</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="iccn">SSO ICCN</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="none">Tanpa login</SelectItem>
                        </SelectContent>
                      </Select>
                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={clearFilters}
                          title="Clear filters"
                        >
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
                          <TableHead>Login</TableHead>
                          <TableHead>Label / Kode</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Bergabung</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.full_name}
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <div
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role || "user"]}`}
                              >
                                {ROLE_ICONS[user.role || "user"]}
                                <span className="capitalize">
                                  {user.role === "label_custom" ? "Label Custom" : user.role || "user"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getLoginMethodBadge(user.sso_provider, user.account_kind)}
                            </TableCell>
                            <TableCell>
                              {user.role === "copyright" &&
                              user.composer_code ? (
                                <div className="flex items-center gap-1.5">
                                  <Hash className="h-3 w-3 text-cyan-500" />
                                  <span className="text-sm font-mono">
                                    {user.composer_code}
                                  </span>
                                </div>
                              ) : user.role === "artist" &&
                                user.parent_label_name ? (
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">
                                    {user.parent_label_name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  -
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={getStatusBadge(user.status)}
                                className="capitalize"
                              >
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              Rp {Number(user.balance).toLocaleString("id-ID")}
                            </TableCell>
                            <TableCell>
                              {new Date(user.created_at).toLocaleDateString(
                                "id-ID",
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleEditRole(user)}
                                    disabled={
                                      user.account_kind === "MANAGED_ARTIST" || user.id === currentUserId ||
                                      (user.role === "superadmin" && !isSuperadmin)
                                    }
                                  >
                                    <Edit className="mr-2 h-4 w-4" />
                                    Ubah Role
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => user.id === currentUserId ? navigate("/dashboard/settings") : handleEditPassword(user)}
                                    disabled={user.account_kind === "MANAGED_ARTIST" || (user.role === "superadmin" && !isSuperadmin)}
                                  >
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    {user.id === currentUserId ? "Ubah Password Saya" : "Ubah Password"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleEditStatus(user)}
                                    disabled={
                                      user.id === currentUserId ||
                                      (user.role === "superadmin" && !isSuperadmin)
                                    }
                                  >
                                    <UserCog className="mr-2 h-4 w-4" />
                                    Ubah Status
                                  </DropdownMenuItem>
                                  {isSuperadmin &&
                                    !user.roles?.some(role => role === "admin" || role === "superadmin") &&
                                    user.role !== "admin" && user.role !== "superadmin" && (
                                      <DropdownMenuItem
                                        disabled={user.account_kind === "MANAGED_ARTIST"}
                                        onClick={() =>
                                          void handleImpersonate(user)
                                        }
                                      >
                                        <UserCog className="mr-2 h-4 w-4" />
                                        Masuk sebagai User
                                      </DropdownMenuItem>
                                    )}
                                  {user.role === "artist" && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          navigate(
                                            `/dashboard/artist-profile/${user.id}`,
                                          )
                                        }
                                      >
                                        <Music className="mr-2 h-4 w-4" />
                                        Lihat Profil Artis
                                      </DropdownMenuItem>
                                      {backendUsers && isSuperadmin && (
                                        <DropdownMenuItem onClick={() => handleManageIccnIdentity(user)}>
                                          <Link2 className="mr-2 h-4 w-4" />
                                          Kelola ICCN
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  )}
                                  {(user.role === "label_custom" || user.roles?.includes("label_custom")) && backendUsers && (
                                    <DropdownMenuItem onClick={() => handleManageLabelCustomArtists(user)}>
                                      <UsersRound className="mr-2 h-4 w-4" />
                                      Kelola Artis
                                    </DropdownMenuItem>
                                  )}
                                  {user.role === "copyright" && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleEditComposerCode(user)
                                      }
                                    >
                                      <Hash className="mr-2 h-4 w-4" />
                                      Edit Composer Code
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteUser(user)}
                                    disabled={
                                      !isSuperadmin ||
                                      user.id === currentUserId
                                    }
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
          </TabsContent>

          <TabsContent value="requests">
            {!usesBackendArtistLabels() && <DeletionRequestsTable />}
          </TabsContent>
        </Tabs>
      </div>

      <LabelCustomArtistsAdminDialog
        open={labelCustomArtistsOpen}
        onOpenChange={setLabelCustomArtistsOpen}
        owner={labelCustomOwner ? {
          id: labelCustomOwner.id,
          fullName: labelCustomOwner.full_name,
          email: labelCustomOwner.email,
          status: labelCustomOwner.status,
        } satisfies LabelCustomAdminOwner : null}
        canMutate={canMutateLabelCustomOwner(labelCustomOwner)}
      />
      <IccnIdentityDialog
        open={iccnIdentityOpen}
        onOpenChange={setIccnIdentityOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
      <ChangeRoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        currentRole={selectedUser?.role || "user"}
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

      <EditComposerCodeDialog
        open={composerCodeDialogOpen}
        onOpenChange={setComposerCodeDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
      <Dialog open={Boolean(impersonationTarget)} onOpenChange={closeBackendImpersonation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Masuk sebagai user</DialogTitle>
            <DialogDescription>
              Akses sebagai {impersonationTarget?.full_name || impersonationTarget?.email}. Aktivitas tetap tercatat sebagai impersonasi superadmin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="impersonation-reason">Alasan</Label>
              <Textarea id="impersonation-reason" value={impersonationReason} disabled={impersonating}
                maxLength={500} autoFocus placeholder="Jelaskan kebutuhan akses ini"
                onChange={event => setImpersonationReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="impersonation-password">Password saat ini</Label>
              <Input id="impersonation-password" type="password" autoComplete="current-password"
                value={impersonationPassword} disabled={impersonating}
                onChange={event => setImpersonationPassword(event.target.value)} />
              <p className="text-xs text-muted-foreground">Password dipakai sekali untuk verifikasi dan tidak disimpan di browser.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={impersonating} onClick={() => closeBackendImpersonation(false)}>Batal</Button>
            <Button disabled={impersonating || impersonationReason.trim().length < 10 || !impersonationPassword}
              onClick={() => void confirmBackendImpersonation()}>
              {impersonating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mulai impersonasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function DeletionRequestsTable() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("artist_deletion_requests")
        .select(
          `
          id,
          artist_id,
          label_id,
          reason,
          status,
          created_at,
          artist:profiles!artist_id(full_name, email),
          label:profiles!label_id(full_name)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching deletion requests:", error);
      toast.error("Gagal memuat permintaan penghapusan");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (
    reqId: string,
    artistId: string,
    artistName: string,
  ) => {
    setProcessingId(reqId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("delete-user", {
        body: { user_id: artistId },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        const errorMsg =
          response.data?.error ||
          response.error?.message ||
          "Gagal menghapus user";
        if (
          errorMsg.includes("503") ||
          errorMsg.includes("FunctionsRelayError") ||
          errorMsg.includes("FunctionsFetchError")
        ) {
          throw new Error(
            "Edge Function tidak tersedia (Error 503). Silakan hubungi administrator untuk deploy edge functions. Lihat file DEPLOY_EDGE_FUNCTIONS.md untuk panduan.",
          );
        }
        throw new Error(errorMsg);
      }

      toast.success(`Profil artis ${artistName} berhasil dihapus permanen`);
      fetchRequests();
    } catch (error: any) {
      console.error("Error approving deletion:", error);
      toast.error(error.message || "Gagal menyetujui permintaan");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (reqId: string) => {
    setProcessingId(reqId);
    try {
      const { error } = await supabase
        .from("artist_deletion_requests")
        .update({ status: "rejected" })
        .eq("id", reqId);

      if (error) throw error;

      toast.success("Permintaan penghapusan ditolak");
      fetchRequests();
    } catch (error: any) {
      console.error("Error rejecting deletion:", error);
      toast.error(error.message || "Gagal menolak permintaan");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle>Daftar Pengajuan Penghapusan Artis</CardTitle>
        <CardDescription>
          Meninjau pengajuan penghapusan profil artis oleh Label
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Trash2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Belum ada pengajuan penghapusan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Artis</TableHead>
                  <TableHead>Diajukan Oleh (Label)</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal Pengajuan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.artist?.full_name || "Artis Terhapus"}
                      <div className="text-xs text-muted-foreground">
                        {req.artist?.email}
                      </div>
                    </TableCell>
                    <TableCell>{req.label?.full_name || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          req.status === "pending"
                            ? "secondary"
                            : req.status === "approved"
                              ? "default"
                              : "destructive"
                        }
                        className="capitalize"
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(req.created_at).toLocaleDateString("id-ID")}
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(req.id)}
                            disabled={processingId !== null}
                          >
                            Tolak
                          </Button>
                          <Button
                            size="sm"
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={() =>
                              handleApprove(
                                req.id,
                                req.artist_id,
                                req.artist?.full_name,
                              )
                            }
                            disabled={processingId !== null}
                          >
                            Setujui Hapus
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
