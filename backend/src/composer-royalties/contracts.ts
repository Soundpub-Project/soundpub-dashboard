import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { parse, money, minor, decimal } from '../royalties/contracts.js';

const text = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const composerStatement = z.strictObject({
  source: text, source_batch: text, period: month, currency: z.literal('IDR'),
  rows: z.array(z.strictObject({ composer_code: text, composer_name: text, total_net_royalti: money })).min(1).max(1000),
});
export const beneficiaryMappingCreate = z.strictObject({
  composer_code: text, owner_id: z.uuid(), canonical_name: text, valid_from: month, valid_through: month.nullable().optional(),
}).refine(value => !value.valid_through || value.valid_through >= value.valid_from);
export const beneficiaryMappingQuery = z.strictObject({
  composer_code: text.optional(), owner_id: z.uuid().optional(), include_revoked: z.enum(['true', 'false']).optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-9]\d|100)$/).optional(), offset: z.string().regex(/^(?:0|[1-9]\d*)$/).optional(),
});
export const beneficiaryMappingRevoke = z.strictObject({ reason: text.max(500) });
export const beneficiaryMapping = z.strictObject({
  id: z.uuid(), composer_code: text, owner_id: z.uuid(), canonical_name: text,
  valid_from: month, valid_through: month.nullable(), created_by: z.uuid(), created_at: z.iso.datetime(),
  revoked: z.boolean(), revoked_by: z.uuid().nullable(), revocation_reason: z.string().nullable(), revoked_at: z.iso.datetime().nullable(),
});
export const beneficiaryMappingList = z.strictObject({ items: z.array(beneficiaryMapping), next_offset: z.number().int().nullable() });
export const composerStatementPreview = z.strictObject({
  source: text, source_batch: text, period: month, currency: z.literal('IDR'),
  rows: z.array(z.strictObject({
    composer_code: text, composer_name: text, total_net_royalti: money,
    beneficiary_id: z.uuid().nullable(), canonical_name: text.nullable(), mapping_id: z.uuid().nullable(),
    status: z.enum(['MATCHED', 'UNMATCHED']),
  })).min(1).max(1000),
  total_amount: money, checksum: z.string().regex(/^[a-f0-9]{64}$/), status: z.literal('UNRECONCILED'),
  posting_allowed: z.literal(false),
  blockers: z.array(z.enum(['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED'])).min(1).max(2),
});

export function parseComposerStatement(input: unknown) {
  const statement = parse(composerStatement, input);
  const seen = new Set<string>();
  for (const row of statement.rows) {
    const code = row.composer_code.toLocaleLowerCase('en-US');
    if (seen.has(code)) throw new ApiError(400, 'DUPLICATE_COMPOSER');
    seen.add(code);
  }
  return { ...statement,
    rows: statement.rows.map(row => ({ ...row, total_net_royalti: decimal(minor(row.total_net_royalti)) })),
    total_amount: decimal(statement.rows.reduce((total, row) => total + minor(row.total_net_royalti), 0n)) };
}
