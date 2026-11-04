import { createHash, randomUUID } from 'node:crypto';
import {
  S3Client, CreateBucketCommand, DeleteBucketPolicyCommand, DeleteObjectCommand,
  GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertAuthenticated, assertMimeBytes, assertObjectAccess, StorageError } from './index.js';
import type { MetadataRepository, ObjectMetadata, ObjectStorage, StorageActor, StoredObject, UploadInput } from './index.js';

export interface S3DevStorageOptions {
  environment: 'development' | 'test';
  /** Docker backend endpoint, e.g. http://minio:9000. */
  endpoint: string;
  /** Browser endpoint, e.g. http://localhost:9000. Never rewrite signed URLs. */
  publicEndpoint: string;
  region?: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  /** Dedicated dev bucket: initialization removes its bucket policy. */
  bucket: string;
  prefix?: string;
  metadata: MetadataRepository;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
}

export interface SignedUpload {
  metadata: ObjectMetadata;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function missing(error: unknown): boolean {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return value?.$metadata?.httpStatusCode === 404 || ['NoSuchKey', 'NoSuchBucket', 'NotFound'].includes(value?.name ?? '');
}

function lifetime(seconds: number): void {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600) {
    throw new StorageError('INVALID_INPUT', 'URL lifetime must be 1–3600 seconds');
  }
}

