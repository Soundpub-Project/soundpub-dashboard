import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertAuthenticated, assertMimeBytes, assertObjectAccess, StorageError } from './index.js';
import type { MetadataRepository, ObjectMetadata, ObjectStorage, StorageActor, StoredObject, UploadInput } from './index.js';

export class MemoryMetadataRepository implements MetadataRepository {
  private readonly rows = new Map<string, ObjectMetadata>();

  async get(id: string): Promise<ObjectMetadata | undefined> {
    const row = this.rows.get(id);
    return row && { ...row };
  }

  async insert(metadata: ObjectMetadata): Promise<void> {
    if (this.rows.has(metadata.id)) throw new Error('Duplicate object ID');
    this.rows.set(metadata.id, { ...metadata });
  }

  async delete(id: string): Promise<void> { this.rows.delete(id); }
}

export interface MemoryStorageOptions {
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
  metadata?: MetadataRepository;
  /** Injectable clock for deterministic expiry checks. */
  now?: () => number;
}

// ponytail: memory-only test/dev storage; add durable provider for restart persistence.
export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Uint8Array>();
  private readonly repository: MetadataRepository;
  private readonly secret = randomBytes(32);
  private readonly namespace = randomUUID();
  private readonly mimeTypes: Set<string>;
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(options: MemoryStorageOptions) {
    if (!Number.isSafeInteger(options.maxSizeBytes) || options.maxSizeBytes < 1
      || !options.allowedMimeTypes.length
      || options.allowedMimeTypes.some(mime => !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime))) {
      throw new StorageError('INVALID_INPUT', 'Positive maximum size and explicit MIME allowlist required');
    }
    this.maxSize = options.maxSizeBytes;
    this.mimeTypes = new Set(options.allowedMimeTypes);
    this.repository = options.metadata ?? new MemoryMetadataRepository();
    this.now = options.now ?? Date.now;
  }

  async upload(actor: StorageActor, input: UploadInput): Promise<ObjectMetadata> {
    assertAuthenticated(actor);
    if (!input || !(input.data instanceof Uint8Array) || !this.mimeTypes.has(input.mimeType)
      || input.data.byteLength > this.maxSize
      || typeof input.checksum !== 'string' || !/^[a-fA-F0-9]{64}$/.test(input.checksum)) {
      throw new StorageError('INVALID_INPUT', 'Invalid MIME, size, data or SHA-256 checksum');
    }
    const data = Uint8Array.from(input.data);
    const checksum = createHash('sha256').update(data).digest('hex');
    if (checksum !== input.checksum.toLowerCase()) throw new StorageError('INVALID_INPUT', 'Checksum mismatch');
    assertMimeBytes(data, input.mimeType);
    const metadata: ObjectMetadata = {
      id: randomUUID(), ownerId: actor.id, mimeType: input.mimeType,
      size: data.byteLength, checksum, visibility: 'private', createdAt: new Date(this.now()).toISOString(),
    };
    await this.repository.insert(metadata);
    this.objects.set(metadata.id, data);
    return { ...metadata };
  }

  private async metadata(id: string): Promise<ObjectMetadata> {
    const metadata = await this.repository.get(id);
    if (!metadata || !this.objects.has(id)) throw new StorageError('NOT_FOUND', 'Object not found');
    return metadata;
  }

  async download(actor: StorageActor, id: string): Promise<StoredObject> {
    assertAuthenticated(actor);
    const metadata = await this.metadata(id);
    assertObjectAccess(actor, metadata);
    return { metadata, data: Uint8Array.from(this.objects.get(id)!) };
  }

  async objectExists(actor: StorageActor, id: string): Promise<boolean> {
    try { await this.download(actor, id); return true; }
    catch (error) { if (error instanceof StorageError && error.code === 'NOT_FOUND') return false; throw error; }
  }
  async delete(actor: StorageActor, id: string): Promise<void> {
    assertAuthenticated(actor);
    assertObjectAccess(actor, await this.metadata(id));
    await this.repository.delete(id);
    this.objects.delete(id);
  }

  private signature(id: string, expires: string): string {
    return createHmac('sha256', this.secret).update(`${this.namespace}\n${id}\n${expires}`).digest('hex');
  }

  async signedUrl(actor: StorageActor, id: string, expiresInSeconds: number): Promise<string> {
    assertAuthenticated(actor);
    assertObjectAccess(actor, await this.metadata(id));
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
      throw new StorageError('INVALID_INPUT', 'URL lifetime must be 1–3600 seconds');
    }
    const expires = String(this.now() + expiresInSeconds * 1000);
    return `memory://${this.namespace}/${id}?expires=${expires}&signature=${this.signature(id, expires)}`;
  }

  /** Bearer capability for tests; memory:// is not an HTTP endpoint. */
  async downloadSignedUrl(value: string): Promise<StoredObject> {
    let url: URL;
    try { url = new URL(value); } catch { throw new StorageError('INVALID_SIGNATURE', 'Invalid signed URL'); }
    const id = url.pathname.slice(1);
    const expires = url.searchParams.get('expires') ?? '';
    const signature = url.searchParams.get('signature') ?? '';
    if (url.protocol !== 'memory:' || url.host !== this.namespace || url.username || url.password || url.hash
      || !/^[0-9]+$/.test(expires) || !Number.isSafeInteger(Number(expires))
      || !/^[a-f0-9]{64}$/.test(signature)
      || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(this.signature(id, expires), 'hex'))) {
      throw new StorageError('INVALID_SIGNATURE', 'Invalid signed URL');
    }
    if (this.now() >= Number(expires)) throw new StorageError('EXPIRED', 'Signed URL expired');
    const metadata = await this.metadata(id);
    return { metadata, data: Uint8Array.from(this.objects.get(id)!) };
  }
}

