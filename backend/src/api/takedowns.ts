import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, type ApiDependencies, type Principal } from './types.js';
import {
  takedownCreate, takedownDto, takedownEligibleReleaseDto, takedownEligibleReleaseQuery, takedownListQuery,
  takedownCancellation, takedownTargetTransition, takedownTransition,
} from '../takedowns/contracts.js';

type Handler = (actor: Principal, request: FastifyRequest) => Promise<unknown>;
const params = z.strictObject({ id: z.uuid() });
const targetParams = z.strictObject({ id: z.uuid(), targetId: z.uuid() });
const requestPage = z.strictObject({ items: z.array(takedownDto), nextCursor: z.string().nullable() });
const releasePage = z.strictObject({ items: z.array(takedownEligibleReleaseDto), nextCursor: z.string().nullable() });

export function registerTakedownRoutes(app: FastifyInstance, deps: ApiDependencies,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  if (!deps.takedowns) return;
  const service = deps.takedowns;
  function route(method: 'GET' | 'POST', url: string, operationId: string, response: z.ZodType,
    handler: Handler, body?: z.ZodType, query?: z.ZodType) {
    const parameterContract = url.includes(':targetId') ? targetParams : url.includes(':id') ? params : undefined;
    const pathParams = parameterContract ? z.toJSONSchema(parameterContract, { target: 'openapi-3.0' }) : undefined;
    const bodySchema = body ? z.toJSONSchema(body, { target: 'openapi-3.0' }) : undefined;
    const querySchema = query ? z.toJSONSchema(query, { target: 'openapi-3.0' }) : undefined;
    const success = z.toJSONSchema(response, { target: 'openapi-3.0' });
    const responses = { 200: success, ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503]
      .map(status => [status, errorSchema])) };
    app.route({ method, url, schema: { ...(pathParams ? { params: pathParams } : {}),
      ...(bodySchema ? { body: bodySchema } : {}), ...(querySchema ? { querystring: querySchema } : {}), response: responses },
    handler: async request => handler(await authenticate(request), request) });
    const path = url.replace(':id', '{id}').replace(':targetId', '{targetId}');
    paths[path] = { ...paths[path], [method.toLowerCase()]: { operationId, security: [{ bearerAuth: [] }],
      ...(pathParams || querySchema ? { parameters: [
        ...(pathParams ? Object.entries(pathParams.properties ?? {}).map(([name, schema]) =>
          ({ name, in: 'path', required: true, schema })) : []),
        ...Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', schema })),
      ] } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
  route('GET', '/api/v1/takedowns/eligible-releases', 'listEligibleTakedownReleases', releasePage,
    (actor, request) => service.eligibleReleases(actor, request.query as never), undefined, takedownEligibleReleaseQuery);
  route('GET', '/api/v1/takedowns', 'listTakedowns', requestPage,
    (actor, request) => service.list(actor, request.query as never), undefined, takedownListQuery);
  route('POST', '/api/v1/takedowns', 'createTakedown', takedownDto, (actor, request) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string') throw new ApiError(400, 'BAD_REQUEST');
    return service.create(actor, request.body as never, key, request.id);
  }, takedownCreate);
  route('GET', '/api/v1/takedowns/:id', 'getTakedown', takedownDto,
    (actor, request) => service.get(actor, (request.params as { id: string }).id));
  route('POST', '/api/v1/takedowns/:id/transitions', 'transitionTakedown', takedownDto, (actor, request) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string') throw new ApiError(400, 'BAD_REQUEST');
    return service.transition(actor, (request.params as { id: string }).id, request.body as never, key, request.id);
  }, takedownTransition);
  route('POST', '/api/v1/takedowns/:id/cancellation', 'requestTakedownCancellation', takedownDto, (actor, request) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string') throw new ApiError(400, 'BAD_REQUEST');
    return service.requestCancellation(actor, (request.params as { id: string }).id, request.body as never, key, request.id);
  }, takedownCancellation);
  route('POST', '/api/v1/takedowns/:id/targets/:targetId/transitions', 'transitionTakedownTarget', takedownDto,
    (actor, request) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string') throw new ApiError(400, 'BAD_REQUEST');
      const values = request.params as { id: string; targetId: string };
      return service.transitionTarget(actor, values.id, values.targetId, request.body as never, key, request.id);
    }, takedownTargetTransition);
}
