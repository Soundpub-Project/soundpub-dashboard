import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CopyrightRegistrationsService } from '../copyright-registrations/index.js';
import {
  copyrightContractTransition, copyrightRegistrationCreateDraft, copyrightRegistrationDetailDto,
  copyrightRegistrationDraftReplace, copyrightRegistrationListDto, copyrightRegistrationListQuery,
  copyrightRegistrationReviewTransition, copyrightRegistrationSubmit,
  copyrightRegistrationInvoiceRequest, copyrightRegistrationInvoiceDto, copyrightRegistrationPaymentCallbackResult,
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
  route('POST', '/api/v1/copyright/registrations/:id/payment/invoice', 'requestCopyrightRegistrationPaymentInvoice',
    copyrightRegistrationInvoiceDto,(actor,request)=>service.requestPaymentInvoice(actor,id(request),request.body,key(request),request.id),
    copyrightRegistrationInvoiceRequest,undefined,true);
  route('GET', '/api/v1/admin/copyright/registrations', 'listCopyrightRegistrations', copyrightRegistrationListDto,
    (actor, request) => service.list(actor, request.query), undefined, copyrightRegistrationListQuery);
  route('POST', '/api/v1/admin/copyright/registrations/:id/review', 'reviewCopyrightRegistration', copyrightRegistrationDetailDto,
    (actor, request) => service.review(actor, id(request), request.body, key(request), request.id),
    copyrightRegistrationReviewTransition, undefined, true);
  route('POST', '/api/v1/admin/copyright/registrations/:id/contract/transitions', 'transitionCopyrightRegistrationContract',
    copyrightRegistrationDetailDto,
    (actor, request) => service.transitionContract(actor, id(request), request.body, key(request), request.id),
    copyrightContractTransition, undefined, true);

  app.register(async scope=>{
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>done(null,body));
    scope.post('/api/v1/webhooks/copyright-registration-payments/mock',async request=>{
      const envelope=request.headers['x-webhook-signature'];
      const match=typeof envelope==='string' ? /^t=(\d{1,12}),id=([A-Za-z0-9_:-]{1,200}),v1=([a-fA-F0-9]{64})$/.exec(envelope) : null;
      if(!match || !Buffer.isBuffer(request.body)) throw new ApiError(401,'UNAUTHORIZED');
      try { return {status:await service.paymentCallback({provider:'mock-copyright-registration',timestamp:match[1]!,
        eventId:match[2]!,signature:match[3]!,rawBody:request.body})}; }
      catch(error) {
        if(error instanceof ApiError) throw error;
        const message=error instanceof Error ? error.message : '';
        if(message==='Webhook event ID reused with different body') throw new ApiError(409,'CONFLICT');
        if(message.includes('signature') || message.includes('timestamp') || message.includes('callback unavailable')) {
          throw new ApiError(401,'UNAUTHORIZED');
        }
        throw new ApiError(400,'BAD_REQUEST');
      }
    });
  });
  paths['/api/v1/webhooks/copyright-registration-payments/mock']={post:{operationId:'receiveCopyrightRegistrationPaymentCallback',
    security:[{webhookSignature:[]}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:
      ['provider_invoice_id','status','amount_minor','currency']}}}},responses:{200:{description:'Accepted',content:{'application/json':{
      schema:z.toJSONSchema(copyrightRegistrationPaymentCallbackResult,{target:'openapi-3.0'})}}},400:{description:'Error',content:{'application/json':{schema:errorSchema}}},
      401:{description:'Error',content:{'application/json':{schema:errorSchema}}},409:{description:'Error',content:{'application/json':{schema:errorSchema}}}}}};
}
