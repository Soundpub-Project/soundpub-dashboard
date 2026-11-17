import { formatMoney } from '../finance/index.js';

export type ReleasePricingMode = 'per_track' | 'per_category';
export type ReleaseDistributionService = 'standard' | 'custom_label';
export interface ReleasePriceSnapshot {
  price_per_track_snapshot: string | null;
  total_payment_snapshot: string | null;
  pricing_snapshot_mode: ReleasePricingMode | null;
  pricing_snapshot_track_count: number | null;
}

function configuredPrice(value: string | null | undefined): bigint | null {
  if (!value) return null;
  const match = /^([1-9][0-9]{0,15})(?:\.([0-9]{2}))?$/.exec(value);
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt(match[2] ?? '00');
}

export function calculateReleasePrice(settings: Record<string, string | null>, trackCount: number,
  service: ReleaseDistributionService, releaseType: string): ReleasePriceSnapshot {
  if (trackCount < 1) return { price_per_track_snapshot: null, total_payment_snapshot: null,
    pricing_snapshot_mode: null, pricing_snapshot_track_count: null };
  const customPrice = service === 'custom_label'
    ? Object.hasOwn(settings, 'release_price_custom_label') ? settings.release_price_custom_label : '75000.00'
    : null;
  const customPriceMinor = configuredPrice(customPrice);
  const useCustomPrice = customPriceMinor !== null;
  const categoryMode = settings.release_pricing_mode === 'per_category' && !useCustomPrice;
  let unitMinor: bigint;
  let totalMinor: bigint;
  if (!categoryMode) {
    const price = useCustomPrice ? customPriceMinor : configuredPrice(settings.release_price_per_track ?? '50000.00');
    if (price === null) throw new Error('PAYMENT_PRICE_UNAVAILABLE');
    unitMinor = price;
    totalMinor = unitMinor * BigInt(trackCount);
  } else {
    const type = releaseType.toLowerCase();
    const priceValue = type === 'ep' ? settings.release_price_ep ?? '150000.00'
      : type === 'album' ? settings.release_price_album ?? '300000.00'
        : settings.release_price_single ?? '50000.00';
    const price = configuredPrice(priceValue);
    if (price === null) throw new Error('PAYMENT_PRICE_UNAVAILABLE');
    totalMinor = price;
    unitMinor = (totalMinor + BigInt(trackCount) - 1n) / BigInt(trackCount);
  }
  return { price_per_track_snapshot: formatMoney(unitMinor), total_payment_snapshot: formatMoney(totalMinor),
    pricing_snapshot_mode: categoryMode ? 'per_category' : 'per_track', pricing_snapshot_track_count: trackCount };
}
