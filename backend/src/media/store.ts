import { createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, PutBucketCorsCommand,
  CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3DevObjectStorage, type S3DevStorageOptions, type ObjectMetadata } from '../storage/index.js';
import { ApiError } from '../api/types.js';
import { assertMediaSignature, MULTIPART_PART_SIZE_BYTES, MULTIPART_THRESHOLD_BYTES, type MediaRow, type UploadInput } from './contracts.js';

export type MediaStoreOptions = Omit<S3DevStorageOptions, 'metadata' | 'allowedMimeTypes' | 'maxSizeBytes'> & { allowedOrigins?: readonly string[] };
export interface MediaObjectStore {
  bucket: string;
  key(id: string): string;
  request(ownerId: string, input: UploadInput): Promise<{ metadata: ObjectMetadata; url: string; method: 'PUT'; headers: Record<string,string> }>;
  beginMultipart?(id: string, input: UploadInput): Promise<string>;
  multipartParts?(row: MediaRow): Promise<{ parts: number[]; completed: boolean }>;
  multipartPart?(row: MediaRow, partNumber: number): Promise<{ url: string; size: number }>;
  finishMultipart?(row: MediaRow): Promise<void>;
  abortMultipart?(row: MediaRow): Promise<void>;
  verify(row: MediaRow): Promise<void>;
  download(row: MediaRow): Promise<string>;
  remove(row: MediaRow): Promise<void>;
  removeStaging(row: MediaRow): Promise<void>;
  inspect(row: MediaRow): Promise<'ok' | 'missing' | 'mismatch'>;
  listKeys(): Promise<string[]>;
  isReady(): Promise<boolean>;
  close(): void;
}
const metadata = (row: MediaRow): ObjectMetadata => ({ id: row.id, ownerId: row.owner_user_id,
  mimeType: row.mime_type, size: Number(row.size), checksum: row.checksum, visibility: 'private', createdAt: row.created_at });
