import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { transaction, type SqlClient, type SqlPool } from '../worker/index.js';

export interface WebhookInput {
  provider: string;
  eventId: string;
  rawBody: Uint8Array;
  signature: string;
  timestamp: string;
}

// Signed envelope binds event ID and timestamp to exact raw bytes.
export function webhookSignature(secret: string, input: Pick<WebhookInput, 'eventId' | 'timestamp' | 'rawBody'>): string {
  if (!secret) throw new Error('Webhook secret required');
  return createHmac('sha256', secret).update(`${input.timestamp}.${input.eventId}.`).update(input.rawBody).digest('hex');
}

export async function receiveWebhook(pool: SqlPool, input: WebhookInput, secret: string,
  handle: (payload: unknown, db: SqlClient) => Promise<void>, options: { nowMs?: number; toleranceSeconds?: number; maxBodyBytes?: number } = {},
): Promise<'accepted' | 'duplicate'> {
  const { nowMs = Date.now(), toleranceSeconds = 300, maxBodyBytes = 1048576 } = options;
  if (!Number.isFinite(nowMs) || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0 || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error('Invalid webhook policy');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(input.provider) || !/^[a-zA-Z0-9_:-]{1,200}$/.test(input.eventId)) throw new Error('Invalid webhook identity');
  if (!(input.rawBody instanceof Uint8Array) || input.rawBody.byteLength > maxBodyBytes) throw new Error('Invalid webhook body');
  if (!/^\d{1,12}$/.test(input.timestamp) || Math.abs(nowMs / 1000 - Number(input.timestamp)) > toleranceSeconds) throw new Error('Webhook timestamp expired or invalid');
  if (!/^[a-fA-F0-9]{64}$/.test(input.signature)) throw new Error('Invalid webhook signature');
  const expected = Buffer.from(webhookSignature(secret, input), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(input.signature, 'hex'))) throw new Error('Invalid webhook signature');
  const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.rawBody)) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Webhook payload must be an object');
  const digest = createHash('sha256').update(input.rawBody).digest('hex');
  return transaction(pool, async db => {
    const inserted = await db.query(`INSERT INTO webhook_events (provider, event_id, payload_sha256)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id`, [input.provider, input.eventId, digest]);
    if (!inserted.rows.length) {
      const existing = await db.query<{ payload_sha256: string }>(
        'SELECT payload_sha256 FROM webhook_events WHERE provider = $1 AND event_id = $2', [input.provider, input.eventId]);
      if (existing.rows[0]?.payload_sha256 !== digest) throw new Error('Webhook event ID reused with different body');
      return 'duplicate';
    }
    await handle(payload, db);
    await db.query(`UPDATE webhook_events SET status = 'processed', processed_at = now(), attempts = attempts + 1
      WHERE provider = $1 AND event_id = $2`, [input.provider, input.eventId]);
    return 'accepted';
  });
}

