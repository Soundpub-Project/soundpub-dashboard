import type { Pool } from 'pg';
import type { MetadataRepository, ObjectMetadata } from './index.js';

export function createPgMetadataRepository(pool: Pool, bucket: string): MetadataRepository {
  return {
    async get(id) {
      const result = await pool.query<{
        id: string; owner_user_id: string; content_type: string; size_bytes: string;
        checksum_sha256: string; created_at: Date;
      }>(`SELECT id, owner_user_id, content_type, size_bytes, checksum_sha256, created_at
        FROM soundpub.storage_assets WHERE id = $1 AND bucket = $2 AND status IN ('pending', 'ready')`, [id, bucket]);
      const row = result.rows[0];
      if (!row?.owner_user_id || !row.checksum_sha256) return undefined;
      return { id: row.id, ownerId: row.owner_user_id, mimeType: row.content_type,
        size: Number(row.size_bytes), checksum: row.checksum_sha256,
        visibility: 'private', createdAt: row.created_at.toISOString() } satisfies ObjectMetadata;
    },
    async insert(metadata) {
      await pool.query(`INSERT INTO soundpub.storage_assets
        (id,bucket,object_key,owner_user_id,content_type,size_bytes,checksum_sha256,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [metadata.id, bucket, `private/objects/${metadata.id}`, metadata.ownerId,
        metadata.mimeType, metadata.size, metadata.checksum]);
    },
    async markReady(id) {
      await pool.query(`UPDATE soundpub.storage_assets SET status = 'ready', updated_at = now() WHERE id = $1 AND bucket = $2`, [id, bucket]);
    },
    async delete(id) {
      await pool.query(`UPDATE soundpub.storage_assets SET status = 'deleted', updated_at = now()
        WHERE id = $1 AND bucket = $2`, [id, bucket]);
    },
  };
}


