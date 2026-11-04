import { createHash } from 'node:crypto';

export const providerNames = ['email', 'payment', 'oidc', 'spotify', 'analytics', 'legacy-storage'] as const;
export type ProviderName = typeof providerNames[number];
export interface ProviderRequest { idempotencyKey: string; operation: string; payload: unknown }
export interface ProviderResult { provider: ProviderName; id: string; mock: true }

export function createMockProvider(provider: ProviderName) {
  const deliveries = new Map<string, { fingerprint: string; result: ProviderResult }>();
  return {
    provider,
    async execute(request: ProviderRequest): Promise<ProviderResult> {
      if (!request.idempotencyKey || !request.operation) throw new Error('Idempotency key and operation required');
      const fingerprint = createHash('sha256').update(JSON.stringify([request.operation, request.payload])).digest('hex');
      const previous = deliveries.get(request.idempotencyKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('Idempotency key reused with different request');
        return { ...previous.result };
      }
      const result: ProviderResult = { provider, id: `mock_${createHash('sha256').update(provider + ':' + request.idempotencyKey).digest('hex')}`, mock: true };
      deliveries.set(request.idempotencyKey, { fingerprint, result });
      return { ...result };
    },
    get deliveryCount() { return deliveries.size; },
  };
}

// ponytail: process-local mocks only; replace adapters with durable provider idempotency before live use.
export function createMockProviders() {
  return Object.fromEntries(providerNames.map(name => [name, createMockProvider(name)])) as Record<ProviderName, ReturnType<typeof createMockProvider>>;
}
