import type { Pool } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';

export const catalogQuery = z.strictObject({
  limit: z.string().regex(/^[1-9]\d{0,2}$/).optional(),
  offset: z.string().regex(/^(0|[1-9]\d{0,5})$/).optional(),
  search: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(200).optional(),
}).refine(value => Number(value.limit ?? 12) <= 100);
export const catalogRelease = z.strictObject({
  id: z.uuid(), title: z.string(), artist_name: z.string(), genre: z.string().nullable(),
  release_type: z.string(), release_date: z.string().nullable(), upc: z.string().nullable(),
  cover_url: z.null(), label: z.strictObject({ full_name: z.string() }).nullable(),
  tracks: z.array(z.strictObject({
    id: z.uuid(), title: z.string(), artist_name: z.string(), isrc: z.string().nullable(),
    genre: z.string().nullable(), duration: z.number().nullable(), explicit_lyrics: z.boolean(),
    audio_url: z.null(), clip_url: z.null(),
  })),
});
export const catalogPage = z.strictObject({ success: z.literal(true), data: z.array(catalogRelease),
  pagination: z.strictObject({ total: z.number().int(), limit: z.number().int(),
    offset: z.number().int(), hasMore: z.boolean() }) });

const projection = `r.id,r.title,r.artist_name,r.genre,r.release_type,
  to_char(r.release_date,'YYYY-MM-DD') AS release_date,r.upc,NULL AS cover_url,
  (SELECT json_build_object('full_name',p.full_name) FROM soundpub.profiles p WHERE p.id=r.label_id) AS label,
  COALESCE((SELECT json_agg(json_build_object('id',t.id,'title',t.title,'artist_name',t.artist_name,
    'isrc',t.isrc,'genre',t.genre,'duration',t.duration,'explicit_lyrics',t.explicit_lyrics,
    'audio_url',NULL,'clip_url',NULL) ORDER BY t.position,t.id)
    FROM soundpub.tracks t WHERE t.release_id=r.id),'[]'::json) AS tracks`;
const eligible = "r.status='active' AND r.archived_at IS NULL";

export function createPublicCatalogService(pool: Pool) {
  return {
    async list(input: unknown) {
      const query = catalogQuery.parse(input);
      const limit = Number(query.limit ?? 12);
      const offset = Number(query.offset ?? 0);
      const result = await pool.query(`WITH eligible AS MATERIALIZED (
        SELECT r.* FROM soundpub.releases r WHERE ${eligible}
        AND ($1::text IS NULL OR strpos(lower(r.title || ' ' || r.artist_name),lower($1))>0)
        AND ($2::text IS NULL OR r.genre=$2)
      ), page AS (
        SELECT ${projection} FROM eligible r ORDER BY r.release_date DESC NULLS LAST,r.id LIMIT $3 OFFSET $4
      ) SELECT (SELECT count(*)::int FROM eligible) AS total,
        COALESCE((SELECT json_agg(page) FROM page),'[]'::json) AS items`,
      [query.search || null, query.genre || null, limit, offset]);
      const { total, items } = result.rows[0];
      return catalogPage.parse({ success: true, data: items,
        pagination: { total, limit, offset, hasMore: offset + limit < total } });
    },
    async get(id: string) {
      z.uuid().parse(id);
      const result = await pool.query(`SELECT ${projection} FROM soundpub.releases r
        WHERE r.id=$1 AND ${eligible}`, [id]);
      if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND');
      return catalogRelease.parse(result.rows[0]);
    },
  };
}
export type PublicCatalogService = ReturnType<typeof createPublicCatalogService>;
