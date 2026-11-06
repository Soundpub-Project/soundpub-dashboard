import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { parse, money, minor, decimal } from '../royalties/contracts.js';

const text = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.uuid();
export const COPYRIGHT_ROYALTY_POLICY_CODE = 'LEGACY_AGGREGATE_100_PERCENT_TO_RESOLVED_BENEFICIARY_V1';
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
  total_amount: money, checksum, status: z.literal('UNRECONCILED'),
  policy_code: z.literal(COPYRIGHT_ROYALTY_POLICY_CODE), policy_checksum: checksum,
  posting_allowed: z.boolean(),
  blockers: z.array(z.literal('COMPOSER_IDENTITY_MAPPING_REQUIRED')).max(1),
});

export const copyrightRoyaltyImportCreate = z.strictObject({ expected_checksum: checksum, statement: composerStatement });
const unsignedInteger = z.string().regex(/^(0|[1-9]\d*)$/);
export const copyrightRoyaltySummaryQuery = z.strictObject({});
export const copyrightRoyaltySummary = z.strictObject({
  currency: z.literal('IDR'), semantics: z.literal('GROSS_ENTRIES'),
  total_minor: unsignedInteger, entry_count: unsignedInteger,
  periods: z.array(z.strictObject({ period: month, total_minor: unsignedInteger, entry_count: unsignedInteger })),
  latest: z.strictObject({ period: month, amount_minor: unsignedInteger }).nullable(),
});
export type CopyrightRoyaltySummary = z.infer<typeof copyrightRoyaltySummary>;
export const copyrightRoyaltyListQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9]\d|100)$/).optional(),
  offset: z.string().regex(/^(?:0|[1-9]\d*)$/).optional(),
});
export const copyrightRoyaltyEntry = z.strictObject({
  id: uuid, batch_id: uuid, composer_code: text, composer_name: text, beneficiary_id: uuid,
  canonical_name: text, mapping_id: uuid, period: month, amount: money, policy_code: z.literal(COPYRIGHT_ROYALTY_POLICY_CODE),
  created_at: z.iso.datetime(),
});
export const copyrightRoyaltyBatch = z.strictObject({
  id: uuid, source: text, source_batch: text, period: month, currency: z.literal('IDR'), uploader_id: uuid,
  row_count: z.number().int().min(1), total_amount: money, checksum, policy_code: z.literal(COPYRIGHT_ROYALTY_POLICY_CODE),
  policy_checksum: checksum, status: z.enum(['UNRECONCILED', 'RECONCILED', 'CORRECTED']), created_at: z.iso.datetime(),
});
export const copyrightRoyaltyImportDetail = copyrightRoyaltyBatch.extend({ entries: z.array(copyrightRoyaltyEntry) });
export const copyrightRoyaltyImportList = z.strictObject({ items: z.array(copyrightRoyaltyBatch), next_offset: z.number().int().nullable() });
export const copyrightRoyaltyPostingResult = z.strictObject({ batch: copyrightRoyaltyImportDetail, replayed: z.boolean() });
export const copyrightRoyaltyCorrectionCreate = z.strictObject({ reason: text.max(500) });
export const copyrightRoyaltyCorrection = z.strictObject({
  id: uuid, batch_id: uuid, reason: text.max(500), actor_id: uuid, created_at: z.iso.datetime(),
});
export const copyrightRoyaltyReconciliationCreate = z.strictObject({ evidence: text.max(500) });
export const copyrightRoyaltyReconciliation = z.strictObject({
  id: uuid, batch_id: uuid, actor_id: uuid, result: z.enum(['MATCHED', 'MISMATCH']), evidence: text.max(500),
  snapshot_checksum: checksum, snapshot: z.unknown(), issues: z.array(z.unknown()), created_at: z.iso.datetime(), replayed: z.boolean(),
});

export function parseComposerStatement(input: unknown) {
  const statement = parse(composerStatement, input);
  const seen = new Set<string>();
  for (const row of statement.rows) {
    if (minor(row.total_net_royalti) <= 0n) throw new ApiError(400, 'INVALID_COPYRIGHT_ROYALTY_AMOUNT');
    const code = row.composer_code.toLocaleLowerCase('en-US');
    if (seen.has(code)) throw new ApiError(400, 'DUPLICATE_COMPOSER');
    seen.add(code);
  }
  return { ...statement,
    rows: statement.rows.map(row => ({ ...row, total_net_royalti: decimal(minor(row.total_net_royalti)) })),
    total_amount: decimal(statement.rows.reduce((total, row) => total + minor(row.total_net_royalti), 0n)) };
}
