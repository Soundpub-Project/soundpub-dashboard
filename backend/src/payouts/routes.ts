import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError } from '../api/types.js';
import type { Principal } from '../auth/index.js';
import type { PayoutsService } from './index.js';

/** Coordinator mounts from API composition; intentionally no browser settlement route. */
export function registerPayoutRoutes(app: FastifyInstance, service: PayoutsService,
  authenticate: (request: FastifyRequest) => Promise<Principal>) {
  const key = (r: FastifyRequest) => {
    const value = r.headers['idempotency-key'];
    if (typeof value !== 'string') throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
    return value;
  };
  const id = (r: FastifyRequest) => (r.params as { id: string }).id;
  app.get('/api/v1/payouts/destination', async r => service.destination(await authenticate(r)));
  app.put('/api/v1/payouts/destination', async r => service.updateDestination(await authenticate(r), r.body));
  app.post('/api/v1/admin/payouts/readiness/:id', async r => service.reviewReadiness(await authenticate(r), id(r), r.body, key(r)));
  app.get('/api/v1/payouts/eligibility', async r => service.eligibility(await authenticate(r)));
  app.get('/api/v1/payouts', async r => service.list(await authenticate(r), r.query));
  app.get('/api/v1/admin/payouts', async r => service.list(await authenticate(r), r.query, true));
  app.get('/api/v1/payouts/:id', async r => service.detail(await authenticate(r), id(r)));
  app.post('/api/v1/payouts', async r => service.request(await authenticate(r), r.body, key(r)));
  app.post('/api/v1/payouts/:id/cancel', async r => service.cancel(await authenticate(r), id(r), key(r)));
  app.post('/api/v1/admin/payouts/:id/transition', async r => service.transition(await authenticate(r), id(r), r.body, key(r)));
}
