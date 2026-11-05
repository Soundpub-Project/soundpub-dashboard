import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { parse, money, minor, decimal } from '../royalties/contracts.js';

const text = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/);
export const composerStatement = z.strictObject({
  source: text,
  source_batch: text,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('IDR'),
  rows: z.array(z.strictObject({
    composer_code: text,
    composer_name: text,
    total_net_royalti: money,
  })).min(1).max(1000),
});

export const composerStatementPreview = z.strictObject({
  source: text,
  source_batch: text,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('IDR'),
  rows: z.array(z.strictObject({
    composer_code: text,
    composer_name: text,
    total_net_royalti: money,
  })).min(1).max(1000),
  total_amount: money,
  status: z.literal('UNRECONCILED'),
  posting_allowed: z.literal(false),
  blockers: z.tuple([
    z.literal('COMPOSER_IDENTITY_MAPPING_REQUIRED'),
    z.literal('WORK_ALLOCATION_CONTRACT_REQUIRED'),
  ]),
});

export function previewComposerStatement(input: unknown) {
  const statement = parse(composerStatement, input);
  const seen = new Set<string>();
  for (const row of statement.rows) {
    if (seen.has(row.composer_code)) throw new ApiError(400, 'DUPLICATE_COMPOSER');
    seen.add(row.composer_code);
  }
  return {
    ...statement,
    rows: statement.rows.map(row => ({ ...row, total_net_royalti: decimal(minor(row.total_net_royalti)) })),
    total_amount: decimal(statement.rows.reduce((total, row) => total + minor(row.total_net_royalti), 0n)),
    status: 'UNRECONCILED' as const,
    posting_allowed: false as const,
    blockers: ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED'],
  };
}
