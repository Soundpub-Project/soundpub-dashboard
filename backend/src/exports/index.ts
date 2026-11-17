import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { usersRepository } from '../users/repository.js';

export const exportDatasets = [
  'profiles', 'artists', 'releases', 'tracks', 'royalties', 'royalty_uploads',
  'payout_requests', 'audit_logs', 'user_roles', 'app_settings',
] as const;
export type ExportDataset = typeof exportDatasets[number];

export const exportQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100_000).default(100_000),
});
const maxExportBytes = 25 * 1024 * 1024;

const allows = createAuthorizer();
const formulaPrefix = /^(?:[\t\r\n]|[\t\r\n ]*[=+\-@])/;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const safe = formulaPrefix.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvChunk(rows: Record<string, unknown>[], headers: string[], includeHeader: boolean): string {
  const lines = rows.map(row => headers.map(header => csvCell(row[header])).join(','));
  if (includeHeader) lines.unshift(headers.map(csvCell).join(','));
  return lines.join('\r\n');
}
const queries: Record<ExportDataset, string> = {
  profiles: `SELECT u.id, u.email, u.email_verified_at, u.status, p.full_name, p.phone, p.address,
    p.parent_label_id, p.composer_code, p.subscription_status, p.subscription_upgraded_at,
    p.artist_profile_completed, p.avatar_media_id, p.logo_media_id, p.logo_light_media_id,
    p.logo_dark_media_id, u.created_at, u.updated_at
    FROM soundpub.backend_users u LEFT JOIN soundpub.profiles p ON p.id=u.id
    ORDER BY u.created_at ASC,u.id ASC`,
  artists: `SELECT a.id,a.label_id,a.artist_user_id,a.name,a.verified_at,a.management_mode,
    a.label_custom_unit_id,a.contact_email,a.contact_phone,a.created_at,a.updated_at
    FROM soundpub.artists a ORDER BY a.created_at ASC,a.id ASC`,
  releases: `SELECT r.id,r.label_id,r.artist_user_id,r.artist_id,r.created_by,r.title,r.artist_name,
    r.release_type,r.genre,r.release_date,r.upc,r.status,r.rejection_reason,r.distribution_service,
    r.custom_label_name,r.custom_record_name,r.price_per_track_snapshot,r.total_payment_snapshot,
    r.archived_at,r.version,r.cover_media_id,r.created_at,r.updated_at
    FROM soundpub.releases r ORDER BY r.created_at ASC,r.id ASC`,
  tracks: `SELECT t.id,t.release_id,t.artist_user_id,t.artist_id,t.title,t.artist_name,t.artists,
    t.contributors,t.composer,t.lyricist,t.genre,t.explicit_lyrics,t.isrc,t.duration,t.position,
    t.version,t.audio_media_id,t.created_at,t.updated_at
    FROM soundpub.tracks t ORDER BY t.created_at ASC,t.id ASC`,
  royalties: `SELECT e.id,e.batch_id,e.source,e.period,e.source_row_id,e.source_row_number,
    e.beneficiary_id,e.financial_owner_user_id,e.label_owner_user_id,e.artist_id,e.release_id,e.track_id,
    e.platform,e.country,e.sales_type,e.sales_unit,e.source_isrc,e.source_upc,e.source_title,e.source_artist,e.source_label,e.gross_amount,
    e.deduction_amount,e.net_amount,e.calculation_policy_code
    FROM soundpub.royalty_import_entries e ORDER BY e.batch_id ASC,e.source_row_number ASC,e.id ASC`,
  royalty_uploads: `SELECT b.id,b.source,b.period,b.currency,b.filename,b.uploader_id,b.row_count,
    b.total_amount,b.status,b.created_at FROM soundpub.royalty_import_batches b
    ORDER BY b.created_at ASC,b.id ASC`,
  payout_requests: `SELECT p.id,p.user_id,p.amount,p.currency,p.status,p.bank_name,
    CASE WHEN length(p.account_number)<=4 THEN repeat('*',length(p.account_number))
      ELSE repeat('*',length(p.account_number)-4)||right(p.account_number,4) END AS account_number_masked,
    p.account_holder_name,p.created_at,p.updated_at FROM soundpub.payout_requests p
    ORDER BY p.created_at ASC,p.id ASC`,
  audit_logs: `SELECT a.id,a.actor_user_id,a.action,a.resource_type,a.resource_id,a.created_at
    FROM soundpub.audit_logs a ORDER BY a.created_at ASC,a.id ASC`,
  user_roles: `SELECT r.id,r.user_id,u.email,r.role,r.verified_at,r.created_at
    FROM soundpub.user_roles r JOIN soundpub.backend_users u ON u.id=r.user_id
    WHERE r.tenant_id IS NULL AND r.verified_at IS NOT NULL
    ORDER BY r.created_at ASC,r.id ASC`,
  app_settings: `SELECT version,settings->>'dashboard_logo_light' AS dashboard_logo_light,
    settings->>'dashboard_logo_dark' AS dashboard_logo_dark,settings->>'favicon' AS favicon,
    settings->>'maintenance_enabled' AS maintenance_enabled,settings->>'min_payout_amount' AS min_payout_amount,
    settings->>'release_price_per_track' AS release_price_per_track,
    settings#>>'{auth_notice_config,enabled}' AS auth_notice_enabled,
    settings#>>'{auth_notice_config,title}' AS auth_notice_title,
    settings#>>'{auth_notice_config,badge}' AS auth_notice_badge,
    settings#>>'{auth_notice_config,message}' AS auth_notice_message,
    settings#>>'{auth_notice_config,detail}' AS auth_notice_detail,
    settings#>>'{auth_notice_config,buttonText}' AS auth_notice_button_text,
    settings#>>'{auth_notice_config,revision}' AS auth_notice_revision
    FROM soundpub.application_settings WHERE id=true`,
};

