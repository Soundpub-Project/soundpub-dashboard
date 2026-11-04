import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { parseMoney, formatMoney } from '../finance/money.js';

// ponytail: synthetic IDR statements only; add currencies after approved precision/allocation contracts.
export const money = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/);
const text = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/);
export const royaltyRow = z.strictObject({
  source_row_id: text, beneficiary_id: z.uuid().optional(), artist_id: z.uuid().optional(), release_id: z.uuid(), track_id: z.uuid(),
  platform: text.default('UNKNOWN'),
  gross_amount: money, deduction_amount: money, net_amount: money,
});
export const importEnvelope = z.strictObject({
  source: text, period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), currency: z.literal('IDR'),
  filename: text, rows: z.array(z.unknown()).min(1).max(1000),
});
export type RoyaltyRow = z.infer<typeof royaltyRow>;
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
export function minor(value: string): bigint {
  parse(money, value);
  return parseMoney(value);
}
export function decimal(value: bigint): string {
  return formatMoney(value);
}
export function canonicalRow(row: RoyaltyRow): RoyaltyRow {
  return { source_row_id: row.source_row_id, beneficiary_id: row.beneficiary_id?.toLowerCase(), artist_id: row.artist_id?.toLowerCase(),
    release_id: row.release_id.toLowerCase(), track_id: row.track_id.toLowerCase(), platform: row.platform,
    gross_amount: decimal(minor(row.gross_amount)), deduction_amount: decimal(minor(row.deduction_amount)),
    net_amount: decimal(minor(row.net_amount)) };
}
export function fingerprint(source: string, period: string, currency: string, rows: RoyaltyRow[]): string {
  const ordered = rows.map(canonicalRow).map(({ artist_id: _artist, ...row }) => row).sort((a, b) => a.source_row_id < b.source_row_id ? -1 : a.source_row_id > b.source_row_id ? 1 : 0);
  return createHash('sha256').update(JSON.stringify({ source, period, currency, rows: ordered })).digest('hex');
}
