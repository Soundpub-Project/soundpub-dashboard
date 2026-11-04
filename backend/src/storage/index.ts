export type StorageActor = Readonly<{ id: string; role?: string }>;

export interface ObjectMetadata {
  id: string;
  ownerId: string;
  mimeType: string;
  size: number;
  /** Lowercase SHA-256 hex digest. */
  checksum: string;
  visibility: 'private';
  createdAt: string;
}

/** Implementations must return/store copies and reject duplicate IDs. */
export interface MetadataRepository {
  get(id: string): Promise<ObjectMetadata | undefined>;
  insert(metadata: ObjectMetadata): Promise<void>;
  delete(id: string): Promise<void>;
  markReady?(id: string): Promise<void>;
}

export interface UploadInput {
  data: Uint8Array;
  mimeType: string;
  /** Required SHA-256 hex digest, verified before storage. */
  checksum: string;
}

export interface StoredObject {
  metadata: ObjectMetadata;
  data: Uint8Array;
}

/** Actors must come from trusted server authentication, never request bodies. */
export interface ObjectStorage {
  upload(actor: StorageActor, input: UploadInput): Promise<ObjectMetadata>;
  download(actor: StorageActor, id: string): Promise<StoredObject>;
  delete(actor: StorageActor, id: string): Promise<void>;
  objectExists(actor: StorageActor, id: string): Promise<boolean>;
  signedUrl(actor: StorageActor, id: string, expiresInSeconds: number): Promise<string>;
}

export class StorageError extends Error {
  readonly code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'EXPIRED' | 'INVALID_SIGNATURE';

  constructor(code: StorageError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'StorageError';
  }
}

export function assertMimeBytes(data: Uint8Array, mimeType: string): void {
  // ponytail: signatures identify formats, not file integrity; add a decoder for structural validation.
  const signature = mimeType === 'image/png' ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    : mimeType === 'image/jpeg' ? [0xff, 0xd8, 0xff]
    : mimeType === 'application/pdf' ? [0x25, 0x50, 0x44, 0x46, 0x2d] : undefined;
  if (signature && signature.every((byte, index) => data[index] === byte)) return;
  if (mimeType === 'text/plain' && !data.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      return;
    } catch { /* Invalid UTF-8 must not be accepted through replacement characters. */ }
  }
  throw new StorageError('INVALID_INPUT', 'Bytes do not match MIME type');
}

export function assertAuthenticated(actor: StorageActor): void {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) {
    throw new StorageError('FORBIDDEN', 'Authenticated actor required');
  }
}

export function canAccessObject(actor: StorageActor, metadata: ObjectMetadata): boolean {
  return !!actor && typeof actor.id === 'string' && !!actor.id.trim()
    && (actor.id === metadata.ownerId || actor.role === 'admin');
}

export function assertObjectAccess(actor: StorageActor, metadata: ObjectMetadata): void {
  if (!canAccessObject(actor, metadata)) throw new StorageError('FORBIDDEN', 'Owner or admin required');
}

export { MemoryMetadataRepository, MemoryObjectStorage } from './memory.js';
export type { MemoryStorageOptions } from './memory.js';
export { S3DevObjectStorage } from './s3.js';
export type { S3DevStorageOptions, SignedUpload } from './s3.js';

export { createPgMetadataRepository } from './pg.js';

