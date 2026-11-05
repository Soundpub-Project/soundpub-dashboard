import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import { ROLES } from '../auth/index.js';
import { composerCodePut, listQuery, passwordReset, profileDto, profilePatch, rolesPut, statusPatch, userCreate,
  whitelabelArtistCreate, whitelabelDashboardDto, type ComposerCodePut, type ListQuery, type PasswordReset,
  type ProfilePatch, type RolesPut, type UserCreate, type WhitelabelArtistCreate } from '../users/contracts.js';
import type { UsersService } from '../users/index.js';

export function registerUsersRoutes(app: FastifyInstance, users: UsersService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const profileResponse = z.strictObject({ profile: profileDto, roles: z.array(z.enum(ROLES)) });
  const definitions = [
    { method: 'GET', url: '/api/v1/profile', operationId: 'getProfile', response: profileResponse },
    { method: 'PATCH', url: '/api/v1/profile', operationId: 'updateProfile', body: profilePatch, response: profileResponse },
    { method: 'GET', url: '/api/v1/admin/users', operationId: 'listUsers', query: listQuery,
      response: z.strictObject({ items: z.array(profileDto.extend({ roles: z.array(z.enum(ROLES)) })), nextCursor: z.string().nullable() }) },
    { method: 'POST', url: '/api/v1/admin/users', operationId: 'createUser', body: userCreate,
      response: profileDto.extend({ roles: z.array(z.enum(ROLES)) }) },
    { method: 'GET', url: '/api/v1/whitelabel/dashboard', operationId: 'getWhitelabelDashboard', response: whitelabelDashboardDto },
    { method: 'POST', url: '/api/v1/whitelabel/artists', operationId: 'createWhitelabelArtist', body: whitelabelArtistCreate,
      response: profileDto.extend({ roles: z.array(z.enum(ROLES)) }) },
    { method: 'PUT', url: '/api/v1/whitelabel/artists/:id/password', operationId: 'enableWhitelabelArtistLogin', body: passwordReset,
      response: z.strictObject({ status: z.literal('ok') }) },
    { method: 'PATCH', url: '/api/v1/admin/users/:id/status', operationId: 'updateUserStatus', body: statusPatch, response: statusPatch },
    { method: 'PUT', url: '/api/v1/admin/users/:id/roles', operationId: 'replaceUserRoles', body: rolesPut,
      response: z.strictObject({ roles: rolesPut.shape.roles, parentLabelId: z.uuid().nullable() }) },
    { method: 'PUT', url: '/api/v1/admin/users/:id/password', operationId: 'resetUserPassword', body: passwordReset,
      response: z.strictObject({ status: z.literal('ok') }) },
    { method: 'PUT', url: '/api/v1/admin/users/:id/composer-code', operationId: 'updateComposerCode', body: composerCodePut,
      response: z.strictObject({ composerCode: z.string().nullable() }) },
    { method: 'DELETE', url: '/api/v1/admin/users/:id', operationId: 'deleteUser', response: z.strictObject({ deleted: z.literal(true) }) },
  ] as const;
  for (const def of definitions) {
    const body = 'body' in def ? z.toJSONSchema(def.body, { target: 'openapi-3.0' }) : undefined;
    // Zod refinements also run in service; JSON Schema supplies transport type/field bounds.
    if (body && def.url === '/api/v1/profile') body.minProperties = 1;
    if (body && def.url.endsWith('/roles')) (body.properties!.roles as Record<string, unknown>).uniqueItems = true;
    const query = 'query' in def ? z.toJSONSchema(def.query, { target: 'openapi-3.0' }) : undefined;
    const params = def.url.includes(':id') ? z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' }) : undefined;
    const success = z.toJSONSchema(def.response, { target: 'openapi-3.0' });
    const responses = { 200: success, ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map(status => [status, errorSchema])) };
    app.route({ method: def.method, url: def.url,
      schema: { ...(body ? { body } : {}), ...(query ? { querystring: query } : {}), ...(params ? { params } : {}), response: responses },
      handler: async request => {
        const actor = await authenticate(request);
        if (def.url === '/api/v1/profile') return def.method === 'GET'
          ? users.profile(actor) : users.updateProfile(actor, request.body as ProfilePatch, request.id);
        if (def.url === '/api/v1/admin/users') return def.method === 'GET'
          ? users.list(actor, request.query as ListQuery) : users.create(actor, request.body as UserCreate, request.id);
        if (def.url === '/api/v1/whitelabel/dashboard') return users.whitelabelDashboard(actor);
        if (def.url === '/api/v1/whitelabel/artists') return users.createWhitelabelArtist(actor,
          request.body as WhitelabelArtistCreate, request.id);
        const id = (request.params as { id: string }).id;
        if (def.url === '/api/v1/whitelabel/artists/:id/password') return users.setWhitelabelArtistPassword(actor, id,
          request.body as PasswordReset, request.id);
        if (def.method === 'DELETE') return users.deleteUser(actor, id, request.id);
        if (def.url.endsWith('/password')) return users.resetPassword(actor, id, request.body as PasswordReset, request.id);
        if (def.url.endsWith('/composer-code')) return users.setComposerCode(actor, id, request.body as ComposerCodePut, request.id);
        return def.method === 'PUT' ? users.setRoles(actor, id, request.body as RolesPut, request.id)
          : users.setStatus(actor, id, request.body as { status: Principal['status'] }, request.id);
      },
    });
    const parameters = [
      ...(params ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] : []),
      ...Object.entries(query?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
    ];
    const path = def.url.replace(':id', '{id}');
    paths[path] = { ...paths[path], [def.method.toLowerCase()]: {
      operationId: def.operationId, security: [{ bearerAuth: [] }], ...(parameters.length ? { parameters } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, {
        description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } },
      }])),
    } };
  }
}
