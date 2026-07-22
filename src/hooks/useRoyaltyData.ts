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

// --- New RPC hooks ---

export function useRoyaltyPeriodSummary() {
  return useQuery({
    queryKey: ['royalty-period-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_period_summary' as any);
      if (error) throw error;
      return (data || []).map((d: any) => ({
        period: d.period as string,
        totalRevenue: Number(d.revenue || 0),
        totalStreams: Number(d.streams || 0),
        uniqueTracks: Number(d.unique_tracks || 0),
        uniqueArtists: Number(d.unique_artists || 0),
        uniqueLabels: Number(d.unique_labels || 0),
        topPlatform: (d.top_platform || '-') as string,
        topCountry: (d.top_country || '-') as string,
        growth: Number(d.growth || 0),
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyLabelBreakdown(period: string | null) {
  return useQuery({
    queryKey: ['royalty-label-breakdown', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_label_breakdown' as any, {
        _period: period,
      });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        label: d.label_name as string,
        revenue: Number(d.revenue || 0),
        streams: Number(d.streams || 0),
        artistRevenue: Number(d.artist_share || 0),
        labelRevenue: Number(d.label_share || 0),
        adminRevenue: Number(d.admin_share || 0),
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyArtistBreakdown(period: string | null, limit: number = 20) {
  return useQuery({
    queryKey: ['royalty-artist-breakdown', period, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_artist_breakdown' as any, {
        _period: period,
        _limit: limit,
      });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        artist: d.artist_name as string,
        revenue: Number(d.revenue || 0),
        streams: Number(d.streams || 0),
        trackCount: Number(d.track_count || 0),
        isSoundpubOnly: Boolean(d.is_soundpub),
        artistRevenue: Number(d.artist_share || 0),
        labelRevenue: Number(d.label_share || 0),
        adminRevenue: Number(d.admin_share || 0),
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyTrackBreakdown(period: string | null) {
  return useQuery({
    queryKey: ['royalty-track-breakdown', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_track_breakdown' as any, {
        _period: period,
      });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        isrc: d.isrc as string,
        title: (d.title || 'Unknown') as string,
        artist: (d.artist_name || 'Unknown') as string,
        label: (d.label || '') as string,
        revenue: Number(d.revenue || 0),
        streams: Number(d.streams || 0),
        platformCount: Number(d.platform_count || 0),
        countryCount: Number(d.country_count || 0),
        isSoundpub: Boolean(d.is_soundpub),
        artistRevenue: Number(d.artist_share || 0),
        labelRevenue: Number(d.label_share || 0),
        adminRevenue: Number(d.admin_share || 0),
      }));
    },
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyComparison(currentPeriods: string[], previousPeriods: string[]) {
  return useQuery({
    queryKey: ['royalty-comparison', currentPeriods, previousPeriods],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_comparison' as any, {
        _current_periods: currentPeriods,
        _previous_periods: previousPeriods,
      });
      if (error) throw error;
      const currentMap = new Map<string, { revenue: number; streams: number }>();
      const previousMap = new Map<string, { revenue: number; streams: number }>();
      (data || []).forEach((d: any) => {
        const map = d.data_type === 'current' ? currentMap : previousMap;
        map.set(d.period, { revenue: Number(d.revenue || 0), streams: Number(d.streams || 0) });
      });
      return { currentMap, previousMap };
    },
    enabled: currentPeriods.length > 0 || previousPeriods.length > 0,
    staleTime: STALE_TIME,
  });
}

export function useRoyaltyTopPerformers(
  currentPeriods: string[],
  previousPeriods: string[],
  groupBy: 'title' | 'platform' | 'country',
  limit: number = 10
) {
  return useQuery({
    queryKey: ['royalty-top-performers', currentPeriods, previousPeriods, groupBy, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_royalty_top_performers' as any, {
        _current_periods: currentPeriods,
        _previous_periods: previousPeriods,
        _group_by: groupBy,
        _limit: limit,
      });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        name: d.name as string,
        revenue: Number(d.revenue || 0),
        streams: Number(d.streams || 0),
        growth: Number(d.growth || 0),
      }));
    },
    enabled: currentPeriods.length > 0,
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
