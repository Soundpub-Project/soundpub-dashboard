import { supabase } from '@/integrations/supabase/client';

export interface RoyaltyRecord {
  id: string;
  period: string;
  isrc: string;
  title: string | null;
  artist: string | null;
  label_name: string;
  platform: string;
  country: string;
  sales_type: string | null;
  sales_unit: number;
  net_revenue: number;
  created_at: string | null;
  upc: string;
  upload_id: string;
  artist_user_id: string | null;
}

export async function fetchAllRoyalties(selectColumns?: string): Promise<RoyaltyRecord[]> {
  const allData: RoyaltyRecord[] = [];
  const BATCH_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('royalties')
      .select(selectColumns || '*')
      .order('period', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (data) allData.push(...(data as unknown as RoyaltyRecord[]));
    hasMore = (data?.length || 0) === BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  return allData;
}
