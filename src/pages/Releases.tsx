import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Disc3, Search, Plus, Loader2, Pencil, Eye, MoreHorizontal, Trash2, Archive, ArchiveRestore, CheckSquare } from 'lucide-react';
import { ReleaseFormDialog } from '@/components/releases/ReleaseFormDialog';
import { DeleteReleaseDialog } from '@/components/releases/DeleteReleaseDialog';
import { ArchiveReleaseDialog } from '@/components/releases/ArchiveReleaseDialog';
import { toast } from 'sonner';

interface Release {
  id: string;
  upc: string;
  title: string;
  artist_name: string;
  release_date: string | null;
  cover_url: string | null;
  genre: string | null;
  release_type: string;
  status: string;
  created_at: string;
  label_id: string;
  archived_at: string | null;
}

export default function Releases() {
  const navigate = useNavigate();
  const { isAdmin, isLabel, loading: authLoading } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const canManageReleases = isAdmin || isLabel;

  useEffect(() => {
    fetchReleases();
  }, []);

  // Debug log to check role status
  useEffect(() => {
    console.log('Releases page - isAdmin:', isAdmin, 'isLabel:', isLabel, 'authLoading:', authLoading, 'canManageReleases:', canManageReleases);
  }, [isAdmin, isLabel, authLoading, canManageReleases]);

  const fetchReleases = async () => {
    try {
      const { data, error } = await supabase
        .from('releases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReleases(data || []);
    } catch (error) {
      console.error('Error fetching releases:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      pending: 'secondary',
      rejected: 'destructive',
      draft: 'outline',
      inactive: 'outline',
    };
    return variants[status] || 'secondary';
  };

  const filteredReleases = releases.filter((release) => {
    const matchesSearch = 
      release.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      release.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (release.upc && release.upc.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesArchiveFilter = showArchived 
      ? !!release.archived_at 
      : !release.archived_at;
    
    return matchesSearch && matchesArchiveFilter;
  });

  const handleAddRelease = () => {
    setSelectedRelease(null);
    setFormOpen(true);
  };

  const handleEditRelease = (release: Release) => {
    setSelectedRelease(release);
    setFormOpen(true);
  };

  const handleDeleteRelease = (release: Release) => {
    setSelectedRelease(release);
    setDeleteDialogOpen(true);
  };

  const handleArchiveRelease = (release: Release) => {
    setSelectedRelease(release);
    setArchiveDialogOpen(true);
  };

  const handleFormSuccess = () => {
    fetchReleases();
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReleases.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReleases.map((r) => r.id));
    }
  };

  const toggleSelectRelease = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return;

    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from('releases')
        .update({
          archived_at: showArchived ? null : new Date().toISOString(),
          status: showArchived ? 'pending' : 'inactive',
        })
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(
        showArchived
          ? `${selectedIds.length} release berhasil dipulihkan`
          : `${selectedIds.length} release berhasil diarsipkan`
      );
      fetchReleases();
      setSelectedIds([]);
    } catch (error: any) {
      console.error('Error bulk archiving:', error);
      toast.error(error.message || 'Gagal memproses bulk action');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    if (!confirm(`Yakin ingin menghapus ${selectedIds.length} release? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    setBulkLoading(true);
    try {
      // Delete tracks first
      for (const id of selectedIds) {
        await supabase.from('tracks').delete().eq('release_id', id);
      }

      // Then delete releases
      const { error } = await supabase
        .from('releases')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(`${selectedIds.length} release berhasil dihapus`);
      fetchReleases();
      setSelectedIds([]);
    } catch (error: any) {
      console.error('Error bulk deleting:', error);
      toast.error(error.message || 'Gagal menghapus releases');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Releases</h1>
            <p className="text-muted-foreground">Kelola album dan single Anda</p>
          </div>
          {!authLoading && canManageReleases && (
            <Button className="gradient-primary" onClick={handleAddRelease}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Release
            </Button>
          )}
          {authLoading && (
            <div className="h-10 w-32 bg-muted animate-pulse rounded-md" />
          )}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>
                  {showArchived ? 'Releases Diarsipkan' : 'Daftar Releases'}
                </CardTitle>
                <CardDescription>
                  {filteredReleases.length} {showArchived ? 'archived' : 'total'} releases
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showArchived ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setShowArchived(!showArchived);
                    setSelectedIds([]);
                  }}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {showArchived ? 'Lihat Aktif' : 'Lihat Arsip'}
                </Button>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari release..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && canManageReleases && (
              <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-muted/50 border">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedIds.length} release dipilih
                </span>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkArchive}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : showArchived ? (
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                  ) : (
                    <Archive className="h-4 w-4 mr-2" />
                  )}
                  {showArchived ? 'Pulihkan' : 'Arsipkan'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Hapus
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  disabled={bulkLoading}
                >
                  Batal
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredReleases.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Disc3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{showArchived ? 'Tidak ada releases diarsipkan' : 'Belum ada releases'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canManageReleases && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectedIds.length === filteredReleases.length &&
                              filteredReleases.length > 0
                            }
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead>Cover</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Release Date</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReleases.map((release) => (
                      <TableRow key={release.id}>
                        {canManageReleases && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(release.id)}
                              onCheckedChange={() => toggleSelectRelease(release.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                            {release.cover_url ? (
                              <img
                                src={release.cover_url}
                                alt={release.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Disc3 className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {release.title}
                          {release.archived_at && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Archived
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{release.artist_name}</TableCell>
                        <TableCell className="font-mono text-xs">{release.upc || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {release.release_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(release.status)} className="capitalize">
                            {release.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {release.release_date
                            ? new Date(release.release_date).toLocaleDateString('id-ID')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/dashboard/releases/${release.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canManageReleases && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditRelease(release)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleArchiveRelease(release)}>
                                    {release.archived_at ? (
                                      <>
                                        <ArchiveRestore className="h-4 w-4 mr-2" />
                                        Pulihkan
                                      </>
                                    ) : (
                                      <>
                                        <Archive className="h-4 w-4 mr-2" />
                                        Arsipkan
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteRelease(release)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Hapus
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
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

      <ReleaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        release={selectedRelease}
        onSuccess={handleFormSuccess}
      />

      <DeleteReleaseDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        release={selectedRelease}
        onSuccess={handleFormSuccess}
      />

      <ArchiveReleaseDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        release={selectedRelease}
        onSuccess={handleFormSuccess}
      />
    </DashboardLayout>
  );
}
