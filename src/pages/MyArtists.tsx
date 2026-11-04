import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { listLabelArtists, usesBackendArtistLabels } from "@/services/labels";
import type { ArtistAccount } from "@/api/artists";
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
  Music,
  Search,
  Loader2,
  UserPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
} from "lucide-react";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { EditArtistDialog } from "@/components/users/EditArtistDialog";
import { DeleteArtistDialog } from "@/components/users/DeleteArtistDialog";
import { ChangePasswordDialog } from "@/components/users/ChangePasswordDialog";
import { LabelAddArtistDialog } from "@/components/users/LabelAddArtistDialog";
import { RequestDeletionDialog } from "@/components/users/RequestDeletionDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LabelCustomArtistDialog } from "@/components/users/LabelCustomArtistDialog";
import { SoundpubApiError } from "@/api/client";
import {
  archiveLabelCustomArtist,
  createLabelCustomUnit,
  getLabelCustomUnit,
  listLabelCustomArtists,
  type LabelCustomArtist,
  type LabelCustomUnit,
} from "@/services/label-custom";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ArtistProfile = ArtistAccount;

export default function MyArtists() {
  const { isLabelCustom, loading, user } = useAuth();
  if (loading) return null;
  if (isLabelCustom) return user ? <LabelCustomMyArtists key={user.id} /> : null;
  return <LegacyMyArtists />;
}

function labelCustomError(error: unknown, fallback: string) {
  if (error instanceof SoundpubApiError) {
    if (error.status === 401) return "Sesi berakhir. Silakan login kembali sebagai PIC Label Custom.";
    if (error.status === 403) return "Anda tidak memiliki izin. Hubungi admin untuk memeriksa akses PIC.";
    if (error.status === 409) return "Status data sudah berubah. Muat ulang daftar sebelum mencoba lagi.";
  }
  return fallback;
}

