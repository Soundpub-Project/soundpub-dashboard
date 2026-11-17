import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface InvoiceDocumentStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  signedDownload(path: string, filename: string, expiresInSeconds: number): Promise<string>;
  close(): void;
}

export interface InvoiceDocumentStoreOptions {
  environment: 'development' | 'test' | 'staging' | 'production';
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
  prefix?: string;
  region?: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
}

export function createInvoiceDocumentStore(options: InvoiceDocumentStoreOptions): InvoiceDocumentStore {
  if (!['development', 'test'].includes(options.environment) || process.env.NODE_ENV === 'production') {
    throw new Error('Invoice document store is restricted to isolated development/test');
  }
  for (const value of [options.endpoint, options.publicEndpoint]) {
    const endpoint = new URL(value);
    if (!['localhost', '127.0.0.1', '[::1]', 'object-storage', 'minio', 'rustfs'].includes(endpoint.hostname)
      || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      throw new Error('Invoice documents require isolated local object storage');
    }
  }
  const common = { region: options.region ?? 'us-east-1', credentials: options.credentials, forcePathStyle: true };
  const client = new S3Client({ ...common, endpoint: options.endpoint });
  const signer = new S3Client({ ...common, endpoint: options.publicEndpoint });
  const prefix = options.prefix ?? 'invoices';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(prefix)) throw new Error('Invalid invoice document prefix');
  const validPath = (path: string) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/SPB-[0-9]{6}-[A-F0-9]{8}\.pdf$/.test(path);
  return {
    async put(path, bytes) {
      if (!validPath(path)) throw new Error('Invalid invoice document path');
      await client.send(new PutObjectCommand({ Bucket: options.bucket, Key: `${prefix}/${path}`,
        Body: bytes, ContentLength: bytes.byteLength, ContentType: 'application/pdf',
        ContentDisposition: 'attachment' }));
    },
    async signedDownload(path, filename, expiresInSeconds) {
      if (!validPath(path) || !Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 600) {
        throw new Error('Invalid invoice document signing request');
      }
      const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: options.bucket, Key: `${prefix}/${path}`,
        ResponseContentType: 'application/pdf', ResponseContentDisposition: `attachment; filename="${safeFilename}"` }),
      { expiresIn: expiresInSeconds });
    },
    close() { client.destroy(); signer.destroy(); },
  };
}
