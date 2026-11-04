import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3DevObjectStorage, type ObjectMetadata, type S3DevStorageOptions } from '../storage/index.js';
import { ApiError } from '../api/types.js';

export interface RoyaltyImportFileRow {
  id: string;
  requester_id: string;
  bucket: string;
  object_key: string;
  mime_type: 'text/csv';
  size_bytes: string | number;
  source_checksum: string;
  created_at: Date | string;
}

export type RoyaltyImportStoreOptions = Omit<S3DevStorageOptions, 'metadata' | 'allowedMimeTypes' | 'maxSizeBytes'>;
export interface RoyaltyImportObjectStore {
  bucket: string;
  key(id: string): string;
  request(ownerId: string, input: { mime_type: 'text/csv'; size: number; checksum: string }): Promise<{
    metadata: ObjectMetadata; url: string; method: 'PUT'; headers: Record<string, string>;
  }>;
  verify(row: RoyaltyImportFileRow): Promise<void>;
  download(row: RoyaltyImportFileRow): Promise<string>;
  remove(row: RoyaltyImportFileRow): Promise<void>;
  isReady(): Promise<boolean>;
  close(): void;
}

function metadata(row: RoyaltyImportFileRow): ObjectMetadata {
  return { id: row.id, ownerId: row.requester_id, mimeType: row.mime_type, size: Number(row.size_bytes),
    checksum: row.source_checksum, visibility: 'private', createdAt: new Date(row.created_at).toISOString() };
}

export async function createRoyaltyImportObjectStore(pool: Pool, options: RoyaltyImportStoreOptions): Promise<RoyaltyImportObjectStore> {
  for (const endpoint of [options.endpoint, options.publicEndpoint]) {
    if (!['localhost', '127.0.0.1', '[::1]', 'object-storage', 'minio', 'rustfs'].includes(new URL(endpoint).hostname)) {
      throw new Error('Dedicated local royalty storage endpoint required');
    }
  }
  const prefix = options.prefix ?? 'royalty-imports';
  const storage = await S3DevObjectStorage.create({ ...options, prefix, allowedMimeTypes: ['text/csv'], maxSizeBytes: 100 * 1024 ** 2, metadata: {
    async get(id) {
      const row = (await pool.query<RoyaltyImportFileRow>(`SELECT id,requester_id,bucket,object_key,mime_type,size_bytes,
        source_checksum,created_at FROM soundpub.royalty_import_sessions WHERE id=$1 AND status<>'DELETED'`, [id])).rows[0];
      return row ? metadata(row) : undefined;
    },
    async insert() {},
    async delete() {},
  } });
  const client = new S3Client({ endpoint: options.endpoint, region: options.region ?? 'us-east-1',
    credentials: options.credentials, forcePathStyle: true });
  const key = (id: string) => `${prefix}/objects/${id}`;
  const stagingKey = (id: string) => `${prefix}/staging/${id}`;
  const missing = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;
  return {
    bucket: options.bucket,
    key,
    isReady: () => storage.isReady(),
    request: (ownerId, input) => storage.signedUploadUrl({ id: ownerId }, { mimeType: input.mime_type, size: input.size, checksum: input.checksum }, 300),
    async verify(row) {
      const dir = await mkdtemp(join(tmpdir(), 'soundpub-royalty-'));
      try {
        let object;
        try { object = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: stagingKey(row.id) })); }
        catch (error) { if (missing(error)) throw new ApiError(409, 'ROYALTY_FILE_BYTES_MISSING'); throw error; }
        if (!object.Body) throw new ApiError(409, 'ROYALTY_FILE_BYTES_MISSING');
        const body = object.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
        try {
          if (object.ContentLength !== Number(row.size_bytes) || object.ContentType !== row.mime_type) throw new ApiError(400, 'ROYALTY_FILE_METADATA_MISMATCH');
          const file = await open(join(dir, 'statement.csv'), 'wx', 0o600);
          const hash = createHash('sha256');
          const decoder = new TextDecoder('utf-8', { fatal: true });
          let size = 0;
          try {
            for await (const bytes of body) {
              size += bytes.byteLength;
              if (size > Number(row.size_bytes) || size > 100 * 1024 ** 2) throw new ApiError(400, 'ROYALTY_FILE_SIZE_MISMATCH');
              hash.update(bytes);
              const text = decoder.decode(bytes, { stream: true });
              if (text.includes('\0')) throw new ApiError(400, 'ROYALTY_FILE_ENCODING_INVALID');
              await file.writeFile(bytes);
            }
            decoder.decode();
          } catch (error) {
            if (error instanceof TypeError) throw new ApiError(400, 'ROYALTY_FILE_ENCODING_INVALID');
            throw error;
          } finally { await file.close(); }
          if (size !== Number(row.size_bytes) || hash.digest('hex') !== row.source_checksum) throw new ApiError(400, 'ROYALTY_FILE_CHECKSUM_MISMATCH');
          const stream = createReadStream(join(dir, 'statement.csv'));
          try { await client.send(new PutObjectCommand({ Bucket: options.bucket, Key: key(row.id), Body: stream,
            ContentLength: size, ContentType: row.mime_type, ChecksumSHA256: Buffer.from(row.source_checksum, 'hex').toString('base64') })); }
          finally { stream.destroy(); }
          await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: stagingKey(row.id) }));
        } finally { body.destroy?.(); }
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
    async download(row) {
      try { await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key(row.id) })); }
      catch (error) { if (missing(error)) throw new ApiError(404, 'NOT_FOUND'); throw error; }
      return storage.signedUrl({ id: row.requester_id }, row.id, 60);
    },
    async remove(row) {
      await storage.delete({ id: row.requester_id }, row.id);
    },
    close() { storage.close(); client.destroy(); },
  };
}
