import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Building2, Loader2, Pencil, RefreshCw, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { SoundpubApiError } from "@/api/client";
import {
  archiveLabelCustomArtist, createLabelCustomUnit, getLabelCustomUnit, listLabelCustomArtists,
  type LabelCustomArtist, type LabelCustomUnit,
} from "@/services/label-custom";
import { LabelCustomArtistDialog } from "@/components/users/LabelCustomArtistDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LabelCustomAdminOwner { id: string; fullName: string; email: string; status: string }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; owner: LabelCustomAdminOwner | null; canMutate: boolean }

function errorMessage(error: unknown) {
  if (error instanceof SoundpubApiError) {
    if (error.category === "FORBIDDEN" || error.category === "NOT_FOUND")
      return "Data Label Custom tidak ditemukan atau tidak dapat diakses oleh akun ini.";
    if (error.category === "VALIDATION_ERROR" || error.category === "CONFLICT")
      return "Data tidak dapat diproses pada kondisi saat ini. Muat ulang lalu coba lagi.";
    if (error.category === "UNAUTHENTICATED") return "Sesi admin berakhir. Silakan login kembali.";
  }
  return "Data artis belum dapat dimuat. Periksa koneksi lalu coba lagi.";
}

export function LabelCustomArtistsAdminDialog({ open, onOpenChange, owner, canMutate }: Props) {
  const scope = useMemo(() => owner ? { owner_user_id: owner.id } : undefined, [owner]);
  const mounted = useRef(true);
  const mutationPending = useRef(false);
  const [unit, setUnit] = useState<LabelCustomUnit | null>(null);
  const [artists, setArtists] = useState<LabelCustomArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [missingUnit, setMissingUnit] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<LabelCustomArtist | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LabelCustomArtist | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => () => { mounted.current = false; }, []);
  const load = useCallback(async () => {
    if (!open || !owner || !scope) return;
    setLoading(true); setError(""); setMissingUnit(false);
    try {
      const loadedUnit = await getLabelCustomUnit(scope);
      const [active, archived] = await Promise.all([
        listLabelCustomArtists({ status: "active" }, scope),
        listLabelCustomArtists({ status: "archived" }, scope),
      ]);
      if (!mounted.current) return;
      setUnit(loadedUnit); setUnitName(loadedUnit.name); setArtists([...active, ...archived]);
    } catch (loadError) {
      if (!mounted.current) return;
      if (loadError instanceof SoundpubApiError && loadError.category === "NOT_FOUND") {
        setUnit(null); setArtists([]); setUnitName(owner.fullName); setMissingUnit(true);
      } else setError(errorMessage(loadError));
    } finally { if (mounted.current) setLoading(false); }
  }, [open, owner, scope]);

  useEffect(() => {
    if (!open) return;
    mounted.current = true; setSearch(""); setStatus("all"); setEditingArtist(null);
    setArtistDialogOpen(false); setArchiveTarget(null); void load();
  }, [open, load]);

  const visibleArtists = artists.filter(artist => {
    if (status !== "all" && artist.status !== status) return false;
    const query = search.trim().toLocaleLowerCase("id-ID");
    return !query || [artist.name, artist.contact_email, artist.contact_phone]
      .some(value => value.toLocaleLowerCase("id-ID").includes(query));
  });
  const activeCount = artists.filter(artist => artist.status === "active").length;
  const readOnly = !canMutate || owner?.status !== "active" || unit?.status === "archived";

  async function createUnit() {
    if (!scope || creatingUnit || !canMutate) return;
    const name = unitName.trim();
    if (!name) return setError("Nama unit wajib diisi.");
    setCreatingUnit(true); setError("");
    try { await createLabelCustomUnit({ name }, scope); toast.success("Unit Label Custom berhasil dibuat."); await load(); }
    catch (createError) { setError(errorMessage(createError)); }
    finally { if (mounted.current) setCreatingUnit(false); }
  }

  async function archiveArtist() {
    if (!scope || !archiveTarget || mutationPending.current || readOnly) return;
    mutationPending.current = true; setArchiving(true);
    try {
      await archiveLabelCustomArtist(archiveTarget.id, scope);
      toast.success(archiveTarget.name + " berhasil diarsipkan."); setArchiveTarget(null); await load();
    } catch (archiveError) { setError(errorMessage(archiveError)); }
    finally { mutationPending.current = false; if (mounted.current) setArchiving(false); }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={next => {
        if (!mutationPending.current && !creatingUnit) onOpenChange(next);
      }}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b bg-muted/30 px-6 py-5 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />Kelola Artis Label Custom
                </DialogTitle>
                <DialogDescription>{owner?.fullName ?? "Label Custom"} · {owner?.email ?? "-"}</DialogDescription>
              </div>
              {!canMutate && <Badge variant="secondary">Hanya lihat</Badge>}
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(92dvh-105px)]">
            <div className="space-y-6 p-6">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {!canMutate && <Alert><AlertDescription>
                Admin biasa dapat melihat data, tetapi hanya Super Admin yang dapat mengubah owner dengan role Admin/Super Admin.
              </AlertDescription></Alert>}
              {loading ? (
                <div className="flex min-h-56 items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Memuat unit dan artis…
                </div>
              ) : missingUnit ? (
                <section className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-5">
                  <div><h3 className="font-semibold">Unit belum dibuat</h3>
                    <p className="text-sm text-muted-foreground">Buat unit sebelum menambahkan artis.</p></div>
                  <div className="space-y-2"><Label htmlFor="admin-label-custom-unit-name">Nama unit</Label>
                    <Input id="admin-label-custom-unit-name" value={unitName} maxLength={200}
                      disabled={!canMutate || creatingUnit} onChange={event => setUnitName(event.target.value)} /></div>
                  <Button disabled={!canMutate || creatingUnit || !unitName.trim()} onClick={() => void createUnit()}>
                    {creatingUnit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}Buat Unit
                  </Button>
                </section>
              ) : unit ? (
                <>
                  <section className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Unit</p>
                      <p className="mt-2 break-words font-semibold">{unit.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{unit.unit_code}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Artis aktif</p>
                      <p className="mt-2 text-2xl font-bold">{activeCount}</p></div>
                    <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Diarsipkan</p>
                      <p className="mt-2 text-2xl font-bold">{artists.length - activeCount}</p></div>
                  </section>
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-2"><Label htmlFor="admin-label-custom-artist-search">Cari artis</Label>
                          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input id="admin-label-custom-artist-search" className="pl-9" value={search} placeholder="Nama, email, atau telepon"
                              onChange={event => setSearch(event.target.value)} /></div></div>
                        <div className="flex items-end gap-2" aria-label="Filter status artis">
                          {(["all", "active", "archived"] as const).map(value => <Button key={value} size="sm"
                            variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>
                            {value === "all" ? "Semua" : value === "active" ? "Aktif" : "Arsip"}
                          </Button>)}
                        </div>
                      </div>
                      <div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Muat ulang artis" onClick={() => void load()}>
                        <RefreshCw className="h-4 w-4" /></Button>
                        <Button disabled={readOnly} onClick={() => { setEditingArtist(null); setArtistDialogOpen(true); }}>
                          <UserPlus className="mr-2 h-4 w-4" />Tambah Artis</Button></div>
                    </div>
                    {visibleArtists.length === 0 ? (
                      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-muted-foreground">
                        <p>{artists.length ? "Tidak ada artis yang cocok." : "Belum ada artis di unit ini."}</p>
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">{visibleArtists.map(artist => (
                        <article key={artist.id} className="min-w-0 rounded-xl border bg-card p-4">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0">
                            <h3 className="truncate font-semibold" title={artist.name}>{artist.name}</h3>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{artist.contact_email}</p>
                            <p className="truncate text-sm text-muted-foreground">{artist.contact_phone}</p></div>
                            <Badge variant={artist.status === "active" ? "default" : "secondary"}>{artist.status === "active" ? "Aktif" : "Arsip"}</Badge></div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={readOnly || artist.status !== "active"} aria-label={`Edit ${artist.name}`}
                              onClick={() => { setEditingArtist(artist); setArtistDialogOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                            <Button size="sm" variant="outline" disabled={readOnly || artist.status !== "active"} aria-label={`Arsipkan ${artist.name}`}
                              onClick={() => setArchiveTarget(artist)}><Archive className="mr-2 h-4 w-4" />Arsipkan</Button>
                          </div>
                        </article>
                      ))}</div>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {scope && artistDialogOpen && (editingArtist ? (
        <LabelCustomArtistDialog mode="edit" artist={editingArtist} scope={scope} open={artistDialogOpen}
          onOpenChange={setArtistDialogOpen} onSuccess={() => { setArtistDialogOpen(false); void load(); }} />
      ) : (
        <LabelCustomArtistDialog mode="create" scope={scope} open={artistDialogOpen}
          onOpenChange={setArtistDialogOpen} onSuccess={() => { setArtistDialogOpen(false); void load(); }} />
      ))}
      <AlertDialog open={!!archiveTarget} onOpenChange={next => { if (!next && !mutationPending.current) setArchiveTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Arsipkan artis?</AlertDialogTitle>
          <AlertDialogDescription>{archiveTarget?.name} tidak dapat dipakai untuk release baru. Release dan histori royalti tetap dipertahankan.</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={archiving}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={archiving} onClick={event => { event.preventDefault(); void archiveArtist(); }}>
            {archiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Arsipkan
          </AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}