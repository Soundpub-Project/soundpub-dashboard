import { useQuery } from '@tanstack/react-query';
import { Crown, Disc3, KeyRound, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { labelsApi } from '@/api/labels';
import { SoundpubApiError } from '@/api/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

function formatIdr(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 2,
  }).format(amount) : `IDR ${value}`;
}

function errorMessage(error: unknown) {
  if (error instanceof SoundpubApiError && error.status === 403) return 'Akun ini tidak memiliki akses Whitelabel aktif.';
  return 'Dashboard Whitelabel belum dapat dimuat. Coba lagi.';
}

export function BackendWhitelabelDashboard() {
  const navigate = useNavigate();
  const { user, isWhitelabel } = useAuth();
  const dashboard = useQuery({
    queryKey: ['backend-whitelabel-dashboard', user?.id], enabled: !!user && isWhitelabel,
    queryFn: () => labelsApi.whitelabelDashboard(), retry: false,
  });
  if (!isWhitelabel) return null;
  const data = dashboard.data;
  const subscribed = data?.subscription_status === 'active';
  const cards = [
    { label: 'Total artist', value: data?.total_artists.toLocaleString('id-ID') ?? '—', icon: Users },
    { label: 'Total release', value: data?.total_releases.toLocaleString('id-ID') ?? '—', icon: Disc3 },
    { label: 'Revenue katalog', value: data ? formatIdr(data.total_revenue) : '—', icon: TrendingUp },
    { label: 'Akses login artist', value: data ? `${data.artists_with_access}/${data.total_artists}` : '—', icon: KeyRound,
      note: data ? `${data.artists_without_access} belum aktif` : undefined },
  ];
  return <DashboardLayout><div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><Crown className="h-7 w-7 text-amber-500" />White Label Dashboard</h1><p className="text-muted-foreground">Kelola artist, release, dan pendapatan dalam scope label Anda.</p></div>
      <div className="flex items-center gap-2"><Badge variant={subscribed ? 'default' : 'secondary'}>{subscribed ? 'Subscription aktif' : 'Free plan'}</Badge><Button size="icon" variant="outline" aria-label="Muat ulang dashboard" disabled={dashboard.isFetching} onClick={() => void dashboard.refetch()}><RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} /></Button></div>
    </div>
    {dashboard.isError && <Card className="border-destructive/40"><CardContent className="flex items-center justify-between gap-3 pt-6"><p role="alert" className="text-destructive">{errorMessage(dashboard.error)}</p><Button variant="outline" onClick={() => void dashboard.refetch()}>Coba lagi</Button></CardContent></Card>}
    {!subscribed && data && <Card className="border-amber-500/30 bg-amber-500/10"><CardHeader><CardTitle className="text-base">Akses login artist belum tersedia</CardTitle><CardDescription>Upgrade subscription untuk mengaktifkan password artist. Data artist, release, dan royalti tetap dikelola oleh akun Whitelabel.</CardDescription></CardHeader></Card>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <Card key={card.label}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle><card.icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{dashboard.isLoading ? '…' : card.value}</p>{card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}</CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Operasional Whitelabel</CardTitle><CardDescription>Semua data dibaca dari backend mandiri tanpa fallback Supabase.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Button onClick={() => navigate('/dashboard/my-artists')}>Kelola artist</Button><Button variant="outline" onClick={() => navigate('/dashboard/releases')}>Kelola release</Button><Button variant="outline" onClick={() => navigate('/dashboard/royalties')}>Lihat royalti</Button></CardContent></Card>
  </div></DashboardLayout>;
}
