import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function useRoyaltyStats() {
  return useQuery({
    queryKey: ['royalty-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_stats');
      if (error) throw error;
      if (!data?.[0]) return null;
      const s = data[0];
      return {
        totalRevenue: Number(s.total_revenue || 0),
        totalStreams: Number(s.total_streams || 0),
        uniqueArtists: Number(s.unique_artists || 0),
        uniqueLabels: Number(s.unique_labels || 0),
        uniquePlatforms: Number(s.unique_platforms || 0),
        uniqueTracks: Number(s.unique_tracks || 0),
      };
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyMonthlySummary() {
  return useQuery({
    queryKey: ['royalty-monthly-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_monthly_summary');
      if (error) throw error;
      return (data || []).map((d: any) => ({
        month: d.period,
        period: d.period,
        revenue: Number(d.revenue),
        streams: Number(d.streams),
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyPlatformSummary(limit: number = 10) {
  return useQuery({
    queryKey: ['royalty-platform-summary', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_platform_summary', { _limit: limit });
      if (error) throw error;
      return (data || []).map((d: any, i: number) => ({
        name: d.platform,
        platform: d.platform,
        revenue: Number(d.revenue),
        streams: Number(d.streams),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyCountrySummary(limit: number = 10) {
  return useQuery({
    queryKey: ['royalty-country-summary', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_country_summary', { _limit: limit });
      if (error) throw error;
      return (data || []).map((d: any, i: number) => ({
        name: d.country,
        revenue: Number(d.revenue),
        streams: Number(d.streams),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyPeriods() {
  return useQuery({
    queryKey: ['royalty-periods'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_periods');
      if (error) throw error;
      return (data || []).map((d: any) => d.period as string);
    },
    staleTime: STALE_TIME,
  });
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
