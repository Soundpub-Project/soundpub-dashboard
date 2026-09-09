import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Music,
  Search,
  Loader2,
  UserPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
  Crown,
  Users,
  Disc3,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Lock,
} from "lucide-react";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { EditArtistDialog } from "@/components/users/EditArtistDialog";
import { DeleteArtistDialog } from "@/components/users/DeleteArtistDialog";
import { useToast } from "@/hooks/use-toast";

interface ArtistProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  address: string | null;
  password_set: boolean | null;
  created_at: string;
}

interface WhitelabelStats {
  totalArtists: number;
  totalReleases: number;
  totalRevenue: number;
  artistsWithAccess: number;
  artistsWithoutAccess: number;
}

export default function WhitelabelDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, isWhitelabel, loading: authLoading } = useAuth();
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [stats, setStats] = useState<WhitelabelStats>({
    totalArtists: 0,
    totalReleases: 0,
    totalRevenue: 0,
    artistsWithAccess: 0,
    artistsWithoutAccess: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addArtistDialogOpen, setAddArtistDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistProfile | null>(
    null,
  );
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const isSubscribed = profile?.subscription_status === "active";

  useEffect(() => {
    if (!authLoading && !isWhitelabel) {
      navigate("/dashboard");
    }
  }, [isWhitelabel, authLoading, navigate]);

  useEffect(() => {
    if (isWhitelabel && user) {
      fetchData();
    }
  }, [isWhitelabel, user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch only valid artist user accounts under this whitelabel.
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "artist");

      if (roleError) throw roleError;

      const artistUserIds = (roleRows || []).map((row) => row.user_id);
      const { data: profiles, error: profilesError } =
        artistUserIds.length > 0
          ? await supabase
              .from("profiles")
              .select("*")
              .eq("parent_label_id", user.id)
              .eq("status", "active")
              .in("id", artistUserIds)
              .order("created_at", { ascending: false })
          : { data: [], error: null };

      if (profilesError) throw profilesError;

      const artistList = profiles || [];
      setArtists(artistList);

      // Calculate stats
      const withAccess = artistList.filter(
        (a) => a.password_set === true,
      ).length;
      const withoutAccess = artistList.filter(
        (a) => a.password_set !== true,
      ).length;

      // Fetch releases count
      const { count: releasesCount } = await supabase
        .from("releases")
        .select("*", { count: "exact", head: true })
        .eq("label_id", user.id);

      // Fetch royalties
      const { data: royaltiesData } = await supabase
        .from("royalties")
        .select("net_revenue, artist_user_id")
        .eq("label_user_id", user.id);

      const totalRevenue =
        royaltiesData?.reduce(
          (sum, r) => sum + Number(r.net_revenue || 0),
          0,
        ) || 0;

      setStats({
        totalArtists: artistList.length,
        totalReleases: releasesCount || 0,
        totalRevenue,
        artistsWithAccess: withAccess,
        artistsWithoutAccess: withoutAccess,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
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

  const handleEditClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setDeleteDialogOpen(true);
  };

  const handleSetPasswordClick = (artist: ArtistProfile) => {
    if (!isSubscribed) {
      toast({
        title: "Subscription Required",
        description:
          "Anda perlu upgrade subscription untuk mengaktifkan akses login artist",
        variant: "destructive",
      });
      return;
    }
    setSelectedArtist(artist);
    setNewPassword("");
    setSetPasswordDialogOpen(true);
  };

  const handleSetPassword = async () => {
    if (!selectedArtist || !newPassword) return;

    setSettingPassword(true);
    try {
      const { error } = await supabase.functions.invoke("set-artist-password", {
        body: {
          artist_id: selectedArtist.id,
          new_password: newPassword,
        },
      });

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: `Password untuk ${selectedArtist.full_name} berhasil diset. Artist sekarang bisa login.`,
      });

      setSetPasswordDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error("Error setting password:", error);
      toast({
        title: "Error",
        description: error.message || "Gagal set password",
        variant: "destructive",
      });
    } finally {
      setSettingPassword(false);
    }
  };

  const filteredArtists = artists.filter(
    (artist) =>
      artist.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artist.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (!isWhitelabel) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Crown className="h-8 w-8 text-yellow-500" />
              White Label Dashboard
            </h1>
            <p className="text-muted-foreground">
              Kelola artist dan releases di bawah label Anda
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSubscribed ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Subscribed
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />
                Free Plan
              </Badge>
            )}
          </div>
        </div>

        {/* Subscription Notice */}
        {!isSubscribed && (
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-yellow-500/20">
                  <Crown className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Upgrade ke Premium</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dengan subscription aktif, artist di bawah label Anda bisa
                    login ke dashboard untuk melihat analytics dan royalty
                    mereka. Hubungi admin untuk upgrade.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Artists
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalArtists}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Releases
              </CardTitle>
              <Disc3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalReleases}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(stats.totalRevenue)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Artist Access
              </CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div>
                  <div className="text-2xl font-bold">
                    {stats.artistsWithAccess}/{stats.totalArtists}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.artistsWithoutAccess} belum bisa login
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Artists Table */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Artists</CardTitle>
                <CardDescription>
                  {artists.length} total artists
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari artist..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={() => setAddArtistDialogOpen(true)}
                  className="gradient-primary"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Tambah Artist
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredArtists.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada artist</p>
                <p className="text-sm mt-2">
                  Klik "Tambah Artist" untuk menambahkan artist baru
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Akses Login</TableHead>
                      <TableHead>Bergabung</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArtists.map((artist) => (
                      <TableRow key={artist.id}>
                        <TableCell className="font-medium">
                          {artist.full_name}
                        </TableCell>
                        <TableCell>{artist.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadge(artist.status)}
                            className="capitalize"
                          >
                            {artist.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {artist.password_set ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Bisa Login
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Lock className="h-3 w-3 mr-1" />
                              Belum Set
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(artist.created_at).toLocaleDateString(
                            "id-ID",
                          )}
                        </TableCell>
                        <TableCell>
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
                                onClick={() => handleEditClick(artist)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              {!artist.password_set && (
                                <DropdownMenuItem
                                  onClick={() => handleSetPasswordClick(artist)}
                                  disabled={!isSubscribed}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Set Password
                                  {!isSubscribed && (
                                    <Crown className="ml-2 h-3 w-3 text-yellow-500" />
                                  )}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(artist)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Hapus dari Label
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

      {/* Add Artist Dialog - using whitelabel mode */}
      <AddUserDialog
        open={addArtistDialogOpen}
        onOpenChange={setAddArtistDialogOpen}
        onSuccess={fetchData}
        allowedRoles={["artist"]}
        isWhitelabelMode={true}
      />

      <EditArtistDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchData}
      />

      <DeleteArtistDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchData}
      />

      {/* Set Password Dialog */}
      <Dialog
        open={setPasswordDialogOpen}
        onOpenChange={setSetPasswordDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set Password untuk {selectedArtist?.full_name}
            </DialogTitle>
            <DialogDescription>
              Setelah password diset, artist ini akan bisa login ke dashboard
              untuk melihat analytics dan royalty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password Baru</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Masukkan password baru"
              />
              <p className="text-xs text-muted-foreground">
                Minimal 6 karakter
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetPasswordDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleSetPassword}
              disabled={settingPassword || newPassword.length < 6}
            >
              {settingPassword && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
