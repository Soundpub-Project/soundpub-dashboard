import { useEffect, useState, useMemo } from 'react';
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Disc3, Search, Plus, Loader2, Pencil, Eye, MoreHorizontal, Trash2, Archive, ArchiveRestore, CheckSquare, Beaker, Filter, X } from 'lucide-react';
import { ReleaseFormDialog } from '@/components/releases/ReleaseFormDialog';
import { ArtistReleaseFormDialog } from '@/components/releases/ArtistReleaseFormDialog';
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

interface LabelInfo {
  id: string;
  full_name: string;
}

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: 'all', label: 'Semua' },
];

export default function Releases() {
  const navigate = useNavigate();
  const { isAdmin, isLabel, isArtist, isWhitelabel, loading: authLoading } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [labels, setLabels] = useState<LabelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [artistFormOpen, setArtistFormOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lyricsOnlyMode, setLyricsOnlyMode] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [labelFilter, setLabelFilter] = useState<string>('all');
  const [artistFilter, setArtistFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<string>('10');

  const canManageReleases = isAdmin || isLabel || isWhitelabel;
  const canCreateRelease = isAdmin || isLabel || isArtist || isWhitelabel;

  useEffect(() => {
    fetchReleases();
    fetchLabels();
  }, []);

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

  const fetchLabels = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', releases.map(r => r.label_id));

      if (error) throw error;
      setLabels(data || []);
    } catch (error) {
      console.error('Error fetching labels:', error);
    }
  };

  // Fetch labels when releases are loaded
  useEffect(() => {
    if (releases.length > 0) {
      const labelIds = [...new Set(releases.map(r => r.label_id))];
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', labelIds)
        .then(({ data }) => {
          if (data) setLabels(data);
        });
    }
  }, [releases]);

  const getLabelName = (labelId: string) => {
    const label = labels.find(l => l.id === labelId);
    return label?.full_name || '-';
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

  // Get unique values for filters
  const uniqueStatuses = useMemo(() => {
    return [...new Set(releases.map(r => r.status))].sort();
  }, [releases]);

  const uniqueLabels = useMemo(() => {
    const labelSet = new Map<string, string>();
    releases.forEach(r => {
      const labelName = getLabelName(r.label_id);
      if (labelName !== '-') {
        labelSet.set(r.label_id, labelName);
      }
    });
    return Array.from(labelSet.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [releases, labels]);

  const uniqueArtists = useMemo(() => {
    return [...new Set(releases.map(r => r.artist_name))].sort();
  }, [releases]);

  // Filtered releases
  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      const matchesSearch = 
        release.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        release.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (release.upc && release.upc.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesArchiveFilter = showArchived 
        ? !!release.archived_at 
        : !release.archived_at;

      const matchesStatus = statusFilter === 'all' || release.status === statusFilter;
      const matchesLabel = labelFilter === 'all' || release.label_id === labelFilter;
      const matchesArtist = artistFilter === 'all' || release.artist_name === artistFilter;
      
      return matchesSearch && matchesArchiveFilter && matchesStatus && matchesLabel && matchesArtist;
    });
  }, [releases, searchTerm, showArchived, statusFilter, labelFilter, artistFilter]);

  // Pagination logic
  const paginatedReleases = useMemo(() => {
    if (pageSize === 'all') return filteredReleases;
    const size = parseInt(pageSize);
    const start = (currentPage - 1) * size;
    return filteredReleases.slice(start, start + size);
  }, [filteredReleases, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(filteredReleases.length / parseInt(pageSize));
  }, [filteredReleases.length, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showArchived, statusFilter, labelFilter, artistFilter, pageSize]);

  const hasActiveFilters = statusFilter !== 'all' || labelFilter !== 'all' || artistFilter !== 'all';

  const clearFilters = () => {
    setStatusFilter('all');
    setLabelFilter('all');
    setArtistFilter('all');
  };

  const handleAddRelease = () => {
    setSelectedRelease(null);
    setLyricsOnlyMode(false);
    if (isArtist && !isAdmin && !isLabel && !isWhitelabel) {
      setArtistFormOpen(true);
    } else {
      setFormOpen(true);
    }
  };

  const handleEditRelease = (release: Release) => {
    setSelectedRelease(release);
    if (isWhitelabel && !isAdmin && release.status === 'active') {
      setLyricsOnlyMode(true);
    } else {
      setLyricsOnlyMode(false);
    }
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
    if (selectedIds.length === paginatedReleases.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedReleases.map((r) => r.id));
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
      for (const id of selectedIds) {
        await supabase.from('tracks').delete().eq('release_id', id);
      }

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

  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => setCurrentPage(i)}
            isActive={currentPage === i}
            className="cursor-pointer"
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    return items;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Releases</h1>
            <p className="text-muted-foreground">Kelola album dan single Anda</p>
          </div>
          {!authLoading && canCreateRelease && (
            <div className="flex items-center gap-2">
              {isArtist && !isAdmin && !isLabel && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                  <Beaker className="h-3 w-3 mr-1" />
                  BETA
                </Badge>
              )}
              <Button className="gradient-primary" onClick={handleAddRelease}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Release
              </Button>
            </div>
          )}
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col gap-4">
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

              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    {uniqueStatuses.map((status) => (
                      <SelectItem key={status} value={status} className="capitalize">
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={labelFilter} onValueChange={setLabelFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Label</SelectItem>
                    {uniqueLabels.map((label) => (
                      <SelectItem key={label.id} value={label.id}>
                        {label.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={artistFilter} onValueChange={setArtistFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Artist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Artist</SelectItem>
                    {uniqueArtists.map((artist) => (
                      <SelectItem key={artist} value={artist}>
                        {artist}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 px-2 text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tampilkan:</span>
                  <Select value={pageSize} onValueChange={setPageSize}>
                    <SelectTrigger className="w-[80px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            ) : paginatedReleases.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Disc3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{showArchived ? 'Tidak ada releases diarsipkan' : 'Belum ada releases'}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canManageReleases && (
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                selectedIds.length === paginatedReleases.length &&
                                paginatedReleases.length > 0
                              }
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                        )}
                        <TableHead>Cover</TableHead>
                        <TableHead>Judul</TableHead>
                        <TableHead>Artist</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead>UPC</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Release Date</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReleases.map((release) => (
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
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getLabelName(release.label_id)}
                            </Badge>
                          </TableCell>
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
                                      className="text-destructive"
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {((currentPage - 1) * parseInt(pageSize)) + 1} - {Math.min(currentPage * parseInt(pageSize), filteredReleases.length)} dari {filteredReleases.length}
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {renderPaginationItems()}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <ReleaseFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          release={selectedRelease}
          onSuccess={handleFormSuccess}
          lyricsOnlyMode={lyricsOnlyMode}
        />

        <ArtistReleaseFormDialog
          open={artistFormOpen}
          onOpenChange={setArtistFormOpen}
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
      </div>
    </DashboardLayout>
  );
}
