import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import type { AuditSettingsService } from '../audit-settings/index.js';
import { parse } from '../audit-settings/index.js';
import { adminSettings, auditDto, auditQuery, publicSettings, settingsPatch, userSettings, userSettingsPatch } from '../audit-settings/contracts.js';

export function registerAuditSettingsRoutes(app: FastifyInstance, service: AuditSettingsService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const version = z.number().int().min(1);
  const definitions = [
    { method: 'GET', url: '/api/v1/settings/public', operationId: 'getPublicSettings', public: true,
      response: z.strictObject({ settings: publicSettings }) },
    { method: 'GET', url: '/api/v1/settings/me', operationId: 'getUserSettings', response: z.strictObject({ settings: userSettings, version }) },
    { method: 'PATCH', url: '/api/v1/settings/me', operationId: 'updateUserSettings', body: userSettingsPatch,
      response: z.strictObject({ settings: userSettings, version }) },
    { method: 'GET', url: '/api/v1/admin/settings', operationId: 'getAdminSettings', response: z.strictObject({ settings: adminSettings, version }) },
    { method: 'PATCH', url: '/api/v1/admin/settings', operationId: 'updateAdminSettings', body: settingsPatch,
      response: z.strictObject({ settings: adminSettings, version }) },
    { method: 'GET', url: '/api/v1/admin/audit', operationId: 'listAudit', query: auditQuery,
      response: z.strictObject({ items: z.array(auditDto), nextOffset: z.number().int().nullable() }) },
    { method: 'GET', url: '/api/v1/admin/audit/:id', operationId: 'getAudit', response: auditDto },
  ] as const;
  for (const def of definitions) {
    const body = 'body' in def ? z.toJSONSchema(def.body, { target: 'openapi-3.0' }) : undefined;
    if (body) (body.properties!.settings as Record<string, unknown>).minProperties = 1;
    const query = 'query' in def ? { type: 'object', additionalProperties: false, properties: {
      actor: { type: 'string', format: 'uuid' }, action: { type: 'string', pattern: '^[a-zA-Z0-9_.:-]{1,100}$' },
      resource: { type: 'string', pattern: '^[a-zA-Z0-9_.:-]{1,100}$' }, resource_id: { type: 'string', format: 'uuid' },
      from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' },
      limit: { type: 'string', pattern: '^(?:[1-9]|[1-9][0-9]|100)$' }, offset: { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,3}|10000)$' },
    } } : z.toJSONSchema(z.strictObject({}), { target: 'openapi-3.0' });
    const params = def.url.includes(':id') ? z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' }) : undefined;
    const responses = { 200: z.toJSONSchema(def.response, { target: 'openapi-3.0' }),
      ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map(status => [status, errorSchema])) };
    app.route({ method: def.method, url: def.url,
      schema: { ...(body ? { body } : {}), querystring: query, ...(params ? { params } : {}), response: responses },
      // Validate before Fastify can coerce body types or strip unknown properties.
      preValidation: async request => {
        if ('body' in def) parse<unknown>(def.body, request.body);
        if ('query' in def) parse(def.query, request.query);
        else parse(z.strictObject({}), request.query);
      },
      handler: async request => {
        if ('public' in def) return service.publicSettings();
        const actor = await authenticate(request);
        if (def.url === '/api/v1/settings/me') return def.method === 'GET' ? service.userSettings(actor)
          : service.updateUserSettings(actor, request.body, request.id);
        if (def.url === '/api/v1/admin/settings') return def.method === 'GET' ? service.adminSettings(actor)
          : service.updateAdminSettings(actor, request.body, request.id);
        return def.url === '/api/v1/admin/audit' ? service.listAudit(actor, request.query)
          : service.getAudit(actor, (request.params as { id: string }).id);
      },
    });
    paths[def.url.replace(':id', '{id}')] = { ...paths[def.url.replace(':id', '{id}')], [def.method.toLowerCase()]: {
      operationId: def.operationId, security: 'public' in def ? [] : [{ bearerAuth: [] }],
      parameters: [...Object.entries(query.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
        ...(params ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] : [])],
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
}
