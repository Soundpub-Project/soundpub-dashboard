import { z } from "zod";
import { assertFoundationEnvironment, parseIsolatedDatabaseUrl } from "./database-target.js";

const localBrowserOrigins = z.string().default('http://localhost:8281,http://127.0.0.1:8281').transform((raw, context) => {
  const origins = [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean))];
  const valid = origins.length > 0 && origins.length <= 4 && origins.every(origin => {
    try {
      const url = new URL(origin);
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        && !!url.port && url.origin === origin;
    } catch { return false; }
  });
  if (!valid) {
    context.addIssue({ code: 'custom', message: 'Must contain one to four local HTTP origins with explicit ports' });
    return z.NEVER;
  }
  return origins;
});

const forbiddenProductionTargets = [
  "20.20.20.3",
  "20.20.20.173",
  "supabase.carubra.space",
  "supabase.carubra.com",
];

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  HOST: z.enum(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  RECONCILIATION_DATABASE_URL: z.string().url(),
  AUDIT_DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PARTNER_LABEL_ID: z.preprocess(value => value === '' ? undefined : value, z.uuid().optional()),
  DEV_AUTH_TOKENS_JSON: z.string().refine((raw) => {
    try {
      const value: unknown = JSON.parse(raw);
      return z.record(z.string().min(8).max(200), z.object({
        issuer: z.string().min(1), subject: z.string().min(1),
      }).strict()).safeParse(value).success;
    } catch { return false; }
  }, 'Must map development tokens to issuer and subject').default("{}"),
  OBJECT_STORAGE_ENDPOINT: z.enum(['object-storage', 'localhost', '127.0.0.1']),
  OBJECT_STORAGE_PUBLIC_ENDPOINT: z.string().url().default('http://127.0.0.1:9100'),
  OBJECT_STORAGE_BROWSER_ORIGINS: localBrowserOrigins,
  OBJECT_STORAGE_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  OBJECT_STORAGE_USE_SSL: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(8),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(12),
  OBJECT_STORAGE_BUCKET: z.string().min(3).default("soundpub-development"),
  WEBHOOK_MOCK_SECRET: z.string().min(16),
  AUTH_DELIVERY_SECRET: z.string().min(32),
  AUTH_DELIVERY_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default('legacy'),
  AUTH_DELIVERY_PREVIOUS_KEYS_JSON: z.string().default('{}').transform((raw, context) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      const keys = z.record(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), z.string().min(32)).safeParse(parsed);
      if (keys.success) return keys.data;
    } catch {}
    context.addIssue({ code: 'custom', message: 'Must be a JSON object of key IDs and secrets' });
    return z.NEVER;
  }),
  WORKER_POLL_MS: z.coerce.number().int().min(50).max(60000).default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  FINANCE_RECONCILIATION_INTERVAL_MS: z.coerce.number().int().min(10_000).max(86_400_000).default(300_000),
  FINANCE_RECONCILIATION_ISSUE_LIMIT: z.coerce.number().int().min(1).max(5000).default(500),
  FINANCE_RECONCILIATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(5000),
  STORAGE_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  assertFoundationEnvironment(environment.NODE_ENV);
  const forbidden = Object.entries(environment).find(([, value]) =>
    value && forbiddenProductionTargets.some((target) => value.toLowerCase().includes(target)),
  );
  if (forbidden) {
    throw new Error(`Phase 2 isolation violation: ${forbidden[0]} references a forbidden production target`);
  }
  parseIsolatedDatabaseUrl(environment.DATABASE_URL, ['soundpub_app']);
  parseIsolatedDatabaseUrl(environment.RECONCILIATION_DATABASE_URL, ['soundpub_reconciler']);
  parseIsolatedDatabaseUrl(environment.AUDIT_DATABASE_URL, ['soundpub_auditor']);
  if (environment.OBJECT_STORAGE_PUBLIC_ENDPOINT) {
    let endpoint: URL;
    try { endpoint = new URL(environment.OBJECT_STORAGE_PUBLIC_ENDPOINT); }
    catch { throw new Error('Public object-store endpoint must be local development storage'); }
    if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
        !endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      throw new Error('Public object-store endpoint must be local development storage');
    }
  }
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid backend configuration: ${details}`);
  }

  if (parsed.data.PARTNER_LABEL_ID && (environment.IDENTITY_PROVIDER !== 'oidc' || !environment.OIDC_CLIENT_ID)) {
    throw new Error('Partner SSO requires OIDC identity provider and client ID');
  }
  if (Object.hasOwn(parsed.data.AUTH_DELIVERY_PREVIOUS_KEYS_JSON, parsed.data.AUTH_DELIVERY_KEY_ID)) {
    throw new Error('Active auth delivery key ID conflicts with a previous key ID');
  }

  return parsed.data;
}





