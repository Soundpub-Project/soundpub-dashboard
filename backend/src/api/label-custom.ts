import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, type Principal } from './types.js';
import type { LabelCustomService } from '../label-custom/index.js';
import { customManagedArtistCreate, customManagedArtistDto, customManagedArtistListQuery,
  customManagedArtistPatch, labelCustomOwnerScope, labelCustomUnitCreate, labelCustomUnitDto,
  labelCustomUnitPatch } from '../label-custom/contracts.js';

const artistListQuery = customManagedArtistListQuery.extend(labelCustomOwnerScope.shape);
const artistPage = z.strictObject({ items: z.array(customManagedArtistDto), nextCursor: z.string().nullable() });
const artistParams = z.strictObject({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}

export function registerLabelCustomRoutes(app: FastifyInstance, labelCustom: LabelCustomService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const unitUrl = '/api/v1/label-custom/unit';
  const artistsUrl = '/api/v1/label-custom/artists';
  const definitions = [
    { method: 'GET', url: unitUrl, operationId: 'getLabelCustomUnit', response: labelCustomUnitDto },
    { method: 'POST', url: unitUrl, operationId: 'createLabelCustomUnit', body: labelCustomUnitCreate, response: labelCustomUnitDto },
    { method: 'PATCH', url: unitUrl, operationId: 'updateLabelCustomUnit', body: labelCustomUnitPatch, response: labelCustomUnitDto },
    { method: 'GET', url: artistsUrl, operationId: 'listLabelCustomArtists', query: artistListQuery, response: artistPage },
    { method: 'POST', url: artistsUrl, operationId: 'createLabelCustomArtist', body: customManagedArtistCreate, response: customManagedArtistDto },
    { method: 'GET', url: `${artistsUrl}/:id`, operationId: 'getLabelCustomArtist', response: customManagedArtistDto },
    { method: 'PATCH', url: `${artistsUrl}/:id`, operationId: 'updateLabelCustomArtist', body: customManagedArtistPatch, response: customManagedArtistDto },
    { method: 'DELETE', url: `${artistsUrl}/:id`, operationId: 'archiveLabelCustomArtist', response: customManagedArtistDto },
  ] as const;
  for (const def of definitions) {
    const body = 'body' in def ? z.toJSONSchema(def.body, { target: 'openapi-3.0' }) : undefined;
    if (body && def.method === 'PATCH') body.minProperties = 1;
    const queryContract = 'query' in def ? def.query : labelCustomOwnerScope;
    const query = z.toJSONSchema(queryContract, { target: 'openapi-3.0' });
    const params = def.url.includes(':id') ? z.toJSONSchema(artistParams, { target: 'openapi-3.0' }) : undefined;
    const success = z.toJSONSchema(def.response, { target: 'openapi-3.0' });
    const responses = { 200: success, ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503]
      .map(status => [status, errorSchema])) };
    app.route({ method: def.method, url: def.url,
      schema: { ...(body ? { body } : {}), querystring: query, ...(params ? { params } : {}), response: responses },
      // Preserve contract refinements and normalization that JSON Schema cannot express.
      validatorCompiler: ({ httpPart }) => {
        const contract = httpPart === 'body' && 'body' in def ? def.body
          : httpPart === 'querystring' ? queryContract : artistParams;
        return input => {
          const result = contract.safeParse(input);
          return result.success ? { value: result.data } : { error: new ApiError(400, 'BAD_REQUEST') };
        };
      },
      handler: async request => {
        const actor = await authenticate(request);
        const admin = actor.roles.includes('admin') || actor.roles.includes('superadmin');
        if (!admin && !actor.roles.includes('label_custom')) throw new ApiError(403, 'FORBIDDEN');
        const { owner_user_id, ...filters } = parse(queryContract, request.query);
        const scope = owner_user_id === undefined ? {} : { owner_user_id };
        if (admin && owner_user_id === undefined) throw new ApiError(400, 'BAD_REQUEST');
        if (!admin && owner_user_id !== undefined && owner_user_id !== actor.id) throw new ApiError(403, 'FORBIDDEN');
        if (def.url === unitUrl) {
          if (def.method === 'GET') return labelCustom.getUnit(actor, scope);
          if (def.method === 'POST') return labelCustom.createUnit(actor, parse(labelCustomUnitCreate, request.body), request.id, scope);
          return labelCustom.updateUnit(actor, parse(labelCustomUnitPatch, request.body), request.id, scope);
        }
        if (def.url === artistsUrl) {
          if (def.method === 'GET') return labelCustom.listArtists(actor, filters, scope);
          const key = request.headers['idempotency-key'];
          if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{8,200}$/.test(key)))
            throw new ApiError(400, 'BAD_REQUEST');
          const requestId = typeof key === 'string' ? key : request.id;
          return labelCustom.createArtist(actor, parse(customManagedArtistCreate, request.body), requestId, scope);
        }
        const { id } = parse(artistParams, request.params);
        if (def.method === 'GET') return labelCustom.getArtist(actor, id, scope);
        if (def.method === 'PATCH') return labelCustom.updateArtist(actor, id, parse(customManagedArtistPatch, request.body), request.id, scope);
        return labelCustom.archiveArtist(actor, id, request.id, scope);
      },
    });
    const parameters = [
      ...(params ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] : []),
      ...(def.method === 'POST' && def.url === artistsUrl ? [{ name: 'Idempotency-Key', in: 'header', required: false,
        description: 'Stable retry key. Same key and payload returns the original artist; a changed payload conflicts.',
        schema: { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9:_-]+$' } }] : []),
      ...Object.entries(query.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema,
        ...(name === 'owner_user_id' ? { description: 'Required for admin/superadmin; label_custom may only select its own user ID.' } : {}),
      })),
    ];
    const path = def.url.replace(':id', '{id}');
    paths[path] = { ...paths[path], [def.method.toLowerCase()]: {
      operationId: def.operationId, security: [{ bearerAuth: [] }], parameters,
      ...(def.method === 'DELETE' ? { description: 'Archive managed artist and return the archived artist; catalog and profile rows are preserved.' } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
}
