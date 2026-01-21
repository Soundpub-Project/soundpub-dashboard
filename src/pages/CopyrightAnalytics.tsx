import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { 
  Loader2, 
  DollarSign, 
  Users, 
  Music2, 
  TrendingUp, 
  TrendingDown,
  CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

interface ComposerRoyalty {
  id: string;
  composer_id: string;
  composer_name: string;
  total_net_royalti: number;
  period: string | null;
  created_at: string;
}

interface ComparisonData {
  period: string;
  current: number;
  previous: number;
}

interface TopComposer {
  name: string;
  revenue: number;
  count: number;
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--chart-1))',
  },
  current: {
    label: 'Periode Saat Ini',
    color: 'hsl(var(--chart-1))',
  },
  previous: {
    label: 'Periode Sebelumnya',
    color: 'hsl(var(--chart-2))',
  },
};

export default function CopyrightAnalytics() {
  const navigate = useNavigate();
  const { isAdmin, isCopyright, role } = useAuth();
  const [royalties, setRoyalties] = useState<ComposerRoyalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonType, setComparisonType] = useState<'mom' | 'yoy'>('mom');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: endOfMonth(new Date()),
  });
  const [previousDateRange, setPreviousDateRange] = useState<DateRange | undefined>();

  // Check access
  useEffect(() => {
    if (!isAdmin && !isCopyright) {
      navigate('/dashboard');
    }
  }, [isAdmin, isCopyright, navigate]);

  // Fetch data
  useEffect(() => {
    const fetchRoyalties = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('composer_royalties')
          .select('*')
          .order('period', { ascending: true });

        if (error) throw error;
        setRoyalties(data || []);
      } catch (error) {
        console.error('Error fetching composer royalties:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoyalties();
  }, []);

  // Auto-adjust previous date range based on comparison type
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;

    const monthsDiff = comparisonType === 'mom' ? 1 : 12;
    setPreviousDateRange({
      from: subMonths(dateRange.from, monthsDiff),
      to: subMonths(dateRange.to, monthsDiff),
    });
  }, [dateRange, comparisonType]);

  // Filter by date range
  const filterByDateRange = (data: ComposerRoyalty[], range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return data;
    
    return data.filter(item => {
      if (!item.period) return false;
      try {
        // Handle period format like "2024-01" or "Jan 2024"
        let periodDate: Date;
        if (item.period.match(/^\d{4}-\d{2}$/)) {
          periodDate = parseISO(`${item.period}-01`);
        } else {
          periodDate = new Date(item.period);
        }
        return isWithinInterval(periodDate, { start: range.from!, end: range.to! });
      } catch {
        return false;
      }
    });
  };

  // Memoized calculations
  const currentPeriodData = useMemo(() => 
    filterByDateRange(royalties, dateRange), [royalties, dateRange]);
  
  const previousPeriodData = useMemo(() => 
    filterByDateRange(royalties, previousDateRange), [royalties, previousDateRange]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const currentRevenue = currentPeriodData.reduce((sum, r) => sum + Number(r.total_net_royalti), 0);
    const previousRevenue = previousPeriodData.reduce((sum, r) => sum + Number(r.total_net_royalti), 0);
    
    const currentComposers = new Set(currentPeriodData.map(r => r.composer_id)).size;
    const previousComposers = new Set(previousPeriodData.map(r => r.composer_id)).size;
    
    const currentPeriods = new Set(currentPeriodData.map(r => r.period)).size;
    
    const revenueGrowth = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;
    
    const composerGrowth = previousComposers > 0 
      ? ((currentComposers - previousComposers) / previousComposers) * 100 
      : 0;

    return {
      revenue: currentRevenue,
      previousRevenue,
      revenueGrowth,
      composers: currentComposers,
      previousComposers,
      composerGrowth,
      periods: currentPeriods,
      averagePerComposer: currentComposers > 0 ? currentRevenue / currentComposers : 0,
    };
  }, [currentPeriodData, previousPeriodData]);

  // Comparison chart data
  const comparisonChartData = useMemo(() => {
    const currentByPeriod: Record<string, number> = {};
    const previousByPeriod: Record<string, number> = {};

    currentPeriodData.forEach(r => {
      if (r.period) {
        currentByPeriod[r.period] = (currentByPeriod[r.period] || 0) + Number(r.total_net_royalti);
      }
    });

    previousPeriodData.forEach(r => {
      if (r.period) {
        previousByPeriod[r.period] = (previousByPeriod[r.period] || 0) + Number(r.total_net_royalti);
      }
    });

    const allPeriods = [...new Set([...Object.keys(currentByPeriod), ...Object.keys(previousByPeriod)])].sort();

    return allPeriods.map(period => ({
      period,
      current: currentByPeriod[period] || 0,
      previous: previousByPeriod[period] || 0,
    }));
  }, [currentPeriodData, previousPeriodData]);

  // Top composers
  const topComposers = useMemo(() => {
    const composerMap: Record<string, { revenue: number; count: number }> = {};
    
    currentPeriodData.forEach(r => {
      if (!composerMap[r.composer_name]) {
        composerMap[r.composer_name] = { revenue: 0, count: 0 };
      }
      composerMap[r.composer_name].revenue += Number(r.total_net_royalti);
      composerMap[r.composer_name].count += 1;
    });

    return Object.entries(composerMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [currentPeriodData]);

  // Format helpers
  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1)}M`;
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(1)}Jt`;
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(0)}Rb`;
    return `Rp ${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const formatGrowth = (value: number) => {
    const formatted = Math.abs(value).toFixed(1);
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  };

  const GrowthIndicator = ({ value }: { value: number }) => (
    <div className={`flex items-center gap-1 text-sm ${value >= 0 ? 'text-chart-3' : 'text-destructive'}`}>
      {value >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      <span>{formatGrowth(value)}</span>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Analitik Hak Cipta</h1>
            <p className="text-muted-foreground">Analisis royalti hak cipta dan performa komposer</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Comparison Type */}
            <Select value={comparisonType} onValueChange={(v) => setComparisonType(v as 'mom' | 'yoy')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mom">Bulan ke Bulan</SelectItem>
                <SelectItem value="yoy">Tahun ke Tahun</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'dd MMM yy', { locale: idLocale })} -{' '}
                        {format(dateRange.to, 'dd MMM yy', { locale: idLocale })}
                      </>
                    ) : (
                      format(dateRange.from, 'dd MMM yyyy', { locale: idLocale })
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
                  locale={idLocale}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Royalti</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpis.revenue)}</div>
              <GrowthIndicator value={kpis.revenueGrowth} />
              <p className="text-xs text-muted-foreground mt-1">
                vs {formatCurrency(kpis.previousRevenue)} periode sebelumnya
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Komposer</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(kpis.composers)}</div>
              <GrowthIndicator value={kpis.composerGrowth} />
              <p className="text-xs text-muted-foreground mt-1">
                vs {kpis.previousComposers} periode sebelumnya
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata per Komposer</CardTitle>
              <Music2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(kpis.averagePerComposer)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                dari {kpis.periods} periode
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Record</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(currentPeriodData.length)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                dalam periode terpilih
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Comparison Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Perbandingan Royalti</CardTitle>
              <CardDescription>
                Perbandingan royalti {comparisonType === 'mom' ? 'bulan' : 'tahun'} ke {comparisonType === 'mom' ? 'bulan' : 'tahun'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="period" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="current" name="Periode Saat Ini" fill="hsl(var(--chart-1))" radius={4} />
                    <Bar dataKey="previous" name="Periode Sebelumnya" fill="hsl(var(--chart-2))" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Composers */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Komposer</CardTitle>
            <CardDescription>Komposer dengan royalti tertinggi dalam periode terpilih</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nama Komposer</TableHead>
                  <TableHead className="text-right">Total Royalti</TableHead>
                  <TableHead className="text-right">Jumlah Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topComposers.map((composer, index) => (
                  <TableRow key={composer.name}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>{composer.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(composer.revenue)}</TableCell>
                    <TableCell className="text-right">{composer.count}</TableCell>
                  </TableRow>
                ))}
                {topComposers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Tidak ada data untuk periode ini
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
