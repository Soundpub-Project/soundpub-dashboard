import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { ApiError } from '../api/types.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';
import { parse } from '../royalties/contracts.js';
import { beneficiaryMappingCreate, beneficiaryMappingQuery, beneficiaryMappingRevoke, parseComposerStatement } from './contracts.js';

const allows = createAuthorizer();
const projection = `m.id, m.composer_code, m.owner_id, m.canonical_name, m.valid_from::text,
  m.valid_through::text, m.created_by, to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  (r.mapping_id IS NOT NULL) AS revoked, r.actor_id AS revoked_by, r.reason AS revocation_reason,
  CASE WHEN r.revoked_at IS NULL THEN NULL ELSE to_char(r.revoked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS revoked_at`;

export interface ComposerRoyaltiesService {
  preview(actor: Principal, input: unknown): Promise<unknown>;
  createMapping(actor: Principal, input: unknown): Promise<unknown>;
  listMappings(actor: Principal, input: unknown): Promise<unknown>;
  revokeMapping(actor: Principal, id: string, input: unknown): Promise<unknown>;
}

export function createComposerRoyaltiesService(pool: Pool): ComposerRoyaltiesService {
  async function authorized<T>(actor: Principal, work: (db: PoolClient) => Promise<T>) {
    if (!allows(actor, 'admin')) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!allows(current ?? null, 'admin')) throw new ApiError(403, 'FORBIDDEN');
      return work(db);
    });
  }
  async function mappingRow(db: PoolClient, id: string) {
    return (await db.query(`SELECT ${projection} FROM soundpub.copyright_beneficiary_mappings m
      LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id WHERE m.id=$1`, [id])).rows[0];
  }
  return {
    async preview(actor, input) {
      const statement = parseComposerStatement(input);
      return authorized(actor, async db => {
        const mappings = await db.query<{ id: string; composer_code: string; owner_id: string; canonical_name: string }>(
          `SELECT DISTINCT ON (lower(m.composer_code)) m.id, m.composer_code, m.owner_id, m.canonical_name
           FROM soundpub.copyright_beneficiary_mappings m
           LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
           WHERE lower(m.composer_code)=ANY($1::text[]) AND m.valid_from <= $2
             AND (m.valid_through IS NULL OR m.valid_through >= $2) AND r.mapping_id IS NULL
           ORDER BY lower(m.composer_code), m.valid_from DESC, m.created_at DESC, m.id DESC`,
        [statement.rows.map(row => row.composer_code.toLocaleLowerCase('en-US')), statement.period]);
        const byCode = new Map(mappings.rows.map(row => [row.composer_code.toLocaleLowerCase('en-US'), row]));
        const rows = statement.rows.map(row => {
          const mapping = byCode.get(row.composer_code.toLocaleLowerCase('en-US'));
          return { ...row, beneficiary_id: mapping?.owner_id ?? null, canonical_name: mapping?.canonical_name ?? null,
            mapping_id: mapping?.id ?? null, status: mapping ? 'MATCHED' as const : 'UNMATCHED' as const };
        });
        const blockers = [...(rows.some(row => row.status === 'UNMATCHED') ? ['COMPOSER_IDENTITY_MAPPING_REQUIRED' as const] : []),
          'WORK_ALLOCATION_CONTRACT_REQUIRED' as const];
        const snapshot = { ...statement, rows, status: 'UNRECONCILED' as const, posting_allowed: false as const, blockers };
        return { ...snapshot, checksum: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
      });
    },
    async createMapping(actor, input) {
      const value = parse(beneficiaryMappingCreate, input);
      return authorized(actor, async db => {
        const target = (await usersRepository(db).lock([value.owner_id], false)).get(value.owner_id);
        if (!target || target.status !== 'active' || !target.roles.includes('copyright')) throw new ApiError(409, 'MAPPING_TARGET_INVALID');
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 0))', [value.composer_code]);
        const overlap = await db.query(`SELECT 1 FROM soundpub.copyright_beneficiary_mappings m
          LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
          WHERE lower(m.composer_code)=lower($1) AND r.mapping_id IS NULL
            AND m.valid_from <= COALESCE($3, '9999-12')
            AND $2 <= COALESCE(m.valid_through, '9999-12') LIMIT 1`,
        [value.composer_code, value.valid_from, value.valid_through ?? null]);
        if (overlap.rowCount) throw new ApiError(409, 'MAPPING_PERIOD_CONFLICT');
        const id = (await db.query<{ id: string }>(`INSERT INTO soundpub.copyright_beneficiary_mappings
          (composer_code,owner_id,canonical_name,valid_from,valid_through,created_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [value.composer_code, value.owner_id, value.canonical_name, value.valid_from, value.valid_through ?? null, actor.id])).rows[0]!.id;
        return mappingRow(db, id);
      });
    },
    async listMappings(actor, input) {
      const query = parse(beneficiaryMappingQuery, input);
      return authorized(actor, async db => {
        const limit = query.limit ? Number(query.limit) : 50;
        const offset = query.offset ? Number(query.offset) : 0;
        const result = await db.query(`SELECT ${projection} FROM soundpub.copyright_beneficiary_mappings m
          LEFT JOIN soundpub.copyright_beneficiary_mapping_revocations r ON r.mapping_id=m.id
          WHERE ($1::text IS NULL OR lower(m.composer_code)=lower($1)) AND ($2::uuid IS NULL OR m.owner_id=$2)
            AND ($3::boolean OR r.mapping_id IS NULL)
          ORDER BY m.created_at DESC, m.id DESC LIMIT $4 OFFSET $5`,
        [query.composer_code ?? null, query.owner_id ?? null, query.include_revoked === 'true', limit + 1, offset]);
        return { items: result.rows.slice(0, limit), next_offset: result.rows.length > limit ? offset + limit : null };
      });
    },
    async revokeMapping(actor, id, input) {
      parse(z.uuid(), id);
      const value = parse(beneficiaryMappingRevoke, input);
      return authorized(actor, async db => {
        const exists = await db.query('SELECT id FROM soundpub.copyright_beneficiary_mappings WHERE id=$1 FOR UPDATE', [id]);
        if (!exists.rowCount) throw new ApiError(404, 'NOT_FOUND');
        const inserted = await db.query(`INSERT INTO soundpub.copyright_beneficiary_mapping_revocations(mapping_id,actor_id,reason)
          VALUES ($1,$2,$3) ON CONFLICT (mapping_id) DO NOTHING`, [id, actor.id, value.reason]);
        if (!inserted.rowCount) throw new ApiError(409, 'MAPPING_ALREADY_REVOKED');
        return mappingRow(db, id);
      });
    },
  };
}
