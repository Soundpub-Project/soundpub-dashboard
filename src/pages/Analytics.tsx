import { useState, useMemo } from 'react';
import {
  useRoyaltyStats,
  useRoyaltyMonthlySummary,
  useRoyaltyComparison,
  useRoyaltyTopPerformers,
} from '@/hooks/useRoyaltyData';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Music2, 
  Globe, 
  BarChart3,
  CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { format, subMonths, subYears, eachMonthOfInterval, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

const chartConfig = {
  current: { label: 'Periode Ini', color: 'hsl(var(--chart-1))' },
  previous: { label: 'Periode Sebelumnya', color: 'hsl(var(--chart-3))' },
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  streams: { label: 'Streams', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

type ComparisonType = 'mom' | 'yoy' | 'custom';

// Generate YYYY-MM period strings from a date range
function getPeriodsFromRange(from: Date, to: Date): string[] {
  const months = eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) });
  return months.map(m => format(m, 'yyyy-MM'));
}

export default function Analytics() {
  const [comparisonType, setComparisonType] = useState<ComparisonType>('mom');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });

  // RPC hooks for quick summary
  const { data: rpcStats, isLoading: statsLoading } = useRoyaltyStats();
  const { data: rpcMonthly = [] } = useRoyaltyMonthlySummary();

  // Compute previous date range
  const previousDateRange = useMemo((): DateRange | undefined => {
    if (!dateRange?.from || !dateRange?.to) return undefined;
    if (comparisonType === 'yoy') {
      return { from: subYears(dateRange.from, 1), to: subYears(dateRange.to, 1) };
    }
    // MoM or custom
    const monthsDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return { from: subMonths(dateRange.from, monthsDiff), to: subMonths(dateRange.to, monthsDiff) };
  }, [comparisonType, dateRange]);

  // Period arrays for RPC
  const currentPeriods = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];
    return getPeriodsFromRange(dateRange.from, dateRange.to);
  }, [dateRange]);

  const previousPeriods = useMemo(() => {
    if (!previousDateRange?.from || !previousDateRange?.to) return [];
    return getPeriodsFromRange(previousDateRange.from, previousDateRange.to);
  }, [previousDateRange]);

  // RPC comparison data
  const { data: comparisonData } = useRoyaltyComparison(currentPeriods, previousPeriods);
  const { data: topReleases = [] } = useRoyaltyTopPerformers(currentPeriods, previousPeriods, 'title', 10);
  const { data: topPlatforms = [] } = useRoyaltyTopPerformers(currentPeriods, previousPeriods, 'platform', 10);
  const { data: topCountries = [] } = useRoyaltyTopPerformers(currentPeriods, previousPeriods, 'country', 10);

  const loading = statsLoading;

  // KPIs from comparison data
  const kpis = useMemo(() => {
    if (!comparisonData) {
      return {
        revenue: { current: 0, previous: 0, growth: 0 },
        streams: { current: 0, previous: 0, growth: 0 },
        platforms: { current: 0, previous: 0, growth: 0 },
        countries: { current: 0, previous: 0, growth: 0 },
        perStream: { current: 0, previous: 0, growth: 0 },
      };
    }
    const { currentMap, previousMap } = comparisonData;
    let currentRevenue = 0, currentStreams = 0, previousRevenue = 0, previousStreams = 0;
    currentMap.forEach(v => { currentRevenue += v.revenue; currentStreams += v.streams; });
    previousMap.forEach(v => { previousRevenue += v.revenue; previousStreams += v.streams; });

    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const streamsGrowth = previousStreams > 0 ? ((currentStreams - previousStreams) / previousStreams) * 100 : 0;
    const currentPerStream = currentStreams > 0 ? currentRevenue / currentStreams : 0;
    const previousPerStream = previousStreams > 0 ? previousRevenue / previousStreams : 0;
    const perStreamGrowth = previousPerStream > 0 ? ((currentPerStream - previousPerStream) / previousPerStream) * 100 : 0;

    return {
      revenue: { current: currentRevenue, previous: previousRevenue, growth: revenueGrowth },
      streams: { current: currentStreams, previous: previousStreams, growth: streamsGrowth },
      platforms: { current: currentMap.size, previous: previousMap.size, growth: 0 },
      countries: { current: 0, previous: 0, growth: 0 },
      perStream: { current: currentPerStream, previous: previousPerStream, growth: perStreamGrowth },
    };
  }, [comparisonData]);

  // Comparison chart data
  const comparisonChartData = useMemo(() => {
    if (!comparisonData) return [];
    const { currentMap, previousMap } = comparisonData;
    const allPeriods = new Set([...currentMap.keys(), ...previousMap.keys()]);
    return Array.from(allPeriods).sort().map(period => {
      const current = currentMap.get(period) || { revenue: 0, streams: 0 };
      const previous = previousMap.get(period) || { revenue: 0, streams: 0 };
      return { period, current: current.revenue, previous: previous.revenue, currentStreams: current.streams, previousStreams: previous.streams };
    });
  }, [comparisonData]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`;
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(1)}Jt`;
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(1)}Rb`;
    return `Rp ${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const formatGrowth = (growth: number) => {
    const icon = growth > 0 ? <ArrowUpRight className="h-3 w-3" /> : growth < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />;
    const color = growth > 0 ? 'text-green-500' : growth < 0 ? 'text-red-500' : 'text-muted-foreground';
    return (
      <span className={cn('flex items-center gap-0.5 text-xs font-medium', color)}>
        {icon}
        {Math.abs(growth).toFixed(1)}%
      </span>
    );
  };

  const GrowthIndicator = ({ growth }: { growth: number }) => {
    const icon = growth > 0 ? <TrendingUp className="h-4 w-4" /> : growth < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />;
    const color = growth > 0 ? 'text-green-500' : growth < 0 ? 'text-red-500' : 'text-muted-foreground';
    const bgColor = growth > 0 ? 'bg-green-500/10' : growth < 0 ? 'bg-red-500/10' : 'bg-muted';
    return (
      <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium', color, bgColor)}>
        {icon}
        {Math.abs(growth).toFixed(1)}%
      </div>
    );
  };

  const hasData = rpcStats && rpcStats.totalRevenue > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Date Range */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Advanced Analytics</h1>
            <p className="text-muted-foreground">Analisis performa dengan perbandingan periode</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Select value={comparisonType} onValueChange={(v) => setComparisonType(v as ComparisonType)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipe Perbandingan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mom">MoM (Bulan)</SelectItem>
                <SelectItem value="yoy">YoY (Tahun)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, 'LLL y', { locale: id })} - {format(dateRange.to, 'LLL y', { locale: id })}</>
                    ) : format(dateRange.from, 'LLL y', { locale: id })
                  ) : <span>Pilih periode</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Period Info Badge */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="default" className="text-xs">
            Periode Ini: {dateRange?.from && dateRange?.to ? `${format(dateRange.from, 'MMM yyyy', { locale: id })} - ${format(dateRange.to, 'MMM yyyy', { locale: id })}` : '-'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Periode Sebelumnya: {previousDateRange?.from && previousDateRange?.to ? `${format(previousDateRange.from, 'MMM yyyy', { locale: id })} - ${format(previousDateRange.to, 'MMM yyyy', { locale: id })}` : '-'}
          </Badge>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasData ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data untuk dianalisis</p>
                <p className="text-sm">Upload file CSV royalty untuk melihat analytics</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="gradient-primary text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(kpis.revenue.current)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.revenue.growth} />
                    <span className="text-xs opacity-80">vs periode lalu</span>
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
                  <div className="text-2xl font-bold">{formatNumber(kpis.streams.current)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.streams.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Rata-rata/Stream
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(kpis.perStream.current)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.perStream.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Platform Aktif
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rpcStats?.uniquePlatforms || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Negara Aktif
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{rpcStats?.uniqueArtists || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Comparison Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Perbandingan Revenue Per Periode
                </CardTitle>
                <CardDescription>
                  {comparisonType === 'mom' ? 'Month over Month' : comparisonType === 'yoy' ? 'Year over Year' : 'Custom Period'} comparison
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={comparisonChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="period" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={formatCurrency} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => {
                              const label = name === 'current' ? 'Periode Ini' : 'Periode Lalu';
                              return [`Rp ${Number(value).toLocaleString('id-ID')}`, label];
                            }}
                          />
                        }
                      />
                      <Legend />
                      <Bar dataKey="previous" name="Periode Lalu" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} opacity={0.5} />
                      <Bar dataKey="current" name="Periode Ini" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Top Performers Tabs */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
                <CardDescription>Performa terbaik dengan pertumbuhan</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="releases" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="releases">Releases</TabsTrigger>
                    <TabsTrigger value="platforms">Platforms</TabsTrigger>
                    <TabsTrigger value="countries">Countries</TabsTrigger>
                  </TabsList>

                  {['releases', 'platforms', 'countries'].map(tab => {
                    const items = tab === 'releases' ? topReleases : tab === 'platforms' ? topPlatforms : topCountries;
                    return (
                      <TabsContent key={tab} value={tab} className="space-y-4">
                        <div className="grid gap-3">
                          {items.map((item, index) => (
                            <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                                <div>
                                  <p className="font-medium truncate max-w-[200px] md:max-w-[300px]">{item.name}</p>
                                  <p className="text-sm text-muted-foreground">{formatNumber(item.streams)} streams</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="font-semibold">{formatCurrency(item.revenue)}</p>
                                </div>
                                {formatGrowth(item.growth)}
                              </div>
                            </div>
                          ))}
                          {items.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">Tidak ada data</p>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
