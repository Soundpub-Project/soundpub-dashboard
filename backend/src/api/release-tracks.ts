import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiDependencies, Principal } from './types.js';
import { releaseActivation, releaseCreate, releasePatch, releaseListQuery, releaseDto } from '../releases/contracts.js';
import { trackCreate, trackPatch, trackDelete, trackReorder, trackDto } from '../tracks/contracts.js';
import { aggregateCreate, aggregatePatch, aggregateDto } from '../releases/aggregate-contracts.js';

type Handler = (actor: Principal, request: FastifyRequest) => Promise<unknown>;
const params = z.strictObject({ id: z.uuid() });
const releasePage = z.strictObject({ items: z.array(releaseDto), nextCursor: z.string().nullable() });
const trackPage = z.strictObject({ items: z.array(trackDto), release_version: z.number().int().min(1) });
const trackResult = z.strictObject({ track: trackDto, release_version: z.number().int().min(1) });
const trackRemoval = z.strictObject({ id: z.uuid(), release_version: z.number().int().min(1) });

export function registerReleaseTrackRoutes(app: FastifyInstance, deps: ApiDependencies,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  function route(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, operationId: string,
    response: z.ZodType, handler: Handler, body?: z.ZodType, query?: z.ZodType) {
    const pathParams = url.includes(':id') ? z.toJSONSchema(params, { target: 'openapi-3.0' }) : undefined;
    const bodySchema = body ? z.toJSONSchema(body, { target: 'openapi-3.0' }) : undefined;
    const querySchema = query ? z.toJSONSchema(query, { target: 'openapi-3.0' }) : undefined;
    const success = z.toJSONSchema(response, { target: 'openapi-3.0' });
    const responses = { 200: success, ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503]
      .map(status => [status, errorSchema])) };
    app.route({ method, url, schema: { ...(pathParams ? { params: pathParams } : {}),
      ...(bodySchema ? { body: bodySchema } : {}), ...(querySchema ? { querystring: querySchema } : {}),
      response: responses }, handler: async request => handler(await authenticate(request), request) });
    const path = url.replace(':id', '{id}');
    paths[path] = { ...paths[path], [method.toLowerCase()]: {
      operationId, security: [{ bearerAuth: [] }],
      ...(pathParams || querySchema ? { parameters: [
        ...(pathParams ? [{ name: 'id', in: 'path', required: true, schema: pathParams.properties!.id }] : []),
        ...Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', schema })),
      ] } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
  const id = (request: FastifyRequest) => (request.params as { id: string }).id;
  if (deps.releases) {
    const releases = deps.releases;
    route('POST', '/api/v1/releases/aggregate', 'createReleaseAggregate', aggregateDto,
      (actor, request) => releases.createAggregate(actor, request.body as z.infer<typeof aggregateCreate>, request.id), aggregateCreate);
    route('PATCH', '/api/v1/releases/:id/aggregate', 'updateReleaseAggregate', aggregateDto,
      (actor, request) => releases.updateAggregate(actor, id(request), request.body as z.infer<typeof aggregatePatch>, request.id), aggregatePatch);
    route('GET', '/api/v1/releases', 'listReleases', releasePage,
      (actor, request) => releases.list(actor, request.query as z.infer<typeof releaseListQuery>), undefined, releaseListQuery);
    route('POST', '/api/v1/releases', 'createRelease', releaseDto,
      (actor, request) => releases.create(actor, request.body as z.infer<typeof releaseCreate>, request.id), releaseCreate);
    route('GET', '/api/v1/releases/:id', 'getRelease', releaseDto, (actor, request) => releases.get(actor, id(request)));
    route('PATCH', '/api/v1/releases/:id', 'updateRelease', releaseDto,
      (actor, request) => releases.update(actor, id(request), request.body as z.infer<typeof releasePatch>, request.id), releasePatch);
    route('POST', '/api/v1/admin/releases/:id/activate', 'activateRelease', releaseDto,
      (actor, request) => releases.activate(actor, id(request), request.body as z.infer<typeof releaseActivation>, request.id), releaseActivation);
    route('DELETE', '/api/v1/releases/:id', 'deleteRelease', z.strictObject({ status: z.literal('deleted') }),
      (actor, request) => releases.delete(actor, id(request), request.id));
  }
  if (deps.tracks) {
    const tracks = deps.tracks;
    route('GET', '/api/v1/releases/:id/tracks', 'listReleaseTracks', trackPage, (actor, request) => tracks.list(actor, id(request)));
    route('POST', '/api/v1/releases/:id/tracks', 'createReleaseTrack', trackResult,
      (actor, request) => tracks.create(actor, id(request), request.body as z.infer<typeof trackCreate>, request.id), trackCreate);
    route('POST', '/api/v1/releases/:id/tracks/reorder', 'reorderReleaseTracks', trackPage,
      (actor, request) => tracks.reorder(actor, id(request), request.body as z.infer<typeof trackReorder>, request.id), trackReorder);
    route('GET', '/api/v1/tracks/:id', 'getTrack', trackDto, (actor, request) => tracks.get(actor, id(request)));
    route('PATCH', '/api/v1/tracks/:id', 'updateTrack', trackResult,
      (actor, request) => tracks.update(actor, id(request), request.body as z.infer<typeof trackPatch>, request.id), trackPatch);
    route('DELETE', '/api/v1/tracks/:id', 'deleteTrack', trackRemoval,
      (actor, request) => tracks.delete(actor, id(request), request.body as z.infer<typeof trackDelete>, request.id), trackDelete);
  }
}
