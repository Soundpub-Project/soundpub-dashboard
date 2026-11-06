import type { ProviderRequest } from '../integrations/index.js';
import type { OutboxHandler } from '../worker/index.js';
import { decryptDeliveryToken } from './delivery-crypto.js';

export function createAuthDeliveryHandler(
  provider: { execute(request: ProviderRequest): Promise<unknown> },
  secret: string,
  operation: 'send-email-verification' | 'send-password-reset',
): OutboxHandler {
  return async (event, db) => {
    const token = decryptDeliveryToken(event.payload, secret);
    const { token_ciphertext: _ciphertext, token_iv: _iv, token_tag: _tag, ...delivery } = event.payload as Record<string, unknown>;
    await provider.execute({ idempotencyKey: event.idempotency_key, operation, payload: { ...delivery, token } });
    await db.query("UPDATE soundpub.outbox_events SET payload=payload-'token_ciphertext'-'token_iv'-'token_tag' WHERE id=$1", [event.id]);
  };
}
