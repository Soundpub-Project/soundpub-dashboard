import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import { releaseDto } from '../releases/contracts.js';
import { submissionInput, submissionReadinessDto, type SubmissionService } from '../submissions/index.js';

export function registerSubmissionRoutes(app: FastifyInstance, service: SubmissionService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const params = z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' });
  for (const operation of [
    { method: 'GET', suffix: 'submission-readiness', operationId: 'getReleaseSubmissionReadiness', response: submissionReadinessDto },
    { method: 'POST', suffix: 'submit', operationId: 'submitRelease', response: releaseDto },
  ] as const) {
    const url = `/api/v1/releases/:id/${operation.suffix}`;
    const body = operation.method === 'POST' ? z.toJSONSchema(submissionInput, { target: 'openapi-3.0' }) : undefined;
    const responses = { 200: z.toJSONSchema(operation.response, { target: 'openapi-3.0' }),
      ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503].map(status => [status, errorSchema])) };
    app.route({ method: operation.method, url, schema: { params, ...(body ? { body } : {}), response: responses },
      handler: async request => {
        const actor = await authenticate(request);
        const { id } = request.params as { id: string };
        return operation.method === 'GET' ? service.readiness(actor, id) : service.submit(actor, id, request.body, request.id);
      } });
    paths[url.replace(':id', '{id}')] = { [operation.method.toLowerCase()]: {
      operationId: operation.operationId, security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }],
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
}
