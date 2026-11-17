import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import { mediaDto, uploadInput, type MediaService } from '../media/index.js';

export function registerMediaRoutes(app: FastifyInstance, media: MediaService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>> = {}, errorSchema: object = { type: 'object' }) {
  const params = z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' });
  function route(method: 'GET' | 'POST' | 'DELETE', url: string, operationId: string, response: z.ZodType,
    handler: (actor: Principal, request: FastifyRequest) => Promise<unknown>, body?: z.ZodType) {
    const schema = z.toJSONSchema(response, { target: 'openapi-3.0' });
    const bodySchema = body ? z.toJSONSchema(body, { target: 'openapi-3.0', unrepresentable: 'any', io: 'input' }) : undefined;
    const responses = { 200: schema, ...Object.fromEntries([400,401,403,404,409,413,415,429,500,503].map(code => [code,errorSchema])) };
    app.route({ method, url, schema: { ...(url.includes(':id') ? { params } : {}),
      ...(bodySchema ? { body: bodySchema } : {}), response: responses },
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return handler(await authenticate(request), request);
    } });
    paths[url.replace(':id', '{id}')] = { ...paths[url.replace(':id', '{id}')], [method.toLowerCase()]: {
      operationId, security: [{ bearerAuth: [] }],
      ...(url.includes(':id') ? { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([code, value]) => [code, {
        description: code === '200' ? 'Success' : 'Error', content: { 'application/json': { schema: value } },
      }])),
    } };
  }
  const objectId = (request: FastifyRequest) => (request.params as { id: string }).id;
  route('POST', '/api/v1/storage/uploads', 'requestMediaUpload', z.strictObject({ object: mediaDto,
    url: z.string(), method: z.literal('PUT'), headers: z.record(z.string(), z.string()), expires_at: z.string() }),
  (actor, request) => media.requestUpload(actor, request.body, request.id), uploadInput);
  route('POST', '/api/v1/storage/uploads/multipart', 'requestMediaMultipartUpload', z.strictObject({ object: mediaDto,
    part_size: z.number().int(), expires_at: z.string() }),
  (actor, request) => media.requestMultipart(actor, request.body, request.id), uploadInput);
  route('GET', '/api/v1/storage/uploads/:id/multipart', 'getMediaMultipartStatus', z.strictObject({ object: mediaDto,
    part_size: z.number().int(), parts: z.array(z.number().int()), completed: z.boolean(), expires_at: z.string() }),
  (actor, request) => media.multipartStatus(actor, objectId(request)));
  const multipartPart = z.strictObject({ part_number: z.number().int().min(1).max(100) });
  route('POST', '/api/v1/storage/uploads/:id/multipart/parts', 'signMediaMultipartPart', z.strictObject({
    url: z.string(), size: z.number().int(), expires_at: z.string() }),
  (actor, request) => media.multipartPart(actor, objectId(request), (request.body as z.infer<typeof multipartPart>).part_number), multipartPart);
  route('POST', '/api/v1/storage/uploads/:id/complete', 'completeMediaUpload', mediaDto,
    (actor, request) => media.completeUpload(actor, objectId(request), request.id));
  route('DELETE', '/api/v1/storage/uploads/:id', 'abortMediaUpload', z.strictObject({ status: z.literal('deleted') }),
    (actor, request) => media.abortUpload(actor, objectId(request), request.id));
  route('GET', '/api/v1/storage/objects/:id', 'getMediaObject', mediaDto,
    (actor, request) => media.get(actor, objectId(request)));
  route('GET', '/api/v1/storage/objects/:id/download', 'downloadMediaObject', z.strictObject({ url: z.string(), expires_at: z.string() }),
    (actor, request) => media.download(actor, objectId(request)));
  route('DELETE', '/api/v1/storage/objects/:id', 'deleteMediaObject', z.strictObject({ status: z.literal('deleted') }),
    (actor, request) => media.delete(actor, objectId(request), request.id));
  const publicKey = z.enum(['dashboard_logo_light', 'dashboard_logo_dark', 'favicon']);
  app.get('/api/v1/settings/public-media/:key', { schema: { params: z.toJSONSchema(z.strictObject({ key: publicKey }), { target: 'openapi-3.0' }) } },
    async (request, reply) => {
      const key = publicKey.parse((request.params as { key: string }).key);
      return reply.header('Cache-Control', 'public, max-age=30').redirect(await media.publicDownload(key));
    });
  paths['/api/v1/settings/public-media/{key}'] = { get: { operationId: 'downloadPublicSettingMedia', security: [],
    parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string', enum: publicKey.options } }],
    responses: { 302: { description: 'Short-lived media redirect' }, 404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } } } } };
}
