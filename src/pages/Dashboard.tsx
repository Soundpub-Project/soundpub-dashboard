import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Disc3, Music, DollarSign, TrendingUp, Loader2 } from 'lucide-react';

interface DashboardStats {
  totalReleases: number;
  totalTracks: number;
  totalRevenue: number;
  balance: number;
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

export default function Dashboard() {
  const { profile, role, isAdmin, isLabel, isArtist } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalReleases: 0,
    totalTracks: 0,
    totalRevenue: 0,
    balance: 0,
  });
  const [recentReleases, setRecentReleases] = useState<RecentRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      // Fetch releases count
      const { count: releasesCount } = await supabase
        .from('releases')
        .select('*', { count: 'exact', head: true });

      // Fetch tracks count
      const { count: tracksCount } = await supabase
        .from('tracks')
        .select('*', { count: 'exact', head: true });

      // Fetch total revenue from royalties
      const { data: royaltiesData } = await supabase
        .from('royalties')
        .select('artist_revenue');

      const totalRevenue = royaltiesData?.reduce(
        (sum, r) => sum + Number(r.artist_revenue || 0),
        0
      ) || 0;

      setStats({
        totalReleases: releasesCount || 0,
        totalTracks: tracksCount || 0,
        totalRevenue,
        balance: profile?.balance || 0,
      });

      // Fetch recent releases
      const { data: releases } = await supabase
        .from('releases')
        .select('id, title, artist_name, cover_url, status, release_date, release_type')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentReleases(releases || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

  const getRoleTitle = () => {
    if (isAdmin) return 'Administrator';
    if (isLabel) return 'Label Manager';
    if (isArtist) return 'Artist';
    return 'User';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Selamat Datang, {profile?.full_name || 'User'}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {getRoleTitle()} Dashboard
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Releases
              </CardTitle>
              <Disc3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalReleases}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tracks
              </CardTitle>
              <Music className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalTracks}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  Rp {stats.totalRevenue.toLocaleString('id-ID')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Balance
              </CardTitle>
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">
                  Rp {stats.balance.toLocaleString('id-ID')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Releases */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle>Recent Releases</CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Semua rilis terbaru'
                : isLabel
                ? 'Rilis terbaru dari label Anda'
                : 'Rilis terbaru Anda'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recentReleases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Belum ada rilis
              </div>
            ) : (
              <div className="space-y-4">
                {recentReleases.map((release) => (
                  <div
                    key={release.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
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
                      <Badge variant="outline" className="capitalize">
                        {release.release_type}
                      </Badge>
                      <Badge variant={getStatusBadge(release.status)} className="capitalize">
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
