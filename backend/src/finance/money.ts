import { ApiError } from '../api/types.js';

// ponytail: IDR only, two decimal accounting precision from legacy numeric(18,2); add currencies after contract review.
export const FINANCE_CURRENCY = 'IDR';
export const MAX_MINOR = 999999999999999999n;

export function parseMoney(value: unknown): bigint {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value)) {
    throw new ApiError(400, 'INVALID_MONEY');
  }
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > MAX_MINOR || (negative && minor === 0n)) throw new ApiError(400, 'INVALID_MONEY');
  return negative ? -minor : minor;
}

export function formatMoney(minor: bigint): string {
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

/** Exact half-away-from-zero rounding, only at explicitly approved calculation boundaries. */
export function roundRatio(minor: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const product = minor * numerator;
  const absolute = product < 0n ? -product : product;
  return (product < 0n ? -1n : 1n) * ((absolute + denominator / 2n) / denominator);
}