export async function createMediaObjectStore(pool: Pool, options: MediaStoreOptions): Promise<MediaObjectStore> {
  // Dedicated dev S3 only: never initialize a provider on a shared or external host.
  for (const endpoint of [options.endpoint, options.publicEndpoint]) {
    if (!['localhost', '127.0.0.1', '[::1]', 'object-storage', 'minio', 'rustfs'].includes(new URL(endpoint).hostname)) throw new Error('Dedicated local media endpoint required');
  }
  const prefix = options.prefix ?? 'media';
  const storage = await S3DevObjectStorage.create({ ...options, prefix, allowedMimeTypes: [
    'image/png','image/jpeg','image/webp','application/pdf','audio/wav','audio/x-wav','audio/flac','audio/aiff','audio/x-aiff','audio/mpeg','audio/mp4','audio/ogg',
  ], maxSizeBytes: 500 * 1024 ** 2, metadata: {
    async get(id) {
      const row = (await pool.query<MediaRow>('SELECT * FROM soundpub.media_objects WHERE id=$1', [id])).rows[0];
      return row ? metadata(row) : undefined;
    },
    // Intent insertion belongs to createMediaService's resource-locked transaction.
    async insert() {}, async delete() {},
  } });
  const client = new S3Client({ endpoint: options.endpoint, region: options.region ?? 'us-east-1',
    credentials: options.credentials, forcePathStyle: true });
  const signer = new S3Client({ endpoint: options.publicEndpoint, region: options.region ?? 'us-east-1',
    credentials: options.credentials, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED' });
  const origins = [...(options.allowedOrigins ?? ['http://localhost:8281', 'http://127.0.0.1:8281'])];
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.origin !== origin) {
      storage.close(); client.destroy(); signer.destroy(); throw new Error('Local browser CORS origin required');
    }
  }
  try {
    await client.send(new PutBucketCorsCommand({ Bucket: options.bucket, CORSConfiguration: { CORSRules: [{
      AllowedOrigins: origins, AllowedMethods: ['PUT','GET','HEAD'],
      AllowedHeaders: ['content-type','x-amz-checksum-sha256','x-amz-sdk-checksum-algorithm'],
      ExposeHeaders: ['ETag','x-amz-checksum-sha256'], MaxAgeSeconds: 300,
    }] } }));
  } catch (error) { storage.close(); client.destroy(); signer.destroy(); throw error; }
  const key = (id: string) => `${prefix}/objects/${id}`;
  const stagingKey = (id: string) => `${prefix}/staging/${id}`;
  const missing = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;
  const uploadId = (row: MediaRow) => {
    if (row.upload_method !== 'MULTIPART' || !row.multipart_upload_id) throw new ApiError(409, 'MEDIA_UPLOAD_METHOD_INVALID');
    return row.multipart_upload_id;
  };
  async function stagingComplete(row: MediaRow) {
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: stagingKey(row.id) }));
      return head.ContentLength === Number(row.size) && head.ContentType === row.mime_type
        && head.Metadata?.checksum === row.checksum;
    } catch (error) { if (missing(error)) return false; throw error; }
  }
  async function listedParts(row: MediaRow) {
    const parts: { number: number; size: number; etag: string }[] = [];
    let marker: string | undefined;
    do {
      const page = await client.send(new ListPartsCommand({ Bucket: options.bucket, Key: stagingKey(row.id),
        UploadId: uploadId(row), ...(marker ? { PartNumberMarker: marker } : {}) }));
      for (const part of page.Parts ?? []) {
        if (!part.PartNumber || part.Size === undefined || !part.ETag || parts.length >= 100) throw new ApiError(409, 'MEDIA_PARTS_INVALID');
        parts.push({ number: part.PartNumber, size: part.Size, etag: part.ETag });
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      if (page.IsTruncated && !marker) throw new ApiError(409, 'MEDIA_PARTS_INVALID');
    } while (marker);
    return parts;
  }
  return {
    bucket: options.bucket, key,
    isReady: () => storage.isReady(),
    request: (ownerId, input) => storage.signedUploadUrl({ id: ownerId }, { mimeType: input.mime_type, size: input.size, checksum: input.checksum }, 300),
    async beginMultipart(id, input) {
      if (input.category !== 'TRACK_AUDIO' || input.size <= MULTIPART_THRESHOLD_BYTES) throw new ApiError(400, 'BAD_REQUEST');
      const result = await client.send(new CreateMultipartUploadCommand({ Bucket: options.bucket, Key: stagingKey(id),
        ContentType: input.mime_type, Metadata: { checksum: input.checksum } }));
      if (!result.UploadId) throw new ApiError(503, 'MEDIA_UPLOAD_UNAVAILABLE');
      return result.UploadId;
    },
    async multipartParts(row) {
      try {
        const parts = await listedParts(row);
        return { parts: parts.filter(part => part.number >= 1 && part.number <= Math.ceil(Number(row.size) / MULTIPART_PART_SIZE_BYTES)
          && part.size === Math.min(MULTIPART_PART_SIZE_BYTES, Number(row.size) - (part.number - 1) * MULTIPART_PART_SIZE_BYTES))
          .map(part => part.number), completed: false };
      } catch (error) {
        if (missing(error) && await stagingComplete(row)) return { parts: [], completed: true };
        throw error;
      }
    },
    async multipartPart(row, partNumber) {
      const remaining = Number(row.size) - (partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
      if (!Number.isInteger(partNumber) || partNumber < 1 || remaining <= 0) throw new ApiError(400, 'BAD_REQUEST');
      const url = await getSignedUrl(signer, new UploadPartCommand({ Bucket: options.bucket, Key: stagingKey(row.id),
        UploadId: uploadId(row), PartNumber: partNumber }), { expiresIn: 300 });
      return { url, size: Math.min(remaining, MULTIPART_PART_SIZE_BYTES) };
    },
    async finishMultipart(row) {
      let parts: Awaited<ReturnType<typeof listedParts>>;
      try { parts = await listedParts(row); }
      catch (error) {
        if (missing(error) && await stagingComplete(row)) return;
        throw error;
      }
      const count = Math.ceil(Number(row.size) / MULTIPART_PART_SIZE_BYTES);
      if (parts.length !== count || parts.some((part, index) => part.number !== index + 1
        || part.size !== Math.min(MULTIPART_PART_SIZE_BYTES, Number(row.size) - index * MULTIPART_PART_SIZE_BYTES))) {
        throw new ApiError(409, 'MEDIA_PARTS_INCOMPLETE');
      }
      await client.send(new CompleteMultipartUploadCommand({ Bucket: options.bucket, Key: stagingKey(row.id),
        UploadId: uploadId(row), MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.number, ETag: part.etag })) } }));
    },
    async abortMultipart(row) {
      try { await client.send(new AbortMultipartUploadCommand({ Bucket: options.bucket, Key: stagingKey(row.id), UploadId: uploadId(row) })); }
      catch (error) { if (!missing(error)) throw error; }
    },
    async verify(row) {
      const dir = await mkdtemp(join(tmpdir(), 'soundpub-media-'));
      try {
        let object;
        try { object = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: stagingKey(row.id) })); }
        catch (error) { if (missing(error)) throw new ApiError(409, 'MEDIA_BYTES_MISSING'); throw error; }
        if (!object.Body) throw new ApiError(409, 'MEDIA_BYTES_MISSING');
        const body = object.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
        try {
          if (object.ContentLength !== Number(row.size) || object.ContentType !== row.mime_type) throw new ApiError(400, 'MEDIA_METADATA_MISMATCH');
          const file = await open(join(dir, 'bytes'), 'wx', 0o600);
          const hash = createHash('sha256');
          let size = 0;
          let header = Buffer.alloc(0);
          try {
            for await (const bytes of body) {
              size += bytes.byteLength;
              if (size > Number(row.size)) throw new ApiError(400, 'MEDIA_SIZE_MISMATCH');
              if (header.length < 64) header = Buffer.concat([header, Buffer.from(bytes).subarray(0, 64 - header.length)]);
              hash.update(bytes);
              await file.writeFile(bytes);
            }
          } finally { await file.close(); }
          if (size !== Number(row.size) || hash.digest('hex') !== row.checksum) throw new ApiError(400, 'MEDIA_CHECKSUM_MISMATCH');
          assertMediaSignature(header, row.mime_type);
          // Stream verified snapshot to an immutable key; replayed staging PUT cannot mutate active bytes.
          const stream = createReadStream(join(dir, 'bytes'));
          try { await client.send(new PutObjectCommand({ Bucket: options.bucket, Key: key(row.id), Body: stream,
            ContentLength: size, ContentType: row.mime_type, ChecksumSHA256: Buffer.from(row.checksum, 'hex').toString('base64') })); }
          finally { stream.destroy(); }
        } finally { body.destroy?.(); }
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
    download: row => storage.signedUrl({ id: row.owner_user_id }, row.id, 60),
    remove: row => storage.delete({ id: row.owner_user_id }, row.id),
    async removeStaging(row) { await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: stagingKey(row.id) })); },
    async inspect(row) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key(row.id), ChecksumMode: 'ENABLED' }));
        return head.ContentLength === Number(row.size) && head.ContentType === row.mime_type
          && (!head.ChecksumSHA256 || head.ChecksumSHA256 === Buffer.from(row.checksum, 'hex').toString('base64')) ? 'ok' : 'mismatch';
      } catch (error) { if (missing(error)) return 'missing'; throw error; }
    },
    async listKeys() {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: options.bucket, Prefix: `${prefix}/`, ...(token ? { ContinuationToken: token } : {}) }));
        keys.push(...(page.Contents ?? []).flatMap(object => object.Key ? [object.Key] : []));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    close() { storage.close(); client.destroy(); signer.destroy(); },
  };
}
