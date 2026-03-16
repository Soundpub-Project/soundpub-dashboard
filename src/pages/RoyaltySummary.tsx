import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useRoyaltyPeriods,
  useRoyaltyStats,
  useRoyaltyMonthlySummary,
  useRoyaltyPlatformSummary,
  useRoyaltyPeriodSummary,
  useRoyaltyLabelBreakdown,
  useRoyaltyArtistBreakdown,
  useRoyaltyTrackBreakdown,
} from '@/hooks/useRoyaltyData';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  TrendingUp, 
  DollarSign, 
  Music2, 
  Globe, 
  Disc3,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart,
  Area,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(200, 70%, 50%)',
  'hsl(280, 70%, 50%)',
  'hsl(40, 70%, 50%)',
];

export default function RoyaltySummary() {
  const { isArtist } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  // RPC hooks
  const { data: periods = [] } = useRoyaltyPeriods();
  const { data: rpcStats, isLoading: statsLoading } = useRoyaltyStats();
  const { data: rpcMonthly = [] } = useRoyaltyMonthlySummary();
  const { data: periodSummaries = [], isLoading: periodLoading } = useRoyaltyPeriodSummary();
  const { data: rpcPlatforms = [] } = useRoyaltyPlatformSummary(10);

  const filterPeriod = selectedPeriod === 'all' ? null : selectedPeriod;
  const { data: labelBreakdown = [], isLoading: labelLoading } = useRoyaltyLabelBreakdown(filterPeriod);
  const { data: artistBreakdown = [], isLoading: artistLoading } = useRoyaltyArtistBreakdown(filterPeriod, 20);
  const { data: trackBreakdown = [], isLoading: trackLoading } = useRoyaltyTrackBreakdown(filterPeriod);

  const loading = statsLoading && periodLoading;

  // Platform breakdown from RPC (with percentage)
  const platformBreakdown = useMemo(() => {
    const totalRevenue = rpcPlatforms.reduce((sum, p) => sum + p.revenue, 0);
    return rpcPlatforms.map(p => ({
      ...p,
      percentage: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
    }));
  }, [rpcPlatforms]);

  // Stats: use period-filtered data when a period is selected
  const totalStats = useMemo(() => {
    if (selectedPeriod === 'all' && rpcStats) {
      return {
        totalRevenue: rpcStats.totalRevenue,
        totalStreams: rpcStats.totalStreams,
        uniqueTracks: rpcStats.uniqueTracks,
        uniqueArtists: rpcStats.uniqueArtists,
        uniqueLabels: rpcStats.uniqueLabels,
        uniquePlatforms: rpcStats.uniquePlatforms,
      };
    }
    // When period is selected, use the period summary data
    const ps = periodSummaries.find(p => p.period === selectedPeriod);
    if (ps) {
      return {
        totalRevenue: ps.totalRevenue,
        totalStreams: ps.totalStreams,
        uniqueTracks: ps.uniqueTracks,
        uniqueArtists: ps.uniqueArtists,
        uniqueLabels: ps.uniqueLabels,
        uniquePlatforms: 0, // not in period summary
      };
    }
    return { totalRevenue: 0, totalStreams: 0, uniqueTracks: 0, uniqueArtists: 0, uniqueLabels: 0, uniquePlatforms: 0 };
  }, [selectedPeriod, rpcStats, periodSummaries]);

  // Revenue trend chart data from monthly summary
  const revenueTrendData = useMemo(() => {
    return rpcMonthly.map(m => ({
      period: m.period,
      revenue: m.revenue,
      streams: m.streams,
    }));
  }, [rpcMonthly]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`;
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(1)}Jt`;
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(1)}Rb`;
    return `Rp ${value.toLocaleString('id-ID')}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString('id-ID');
  };

  const exportTrackBreakdownCSV = () => {
    if (trackBreakdown.length === 0) {
      toast.error('Tidak ada data untuk diexport');
      return;
    }
    setExporting(true);
    try {
      const headers = ['No','Judul Lagu','ISRC','Label','Revenue (Rp)','Streams','Jumlah Platform','Jumlah Negara','Avg/Stream (Rp)'];
      const csvRows = [
        headers.join(','),
        ...trackBreakdown.map((track, index) => {
          const avgPerStream = track.streams > 0 ? (track.revenue / track.streams).toFixed(2) : '0';
          return [
            index + 1,
            `"${(track.title || 'Unknown').replace(/"/g, '""')}"`,
            track.isrc,
            `"${track.label.replace(/"/g, '""')}"`,
            track.revenue.toFixed(2),
            track.streams,
            track.platformCount,
            track.countryCount,
            avgPerStream,
          ].join(',');
        }),
      ];
      const totalRevenue = trackBreakdown.reduce((sum, t) => sum + t.revenue, 0);
      const totalStreams = trackBreakdown.reduce((sum, t) => sum + t.streams, 0);
      csvRows.push('');
      csvRows.push(`"TOTAL","","","",${totalRevenue.toFixed(2)},${totalStreams},"","",""`);

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const periodSuffix = selectedPeriod === 'all' ? 'all-periods' : selectedPeriod;
      link.setAttribute('href', url);
      link.setAttribute('download', `royalty-per-lagu_${periodSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Berhasil export ${trackBreakdown.length} lagu ke CSV`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Gagal export data');
    } finally {
      setExporting(false);
    }
  };

  const GrowthBadge = ({ growth }: { growth: number }) => {
    const icon = growth > 0 ? <ArrowUpRight className="h-3 w-3" /> : 
                 growth < 0 ? <ArrowDownRight className="h-3 w-3" /> : 
                 <Minus className="h-3 w-3" />;
    const color = growth > 0 ? 'text-green-500 bg-green-500/10' : 
                  growth < 0 ? 'text-red-500 bg-red-500/10' : 
                  'text-muted-foreground bg-muted';
    return (
      <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium', color)}>
        {icon}
        {Math.abs(growth).toFixed(1)}%
      </span>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const hasData = rpcStats && rpcStats.totalRevenue > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Ringkasan Royalti</h1>
            <p className="text-muted-foreground">Analisis royalti per periode dengan breakdown detail</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Periode</SelectItem>
                {periods.map((period) => (
                  <SelectItem key={period} value={period}>{period}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!hasData ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data royalti</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <DollarSign className="h-3.5 w-3.5" />
                    Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-green-500">{formatCurrency(totalStats.totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <Music2 className="h-3.5 w-3.5" />
                    Total Streams
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatNumber(totalStats.totalStreams)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <Disc3 className="h-3.5 w-3.5" />
                    Tracks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{totalStats.uniqueTracks}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Artists
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{totalStats.uniqueArtists}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Labels
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{totalStats.uniqueLabels}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    Platforms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{totalStats.uniquePlatforms || rpcStats?.uniquePlatforms || 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Trend Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Trend Revenue per Periode
                </CardTitle>
                <CardDescription>Perbandingan revenue dan streams antar periode</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrendData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                      <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(value) => formatCurrency(value)} />
                      <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(value) => formatNumber(value)} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(value: number, name: string) => [
                          name === 'revenue' ? formatCurrency(value) : formatNumber(value),
                          name === 'revenue' ? 'Revenue' : 'Streams'
                        ]}
                      />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#colorRevenue)" />
                      <Line yAxisId="right" type="monotone" dataKey="streams" name="Streams" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for different views */}
            <Tabs defaultValue="periods" className="space-y-4">
              <TabsList className="grid w-full lg:w-auto lg:inline-grid grid-cols-3 lg:grid-cols-5">
                <TabsTrigger value="periods">Per Periode</TabsTrigger>
                <TabsTrigger value="platforms">Per Platform</TabsTrigger>
                <TabsTrigger value="tracks">Per Lagu</TabsTrigger>
                {!isArtist && (
                  <>
                    <TabsTrigger value="labels">Per Label</TabsTrigger>
                    <TabsTrigger value="artists">Per Artist</TabsTrigger>
                  </>
                )}
              </TabsList>

              {/* Period Summary Tab */}
              <TabsContent value="periods">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle>Ringkasan per Periode</CardTitle>
                    <CardDescription>Detail performa setiap periode royalti</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {periodLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Periode</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead className="text-right">Streams</TableHead>
                              <TableHead className="text-right">Tracks</TableHead>
                              <TableHead className="text-right">Artists</TableHead>
                              <TableHead>Top Platform</TableHead>
                              <TableHead>Top Country</TableHead>
                              <TableHead className="text-right">Growth</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {periodSummaries.map((summary) => (
                              <TableRow key={summary.period}>
                                <TableCell className="font-mono font-medium">{summary.period}</TableCell>
                                <TableCell className="text-right text-green-500 font-medium">{formatCurrency(summary.totalRevenue)}</TableCell>
                                <TableCell className="text-right">{formatNumber(summary.totalStreams)}</TableCell>
                                <TableCell className="text-right">{summary.uniqueTracks}</TableCell>
                                <TableCell className="text-right">{summary.uniqueArtists}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{summary.topPlatform}</Badge></TableCell>
                                <TableCell><Badge variant="secondary" className="text-xs">{summary.topCountry}</Badge></TableCell>
                                <TableCell className="text-right"><GrowthBadge growth={summary.growth} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Platform Breakdown Tab */}
              <TabsContent value="platforms">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="bg-card/50 border-border/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChartIcon className="h-5 w-5" />
                        Distribusi Revenue per Platform
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={platformBreakdown.slice(0, 8)}
                              dataKey="revenue"
                              nameKey="platform"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              label={({ platform, percentage }) => `${platform} (${percentage.toFixed(1)}%)`}
                              labelLine={false}
                            >
                              {platformBreakdown.slice(0, 8).map((_, index) => (
                                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => formatCurrency(value)}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card/50 border-border/50">
                    <CardHeader>
                      <CardTitle>Detail Platform</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {platformBreakdown.map((p, index) => (
                          <div key={p.platform} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                              <span className="font-medium">{p.platform}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-green-500 font-medium">{formatCurrency(p.revenue)}</p>
                              <p className="text-xs text-muted-foreground">{formatNumber(p.streams)} streams</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Label Breakdown Tab */}
              <TabsContent value="labels">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle>Breakdown per Label dengan Revenue Split</CardTitle>
                    <CardDescription>
                      Sistem Share: 70% Artist, 21% Label, 9% Admin
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {labelLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Label</TableHead>
                              <TableHead className="text-right">Total Revenue</TableHead>
                              <TableHead className="text-right">Streams</TableHead>
                              <TableHead className="text-right">Artist Share</TableHead>
                              <TableHead className="text-right">Label Share</TableHead>
                              <TableHead className="text-right">Admin Share</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {labelBreakdown.map((l) => (
                              <TableRow key={l.label}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{l.label}</span>
                                    {l.label.toLowerCase() === 'soundpub music' && (
                                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary">Soundpub</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-green-500 font-medium">{formatCurrency(l.revenue)}</TableCell>
                                <TableCell className="text-right">{formatNumber(l.streams)}</TableCell>
                                <TableCell className="text-right text-blue-400">{formatCurrency(l.artistRevenue)}</TableCell>
                                <TableCell className="text-right text-purple-400">{formatCurrency(l.labelRevenue)}</TableCell>
                                <TableCell className="text-right text-orange-400">{l.adminRevenue > 0 ? formatCurrency(l.adminRevenue) : '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Artist Breakdown Tab */}
              <TabsContent value="artists">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle>Top 20 Artists dengan Revenue Split</CardTitle>
                    <CardDescription>
                      Artists dengan revenue tertinggi. Soundpub Music: 70% Artist, 30% Label | Label lain: 49% Artist, 21% Label, 30% Admin
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {artistLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>#</TableHead>
                              <TableHead>Artist</TableHead>
                              <TableHead className="text-right">Total Revenue</TableHead>
                              <TableHead className="text-right">Streams</TableHead>
                              <TableHead className="text-right">Tracks</TableHead>
                              <TableHead className="text-right">Artist Share</TableHead>
                              <TableHead className="text-right">Label Share</TableHead>
                              <TableHead className="text-right">Admin Share</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {artistBreakdown.map((a, index) => (
                              <TableRow key={a.artist}>
                                <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{a.artist}</span>
                                    {a.isSoundpubOnly && (
                                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary">Soundpub</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-green-500 font-medium">{formatCurrency(a.revenue)}</TableCell>
                                <TableCell className="text-right">{formatNumber(a.streams)}</TableCell>
                                <TableCell className="text-right">{a.trackCount}</TableCell>
                                <TableCell className="text-right text-blue-400">{formatCurrency(a.artistRevenue)}</TableCell>
                                <TableCell className="text-right text-purple-400">{formatCurrency(a.labelRevenue)}</TableCell>
                                <TableCell className="text-right text-orange-400">{a.adminRevenue > 0 ? formatCurrency(a.adminRevenue) : '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Track Breakdown Tab */}
              <TabsContent value="tracks">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Disc3 className="h-5 w-5 text-primary" />
                        Ringkasan Per Lagu dengan Revenue Split
                      </CardTitle>
                      <CardDescription>
                        Detail performa setiap lagu. Soundpub: 70% Artist, 30% Label | Label lain: 49% Artist, 21% Label, 30% Admin
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportTrackBreakdownCSV}
                      disabled={exporting || trackBreakdown.length === 0}
                      className="shrink-0"
                    >
                      {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {trackLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Judul Lagu</TableHead>
                                <TableHead>Artist</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead className="text-right">Total Revenue</TableHead>
                                <TableHead className="text-right">Streams</TableHead>
                                <TableHead className="text-right">Artist Share</TableHead>
                                <TableHead className="text-right">Label Share</TableHead>
                                <TableHead className="text-right">Admin Share</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {trackBreakdown.map((track, index) => (
                                <TableRow key={track.isrc}>
                                  <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{track.title}</span>
                                      <span className="text-xs text-muted-foreground font-mono">{track.isrc}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>{track.artist}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-xs">{track.label}</Badge>
                                      {track.isSoundpub && (
                                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary">70/30</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-green-500 font-medium">{formatCurrency(track.revenue)}</TableCell>
                                  <TableCell className="text-right">{formatNumber(track.streams)}</TableCell>
                                  <TableCell className="text-right text-blue-400">{formatCurrency(track.artistRevenue)}</TableCell>
                                  <TableCell className="text-right text-purple-400">{formatCurrency(track.labelRevenue)}</TableCell>
                                  <TableCell className="text-right text-orange-400">{track.adminRevenue > 0 ? formatCurrency(track.adminRevenue) : '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {trackBreakdown.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Disc3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Belum ada data lagu untuk periode ini</p>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
