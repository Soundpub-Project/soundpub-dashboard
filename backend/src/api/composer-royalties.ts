import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from '../auth/index.js';
import type { ComposerRoyaltiesService } from '../composer-royalties/index.js';
import { composerStatement, composerStatementPreview } from '../composer-royalties/contracts.js';

export function registerComposerRoyaltiesRoutes(app: FastifyInstance, service: ComposerRoyaltiesService,
  authenticate: (request: FastifyRequest) => Promise<Principal>, paths: Record<string, Record<string, unknown>>,
  errorSchema: object) {
  const path = '/api/v1/copyright/royalties/preview';
  const body = z.toJSONSchema(composerStatement, { target: 'openapi-3.0', io: 'input' });
  const response = z.toJSONSchema(composerStatementPreview, { target: 'openapi-3.0' });
  const responses = Object.fromEntries([200, 400, 401, 403, 429, 500, 503].map(status => [status, {
    description: status === 200 ? 'Success' : 'Error',
    content: { 'application/json': { schema: status === 200 ? response : errorSchema } },
  }]));
  paths[path] = { post: {
    operationId: 'previewComposerRoyalties',
    security: [{ bearerAuth: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: body } } },
    responses,
  } };
  app.post(path, { schema: { body, response: Object.fromEntries(
    Object.entries(responses).map(([status, value]) => [status, value.content['application/json'].schema]),
  ) } }, async request => service.preview(await authenticate(request), request.body));
}
