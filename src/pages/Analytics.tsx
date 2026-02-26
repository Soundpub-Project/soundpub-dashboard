import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRoyalties } from '@/lib/fetchAllRoyalties';
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
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, subYears } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

interface Royalty {
  id: string;
  period: string;
  isrc: string;
  title: string | null;
  artist: string;
  label_name: string;
  platform: string;
  country: string;
  sales_type: string | null;
  sales_unit: number;
  net_revenue: number;
  created_at: string;
}

interface ComparisonData {
  period: string;
  current: number;
  previous: number;
  currentStreams: number;
  previousStreams: number;
}

interface TopPerformer {
  name: string;
  revenue: number;
  streams: number;
  growth: number;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const chartConfig = {
  current: {
    label: 'Periode Ini',
    color: 'hsl(var(--chart-1))',
  },
  previous: {
    label: 'Periode Sebelumnya',
    color: 'hsl(var(--chart-3))',
  },
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--chart-1))',
  },
  streams: {
    label: 'Streams',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

type ComparisonType = 'mom' | 'yoy' | 'custom';

export default function Analytics() {
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonType, setComparisonType] = useState<ComparisonType>('mom');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [previousDateRange, setPreviousDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: subMonths(new Date(), 6),
  });

  useEffect(() => {
    fetchRoyaltiesData();
  }, []);

  useEffect(() => {
    // Auto-set previous range based on comparison type
    if (comparisonType === 'mom' && dateRange?.from && dateRange?.to) {
      const monthsDiff = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      setPreviousDateRange({
        from: subMonths(dateRange.from, monthsDiff),
        to: subMonths(dateRange.to, monthsDiff),
      });
    } else if (comparisonType === 'yoy' && dateRange?.from && dateRange?.to) {
      setPreviousDateRange({
        from: subYears(dateRange.from, 1),
        to: subYears(dateRange.to, 1),
      });
    }
  }, [comparisonType, dateRange]);

  const fetchRoyaltiesData = async () => {
    try {
      const data = await fetchAllRoyalties();
      setRoyalties(data as unknown as Royalty[]);
    } catch (error) {
      console.error('Error fetching royalties:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter royalties by date range
  const filterByDateRange = (data: Royalty[], range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return data;
    
    return data.filter((r) => {
      try {
        // Period format: YYYY-MM
        const periodDate = parseISO(`${r.period}-01`);
        return isWithinInterval(periodDate, { start: range.from!, end: range.to! });
      } catch {
        return false;
      }
    });
  };

  const currentPeriodData = useMemo(() => filterByDateRange(royalties, dateRange), [royalties, dateRange]);
  const previousPeriodData = useMemo(() => filterByDateRange(royalties, previousDateRange), [royalties, previousDateRange]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const currentRevenue = currentPeriodData.reduce((sum, r) => sum + Number(r.net_revenue || 0), 0);
    const previousRevenue = previousPeriodData.reduce((sum, r) => sum + Number(r.net_revenue || 0), 0);
    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    const currentStreams = currentPeriodData.reduce((sum, r) => sum + Number(r.sales_unit || 0), 0);
    const previousStreams = previousPeriodData.reduce((sum, r) => sum + Number(r.sales_unit || 0), 0);
    const streamsGrowth = previousStreams > 0 ? ((currentStreams - previousStreams) / previousStreams) * 100 : 0;

    const currentPlatforms = new Set(currentPeriodData.map(r => r.platform)).size;
    const previousPlatforms = new Set(previousPeriodData.map(r => r.platform)).size;
    const platformGrowth = previousPlatforms > 0 ? ((currentPlatforms - previousPlatforms) / previousPlatforms) * 100 : 0;

    const currentCountries = new Set(currentPeriodData.map(r => r.country)).size;
    const previousCountries = new Set(previousPeriodData.map(r => r.country)).size;
    const countryGrowth = previousCountries > 0 ? ((currentCountries - previousCountries) / previousCountries) * 100 : 0;

    // Calculate average per stream
    const currentPerStream = currentStreams > 0 ? currentRevenue / currentStreams : 0;
    const previousPerStream = previousStreams > 0 ? previousRevenue / previousStreams : 0;
    const perStreamGrowth = previousPerStream > 0 ? ((currentPerStream - previousPerStream) / previousPerStream) * 100 : 0;

    return {
      revenue: { current: currentRevenue, previous: previousRevenue, growth: revenueGrowth },
      streams: { current: currentStreams, previous: previousStreams, growth: streamsGrowth },
      platforms: { current: currentPlatforms, previous: previousPlatforms, growth: platformGrowth },
      countries: { current: currentCountries, previous: previousCountries, growth: countryGrowth },
      perStream: { current: currentPerStream, previous: previousPerStream, growth: perStreamGrowth },
    };
  }, [currentPeriodData, previousPeriodData]);

  // Comparison chart data
  const comparisonChartData = useMemo((): ComparisonData[] => {
    const currentMonthMap = new Map<string, { revenue: number; streams: number }>();
    const previousMonthMap = new Map<string, { revenue: number; streams: number }>();

    currentPeriodData.forEach((r) => {
      const period = r.period;
      const existing = currentMonthMap.get(period) || { revenue: 0, streams: 0 };
      currentMonthMap.set(period, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    previousPeriodData.forEach((r) => {
      const period = r.period;
      const existing = previousMonthMap.get(period) || { revenue: 0, streams: 0 };
      previousMonthMap.set(period, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    // Merge data for comparison (showing months side by side)
    const allPeriods = new Set([...currentMonthMap.keys(), ...previousMonthMap.keys()]);
    const sortedPeriods = Array.from(allPeriods).sort();

    return sortedPeriods.map((period) => {
      const current = currentMonthMap.get(period) || { revenue: 0, streams: 0 };
      const previous = previousMonthMap.get(period) || { revenue: 0, streams: 0 };
      return {
        period,
        current: current.revenue,
        previous: previous.revenue,
        currentStreams: current.streams,
        previousStreams: previous.streams,
      };
    });
  }, [currentPeriodData, previousPeriodData]);

  // Top performers with growth
  const topReleases = useMemo((): TopPerformer[] => {
    const currentMap = new Map<string, { revenue: number; streams: number }>();
    const previousMap = new Map<string, { revenue: number; streams: number }>();

    currentPeriodData.forEach((r) => {
      const key = r.title || r.isrc;
      const existing = currentMap.get(key) || { revenue: 0, streams: 0 };
      currentMap.set(key, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    previousPeriodData.forEach((r) => {
      const key = r.title || r.isrc;
      const existing = previousMap.get(key) || { revenue: 0, streams: 0 };
      previousMap.set(key, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    return Array.from(currentMap.entries())
      .map(([name, data]) => {
        const prevData = previousMap.get(name) || { revenue: 0, streams: 0 };
        const growth = prevData.revenue > 0 ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : 0;
        return { name, revenue: data.revenue, streams: data.streams, growth };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [currentPeriodData, previousPeriodData]);

  // Top platforms with growth
  const topPlatforms = useMemo((): TopPerformer[] => {
    const currentMap = new Map<string, { revenue: number; streams: number }>();
    const previousMap = new Map<string, { revenue: number; streams: number }>();

    currentPeriodData.forEach((r) => {
      const existing = currentMap.get(r.platform) || { revenue: 0, streams: 0 };
      currentMap.set(r.platform, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    previousPeriodData.forEach((r) => {
      const existing = previousMap.get(r.platform) || { revenue: 0, streams: 0 };
      previousMap.set(r.platform, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    return Array.from(currentMap.entries())
      .map(([name, data]) => {
        const prevData = previousMap.get(name) || { revenue: 0, streams: 0 };
        const growth = prevData.revenue > 0 ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : 0;
        return { name, revenue: data.revenue, streams: data.streams, growth };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [currentPeriodData, previousPeriodData]);

  // Top countries with growth
  const topCountries = useMemo((): TopPerformer[] => {
    const currentMap = new Map<string, { revenue: number; streams: number }>();
    const previousMap = new Map<string, { revenue: number; streams: number }>();

    currentPeriodData.forEach((r) => {
      const existing = currentMap.get(r.country) || { revenue: 0, streams: 0 };
      currentMap.set(r.country, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    previousPeriodData.forEach((r) => {
      const existing = previousMap.get(r.country) || { revenue: 0, streams: 0 };
      previousMap.set(r.country, {
        revenue: existing.revenue + Number(r.net_revenue || 0),
        streams: existing.streams + Number(r.sales_unit || 0),
      });
    });

    return Array.from(currentMap.entries())
      .map(([name, data]) => {
        const prevData = previousMap.get(name) || { revenue: 0, streams: 0 };
        const growth = prevData.revenue > 0 ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : 0;
        return { name, revenue: data.revenue, streams: data.streams, growth };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [currentPeriodData, previousPeriodData]);

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
            {/* Comparison Type */}
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

            {/* Current Period Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'LLL y', { locale: id })} - {format(dateRange.to, 'LLL y', { locale: id })}
                      </>
                    ) : (
                      format(dateRange.from, 'LLL y', { locale: id })
                    )
                  ) : (
                    <span>Pilih periode</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
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
        ) : royalties.length === 0 ? (
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
              {/* Revenue */}
              <Card className="gradient-primary text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(kpis.revenue.current)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.revenue.growth} />
                    <span className="text-xs opacity-80">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              {/* Streams */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Music2 className="h-4 w-4" />
                    Total Streams
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(kpis.streams.current)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.streams.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Per Stream */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Rata-rata/Stream
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(kpis.perStream.current)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.perStream.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              {/* Platforms */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Platform Aktif
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {kpis.platforms.current}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.platforms.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
                </CardContent>
              </Card>

              {/* Countries */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Negara Aktif
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {kpis.countries.current}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GrowthIndicator growth={kpis.countries.growth} />
                    <span className="text-xs text-muted-foreground">vs periode lalu</span>
                  </div>
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
                      <XAxis 
                        dataKey="period" 
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

                  <TabsContent value="releases" className="space-y-4">
                    <div className="grid gap-3">
                      {topReleases.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-muted-foreground w-6">
                              {index + 1}
                            </span>
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
                      {topReleases.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">Tidak ada data</p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="platforms" className="space-y-4">
                    <div className="grid gap-3">
                      {topPlatforms.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-muted-foreground w-6">
                              {index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{item.name}</p>
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
                      {topPlatforms.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">Tidak ada data</p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="countries" className="space-y-4">
                    <div className="grid gap-3">
                      {topCountries.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-muted-foreground w-6">
                              {index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{item.name}</p>
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
                      {topCountries.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">Tidak ada data</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
