import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Shield, 
  Search, 
  Loader2, 
  DollarSign,
  TrendingUp,
  Calendar,
  Music2,
  FileText,
  Wallet
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface ComposerRoyalty {
  id: string;
  composer_id: string;
  composer_name: string;
  total_net_royalti: number;
  period: string | null;
  upload_id: string | null;
  created_at: string;
}

interface CopyrightStats {
  totalRoyalties: number;
  totalPeriods: number;
  latestPeriod: string | null;
  balance: number;
}

interface MonthlyData {
  period: string;
  amount: number;
}

export default function CopyrightDashboard() {
  const navigate = useNavigate();
  const { user, profile, isCopyright, loading: authLoading } = useAuth();
  const [royalties, setRoyalties] = useState<ComposerRoyalty[]>([]);
  const [stats, setStats] = useState<CopyrightStats>({
    totalRoyalties: 0,
    totalPeriods: 0,
    latestPeriod: null,
    balance: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !isCopyright) {
      navigate('/dashboard');
    }
  }, [isCopyright, authLoading, navigate]);

  useEffect(() => {
    if (isCopyright && user) {
      fetchData();
    }
  }, [isCopyright, user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch composer royalties for this user
      const { data, error } = await supabase
        .from('composer_royalties')
        .select('*')
        .eq('composer_id', user.id)
        .order('period', { ascending: false });

      if (error) throw error;

      const royaltyList = data || [];
      setRoyalties(royaltyList);

      // Calculate stats
      const totalRoyalties = royaltyList.reduce(
        (sum, r) => sum + Number(r.total_net_royalti || 0),
        0
      );

      const periods = [...new Set(royaltyList.map(r => r.period).filter(Boolean))] as string[];
      setAvailablePeriods(periods.sort().reverse());

      // Group by period for chart
      const periodData: Record<string, number> = {};
      royaltyList.forEach((r) => {
        const period = r.period || 'Unknown';
        if (!periodData[period]) {
          periodData[period] = 0;
        }
        periodData[period] += Number(r.total_net_royalti || 0);
      });

      const chartData = Object.entries(periodData)
        .map(([period, amount]) => ({ period, amount }))
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-12); // Last 12 periods

      setMonthlyData(chartData);

      setStats({
        totalRoyalties,
        totalPeriods: periods.length,
        latestPeriod: periods[0] || null,
        balance: profile?.balance || 0,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const filteredRoyalties = royalties.filter((royalty) => {
    const matchesSearch = royalty.composer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (royalty.period || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPeriod = periodFilter === 'all' || royalty.period === periodFilter;
    
    return matchesSearch && matchesPeriod;
  });

  if (!isCopyright) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-500" />
              Copyright Dashboard
            </h1>
            <p className="text-muted-foreground">
              Selamat datang, {profile?.full_name || 'Pencipta'} - Lihat royalty hak cipta Anda
            </p>
          </div>
          <Button onClick={() => navigate('/dashboard/payouts')}>
            <Wallet className="h-4 w-4 mr-2" />
            Request Payout
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Royalti
              </CardTitle>
              <div className="p-2 rounded-full bg-green-500/10">
                <DollarSign className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{formatCurrency(stats.totalRoyalties)}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Saldo Tersedia
              </CardTitle>
              <div className="p-2 rounded-full bg-yellow-500/10">
                <Wallet className="h-4 w-4 text-yellow-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{formatCurrency(stats.balance)}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Jumlah Periode
              </CardTitle>
              <div className="p-2 rounded-full bg-blue-500/10">
                <Calendar className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalPeriods}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Periode Terakhir
              </CardTitle>
              <div className="p-2 rounded-full bg-purple-500/10">
                <TrendingUp className="h-4 w-4 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.latestPeriod || '-'}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Trend Royalti</CardTitle>
            <CardDescription>
              Pendapatan royalti per periode
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data royalti</p>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="period" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Royalti']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorAmount)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Royalties Table */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Detail Royalti
                </CardTitle>
                <CardDescription>{royalties.length} total entri</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter Periode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Periode</SelectItem>
                    {availablePeriods.map((period) => (
                      <SelectItem key={period} value={period}>
                        {period}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredRoyalties.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Music2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data royalti</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Pencipta</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Total Royalti</TableHead>
                      <TableHead>Tanggal Upload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoyalties.map((royalty) => (
                      <TableRow key={royalty.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-full bg-blue-500/10">
                              <Shield className="h-4 w-4 text-blue-500" />
                            </div>
                            {royalty.composer_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{royalty.period || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(Number(royalty.total_net_royalti))}
                        </TableCell>
                        <TableCell>
                          {new Date(royalty.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
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
    </DashboardLayout>
  );
}