function LabelCustomMyArtists() {
  const [unit, setUnit] = useState<LabelCustomUnit | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [artists, setArtists] = useState<LabelCustomArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [unitName, setUnitName] = useState("");
  const [setupError, setSetupError] = useState("");
  const [savingUnit, setSavingUnit] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<LabelCustomArtist | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LabelCustomArtist | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const mounted = useRef(true);
  const mutationPending = useRef(false);

  const fetchArtists = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setLoadError("");
    setNeedsSetup(false);
    setArtists([]);
    try {
      let currentUnit: LabelCustomUnit;
      try {
        currentUnit = await getLabelCustomUnit();
      } catch (error) {
        // Only a missing unit offers setup; an artist-list 404 remains an error.
        if (error instanceof SoundpubApiError && error.status === 404) {
          if (current === request.current) {
            setUnit(null);
            setNeedsSetup(true);
          }
          return;
        }
        throw error;
      }
      if (current !== request.current) return;
      setUnit(currentUnit);
      setNeedsSetup(false);
      // Backend defaults to active; request both statuses to keep archives visible.
      const [active, archived] = await Promise.all([
        listLabelCustomArtists({ status: "active" }),
        listLabelCustomArtists({ status: "archived" }),
      ]);
      if (current === request.current) setArtists([...active, ...archived]);
    } catch (error) {
      if (current === request.current) setLoadError(labelCustomError(error,
        "Daftar artis Label Custom belum dapat dimuat. Periksa koneksi lalu coba lagi."));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchArtists();
    return () => { mounted.current = false; request.current += 1; };
  }, [fetchArtists]);

  async function setupUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationPending.current) return;
    const name = unitName.trim();
    if (!name || name.length > 200) {
      setSetupError("Isi nama unit dengan 1–200 karakter.");
      return;
    }
    mutationPending.current = true;
    setSavingUnit(true);
    setSetupError("");
    try {
      await createLabelCustomUnit({ name });
      if (!mounted.current) return;
      setMessage("Unit Label Custom berhasil dibuat.");
      await fetchArtists();
    } catch (error) {
      if (mounted.current) setSetupError(labelCustomError(error,
        "Unit belum dapat dibuat. Periksa nama dan koneksi lalu coba lagi."));
    } finally {
      mutationPending.current = false;
      if (mounted.current) setSavingUnit(false);
    }
  }

  async function archiveArtist() {
    if (!archiveTarget || archiveTarget.status === "archived" || mutationPending.current) return;
    mutationPending.current = true;
    setArchiving(true);
    setArchiveError("");
    try {
      const archived = await archiveLabelCustomArtist(archiveTarget.id);
      if (!mounted.current) return;
      setArtists(current => current.map(artist => artist.id === archived.id ? archived : artist));
      setArchiveTarget(null);
      setMessage("Artis berhasil diarsipkan.");
    } catch (error) {
      if (mounted.current) setArchiveError(labelCustomError(error,
        "Artis belum dapat diarsipkan. Periksa koneksi lalu coba lagi."));
    } finally {
      mutationPending.current = false;
      if (mounted.current) setArchiving(false);
    }
  }

  const search = searchTerm.trim().toLowerCase();
  const filteredArtists = artists.filter(artist =>
    [artist.name, artist.contact_email, artist.contact_phone].some(value => value.toLowerCase().includes(search)));
  const readOnly = unit?.status !== "active";

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold md:text-3xl">My Artists</h1>
          <p className="break-words text-muted-foreground">Kelola artis Label Custom{unit ? ` · ${unit.name}` : ""}.</p>
          <p className="text-sm text-muted-foreground">
            Saldo dan royalti seluruh artis terakumulasi ke PIC Label Custom. Artis tidak bisa login;
            email dan telepon hanya digunakan untuk kontak.
          </p>
          {message && <p role="status" className="text-sm">{message}</p>}
        </div>

        {loadError && (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive p-4">
            <p>{loadError}</p>
            <Button variant="outline" className="min-h-11" disabled={loading || archiving} onClick={() => void fetchArtists()}>Coba lagi</Button>
          </div>
        )}

        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-8">
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin motion-reduce:animate-none" /> Memuat artis…
          </div>
        ) : needsSetup ? (
          <Card>
            <CardHeader>
              <CardTitle>Siapkan Unit Label Custom</CardTitle>
              <CardDescription>Isi nama unit untuk mulai mengelola artis Anda.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={setupUnit} className="max-w-lg space-y-4" aria-busy={savingUnit}>
                <div className="space-y-2">
                  <Label htmlFor="label-custom-unit-name">Nama unit (wajib)</Label>
                  <Input id="label-custom-unit-name" value={unitName} required maxLength={200}
                    className="min-h-11" disabled={savingUnit} aria-invalid={!!setupError}
                    aria-describedby={setupError ? "label-custom-setup-error" : undefined}
                    onChange={event => setUnitName(event.target.value)} />
                </div>
                {setupError && <p id="label-custom-setup-error" role="alert" className="text-sm text-destructive">{setupError}</p>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className="min-h-11" disabled={savingUnit}>
                    {savingUnit ? "Membuat unit…" : "Buat Unit"}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={savingUnit} onClick={() => void fetchArtists()}>Muat ulang</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : !loadError && unit ? (
          <Card className="min-w-0 bg-card/50 border-border/50">
            <CardHeader className="space-y-4">
              <div>
                <CardTitle>Daftar Artis Label Custom</CardTitle>
                <CardDescription>{artists.length} total artis, termasuk arsip.</CardDescription>
                {readOnly && <p role="status" className="mt-2 text-sm text-muted-foreground">Unit diarsipkan. Pengelolaan artis dinonaktifkan. Hubungi admin.</p>}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full space-y-2 sm:max-w-sm">
                  <Label htmlFor="label-custom-artist-search">Cari artis</Label>
                  <Input id="label-custom-artist-search" type="search" placeholder="Nama, email, atau telepon"
                    className="min-h-11" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} />
                </div>
                <Button className="min-h-11 shrink-0" disabled={readOnly || archiving} onClick={() => {
                  setEditingArtist(null);
                  setDialogOpen(true);
                }}><UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />Tambah Artist</Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredArtists.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p>{search ? "Tidak ada artis yang cocok." : "Belum ada artis."}</p>
                  {!search && !readOnly && <p className="mt-2 text-sm">Klik Tambah Artist untuk menambahkan artis baru.</p>}
                </div>
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredArtists.map(artist => (
                    <Card key={artist.id} className="min-w-0">
                      <CardHeader className="space-y-3">
                        <CardTitle className="break-words text-lg">{artist.name}</CardTitle>
                        <Badge className="w-fit" variant={artist.status === "active" ? "default" : "secondary"}>
                          {artist.status === "active" ? "Aktif" : "Diarsipkan"}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <dl className="space-y-2 text-sm">
                          <div><dt className="text-muted-foreground">Email kontak</dt><dd className="break-all">{artist.contact_email}</dd></div>
                          <div><dt className="text-muted-foreground">Telepon kontak</dt><dd className="break-all">{artist.contact_phone}</dd></div>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" className="min-h-11" aria-label={`Edit ${artist.name}`}
                            disabled={readOnly || artist.status === "archived" || archiving}
                            onClick={() => { setEditingArtist(artist); setDialogOpen(true); }}>
                            <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />Edit
                          </Button>
                          <Button variant="outline" className="min-h-11" aria-label={`Arsipkan ${artist.name}`}
                            disabled={readOnly || artist.status === "archived" || archiving}
                            onClick={() => { setArchiveError(""); setArchiveTarget(artist); }}>
                            Arsipkan
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {dialogOpen && !readOnly && (editingArtist ? (
        <LabelCustomArtistDialog mode="edit" artist={editingArtist} open={dialogOpen}
          onOpenChange={setDialogOpen} onSuccess={() => void fetchArtists()} />
      ) : (
        <LabelCustomArtistDialog mode="create" open={dialogOpen}
          onOpenChange={setDialogOpen} onSuccess={() => void fetchArtists()} />
      ))}

      <AlertDialog open={!!archiveTarget} onOpenChange={open => { if (!open && !mutationPending.current) setArchiveTarget(null); }}>
        <AlertDialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Arsipkan Artis?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Arsipkan {archiveTarget?.name}? Artis yang diarsipkan tidak dapat diedit.
              Saldo dan royalti tetap terakumulasi ke PIC Label Custom.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiveError && <p role="alert" className="text-sm text-destructive">{archiveError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={archiving}>Batal</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" disabled={archiving} onClick={event => {
              event.preventDefault();
              void archiveArtist();
            }}>{archiving ? "Mengarsipkan…" : "Arsipkan"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function LegacyMyArtists() {
  const backendArtists = usesBackendArtistLabels();
  const navigate = useNavigate();
  const { user, profile, isLabel, isWhitelabel, loading: authLoading } = useAuth();
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [addArtistDialogOpen, setAddArtistDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestDeletionDialogOpen, setRequestDeletionDialogOpen] =
    useState(false);
  const [labelAddArtistDialogOpen, setLabelAddArtistDialogOpen] =
    useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistProfile | null>(
    null,
  );

  const canAccessMyArtists = isLabel || isWhitelabel;

  useEffect(() => {
    if (!authLoading && !canAccessMyArtists) {
      navigate("/dashboard");
    }
  }, [canAccessMyArtists, authLoading, navigate]);

  useEffect(() => {
    if (canAccessMyArtists && user) {
      fetchArtists();
    }
  }, [canAccessMyArtists, user, profile?.id]);

  const fetchArtists = async () => {
    if (!user) return;

    try {
      setLoadError("");
      setArtists(await listLabelArtists(backendArtists ? profile?.id || user.id : user.id));
    } catch (error) {
      console.error("Error fetching artists:", error);
      if (backendArtists) {
        setArtists([]);
        setLoadError("Daftar artis backend belum dapat dimuat. Coba lagi setelah layanan tersedia.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletionClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setRequestDeletionDialogOpen(true);
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

  const handlePasswordClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setPasswordDialogOpen(true);
  };

  const filteredArtists = artists.filter(
    (artist) =>
      artist.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (artist.email || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!canAccessMyArtists) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">My Artists</h1>
          <p className="text-muted-foreground">
            Kelola artist di bawah label Anda
          </p>
          {loadError && <p role="alert">{loadError} <Button variant="outline" onClick={fetchArtists}>Coba lagi</Button></p>}
        </div>

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
                  onClick={() =>
                    backendArtists || !isLabel
                      ? setAddArtistDialogOpen(true)
                      : setLabelAddArtistDialogOpen(true)
                  }
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
            ) : isLabel ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredArtists.map((artist) => {
                  const artistProfile = artist.artist_profile;
                  const hasSpotify =
                    artistProfile?.social_links?.spotify || false;
                  const hasAppleMusic =
                    artistProfile?.social_links?.apple_music || false;

                  return (
                    <Card
                      key={artist.id}
                      className="overflow-hidden bg-card/50 border border-border/50 flex flex-col justify-between"
                    >
                      <CardHeader className="relative p-6 flex flex-col items-center text-center">
                        <div className="absolute top-4 right-4">
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
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRequestDeletionClick(artist)
                                }
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Minta Penghapusan Profile
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <Avatar className="w-24 h-24 mb-4 border">
                          <AvatarImage
                            src={
                              artist.avatar_url ||
                              artistProfile?.profile_image_url ||
                              undefined
                            }
                            alt={artist.full_name}
                            className="object-cover"
                          />
                          <AvatarFallback className="text-xl">
                            {artist.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-lg font-bold mb-1">
                          {artist.full_name}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                          <Badge
                            variant="outline"
                            className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs py-0 px-2"
                          >
                            Managed
                          </Badge>
                          {hasSpotify && (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs py-0 px-2"
                            >
                              Spotify
                            </Badge>
                          )}
                          {hasAppleMusic && (
                            <Badge
                              variant="outline"
                              className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-xs py-0 px-2"
                            >
                              Apple
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="px-6 pb-6 pt-0 flex flex-col gap-3">
                        <Button
                          onClick={() =>
                            navigate(
                              `/dashboard/releases?artistId=${artist.id}`,
                            )
                          }
                          className="w-full gradient-primary"
                        >
                          <Music className="h-4 w-4 mr-2" />
                          Rilis Musik
                        </Button>
                        <Button
                          variant="link"
                          onClick={() =>
                            navigate(`/dashboard/artist-profile/${artist.id}`)
                          }
                          className="w-full text-sm text-muted-foreground hover:text-primary"
                        >
                          Lihat Profil
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      {!backendArtists && <TableHead>Email</TableHead>}
                      {!backendArtists && <TableHead>Telepon</TableHead>}
                      <TableHead>Status</TableHead>
                      {!backendArtists && <TableHead>Bergabung</TableHead>}
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArtists.map((artist) => (
                      <TableRow key={artist.id}>
                        <TableCell className="font-medium">
                          {artist.full_name}
                        </TableCell>
                        {!backendArtists && <TableCell>{artist.email || "—"}</TableCell>}
                        {!backendArtists && <TableCell>{artist.phone || "-"}</TableCell>}
                        <TableCell>
                          <Badge
                            variant={getStatusBadge(artist.status)}
                            className="capitalize"
                          >
                            {artist.status}
                          </Badge>
                        </TableCell>
                        {!backendArtists && <TableCell>
                          {artist.created_at ? new Date(artist.created_at).toLocaleDateString(
                            "id-ID",
                          ) : "—"}
                        </TableCell>}
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
                              <DropdownMenuItem
                                disabled={backendArtists}
                                onClick={() => handlePasswordClick(artist)}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Ubah Password
                              </DropdownMenuItem>
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

      {(!isLabel || backendArtists) && <AddUserDialog
        open={addArtistDialogOpen}
        onOpenChange={setAddArtistDialogOpen}
        onSuccess={fetchArtists}
        allowedRoles={["artist"]}
        defaultParentLabelId={backendArtists ? profile?.id || user?.id : undefined}
        isWhitelabelMode={backendArtists ? false : isWhitelabel}
      />}

      <LabelAddArtistDialog
        open={labelAddArtistDialogOpen}
        onOpenChange={setLabelAddArtistDialogOpen}
        onSuccess={fetchArtists}
      />

      <RequestDeletionDialog
        open={requestDeletionDialogOpen}
        onOpenChange={setRequestDeletionDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchArtists}
      />

      <EditArtistDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchArtists}
      />

      <DeleteArtistDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchArtists}
      />

      {!backendArtists && <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        user={selectedArtist}
        onSuccess={fetchArtists}
      />}
    </DashboardLayout>
  );
}
