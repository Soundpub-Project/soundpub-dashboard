import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, type Principal } from './types.js';
import { exportDatasets, exportQuery, type ExportsService } from '../exports/index.js';

export function registerExportRoutes(app: FastifyInstance, service: ExportsService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const paramsSchema = z.strictObject({ dataset: z.enum(exportDatasets) });
  const querySchema = { type: 'object', additionalProperties: false, properties: {
    limit: { type: 'string', pattern: '^(?:[1-9][0-9]{0,4}|100000)$' },
  } } as const;
  const paramsJson = z.toJSONSchema(paramsSchema, { target: 'openapi-3.0' });
  app.get('/api/v1/admin/exports/:dataset', {
    schema: {
      params: paramsJson,
      querystring: querySchema,
      response: Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503]
        .map(status => [status, errorSchema])),
    },
    preValidation: async request => {
      if (!paramsSchema.safeParse(request.params).success || !exportQuery.safeParse(request.query).success) {
        throw new ApiError(400, 'BAD_REQUEST');
      }
    },
    handler: async (request, reply) => {
      const actor = await authenticate(request);
      const dataset = paramsSchema.parse(request.params).dataset;
      const result = await service.export(actor, dataset, request.query, request.id);
      reply.header('cache-control', 'no-store');
      reply.header('access-control-expose-headers', 'X-Request-Id, X-Export-Row-Count, Content-Disposition');
      reply.header('content-disposition', `attachment; filename="soundpub-${dataset}.csv"`);
      reply.header('x-export-row-count', String(result.rowCount));
      return reply.type('text/csv; charset=utf-8').send(result.csv);
    },
  });
  paths['/api/v1/admin/exports/{dataset}'] = { get: {
    operationId: 'exportAdminDataset', security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'dataset', in: 'path', required: true, schema: paramsJson.properties!.dataset },
      { name: 'limit', in: 'query', required: false, schema: querySchema.properties!.limit },
    ],
    responses: {
      200: { description: 'CSV export page', headers: {
        'X-Export-Row-Count': { schema: { type: 'integer' } },
      }, content: { 'text/csv': { schema: { type: 'string' } } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503]
        .map(status => [status, { description: 'Error', content: { 'application/json': { schema: errorSchema } } }])),
    },
  } };
}