export function createExportsService(pool: Pool) {
  async function authorized<T>(actor: Principal, work: (db: PoolClient) => Promise<T>) {
    if (!allows(actor, 'superadmin')) throw new ApiError(403, 'FORBIDDEN');
    return withTransaction(pool, async db => {
      const current = (await usersRepository(db).lock([actor.id], false)).get(actor.id);
      if (!allows(current ?? null, 'superadmin')) throw new ApiError(403, 'FORBIDDEN');
      return work(db);
    });
  }

  return {
    async export(actor: Principal, dataset: ExportDataset, input: unknown, requestId: string) {
      const page = exportQuery.safeParse(input);
      if (!page.success) throw new ApiError(400, 'BAD_REQUEST');
      return authorized(actor, async db => {
        await db.query(`DECLARE export_rows NO SCROLL CURSOR FOR ${queries[dataset]}`);
        const chunks: string[] = [];
        let headers: string[] | null = null;
        let rowCount = 0;
        let byteCount = 0;
        for (;;) {
          const pageResult = await db.query<Record<string, unknown>>('FETCH FORWARD 1000 FROM export_rows');
          if (pageResult.rows.length === 0) break;
          if (rowCount + pageResult.rows.length > page.data.limit) throw new ApiError(409, 'EXPORT_TOO_LARGE');
          headers ??= Object.keys(pageResult.rows[0]!);
          const pageCsv = csvChunk(pageResult.rows, headers, rowCount === 0);
          const separator = chunks.length === 0 ? '' : '\r\n';
          const pageBytes = Buffer.byteLength(separator) + Buffer.byteLength(pageCsv);
          if (byteCount + pageBytes > maxExportBytes) throw new ApiError(409, 'EXPORT_TOO_LARGE');
          chunks.push(separator + pageCsv);
          byteCount += pageBytes;
          rowCount += pageResult.rows.length;
        }
        await db.query('CLOSE export_rows');
        const csv = chunks.join('');
        await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
          VALUES ($1,'data.exported','data_export',$2,$3,$4::jsonb)`,
        [actor.id, dataset, requestId, JSON.stringify({ dataset, rowCount,
          limit: page.data.limit, byteCount, sha256: createHash('sha256').update(csv).digest('hex') })]);
        return { csv, rowCount };
      });
    },
  };
}
export type ExportsService = ReturnType<typeof createExportsService>;
