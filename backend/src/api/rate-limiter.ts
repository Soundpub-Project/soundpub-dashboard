import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { RateLimiter } from './types.js';

export function rateLimitForRoute(route: string) {
  return route === '/api/v1/auth/login' || route === '/api/v1/auth/partner' || route.includes('/api/v1/auth/email-verification/') ||
    route.includes('/api/v1/auth/password-recovery/') ? 10 : route.includes('/webhooks/') ? 120 :
    route.includes('/admin/') ? 30 : route === '/api/v1/me' ? 60 :
    route.includes('/storage/') || route.includes('/actions/') ? 120 : 300;
}

export function createSharedRateLimiter(pool: Pool): RateLimiter {
  let nextCleanupAt = 0;
  return {
    async consume({ key, route }) {
      const now = Date.now();
      if (now >= nextCleanupAt) {
        nextCleanupAt = now + 60_000;
        await pool.query("DELETE FROM soundpub.rate_limit_windows WHERE reset_at < clock_timestamp() - interval '1 minute'");
      }
      const hash = createHash('sha256').update(JSON.stringify([route, key])).digest('hex');
      const result = await pool.query<{ hits: number; remaining_ms: string }>(`
        INSERT INTO soundpub.rate_limit_windows(key_hash,hits,reset_at)
        VALUES ($1,1,clock_timestamp() + interval '60 seconds')
        ON CONFLICT (key_hash) DO UPDATE SET
          hits = CASE WHEN soundpub.rate_limit_windows.reset_at <= clock_timestamp()
            THEN 1 ELSE soundpub.rate_limit_windows.hits + 1 END,
          reset_at = CASE WHEN soundpub.rate_limit_windows.reset_at <= clock_timestamp()
            THEN clock_timestamp() + interval '60 seconds' ELSE soundpub.rate_limit_windows.reset_at END
        RETURNING hits, GREATEST(0, EXTRACT(EPOCH FROM (reset_at - clock_timestamp())) * 1000)::text AS remaining_ms`, [hash]);
      const row = result.rows[0]!;
      if (row.hits <= rateLimitForRoute(route)) return { allowed: true };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(Number(row.remaining_ms) / 1000)) };
    },
  };
}
