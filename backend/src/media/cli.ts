import { loadConfig } from '../config/index.js';
import { createPool } from '../db/pool.js';
import { createMediaObjectStore, createMediaService } from './index.js';

if (!['reconcile', 'cleanup'].includes(process.argv[2] ?? '')) throw new Error('Use reconcile or cleanup');
const config = loadConfig();
if (config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') throw new Error('Dedicated local storage only');
const pool = createPool({ connectionString: config.DATABASE_URL });
let store: Awaited<ReturnType<typeof createMediaObjectStore>> | undefined;
try {
  store = await createMediaObjectStore(pool, {
    environment: config.NODE_ENV,
    endpoint: `${config.OBJECT_STORAGE_USE_SSL ? 'https' : 'http'}://${config.OBJECT_STORAGE_ENDPOINT}:${config.OBJECT_STORAGE_PORT}`,
    publicEndpoint: config.OBJECT_STORAGE_PUBLIC_ENDPOINT,
    credentials: { accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY },
    bucket: config.OBJECT_STORAGE_BUCKET,
  allowedOrigins: config.OBJECT_STORAGE_BROWSER_ORIGINS,
  });
  const service = createMediaService(pool, store);
  const result = process.argv[2] === 'cleanup' ? await service.cleanup() : await service.reconcile();
  console.log(JSON.stringify(result));
} finally { store?.close(); await pool.end(); }
