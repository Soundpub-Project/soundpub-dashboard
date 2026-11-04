import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { catalogPage, catalogRelease, type PublicCatalogService } from '../public-catalog/index.js';

export function registerPublicCatalogRoutes(app: FastifyInstance, service: PublicCatalogService,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const querystring = { type: 'object', additionalProperties: false, properties: {
    limit: { type: 'string', pattern: '^(100|[1-9][0-9]?)$' },
    offset: { type: 'string', pattern: '^(0|[1-9][0-9]{0,5})$' },
    search: { type: 'string', maxLength: 200 }, genre: { type: 'string', maxLength: 200 },
  } };
  const params = z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' });
  for (const detail of [false, true]) {
    const url = `/api/v1/public/releases${detail ? '/:id' : ''}`;
    const response = { 200: z.toJSONSchema(detail ? catalogRelease : catalogPage, { target: 'openapi-3.0' }),
      ...Object.fromEntries([400, 404, 429, 500].map(status => [status, errorSchema])) };
    app.get(url, { schema: { ...(detail ? { params } : { querystring }), response } },
      request => detail ? service.get((request.params as { id: string }).id) : service.list(request.query));
    paths[url.replace(':id', '{id}')] = { get: {
      operationId: detail ? 'getPublicRelease' : 'listPublicReleases', security: [],
      parameters: detail ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }]
        : Object.entries(querystring.properties).map(([name, schema]) => ({ name, in: 'query', schema })),
      responses: Object.fromEntries(Object.entries(response).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
}
