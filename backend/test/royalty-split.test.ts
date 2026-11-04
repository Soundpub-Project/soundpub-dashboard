import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateRoyaltyOwners, splitLegacyRoyalty } from '../src/royalties/split.js';

test('legacy royalty split matches production row rounding and remainder rules', () => {
  assert.deepEqual(splitLegacyRoyalty(10_000n), {
    netMinor: 10_000n, artistMinor: 7_000n, labelMinor: 2_100n, soundpubMinor: 900n,
    policyCode: 'SOUNDPUB_LEGACY_70_21_9',
  });
  assert.deepEqual(splitLegacyRoyalty(1n), {
    netMinor: 1n, artistMinor: 1n, labelMinor: 0n, soundpubMinor: 0n,
    policyCode: 'SOUNDPUB_LEGACY_70_21_9',
  });
  assert.deepEqual(splitLegacyRoyalty(2n), {
    netMinor: 2n, artistMinor: 1n, labelMinor: 1n, soundpubMinor: 0n,
    policyCode: 'SOUNDPUB_LEGACY_70_21_9',
  });
  assert.deepEqual(splitLegacyRoyalty(6n), {
    netMinor: 6n, artistMinor: 4n, labelMinor: 1n, soundpubMinor: 1n,
    policyCode: 'SOUNDPUB_LEGACY_70_21_9',
  });
  assert.throws(() => splitLegacyRoyalty(-1n), /cannot be negative/);
});

test('owner allocation combines artist and label shares for Label Custom PIC ownership', () => {
  const split = splitLegacyRoyalty(10_000n);
  assert.deepEqual(allocateRoyaltyOwners(split, 'artist-owner', 'label-owner'), [
    { ownerId: 'artist-owner', amountMinor: 7_000n, components: ['artist'] },
    { ownerId: 'label-owner', amountMinor: 2_100n, components: ['label'] },
  ]);
  assert.deepEqual(allocateRoyaltyOwners(split, 'pic-owner', 'pic-owner'), [
    { ownerId: 'pic-owner', amountMinor: 9_100n, components: ['artist', 'label'] },
  ]);
});
