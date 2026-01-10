import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Search, Loader2, TrendingUp, Globe, Music2, BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface Royalty {
  id: string;
  period: string;
  isrc: string;
  title: string | null;
  artist_name: string;
  platform: string;
  country: string;
  unit_penjualan: number;
  pendapatan_label_artis: number;
  pendapatan_bersih_soundpub: number;
  created_at: string;
}

interface MonthlyData {
  month: string;
  revenue: number;
  streams: number;
}

interface PlatformData {
  name: string;
  revenue: number;
  streams: number;
  fill: string;
}

interface CountryData {
  name: string;
  revenue: number;
  streams: number;
  fill: string;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(142, 76%, 36%)',
  'hsl(262, 83%, 58%)',
  'hsl(24, 95%, 53%)',
  'hsl(346, 77%, 49%)',
  'hsl(199, 89%, 48%)',
];

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--chart-1))',
  },
  streams: {
    label: 'Streams',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

export default function Royalties() {
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalStreams, setTotalStreams] = useState(0);

  useEffect(() => {
    fetchRoyalties();
  }, []);

  const fetchRoyalties = async () => {
    try {
      const { data, error } = await supabase
        .from('royalties')
        .select('*')
        .order('period', { ascending: true });

      if (error) throw error;
      
      setRoyalties(data || []);
      
      const total = data?.reduce((sum, r) => sum + Number(r.pendapatan_label_artis || 0), 0) || 0;
      const streams = data?.reduce((sum, r) => sum + Number(r.unit_penjualan || 0), 0) || 0;
      setTotalRevenue(total);
      setTotalStreams(streams);
    } catch (error) {
      console.error('Error fetching royalties:', error);
    } finally {
      setLoading(false);
    }
  };

  // Process data for monthly trend chart
  const monthlyData = useMemo((): MonthlyData[] => {
    const monthMap = new Map<string, { revenue: number; streams: number }>();
    
    royalties.forEach((r) => {
      const period = r.period; // Format: YYYY-MM or similar
      const existing = monthMap.get(period) || { revenue: 0, streams: 0 };
      monthMap.set(period, {
        revenue: existing.revenue + Number(r.pendapatan_label_artis || 0),
        streams: existing.streams + Number(r.unit_penjualan || 0),
      });
    });

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        streams: data.streams,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [royalties]);

  // Process data for platform breakdown
  const platformData = useMemo((): PlatformData[] => {
    const platformMap = new Map<string, { revenue: number; streams: number }>();
    
    royalties.forEach((r) => {
      const existing = platformMap.get(r.platform) || { revenue: 0, streams: 0 };
      platformMap.set(r.platform, {
        revenue: existing.revenue + Number(r.pendapatan_label_artis || 0),
        streams: existing.streams + Number(r.unit_penjualan || 0),
      });
    });

    return Array.from(platformMap.entries())
      .map(([name, data], index) => ({
        name,
        revenue: data.revenue,
        streams: data.streams,
        fill: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 platforms
  }, [royalties]);

  // Process data for country breakdown
  const countryData = useMemo((): CountryData[] => {
    const countryMap = new Map<string, { revenue: number; streams: number }>();
    
    royalties.forEach((r) => {
      const existing = countryMap.get(r.country) || { revenue: 0, streams: 0 };
      countryMap.set(r.country, {
        revenue: existing.revenue + Number(r.pendapatan_label_artis || 0),
        streams: existing.streams + Number(r.unit_penjualan || 0),
      });
    });

    return Array.from(countryMap.entries())
      .map(([name, data], index) => ({
        name,
        revenue: data.revenue,
        streams: data.streams,
        fill: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 countries
  }, [royalties]);

  const filteredRoyalties = royalties.filter(
    (royalty) =>
      (royalty.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      royalty.artist_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      royalty.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
      royalty.isrc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
      return `Rp ${(value / 1000000000).toFixed(1)}M`;
    }
    if (value >= 1000000) {
      return `Rp ${(value / 1000000).toFixed(1)}Jt`;
    }
    if (value >= 1000) {
      return `Rp ${(value / 1000).toFixed(1)}Rb`;
    }
    return `Rp ${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(1)}B`;
    }
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Royalty Overview</h1>
          <p className="text-muted-foreground">Analisis pendapatan dan statistik streaming</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="gradient-primary text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                Rp {totalRevenue.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Total Streams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalStreams.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Platform
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {platformData.length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Negara
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {countryData.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : royalties.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data royalties</p>
                <p className="text-sm">Upload file CSV royalty untuk melihat analisis</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="charts" className="space-y-6">
            <TabsList>
              <TabsTrigger value="charts">Charts</TabsTrigger>
              <TabsTrigger value="details">Detail Data</TabsTrigger>
            </TabsList>

            <TabsContent value="charts" className="space-y-6">
              {/* Revenue Trend Chart */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Revenue Trend per Bulan
                  </CardTitle>
                  <CardDescription>Perkembangan pendapatan dan streaming dari waktu ke waktu</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          tickFormatter={formatCurrency}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name) => {
                                if (name === 'revenue') {
                                  return [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Revenue'];
                                }
                                return [Number(value).toLocaleString('id-ID'), 'Streams'];
                              }}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--chart-1))"
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Platform and Country Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Platform Breakdown */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Breakdown per Platform
                    </CardTitle>
                    <CardDescription>Top 10 platform berdasarkan revenue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={platformData} 
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                          <XAxis 
                            type="number" 
                            tickFormatter={formatCurrency}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            type="category" 
                            dataKey="name" 
                            width={80}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Revenue']}
                              />
                            }
                          />
                          <Bar 
                            dataKey="revenue" 
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Country Breakdown */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Breakdown per Negara
                    </CardTitle>
                    <CardDescription>Top 10 negara berdasarkan revenue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={countryData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            outerRadius={120}
                            innerRadius={60}
                            paddingAngle={2}
                            dataKey="revenue"
                          >
                            {countryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Revenue']}
                              />
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Top Performers Table */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Platforms Table */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Top Platform</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {platformData.slice(0, 5).map((platform, index) => (
                        <div key={platform.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: platform.fill }}
                            />
                            <span className="font-medium">{platform.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-500">
                              Rp {platform.revenue.toLocaleString('id-ID')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {platform.streams.toLocaleString('id-ID')} streams
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Countries Table */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Top Negara</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {countryData.slice(0, 5).map((country, index) => (
                        <div key={country.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: country.fill }}
                            />
                            <span className="font-medium">{country.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-500">
                              Rp {country.revenue.toLocaleString('id-ID')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {country.streams.toLocaleString('id-ID')} streams
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="details">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle>Detail Royalties</CardTitle>
                      <CardDescription>Rincian pendapatan per track</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cari..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredRoyalties.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Tidak ada hasil untuk "{searchTerm}"</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead>Judul</TableHead>
                            <TableHead>Artist</TableHead>
                            <TableHead>Platform</TableHead>
                            <TableHead>Country</TableHead>
                            <TableHead className="text-right">Streams</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRoyalties.slice(0, 100).map((royalty) => (
                            <TableRow key={royalty.id}>
                              <TableCell className="font-mono text-xs">{royalty.period}</TableCell>
                              <TableCell className="font-medium max-w-[150px] truncate">{royalty.title || '-'}</TableCell>
                              <TableCell>{royalty.artist_name}</TableCell>
                              <TableCell>{royalty.platform}</TableCell>
                              <TableCell>{royalty.country}</TableCell>
                              <TableCell className="text-right">
                                {royalty.unit_penjualan.toLocaleString('id-ID')}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-500">
                                Rp {Number(royalty.pendapatan_label_artis).toLocaleString('id-ID')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {filteredRoyalties.length > 100 && (
                        <p className="text-center text-sm text-muted-foreground mt-4">
                          Menampilkan 100 dari {filteredRoyalties.length} data
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
