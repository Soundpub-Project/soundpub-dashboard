import { roundRatio } from '../finance/money.js';

export const LEGACY_ROYALTY_POLICY = {
  code: 'SOUNDPUB_LEGACY_70_21_9',
  artistPercent: 70n,
  soundpubPercent: 9n,
  denominator: 100n,
} as const;

export interface RoyaltySplit {
  netMinor: bigint;
  artistMinor: bigint;
  labelMinor: bigint;
  soundpubMinor: bigint;
  policyCode: typeof LEGACY_ROYALTY_POLICY.code;
}

export function splitLegacyRoyalty(netMinor: bigint): RoyaltySplit {
  if (netMinor < 0n) throw new RangeError('Royalty net amount cannot be negative');
  const soundpubMinor = roundRatio(netMinor, LEGACY_ROYALTY_POLICY.soundpubPercent, LEGACY_ROYALTY_POLICY.denominator);
  const artistMinor = roundRatio(netMinor, LEGACY_ROYALTY_POLICY.artistPercent, LEGACY_ROYALTY_POLICY.denominator);
  const labelMinor = netMinor - soundpubMinor - artistMinor;
  return { netMinor, artistMinor, labelMinor, soundpubMinor, policyCode: LEGACY_ROYALTY_POLICY.code };
}

export interface RoyaltyOwnerAllocation {
  ownerId: string;
  amountMinor: bigint;
  components: ('artist' | 'label')[];
}

export function allocateRoyaltyOwners(split: RoyaltySplit, artistOwnerId: string, labelOwnerId: string): RoyaltyOwnerAllocation[] {
  const allocations = new Map<string, RoyaltyOwnerAllocation>();
  const add = (ownerId: string, amountMinor: bigint, component: 'artist' | 'label') => {
    const current = allocations.get(ownerId);
    if (current) {
      current.amountMinor += amountMinor;
      current.components.push(component);
    } else allocations.set(ownerId, { ownerId, amountMinor, components: [component] });
  };
  add(artistOwnerId, split.artistMinor, 'artist');
  add(labelOwnerId, split.labelMinor, 'label');
  return [...allocations.values()];
}
