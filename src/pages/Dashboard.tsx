import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useRoyaltyStats, useRoyaltyMonthlySummary, useRoyaltyPlatformSummary } from '@/hooks/useRoyaltyData';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Disc3, 
  Music, 
  DollarSign, 
  TrendingUp, 
  Loader2, 
  Users, 
  Upload,
  ArrowRight,
  Wallet,
  Clock,
  CheckCircle
} from 'lucide-react';
import { ArtistOnboardingDialog } from '@/components/onboarding/ArtistOnboardingDialog';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

interface DashboardStats {
  totalReleases: number;
  totalTracks: number;
  totalRevenue: number;
  balance: number;
  totalUsers: number;
  pendingPayouts: number;
  totalStreams: number;
  pendingReleases: number;
}

interface RecentRelease {
  id: string;
  title: string;
  artist_name: string;
  cover_url: string | null;
  status: string;
  release_date: string | null;
  release_type: string;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
  streams: number;
}

interface TopPlatform {
  platform: string;
  revenue: number;
  streams: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isAdmin, isLabel, isArtist, isSsoUser, isArtistProfileCompleted, refreshProfile } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalReleases: 0,
    totalTracks: 0,
    totalRevenue: 0,
    balance: 0,
    totalUsers: 0,
    pendingPayouts: 0,
    totalStreams: 0,
    pendingReleases: 0,
  });
  const [recentReleases, setRecentReleases] = useState<RecentRelease[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: royaltyStats, isLoading: royaltyLoading } = useRoyaltyStats();
  const { data: monthlyData } = useRoyaltyMonthlySummary();
  const { data: platformData } = useRoyaltyPlatformSummary(5);

  const monthlyRevenue = (monthlyData || []).slice(-6).map(d => ({ month: d.month, revenue: d.revenue, streams: d.streams }));
  const topPlatforms = (platformData || []).map(d => ({ platform: d.platform, revenue: d.revenue, streams: d.streams }));

  useEffect(() => {
    if (royaltyStats) {
      setStats(prev => ({
        ...prev,
        totalRevenue: royaltyStats.totalRevenue,
        totalStreams: royaltyStats.totalStreams,
      }));
    }
  }, [royaltyStats]);

  useEffect(() => {
    if (profile) {
      fetchBasicStats();
    }
  }, [profile]);

  const fetchBasicStats = async () => {
    try {
      // Fetch counts in parallel - these are fast queries
      const [releasesRes, pendingRes, tracksRes, recentReleasesRes] = await Promise.all([
        supabase.from('releases').select('*', { count: 'exact', head: true }),
        supabase.from('releases').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('tracks').select('*', { count: 'exact', head: true }),
        supabase.from('releases').select('id, title, artist_name, cover_url, status, release_date, release_type').order('created_at', { ascending: false }).limit(5),
      ]);

      // Admin-only stats
      let usersCount = 0;
      let pendingPayoutsCount = 0;

      if (isAdmin) {
        const [userRes, payoutRes] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('payout_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        usersCount = userRes.count || 0;
        pendingPayoutsCount = payoutRes.count || 0;
      }

      setStats(prev => ({
        ...prev,
        totalReleases: releasesRes.count || 0,
        totalTracks: tracksRes.count || 0,
        balance: profile?.balance || 0,
        totalUsers: usersCount,
        pendingPayouts: pendingPayoutsCount,
        pendingReleases: pendingRes.count || 0,
      }));

      setRecentReleases(recentReleasesRes.data || []);
    } catch (error) {
      console.error('Error fetching basic stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Royalty data now comes from React Query hooks above

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

  const getRoleTitle = () => {
    if (isAdmin) return 'Administrator';
    if (isLabel) return 'Label Manager';
    if (isArtist) return 'Artist';
    return 'User';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Selamat Datang, {profile?.full_name || 'User'}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              {getRoleTitle()} Dashboard
            </p>
          </div>
          {(isAdmin || isLabel) && (
            <Button className="gradient-primary" onClick={() => navigate('/dashboard/releases')}>
              <Upload className="h-4 w-4 mr-2" />
              Tambah Release
            </Button>
          )}
        </div>

        {/* SSO Artist Profile Reminder Banner */}
        {isSsoUser && !isArtistProfileCompleted && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-600 dark:text-amber-400">Lengkapi Profil Artis Anda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Anda perlu melengkapi informasi profil artis sebelum dapat menambahkan release baru. Buka halaman <a href="/dashboard/releases" className="underline text-primary hover:text-primary/80">Releases</a> untuk memulai.
              </p>
            </div>
          </div>
        )}

        {/* Main Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Releases
              </CardTitle>
              <div className="p-2 rounded-full bg-primary/10">
                <Disc3 className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalReleases}</div>
                  {stats.pendingReleases > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {stats.pendingReleases} pending
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tracks
              </CardTitle>
              <div className="p-2 rounded-full bg-blue-500/10">
                <Music className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalTracks}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(stats.totalStreams)} total streams
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <div className="p-2 rounded-full bg-green-500/10">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              {royaltyLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats.totalRevenue)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dari semua royalties
                  </p>
                </>
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
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats.balance)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bisa ditarik kapan saja
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Admin Stats */}
        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Users
                </CardTitle>
                <div className="p-2 rounded-full bg-purple-500/10">
                  <Users className="h-4 w-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.totalUsers}</div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/users')}>
                      Kelola
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Payouts
                </CardTitle>
                <div className="p-2 rounded-full bg-orange-500/10">
                  <DollarSign className="h-4 w-4 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.pendingPayouts}</div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/payouts')}>
                      Review
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Chart */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Pendapatan Bulanan</CardTitle>
              <CardDescription>
                Trend pendapatan 6 bulan terakhir
              </CardDescription>
            </CardHeader>
            <CardContent>
              {royaltyLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : monthlyRevenue.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Belum ada data pendapatan</p>
                </div>
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyRevenue}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="month" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => formatNumber(value)}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(var(--primary))" 
                        fillOpacity={1} 
                        fill="url(#colorRevenue)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Platforms */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Top Platform</CardTitle>
              <CardDescription>
                Platform dengan pendapatan tertinggi
              </CardDescription>
            </CardHeader>
            <CardContent>
              {royaltyLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : topPlatforms.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Belum ada data platform</p>
                </div>
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPlatforms} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        type="number"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        tickFormatter={(value) => formatNumber(value)}
                      />
                      <YAxis 
                        type="category"
                        dataKey="platform" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        width={80}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      />
                      <Bar 
                        dataKey="revenue" 
                        fill="hsl(var(--primary))" 
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Releases */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Releases</CardTitle>
              <CardDescription>
                {isAdmin
                  ? 'Semua rilis terbaru'
                  : isLabel
                  ? 'Rilis terbaru dari label Anda'
                  : 'Rilis terbaru Anda'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/releases')}>
              Lihat Semua
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recentReleases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Disc3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada rilis</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentReleases.map((release) => (
                  <div
                    key={release.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/releases/${release.id}`)}
                  >
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {release.cover_url ? (
                        <img
                          src={release.cover_url}
                          alt={release.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Disc3 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{release.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {release.artist_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="capitalize hidden sm:inline-flex">
                        {release.release_type}
                      </Badge>
                      <Badge variant={getStatusBadge(release.status)} className="capitalize">
                        {release.status === 'active' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {release.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
