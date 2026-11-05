import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CopyrightRegistrationsService } from '../copyright-registrations/index.js';
import {
  copyrightContractTransition, copyrightRegistrationCreateDraft, copyrightRegistrationDetailDto,
  copyrightRegistrationDraftReplace, copyrightRegistrationListDto, copyrightRegistrationListQuery,
  copyrightRegistrationReviewTransition, copyrightRegistrationSubmit,
} from '../copyright-registrations/contracts.js';
import { ApiError, type ApiDependencies, type Principal } from './types.js';

declare module './types.js' {
  interface ApiDependencies { copyrightRegistrations?: CopyrightRegistrationsService }
}

type Handler = (actor: Principal, request: FastifyRequest) => Promise<unknown>;
const params = z.strictObject({ id: z.uuid() });
const currentResponse = copyrightRegistrationDetailDto.nullable();

export function registerCopyrightRegistrationRoutes(app: FastifyInstance, deps: ApiDependencies,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  if (!deps.copyrightRegistrations) return;
  const service = deps.copyrightRegistrations;
  const keySchema = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[A-Za-z0-9:_-]+$' };

  function route(method: 'GET' | 'POST' | 'PUT', url: string, operationId: string, response: z.ZodType,
    handler: Handler, body?: z.ZodType, query?: z.ZodType, mutation = false) {
    const parameterContract = url.includes(':id') ? params : undefined;
    const parameterSchema = parameterContract ? z.toJSONSchema(parameterContract, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const bodySchema = body ? z.toJSONSchema(body, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const querySchema = query ? z.toJSONSchema(query, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const successSchema = z.toJSONSchema(response, { target: 'openapi-3.0' });
    const responses = { 200: successSchema, ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503]
      .map(status => [status, errorSchema])) };
    app.route({ method, url, schema: {
      ...(parameterSchema ? { params: parameterSchema } : {}), ...(bodySchema ? { body: bodySchema } : {}),
      ...(querySchema ? { querystring: querySchema } : {}),
      ...(mutation ? { headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': keySchema } } } : {}),
      response: responses,
    }, handler: async request => handler(await authenticate(request), request) });

    const path = url.replace(':id', '{id}');
    const parameters = [
      ...(parameterSchema ? [{ name: 'id', in: 'path', required: true, schema: parameterSchema.properties!.id }] : []),
      ...Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
      ...(mutation ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: keySchema }] : []),
    ];
    paths[path] = { ...paths[path], [method.toLowerCase()]: {
      operationId, security: [{ bearerAuth: [] }], ...(parameters.length ? { parameters } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }

  const id = (request: FastifyRequest) => (request.params as { id: string }).id;
  const key = (request: FastifyRequest) => {
    const value = request.headers['idempotency-key'];
    if (typeof value !== 'string') throw new ApiError(400, 'BAD_REQUEST');
    return value;
  };
  route('GET', '/api/v1/copyright/registrations/current', 'getCurrentCopyrightRegistration', currentResponse,
    actor => service.current(actor));
  route('POST', '/api/v1/copyright/registrations', 'createCopyrightRegistration', copyrightRegistrationDetailDto,
    (actor, request) => service.create(actor, request.body, key(request), request.id), copyrightRegistrationCreateDraft, undefined, true);
  route('GET', '/api/v1/copyright/registrations/:id', 'getCopyrightRegistration', copyrightRegistrationDetailDto,
    (actor, request) => service.get(actor, id(request)));
  route('PUT', '/api/v1/copyright/registrations/:id/draft', 'replaceCopyrightRegistrationDraft', copyrightRegistrationDetailDto,
    (actor, request) => service.replaceDraft(actor, id(request), request.body, key(request), request.id),
    copyrightRegistrationDraftReplace, undefined, true);
  route('POST', '/api/v1/copyright/registrations/:id/submit', 'submitCopyrightRegistration', copyrightRegistrationDetailDto,
    (actor, request) => service.submit(actor, id(request), request.body, key(request), request.id),
    copyrightRegistrationSubmit, undefined, true);
  route('GET', '/api/v1/admin/copyright/registrations', 'listCopyrightRegistrations', copyrightRegistrationListDto,
    (actor, request) => service.list(actor, request.query), undefined, copyrightRegistrationListQuery);
  route('POST', '/api/v1/admin/copyright/registrations/:id/review', 'reviewCopyrightRegistration', copyrightRegistrationDetailDto,
    (actor, request) => service.review(actor, id(request), request.body, key(request), request.id),
    copyrightRegistrationReviewTransition, undefined, true);
  route('POST', '/api/v1/admin/copyright/registrations/:id/contract/transitions', 'transitionCopyrightRegistrationContract',
    copyrightRegistrationDetailDto,
    (actor, request) => service.transitionContract(actor, id(request), request.body, key(request), request.id),
    copyrightContractTransition, undefined, true);
}
