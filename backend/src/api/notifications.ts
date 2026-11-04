import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './types.js';
import type { NotificationsService } from '../notifications/index.js';
import { content, targeted, listQuery, notificationDto } from '../notifications/contracts.js';

export function registerNotificationsRoutes(app: FastifyInstance, notifications: NotificationsService,
  authenticate: (request: FastifyRequest) => Promise<Principal>,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const idResponse = z.strictObject({ id: z.uuid() });
  const listResponse = z.strictObject({ items: z.array(notificationDto), nextCursor: z.string().nullable() });
  const definitions = [
    { method: 'GET', url: '/api/v1/notifications', response: listResponse, query: listQuery, operationId: 'listNotifications' },
    { method: 'GET', url: '/api/v1/notifications/unread-count', response: z.strictObject({ count: z.number().int() }), operationId: 'notificationUnreadCount' },
    { method: 'POST', url: '/api/v1/notifications/:id/read', response: idResponse.extend({ read_at: z.string().nullable() }), operationId: 'readNotification' },
    { method: 'POST', url: '/api/v1/notifications/:id/unread', response: idResponse.extend({ read_at: z.string().nullable() }), operationId: 'unreadNotification' },
    { method: 'POST', url: '/api/v1/notifications/read-all', response: z.strictObject({ updated: z.number().int() }), operationId: 'readAllNotifications' },
    { method: 'GET', url: '/api/v1/admin/notifications', response: listResponse, query: listQuery, operationId: 'adminListNotifications' },
    { method: 'POST', url: '/api/v1/admin/notifications', body: targeted, response: idResponse, operationId: 'createNotification' },
    { method: 'POST', url: '/api/v1/admin/announcements', body: content, response: idResponse, operationId: 'createAnnouncement' },
    { method: 'PATCH', url: '/api/v1/admin/notifications/:id', body: content, response: idResponse, operationId: 'updateNotification' },
    { method: 'DELETE', url: '/api/v1/admin/notifications/:id', response: idResponse, operationId: 'deleteNotification' },
  ] as const;
  for (const def of definitions) {
    const body = 'body' in def ? z.toJSONSchema(def.body, { target: 'openapi-3.0' }) : undefined;
    const query = 'query' in def ? { type: 'object', additionalProperties: false, properties: {
      limit: { type: 'string', pattern: '^(?:[1-9]|[1-9][0-9]|1[0-9]{2}|200)$' }, cursor: { type: 'string', maxLength: 1000 },
    } } : { type: 'object', additionalProperties: false, properties: {} };
    const params = def.url.includes(':id') ? z.toJSONSchema(z.strictObject({ id: z.uuid() }), { target: 'openapi-3.0' }) : undefined;
    const responses = { 200: z.toJSONSchema(def.response, { target: 'openapi-3.0' }),
      ...Object.fromEntries([400, 401, 403, 404, 429, 500, 503].map(status => [status, errorSchema])) };
    app.route({ method: def.method, url: def.url,
      schema: { ...(body ? { body } : {}), querystring: query, ...(params ? { params } : {}), response: responses },
      handler: async request => {
        const actor = await authenticate(request);
        const id = (request.params as { id?: string }).id!;
        switch (def.operationId) {
          case 'listNotifications': return notifications.list(actor, request.query);
          case 'notificationUnreadCount': return notifications.unreadCount(actor);
          case 'readNotification': return notifications.setRead(actor, id);
          case 'unreadNotification': return notifications.setRead(actor, id, false);
          case 'readAllNotifications': return notifications.readAll(actor);
          case 'adminListNotifications': return notifications.list(actor, request.query, true);
          case 'createNotification': return notifications.create(actor, request.body, request.id);
          case 'createAnnouncement': return notifications.create(actor, request.body, request.id, true);
          case 'updateNotification': return notifications.update(actor, id, request.body, request.id);
          case 'deleteNotification': return notifications.remove(actor, id, request.id);
        }
      },
    });
    const parameters = [
      ...(params ? [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] : []),
      ...Object.entries(query.properties).map(([name, schema]) => ({ name, in: 'query', required: false, schema })),
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
