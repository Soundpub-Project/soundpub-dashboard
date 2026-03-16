import { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { fetchAllRoyalties, type RoyaltyRecord } from '@/lib/fetchAllRoyalties';
import { useRoyaltyStats } from '@/hooks/useRoyaltyData';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  DollarSign,
  Music2,
  Users,
  Disc3,
  Globe,
  BarChart3,
  Search,
  Loader2,
  Download,
  ListMusic,
} from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function AllRoyaltiesContent() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [royalties, setRoyalties] = useState<RoyaltyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedLabel, setSelectedLabel] = useState<string>('all');
  const [selectedArtist, setSelectedArtist] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const { data: quickStats } = useRoyaltyStats();

  useEffect(() => {
    // Only fetch data once auth is ready and user is confirmed
    if (!authLoading && user && isAdmin) {
      loadData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [authLoading, user, isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAllRoyalties();
      setRoyalties(data);
    } catch (error) {
      console.error('Error fetching royalties:', error);
      toast.error('Gagal memuat data royalti');
    } finally {
      setLoading(false);
    }
  };

  // Unique filter options
  const periods = useMemo(() => [...new Set(royalties.map(r => r.period))].sort().reverse(), [royalties]);
  const labels = useMemo(() => [...new Set(royalties.map(r => r.label_name))].sort(), [royalties]);
  const artists = useMemo(() => [...new Set(royalties.filter(r => r.artist).map(r => r.artist!))].sort(), [royalties]);

  // Filtered data
  const filtered = useMemo(() => {
    return royalties.filter(r => {
      if (selectedPeriod !== 'all' && r.period !== selectedPeriod) return false;
      if (selectedLabel !== 'all' && r.label_name !== selectedLabel) return false;
      if (selectedArtist !== 'all' && r.artist !== selectedArtist) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          (r.title?.toLowerCase() || '').includes(s) ||
          (r.artist?.toLowerCase() || '').includes(s) ||
          r.label_name.toLowerCase().includes(s) ||
          r.isrc.toLowerCase().includes(s) ||
          r.platform.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [royalties, selectedPeriod, selectedLabel, selectedArtist, searchTerm]);

  // KPI stats - use quickStats for unfiltered, computed for filtered
  const hasFilters = selectedPeriod !== 'all' || selectedLabel !== 'all' || selectedArtist !== 'all' || searchTerm !== '';
  const stats = useMemo(() => {
    if (!hasFilters && quickStats) return { ...quickStats };
    const totalRevenue = filtered.reduce((s, r) => s + Number(r.net_revenue || 0), 0);
    const totalStreams = filtered.reduce((s, r) => s + Number(r.sales_unit || 0), 0);
    const uniqueArtists = new Set(filtered.filter(r => r.artist).map(r => r.artist!)).size;
    const uniqueLabels = new Set(filtered.map(r => r.label_name)).size;
    const uniqueTracks = new Set(filtered.map(r => r.isrc)).size;
    const uniquePlatforms = new Set(filtered.map(r => r.platform)).size;
    return { totalRevenue, totalStreams, uniqueArtists, uniqueLabels, uniqueTracks, uniquePlatforms };
  }, [filtered, hasFilters, quickStats]);

  // Breakdown: Per Artist
  const artistBreakdown = useMemo(() => {
    const map = new Map<string, { revenue: number; streams: number; tracks: Set<string> }>();
    filtered.forEach(r => {
      if (!r.artist) return;
      const ex = map.get(r.artist) || { revenue: 0, streams: 0, tracks: new Set<string>() };
      ex.revenue += Number(r.net_revenue || 0);
      ex.streams += Number(r.sales_unit || 0);
      ex.tracks.add(r.isrc);
      map.set(r.artist, ex);
    });
    return Array.from(map.entries())
      .map(([artist, d]) => ({ artist, revenue: d.revenue, streams: d.streams, trackCount: d.tracks.size }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  // Breakdown: Per Label
  const labelBreakdown = useMemo(() => {
    const map = new Map<string, { revenue: number; streams: number; artists: Set<string>; tracks: Set<string> }>();
    filtered.forEach(r => {
      const ex = map.get(r.label_name) || { revenue: 0, streams: 0, artists: new Set<string>(), tracks: new Set<string>() };
      ex.revenue += Number(r.net_revenue || 0);
      ex.streams += Number(r.sales_unit || 0);
      if (r.artist) ex.artists.add(r.artist);
      ex.tracks.add(r.isrc);
      map.set(r.label_name, ex);
    });
    return Array.from(map.entries())
      .map(([label, d]) => ({ label, revenue: d.revenue, streams: d.streams, artistCount: d.artists.size, trackCount: d.tracks.size }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  // Breakdown: Per Track
  const trackBreakdown = useMemo(() => {
    const map = new Map<string, { title: string; artist: string; label: string; revenue: number; streams: number; platforms: Set<string> }>();
    filtered.forEach(r => {
      const ex = map.get(r.isrc) || { title: r.title || 'Unknown', artist: r.artist || 'Unknown', label: r.label_name, revenue: 0, streams: 0, platforms: new Set<string>() };
      ex.revenue += Number(r.net_revenue || 0);
      ex.streams += Number(r.sales_unit || 0);
      ex.platforms.add(r.platform);
      map.set(r.isrc, ex);
    });
    return Array.from(map.entries())
      .map(([isrc, d]) => ({ isrc, title: d.title, artist: d.artist, label: d.label, revenue: d.revenue, streams: d.streams, platformCount: d.platforms.size }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginatedData = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [searchTerm, selectedPeriod, selectedLabel, selectedArtist, perPage]);

  const formatCurrency = (v: number) => {
    if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}M`;
    if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(1)}Jt`;
    if (v >= 1e3) return `Rp ${(v / 1e3).toFixed(1)}Rb`;
    return `Rp ${v.toFixed(0)}`;
  };

  const formatNumber = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString('id-ID');
  };

  const exportCSV = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) { toast.error('Tidak ada data'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const v = r[h];
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '');
      }).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export berhasil');
  };

  const exportAllData = () => {
    exportCSV(filtered.map(r => ({
      Period: r.period, ISRC: r.isrc, Title: r.title || '', Artist: r.artist || '',
      Label: r.label_name, Platform: r.platform, Country: r.country,
      Sales_Type: r.sales_type || '', Streams: r.sales_unit, Revenue: Number(r.net_revenue).toFixed(2),
    })), 'all-royalties');
  };

  // Show loading while auth is being determined
  if (authLoading || (loading && !royalties.length)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat data royalti...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <ListMusic className="h-7 w-7 text-primary" />
              Semua Royalti
            </h1>
            <p className="text-muted-foreground">Data lengkap royalti seluruh artis dan label ({royalties.length.toLocaleString()} baris)</p>
          </div>
          <Button onClick={exportAllData} variant="outline" disabled={loading}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" /> Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{formatCurrency(stats.totalRevenue)}</div></CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Music2 className="h-3.5 w-3.5" /> Total Streams
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{formatNumber(stats.totalStreams)}</div></CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Artis
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{stats.uniqueArtists}</div></CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Disc3 className="h-3.5 w-3.5" /> Label
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{stats.uniqueLabels}</div></CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" /> Lagu
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{stats.uniqueTracks}</div></CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" /> Platform
              </CardTitle>
            </CardHeader>
            <CardContent><div className="text-lg font-bold">{stats.uniquePlatforms}</div></CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari ISRC, judul, artis, label..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Periode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Periode</SelectItem>
              {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedLabel} onValueChange={setSelectedLabel}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Label" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Label</SelectItem>
              {labels.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedArtist} onValueChange={setSelectedArtist}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Artis" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Artis</SelectItem>
              {artists.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Memuat seluruh data royalti...</p>
          </div>
        ) : (
          <Tabs defaultValue="detail" className="space-y-4">
            <TabsList>
              <TabsTrigger value="detail">Detail Data</TabsTrigger>
              <TabsTrigger value="artist">Per Artis</TabsTrigger>
              <TabsTrigger value="label">Per Label</TabsTrigger>
              <TabsTrigger value="track">Per Lagu</TabsTrigger>
            </TabsList>

            {/* Detail Tab */}
            <TabsContent value="detail" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{filtered.length.toLocaleString()} baris</p>
                <Select value={String(perPage)} onValueChange={v => setPerPage(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / hal</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>ISRC</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artis</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Negara</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.period}</TableCell>
                        <TableCell className="font-mono text-xs">{r.isrc}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{r.title || '-'}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{r.artist || '-'}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{r.label_name}</TableCell>
                        <TableCell>{r.platform}</TableCell>
                        <TableCell>{r.country}</TableCell>
                        <TableCell>{r.sales_type || '-'}</TableCell>
                        <TableCell className="text-right">{Number(r.sales_unit).toLocaleString('id-ID')}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">Rp {Number(r.net_revenue).toLocaleString('id-ID')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <PaginationItem key={p}>
                          <PaginationLink isActive={p === page} onClick={() => setPage(p)} className="cursor-pointer">{p}</PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext onClick={() => setPage(p => Math.min(totalPages, p + 1))} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </TabsContent>

            {/* Per Artist Tab */}
            <TabsContent value="artist" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{artistBreakdown.length} artis</p>
                <Button size="sm" variant="outline" onClick={() => exportCSV(artistBreakdown.map(a => ({
                  Artis: a.artist, Revenue: a.revenue.toFixed(2), Streams: a.streams, Jumlah_Lagu: a.trackCount,
                })), 'breakdown-artis')}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </div>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Artis</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Jumlah Lagu</TableHead>
                      <TableHead className="text-right">Avg/Stream</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {artistBreakdown.map((a, i) => (
                      <TableRow key={a.artist}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{a.artist}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(a.revenue)}</TableCell>
                        <TableCell className="text-right">{formatNumber(a.streams)}</TableCell>
                        <TableCell className="text-right">{a.trackCount}</TableCell>
                        <TableCell className="text-right">Rp {a.streams > 0 ? (a.revenue / a.streams).toFixed(2) : '0'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Per Label Tab */}
            <TabsContent value="label" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{labelBreakdown.length} label</p>
                <Button size="sm" variant="outline" onClick={() => exportCSV(labelBreakdown.map(l => ({
                  Label: l.label, Revenue: l.revenue.toFixed(2), Streams: l.streams, Artis: l.artistCount, Lagu: l.trackCount,
                })), 'breakdown-label')}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </div>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Artis</TableHead>
                      <TableHead className="text-right">Lagu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {labelBreakdown.map((l, i) => (
                      <TableRow key={l.label}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{l.label}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(l.revenue)}</TableCell>
                        <TableCell className="text-right">{formatNumber(l.streams)}</TableCell>
                        <TableCell className="text-right">{l.artistCount}</TableCell>
                        <TableCell className="text-right">{l.trackCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Per Track Tab */}
            <TabsContent value="track" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{trackBreakdown.length} lagu</p>
                <Button size="sm" variant="outline" onClick={() => exportCSV(trackBreakdown.map(t => ({
                  ISRC: t.isrc, Judul: t.title, Artis: t.artist, Label: t.label,
                  Revenue: t.revenue.toFixed(2), Streams: t.streams, Platform: t.platformCount,
                })), 'breakdown-track')}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </div>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>ISRC</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Artis</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Platform</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trackBreakdown.slice(0, 100).map((t, i) => (
                      <TableRow key={t.isrc}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{t.isrc}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{t.title}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{t.artist}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{t.label}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(t.revenue)}</TableCell>
                        <TableCell className="text-right">{formatNumber(t.streams)}</TableCell>
                        <TableCell className="text-right">{t.platformCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {trackBreakdown.length > 100 && (
                <p className="text-xs text-muted-foreground text-center">Menampilkan 100 dari {trackBreakdown.length} lagu. Gunakan Export CSV untuk data lengkap.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
