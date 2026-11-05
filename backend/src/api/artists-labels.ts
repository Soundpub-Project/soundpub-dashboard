import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import type { ArtistsService } from '../artists/index.js';
import { artistCreate, artistPatch, artistListQuery, artistDeletionListQuery, artistDeletionRequest, artistDeletionReview,
  artistDto, artistDeletionRequestDto } from '../artists/contracts.js';
import type { LabelsService } from '../labels/index.js';
import { assignInput, transferInput, removeInput, rosterQuery } from '../labels/contracts.js';

const id = z.strictObject({ id: z.uuid() });

const page = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
const rosterItem = z.strictObject({ membershipId: z.uuid(), artistId: z.uuid(), labelId: z.uuid(),
  name: z.string(), fullName: z.string(), status: z.enum(['active', 'inactive', 'suspended']),
  email: z.string().nullable(), phone: z.string().nullable(), address: z.string().nullable(),
  passwordSet: z.boolean(), createdAt: z.string() });
const parent = z.strictObject({ artistId: z.uuid(), parentLabelId: z.uuid().nullable(), membershipId: z.uuid().nullable() });
const change = parent.extend({ changed: z.boolean() });
const labelDto = z.strictObject({ id: z.uuid(), ownerId: z.uuid(), full_name: z.string(),
  logo_url: z.string().nullable(), logo_url_light: z.string().nullable(), logo_url_dark: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'suspended']), roles: z.array(z.enum(['label', 'whitelabel'])) });

type Handler = (actor: Principal, request: FastifyRequest) => Promise<unknown>;
export function registerDomainRoutes(app: FastifyInstance, deps: { artists?: ArtistsService; labels?: LabelsService },
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  function route(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, operationId: string,
    response: z.ZodType, handler: Handler, body?: z.ZodType, query?: z.ZodType) {
    const params = url.includes(':id') ? z.toJSONSchema(id, { target: 'openapi-3.0' }) : undefined;
    const bodySchema = body ? z.toJSONSchema(body, { target: 'openapi-3.0' }) : undefined;
    const querySchema = query ? z.toJSONSchema(query, { target: 'openapi-3.0' }) : undefined;
    const success = z.toJSONSchema(response, { target: 'openapi-3.0' });
    const responses = { 200: success, ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503].map(status => [status, errorSchema])) };
    app.route({ method, url, schema: { ...(params ? { params } : {}), ...(bodySchema ? { body: bodySchema } : {}),
      ...(querySchema ? { querystring: querySchema } : {}), response: responses },
    handler: async request => handler(await authenticate(request), request) });
    const parameters = [
      ...(params ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] : []),
      ...Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
    ];
    const path = url.replace(':id', '{id}');
    paths[path] = { ...paths[path], [method.toLowerCase()]: { operationId, security: [{ bearerAuth: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
  const param = (request: FastifyRequest) => (request.params as { id: string }).id;
  if (deps.artists) {
    const artists = deps.artists;
    route('GET', '/api/v1/artists', 'listArtists', page(artistDto), (actor, request) =>
      artists.list(actor, request.query as z.infer<typeof artistListQuery>), undefined, artistListQuery);
    route('POST', '/api/v1/artists', 'createArtist', artistDto, (actor, request) =>
      artists.create(actor, request.body as z.infer<typeof artistCreate>, request.id), artistCreate);
    route('GET', '/api/v1/artists/:id', 'getArtist', artistDto, (actor, request) => artists.get(actor, param(request)));
    route('PATCH', '/api/v1/artists/:id', 'updateArtist', artistDto, (actor, request) =>
      artists.update(actor, param(request), request.body as z.infer<typeof artistPatch>, request.id), artistPatch);
    route('DELETE', '/api/v1/artists/:id/label', 'detachArtist', z.strictObject({ id: z.uuid(), label_user_id: z.null() }),
      (actor, request) => artists.removeFromLabel(actor, param(request), request.id));
    route('POST', '/api/v1/artists/:id/deletion-requests', 'requestArtistDeletion', artistDeletionRequestDto,
      (actor, request) => artists.requestDeletion(actor, param(request), request.body as z.infer<typeof artistDeletionRequest>, request.id), artistDeletionRequest);
    route('GET', '/api/v1/artist-deletion-requests', 'listArtistDeletionRequests', page(artistDeletionRequestDto),
      (actor, request) => artists.listDeletionRequests(actor, request.query as z.infer<typeof artistDeletionListQuery>), undefined, artistDeletionListQuery);
    route('PATCH', '/api/v1/artist-deletion-requests/:id', 'reviewArtistDeletion', artistDeletionRequestDto,
      (actor, request) => artists.reviewDeletionRequest(actor, param(request), request.body as z.infer<typeof artistDeletionReview>, request.id), artistDeletionReview);
  }
  if (deps.labels) {
    const labels = deps.labels;
    route('GET', '/api/v1/labels/:id/artists', 'listLabelRoster', page(rosterItem), (actor, request) =>
      labels.roster(actor, param(request), request.query as z.infer<typeof rosterQuery>), undefined, rosterQuery);
    route('GET', '/api/v1/artists/:id/parent', 'getArtistParent', parent, (actor, request) => labels.currentParent(actor, param(request)));
    route('POST', '/api/v1/artists/:id/assign', 'assignArtistLabel', change, (actor, request) =>
      labels.assign(actor, param(request), request.body as z.infer<typeof assignInput>, request.id), assignInput);
    route('POST', '/api/v1/artists/:id/transfer', 'transferArtistLabel', change, (actor, request) =>
      labels.transfer(actor, param(request), request.body as z.infer<typeof transferInput>, request.id), transferInput);
    route('POST', '/api/v1/artists/:id/remove', 'removeArtistLabel', change, (actor, request) =>
      labels.remove(actor, param(request), request.body as z.infer<typeof removeInput>, request.id), removeInput);
    route('GET', '/api/v1/labels', 'listLabels', page(labelDto), (actor, request) =>
      labels.list(actor, request.query as z.infer<typeof rosterQuery>), undefined, rosterQuery);
    route('GET', '/api/v1/labels/:id', 'getLabel', labelDto, (actor, request) => labels.get(actor, param(request)));
  }
}