/** MinIO Docker dev adapter using S3 protocol. No production provider wiring. */
export class S3DevObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signer: S3Client;
  private readonly prefix: string;
  private readonly mimeTypes: Set<string>;
  private readonly options: S3DevStorageOptions;

  private constructor(options: S3DevStorageOptions) {
    if (!['development', 'test'].includes(options.environment) || process.env.NODE_ENV === 'production') {
      throw new StorageError('INVALID_INPUT', 'S3 dev adapter cannot run in production');
    }
    for (const endpoint of [options.endpoint, options.publicEndpoint]) {
      const url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new StorageError('INVALID_INPUT', 'S3 endpoint must be an HTTP origin');
      }
    }
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket)
      || !Number.isSafeInteger(options.maxSizeBytes) || options.maxSizeBytes < 1
      || !options.allowedMimeTypes.length
      || options.allowedMimeTypes.some(mime => !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime))
      || !options.credentials.accessKeyId || !options.credentials.secretAccessKey) {
      throw new StorageError('INVALID_INPUT', 'Invalid dev storage configuration');
    }
    this.prefix = options.prefix ?? 'private';
    if (!/^[a-zA-Z0-9_-]+$/.test(this.prefix)) throw new StorageError('INVALID_INPUT', 'Invalid private prefix');
    this.options = { ...options, credentials: { ...options.credentials } };
    this.mimeTypes = new Set(options.allowedMimeTypes);
    const common = { region: options.region ?? 'us-east-1', credentials: this.options.credentials, forcePathStyle: true };
    this.client = new S3Client({ ...common, endpoint: options.endpoint });
    this.signer = new S3Client({ ...common, endpoint: options.publicEndpoint });
  }

  static async create(options: S3DevStorageOptions): Promise<S3DevObjectStorage> {
    const storage = new S3DevObjectStorage(options);
    try {
      try { await storage.client.send(new HeadBucketCommand({ Bucket: options.bucket })); }
      catch (error) {
        if (!missing(error)) throw error;
        await storage.client.send(new CreateBucketCommand({ Bucket: options.bucket }));
      }
      // MinIO buckets are private without policy; never install anonymous access.
      await storage.client.send(new DeleteBucketPolicyCommand({ Bucket: options.bucket }));
      return storage;
    } catch (error) { storage.close(); throw error; }
  }

  close(): void { this.client.destroy(); this.signer.destroy(); }

  async isReady(): Promise<boolean> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    return true;
  }

  private key(id: string, staging = false): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new StorageError('NOT_FOUND', 'Object not found');
    return `${this.prefix}/${staging ? 'staging' : 'objects'}/${id}`;
  }

  private validate(input: { mimeType: string; size: number; checksum: string }): void {
    if (!input || typeof input !== 'object' || !this.mimeTypes.has(input.mimeType)
      || !Number.isSafeInteger(input.size) || input.size < 0
      || input.size > this.options.maxSizeBytes || typeof input.checksum !== 'string' || !/^[a-fA-F0-9]{64}$/.test(input.checksum)) {
      throw new StorageError('INVALID_INPUT', 'Invalid MIME, size or SHA-256 checksum');
    }
  }

  private async owned(actor: StorageActor, id: string): Promise<ObjectMetadata> {
    assertAuthenticated(actor);
    this.key(id);
    const metadata = await this.options.metadata.get(id);
    if (!metadata) throw new StorageError('NOT_FOUND', 'Object not found');
    assertObjectAccess(actor, metadata);
    return metadata;
  }

  private descriptor(actor: StorageActor, input: { mimeType: string; size: number; checksum: string }): ObjectMetadata {
    return this.descriptorForId(actor, randomUUID(), input);
  }

  private descriptorForId(actor: StorageActor, id: string,
    input: { mimeType: string; size: number; checksum: string }): ObjectMetadata {
    assertAuthenticated(actor);
    if (typeof id !== 'string' || !uuid.test(id)) throw new StorageError('INVALID_INPUT', 'Valid object UUID required');
    this.validate(input);
    return { id, ownerId: actor.id, mimeType: input.mimeType, size: input.size,
      checksum: input.checksum.toLowerCase(), visibility: 'private', createdAt: new Date().toISOString() };
  }

  private put(metadata: ObjectMetadata, data?: Uint8Array, staging = false): PutObjectCommand {
    return new PutObjectCommand({ Bucket: this.options.bucket, Key: this.key(metadata.id, staging),
      ContentType: metadata.mimeType, ContentLength: metadata.size,
      ChecksumSHA256: Buffer.from(metadata.checksum, 'hex').toString('base64'),
      ...(data ? { Body: data } : {}) });
  }

  async upload(actor: StorageActor, input: UploadInput): Promise<ObjectMetadata> {
    assertAuthenticated(actor);
    if (!input || !(input.data instanceof Uint8Array)) throw new StorageError('INVALID_INPUT', 'Byte data required');
    const data = Uint8Array.from(input.data);
    const metadata = this.descriptor(actor, { ...input, size: data.byteLength });
    if (createHash('sha256').update(data).digest('hex') !== metadata.checksum) throw new StorageError('INVALID_INPUT', 'Checksum mismatch');
    assertMimeBytes(data, metadata.mimeType);
    await this.client.send(this.put(metadata, data));
    try { await this.options.metadata.insert(metadata); await this.options.metadata.markReady?.(metadata.id); }
    catch (error) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(metadata.id) }));
      throw error;
    }
    return metadata;
  }

  private async read(metadata: ObjectMetadata, staging = false): Promise<StoredObject> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: this.key(metadata.id, staging) }));
      if (!object.Body) throw new StorageError('NOT_FOUND', 'Object body missing');
      const body = object.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
      if (object.ContentLength !== metadata.size || object.ContentType !== metadata.mimeType) {
        body.destroy?.();
        throw new StorageError('INVALID_INPUT', 'Stored MIME or size mismatch');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > metadata.size || size > this.options.maxSizeBytes) {
          body.destroy?.();
          throw new StorageError('INVALID_INPUT', 'Stored object too large');
        }
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      if (size !== metadata.size || createHash('sha256').update(data).digest('hex') !== metadata.checksum) {
        throw new StorageError('INVALID_INPUT', 'Stored size or checksum mismatch');
      }
      return { metadata, data };
    } catch (error) {
      if (missing(error)) throw new StorageError('NOT_FOUND', 'Object not found');
      throw error;
    }
  }

  async download(actor: StorageActor, id: string): Promise<StoredObject> {
    return this.read(await this.owned(actor, id));
  }

  async getObject(actor: StorageActor, id: string): Promise<StoredObject> { return this.download(actor, id); }

  async signedUrl(actor: StorageActor, id: string, expiresInSeconds: number): Promise<string> {
    const metadata = await this.owned(actor, id);
    lifetime(expiresInSeconds);
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.key(metadata.id) })); }
    catch (error) {
      if (missing(error)) throw new StorageError('NOT_FOUND', 'Object not found');
      throw error;
    }
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.options.bucket, Key: this.key(id) }), { expiresIn: expiresInSeconds });
  }

  async signedDownloadUrl(actor: StorageActor, id: string, expiresInSeconds: number): Promise<string> {
    return this.signedUrl(actor, id, expiresInSeconds);
  }

  /** Upload intent is stored in injected repository so completion survives restart. */
  async signedUploadUrl(actor: StorageActor, input: { mimeType: string; size: number; checksum: string }, expiresInSeconds: number): Promise<SignedUpload> {
    return this.signedUploadUrlForId(actor, randomUUID(), input, expiresInSeconds);
  }

  /** Fixed IDs let callers persist business rows and upload capabilities atomically. */
  async signedUploadUrlForId(actor: StorageActor, id: string,
    input: { mimeType: string; size: number; checksum: string }, expiresInSeconds: number): Promise<SignedUpload> {
    const metadata = this.descriptorForId(actor, id, input);
    lifetime(expiresInSeconds);
    const headers = { 'content-type': metadata.mimeType, 'content-length': String(metadata.size),
      'x-amz-checksum-sha256': Buffer.from(metadata.checksum, 'hex').toString('base64') };
    const url = await getSignedUrl(this.signer, this.put(metadata, undefined, true), {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
      unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
    });
    await this.options.metadata.insert(metadata);
    return { metadata, url, method: 'PUT', headers };
  }

  /** Only verified bytes reach download keys. Replaying PUT cannot change them. */
  async completeUpload(actor: StorageActor, id: string): Promise<ObjectMetadata> {
    const metadata = await this.owned(actor, id);
    const { data } = await this.read(metadata, true);
    assertMimeBytes(data, metadata.mimeType);
    await this.client.send(this.put(metadata, data));
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(id, true) }));
    await this.options.metadata.markReady?.(id);
    return metadata;
  }

  async objectExists(actor: StorageActor, id: string): Promise<boolean> {
    const metadata = await this.owned(actor, id);
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.key(metadata.id) })); return true; }
    catch (error) { if (missing(error)) return false; throw error; }
  }
  async delete(actor: StorageActor, id: string): Promise<void> {
    await this.owned(actor, id);
    for (const staging of [false, true]) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.key(id, staging) }));
    }
    await this.options.metadata.delete(id);
  }
}



