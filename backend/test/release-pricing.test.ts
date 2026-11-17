import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReleasePrice } from '../src/releases/pricing.js';

test('release pricing accepts integer values stored by the legacy Supabase settings', () => {
  assert.deepEqual(calculateReleasePrice({ release_price_per_track: '50000' }, 2, 'standard', 'single'), {
    price_per_track_snapshot: '50000.00', total_payment_snapshot: '100000.00',
    pricing_snapshot_mode: 'per_track', pricing_snapshot_track_count: 2,
  });
  assert.deepEqual(calculateReleasePrice({ release_pricing_mode: 'per_category', release_price_ep: '150000' }, 7,
    'standard', 'ep'), {
    price_per_track_snapshot: '21428.58', total_payment_snapshot: '150000.00',
    pricing_snapshot_mode: 'per_category', pricing_snapshot_track_count: 7,
  });
});

test('integer Custom Label price preserves its per-track override in category mode', () => {
  assert.deepEqual(calculateReleasePrice({ release_pricing_mode: 'per_category', release_price_custom_label: '75000' },
    2, 'custom_label', 'ep'), {
    price_per_track_snapshot: '75000.00', total_payment_snapshot: '150000.00',
    pricing_snapshot_mode: 'per_track', pricing_snapshot_track_count: 2,
  });
});

test('invalid configured prices fail closed', () => {
  assert.throws(() => calculateReleasePrice({ release_price_per_track: '50000.5' }, 1, 'standard', 'single'),
    { message: 'PAYMENT_PRICE_UNAVAILABLE' });
});
