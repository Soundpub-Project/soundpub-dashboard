import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { 
  Loader2, 
  DollarSign, 
  Users, 
  Music2, 
  TrendingUp, 
  TrendingDown,
  Download,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';

interface ComposerRoyalty {
  id: string;
  composer_id: string;
  composer_name: string;
  total_net_royalti: number;
  period: string | null;
  created_at: string;
}

interface PeriodSummary {
  period: string;
  revenue: number;
  composers: number;
  records: number;
  growth: number;
}

interface ComposerBreakdown {
  composer_id: string;
  composer_name: string;
  revenue: number;
  records: number;
  periods: number;
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const chartConfig = {
  revenue: {
    label: 'Royalti',
    color: 'hsl(var(--chart-1))',
  },
};

export default function CopyrightRoyaltySummary() {
  const navigate = useNavigate();
  const { isAdmin, isCopyright, role } = useAuth();
  const [royalties, setRoyalties] = useState<ComposerRoyalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

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

  // Get unique periods
  const periods = useMemo(() => {
    const uniquePeriods = [...new Set(royalties.map(r => r.period).filter(Boolean) as string[])];
    return uniquePeriods.sort((a, b) => a.localeCompare(b));
  }, [royalties]);

  // Filter by selected period
  const filteredRoyalties = useMemo(() => {
    if (selectedPeriod === 'all') return royalties;
    return royalties.filter(r => r.period === selectedPeriod);
  }, [royalties, selectedPeriod]);

  // Period summaries
  const periodSummaries = useMemo(() => {
    const summaryMap: Record<string, { revenue: number; composers: Set<string>; records: number }> = {};
    
    royalties.forEach(r => {
      const period = r.period || 'Unknown';
      if (!summaryMap[period]) {
        summaryMap[period] = { revenue: 0, composers: new Set(), records: 0 };
      }
      summaryMap[period].revenue += Number(r.total_net_royalti);
      summaryMap[period].composers.add(r.composer_id);
      summaryMap[period].records += 1;
    });

    const sortedPeriods = Object.keys(summaryMap).sort();
    let previousRevenue = 0;

    return sortedPeriods.map(period => {
      const summary = summaryMap[period];
      const growth = previousRevenue > 0 
        ? ((summary.revenue - previousRevenue) / previousRevenue) * 100 
        : 0;
      previousRevenue = summary.revenue;

      return {
        period,
        revenue: summary.revenue,
        composers: summary.composers.size,
        records: summary.records,
        growth,
      };
    });
  }, [royalties]);

  // Composer breakdown
  const composerBreakdown = useMemo(() => {
    const composerMap: Record<string, { name: string; revenue: number; records: number; periods: Set<string> }> = {};
    
    filteredRoyalties.forEach(r => {
      if (!composerMap[r.composer_id]) {
        composerMap[r.composer_id] = { name: r.composer_name, revenue: 0, records: 0, periods: new Set() };
      }
      composerMap[r.composer_id].revenue += Number(r.total_net_royalti);
      composerMap[r.composer_id].records += 1;
      if (r.period) composerMap[r.composer_id].periods.add(r.period);
    });

    return Object.entries(composerMap)
      .map(([id, data]) => ({
        composer_id: id,
        composer_name: data.name,
        revenue: data.revenue,
        records: data.records,
        periods: data.periods.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredRoyalties]);

  // Total stats
  const totalStats = useMemo(() => {
    const revenue = filteredRoyalties.reduce((sum, r) => sum + Number(r.total_net_royalti), 0);
    const composers = new Set(filteredRoyalties.map(r => r.composer_id)).size;
    const periodsCount = new Set(filteredRoyalties.map(r => r.period).filter(Boolean)).size;
    
    return { revenue, composers, records: filteredRoyalties.length, periods: periodsCount };
  }, [filteredRoyalties]);

  // Format helpers
  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `Rp ${(value / 1000000000).toFixed(2)}M`;
    if (value >= 1000000) return `Rp ${(value / 1000000).toFixed(2)}Jt`;
    if (value >= 1000) return `Rp ${(value / 1000).toFixed(0)}Rb`;
    return `Rp ${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  // Growth badge
  const GrowthBadge = ({ growth }: { growth: number }) => {
    if (growth === 0) return null;
    const isPositive = growth > 0;
    return (
      <Badge variant={isPositive ? 'default' : 'destructive'} className="ml-2">
        {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
        {Math.abs(growth).toFixed(1)}%
      </Badge>
    );
  };

  // Export CSV for composer breakdown
  const exportComposerBreakdownCSV = () => {
    setExporting(true);
    try {
      const headers = ['No', 'ID Komposer', 'Nama Komposer', 'Total Royalti', 'Jumlah Record', 'Jumlah Periode'];
      const rows = composerBreakdown.map((c, index) => [
        index + 1,
        c.composer_id,
        `"${c.composer_name.replace(/"/g, '""')}"`,
        c.revenue,
        c.records,
        c.periods,
      ]);

      // Add summary row
      rows.push([]);
      rows.push(['', 'TOTAL', '', totalStats.revenue, totalStats.records, totalStats.periods]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `royalti-hak-cipta-${selectedPeriod === 'all' ? 'semua-periode' : selectedPeriod}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Export CSV berhasil', {
        description: `${composerBreakdown.length} data komposer berhasil diekspor`,
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Gagal mengekspor CSV');
    } finally {
      setExporting(false);
    }
  };

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
            <h1 className="text-2xl font-bold">Ringkasan Royalti Hak Cipta</h1>
            <p className="text-muted-foreground">Ringkasan royalti untuk komposer dan pencipta lagu</p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[180px]">
                <CalendarDays className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Periode</SelectItem>
                {periods.map(period => (
                  <SelectItem key={period} value={period}>{period}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Royalti</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalStats.revenue)}</div>
              <p className="text-xs text-muted-foreground">
                {selectedPeriod === 'all' ? 'Semua periode' : `Periode ${selectedPeriod}`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Komposer</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(totalStats.composers)}</div>
              <p className="text-xs text-muted-foreground">komposer aktif</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Record</CardTitle>
              <Music2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(totalStats.records)}</div>
              <p className="text-xs text-muted-foreground">data royalti</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata per Komposer</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalStats.composers > 0 ? totalStats.revenue / totalStats.composers : 0)}
              </div>
              <p className="text-xs text-muted-foreground">per komposer</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="period" className="space-y-4">
          <TabsList>
            <TabsTrigger value="period">Per Periode</TabsTrigger>
            <TabsTrigger value="composer">Per Komposer</TabsTrigger>
          </TabsList>

          {/* Per Period Tab */}
          <TabsContent value="period" className="space-y-4">
            {/* Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Trend Royalti per Periode</CardTitle>
                <CardDescription>Perkembangan royalti hak cipta dari waktu ke waktu</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={periodSummaries}>
                      <defs>
                        <linearGradient id="colorRevenueCopyright" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
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
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(var(--chart-1))" 
                        fill="url(#colorRevenueCopyright)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Period Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detail per Periode</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Total Royalti</TableHead>
                      <TableHead className="text-right">Komposer</TableHead>
                      <TableHead className="text-right">Record</TableHead>
                      <TableHead className="text-right">Growth</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodSummaries.map((summary) => (
                      <TableRow key={summary.period}>
                        <TableCell className="font-medium">{summary.period}</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.revenue)}</TableCell>
                        <TableCell className="text-right">{summary.composers}</TableCell>
                        <TableCell className="text-right">{summary.records}</TableCell>
                        <TableCell className="text-right">
                          <GrowthBadge growth={summary.growth} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {periodSummaries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Tidak ada data
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Per Composer Tab */}
          <TabsContent value="composer" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Detail per Komposer</CardTitle>
                  <CardDescription>
                    {composerBreakdown.length} komposer • {selectedPeriod === 'all' ? 'Semua periode' : `Periode ${selectedPeriod}`}
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportComposerBreakdownCSV}
                  disabled={exporting || composerBreakdown.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Mengekspor...' : 'Export CSV'}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>ID Komposer</TableHead>
                      <TableHead>Nama Komposer</TableHead>
                      <TableHead className="text-right">Total Royalti</TableHead>
                      <TableHead className="text-right">Record</TableHead>
                      <TableHead className="text-right">Periode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {composerBreakdown.map((composer, index) => (
                      <TableRow key={composer.composer_id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{composer.composer_id}</TableCell>
                        <TableCell>{composer.composer_name}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(composer.revenue)}</TableCell>
                        <TableCell className="text-right">{composer.records}</TableCell>
                        <TableCell className="text-right">{composer.periods}</TableCell>
                      </TableRow>
                    ))}
                    {composerBreakdown.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Tidak ada data untuk periode ini
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
