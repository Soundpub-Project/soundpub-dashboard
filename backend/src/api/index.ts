import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import { createAuthorizer } from '../auth/index.js';
import { ApiError, type ApiDependencies, type Principal } from './types.js';
import { registerUsersRoutes } from './users.js';
import { registerDomainRoutes } from './artists-labels.js';
import { registerLabelCustomRoutes } from './label-custom.js';
import { registerReleaseTrackRoutes } from './release-tracks.js';
import { registerSubmissionRoutes } from './submissions.js';
import { registerPublicCatalogRoutes } from './public-catalog.js';
import { registerNotificationsRoutes } from './notifications.js';
import { registerMediaRoutes } from './media.js';
import { registerAuditSettingsRoutes } from './audit-settings.js';
import { registerFinancialRoutes } from './financial.js';
import { registerLocalAuthRoutes, sessionToken } from './local-auth.js';
import { registerComposerRoyaltiesRoutes } from './composer-royalties.js';
import { registerTakedownRoutes } from './takedowns.js';
import { registerCopyrightRegistrationRoutes } from './copyright-registrations.js';
import { registerExportRoutes } from './exports.js';

export { ApiError } from './types.js';
export type { ApiDependencies, Principal, RateLimiter } from './types.js';

const errorSchema = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: {
    type: 'object', required: ['code', 'message', 'requestId'], additionalProperties: false,
    properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
  } },
} as const;
const messages: Record<string, string> = {
  BAD_REQUEST: 'Invalid request', UNAUTHORIZED: 'Authentication required', FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found', CONFLICT: 'Conflict', RATE_LIMITED: 'Too many requests',
  NOT_READY: 'Service unavailable', MAINTENANCE_MODE: 'Service unavailable', INTERNAL_ERROR: 'Internal server error',
  SUBMISSION_BLOCKED: 'Submission prerequisites are not satisfied', EXPORT_TOO_LARGE: 'Export exceeds safe size limit',
};
const developmentOrigins = new Set([
  'http://localhost:8181',
  'http://127.0.0.1:8181',
  'http://localhost:8281',
  'http://127.0.0.1:8281',
]);

/** Creates an unbound server. Caller owns listen() and close(). */
export function buildApp(deps: ApiDependencies) {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
    logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-webhook-signature"]'] },
    logController: new LogController({ disableRequestLogging: true }),
  });
  const paths: Record<string, Record<string, unknown>> = {};
  const authorize = createAuthorizer();
  const principals = new WeakMap<FastifyRequest, Promise<Principal | null>>();
  function fail(reply: FastifyReply, status: number, code: string, requestId: string) {
    return reply.code(status).send({ error: { code, message: messages[code] ?? 'Request failed', requestId } });
  }
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    const origin = request.headers.origin;
    if (!origin) return;
    if (!developmentOrigins.has(origin)) return fail(reply, 403, 'FORBIDDEN', request.id);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-credentials', 'true');
  });
  app.options('/api/v1/*', async (_request, reply) => reply
    .header('access-control-allow-methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS')
    .header('access-control-allow-headers', 'Authorization, Content-Type, Idempotency-Key, X-CSRF-Token')
    .code(204).send());
  app.addHook('preHandler', async (request, reply) => {
    if (!maintenanceExempt(request) && await deps.maintenance?.isEnabled()) {
      const principal = await resolvePrincipal(request);
      if (!authorize(principal, 'admin')) {
        reply.header('retry-after', 60);
        reply.header('cache-control', 'no-store');
        return fail(reply, 503, 'MAINTENANCE_MODE', request.id);
      }
    }
    if (request.routeOptions.url === '/health' || request.routeOptions.url === '/ready' || request.routeOptions.url === '/openapi.json') return;
    const denied = await limited(request);
    if (denied) {
      reply.header('retry-after', Math.max(1, Math.ceil(denied.retryAfterSeconds ?? 1)));
      return fail(reply, 429, 'RATE_LIMITED', request.id);
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ requestId: request.id, method: request.method, route: request.routeOptions.url, statusCode: reply.statusCode, durationMs: reply.elapsedTime }, 'request completed');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return fail(reply, error.statusCode, error.code, request.id);
    const errorStatus = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    const code = status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    if (status === 500) {
      const detail = error as { name?: string; code?: string; constraint?: string };
      request.log.error({ requestId: request.id, errorName: detail.name, errorCode: detail.code,
        constraint: detail.constraint }, 'request failed');
    }
    return fail(reply, status, code, request.id);
  });
  app.setNotFoundHandler((request, reply) => fail(reply, 404, 'NOT_FOUND', request.id));

  async function limited(request: FastifyRequest) {
    const result = await deps.rateLimiter.consume({ key: request.ip, route: request.routeOptions.url ?? '' });
    if (!result.allowed) return result;
    return null;
  }
  function maintenanceExempt(request: FastifyRequest) {
    if (request.method === 'OPTIONS') return true;
    return new Set([
      '/health', '/ready', '/openapi.json',
      '/api/v1/auth/login', '/api/v1/auth/partner/start', '/api/v1/auth/partner', '/api/v1/auth/session', '/api/v1/auth/logout',
      '/api/v1/settings/public', '/api/v1/settings/public-media/:key',
      '/api/v1/public/releases', '/api/v1/public/releases/:id',
      '/api/v1/webhooks/events',
    ]).has(request.routeOptions.url ?? '');
  }
  function resolvePrincipal(request: FastifyRequest): Promise<Principal | null> {
    const existing = principals.get(request);
    if (existing) return existing;
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    const cookieToken = deps.localAuth ? sessionToken(request) : null;
    const resolved = match ? deps.auth.authenticate(match[1]!) : cookieToken ? deps.localAuth!.authenticate(
      cookieToken, String(request.headers['x-csrf-token'] ?? ''), !['GET','HEAD','OPTIONS'].includes(request.method),
    ) : Promise.resolve(null);
    principals.set(request, resolved);
    return resolved;
  }
  async function authenticate(request: FastifyRequest): Promise<Principal> {
    const principal = await resolvePrincipal(request);
    if (!principal) throw new ApiError(401, 'UNAUTHORIZED');
    if (!authorize(principal, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
    return principal;
  }
  if (deps.localAuth) registerLocalAuthRoutes(app, deps.localAuth, paths, errorSchema, deps.partnerAuth);
  const statusSchema = { type: 'object', required: ['status'], properties: { status: { type: 'string' } }, additionalProperties: false };
  const definitions = [
    { method: 'GET', url: '/health', operationId: 'health', response: statusSchema },
    { method: 'GET', url: '/ready', operationId: 'ready', response: statusSchema },
    { method: 'GET', url: '/api/v1/me', operationId: 'getMe', secured: true,
      response: { type: 'object', required: ['id', 'roles'], additionalProperties: false, properties: { id: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } } } } },
    { method: 'POST', url: '/api/v1/admin/users/:userId/suspend', operationId: 'suspendUser', secured: true,
      params: { type: 'object', required: ['userId'], additionalProperties: false, properties: { userId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } } },
      body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' } } }, response: statusSchema },
  ];
  for (const def of definitions) {
    const responses = { 200: def.response, ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map(status => [status, errorSchema])) };
    const path = def.url.replace(':userId', '{userId}');
    paths[path] = { [def.method.toLowerCase()]: {
      operationId: def.operationId, ...(def.secured ? { security: [{ bearerAuth: [] }] } : {}),
      ...(def.params ? { parameters: [{ name: 'userId', in: 'path', required: true, schema: def.params.properties.userId }] } : {}),
      ...(def.body ? { requestBody: { required: true, content: { 'application/json': { schema: def.body } } } } : {}),
      responses: Object.fromEntries(Object.entries(responses).map(([status, schema]) => [status, { description: status === '200' ? 'Success' : 'Error', content: { 'application/json': { schema } } }])),
    } };
    app.route({ method: def.method as 'GET' | 'POST', url: def.url,
      schema: { ...(def.params ? { params: def.params } : {}), ...(def.body ? { body: def.body } : {}), response: responses },
      handler: async request => {
        if (def.url === '/health') return { status: 'ok' };
        if (def.url === '/ready') {
          try { if (await deps.readiness.check()) return { status: 'ready' }; } catch { /* Readiness never exposes dependency failures. */ }
          throw new ApiError(503, 'NOT_READY');
        }
        const actor = await authenticate(request);
        if (def.url === '/api/v1/me') return { id: actor.id, roles: actor.roles };
        if (!authorize(actor, 'admin')) throw new ApiError(403, 'FORBIDDEN');
        await deps.admin.suspendUser({ userId: (request.params as { userId: string }).userId,
          reason: (request.body as { reason: string }).reason, actor, requestId: request.id });
        return { status: 'suspended' };
      },
    });
  }
  if (deps.publicCatalog) registerPublicCatalogRoutes(app, deps.publicCatalog, paths, errorSchema);
  if (deps.users) registerUsersRoutes(app, deps.users, authenticate, paths, errorSchema);
  if (deps.artists || deps.labels) registerDomainRoutes(app, deps, authenticate, paths, errorSchema);
  if (deps.labelCustom) registerLabelCustomRoutes(app, deps.labelCustom, authenticate, paths, errorSchema);
  if (deps.releases || deps.tracks) registerReleaseTrackRoutes(app, deps, authenticate, paths, errorSchema);
  if (deps.submissions) registerSubmissionRoutes(app, deps.submissions, authenticate, paths, errorSchema);
  if (deps.notifications) registerNotificationsRoutes(app, deps.notifications, authenticate, paths, errorSchema);
  if (deps.media) registerMediaRoutes(app, deps.media, authenticate, paths, errorSchema);
  if (deps.auditSettings) registerAuditSettingsRoutes(app, deps.auditSettings, authenticate, paths, errorSchema);
  if (deps.exports) registerExportRoutes(app, deps.exports, authenticate, paths, errorSchema);
  registerTakedownRoutes(app, deps, authenticate, paths, errorSchema);
  registerCopyrightRegistrationRoutes(app, deps, authenticate, paths, errorSchema);
  if (deps.composerRoyalties) registerComposerRoyaltiesRoutes(app, deps.composerRoyalties, authenticate, paths, errorSchema);
  if (deps.balance || deps.royalties || deps.payouts || deps.payments || deps.financeReconciliation) {
    registerFinancialRoutes(app, deps, authenticate, paths, errorSchema);
  }
  const uploadBody = { type: 'object', required: ['dataBase64', 'mimeType', 'checksum'], additionalProperties: false,
    properties: { dataBase64: { type: 'string', minLength: 1, description: 'Base64-encoded file bytes' }, mimeType: { type: 'string', minLength: 1, maxLength: 255 }, checksum: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Lowercase SHA-256 hex digest of file bytes' } } };
  const signedUploadBody = { type: 'object', required: ['mimeType', 'size', 'checksum'], additionalProperties: false,
    properties: { mimeType: uploadBody.properties.mimeType, size: { type: 'integer', minimum: 1, maximum: 10485760, description: 'File size in bytes' }, checksum: uploadBody.properties.checksum } };
  if (deps.storage) {
    app.post('/api/v1/storage/objects', {
      schema: { body: uploadBody },
    }, async request => {
      const actor = await authenticate(request);
      const body = request.body as { dataBase64: string; mimeType: string; checksum: string };
      const data = Buffer.from(body.dataBase64, 'base64');
      if (!data.length || data.toString('base64').replace(/=+$/, '') !== body.dataBase64.replace(/=+$/, '')) throw new ApiError(400, 'BAD_REQUEST');
      return deps.storage!.upload(actor, { data, mimeType: body.mimeType, checksum: body.checksum });
    });
    if (deps.storage.signedUploadUrl && deps.storage.completeUpload) {
      app.post('/api/v1/storage/uploads', {
        schema: { body: signedUploadBody },
      }, async request => {
        const actor = await authenticate(request);
        return deps.storage!.signedUploadUrl!(actor, request.body as { mimeType: string; size: number; checksum: string }, 300);
      });
      app.post('/api/v1/storage/uploads/:objectId/complete', {
        schema: { params: { type: 'object', required: ['objectId'], additionalProperties: false,
          properties: { objectId: { type: 'string', pattern: '^[0-9a-f-]{36}$' } } } },
      }, async request => {
        const actor = await authenticate(request);
        return deps.storage!.completeUpload!(actor, (request.params as { objectId: string }).objectId);
      });
    }
    app.get('/api/v1/storage/objects/:objectId/url', {
      schema: { params: { type: 'object', required: ['objectId'], additionalProperties: false,
        properties: { objectId: { type: 'string', pattern: '^[0-9a-f-]{36}$' } } } },
    }, async request => {
      const actor = await authenticate(request);
      const { objectId } = request.params as { objectId: string };
      return { url: await deps.storage!.signedUrl(actor, objectId, 300) };
    });
  }
  if (deps.asyncActions) {
    app.post('/api/v1/actions/notification', async request => {
      const actor = await authenticate(request);
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{8,200}$/.test(key)) throw new ApiError(400, 'BAD_REQUEST');
      return { eventId: await deps.asyncActions!.enqueue(actor, key), status: 'queued' };
    });
  }
  const objectResponse = { type: 'object', required: ['id'], properties: {
    id: { type: 'string', format: 'uuid' }, ownerId: { type: 'string' }, mimeType: uploadBody.properties.mimeType,
    size: { type: 'integer', minimum: 1 }, checksum: uploadBody.properties.checksum,
    visibility: { type: 'string', enum: ['private'] }, createdAt: { type: 'string', format: 'date-time' },
  } };
  const urlResponse = { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' } } };
  for (const [path, method, operationId, body, response] of [
    ['/api/v1/storage/objects', 'post', 'uploadObject', uploadBody, objectResponse],
    ['/api/v1/storage/objects/{objectId}/url', 'get', 'signDownload', undefined, urlResponse],
    ['/api/v1/storage/uploads', 'post', 'requestSignedUpload', signedUploadBody, {
      type: 'object', required: ['metadata', 'url', 'method', 'headers'], properties: {
        metadata: objectResponse, url: urlResponse.properties.url, method: { type: 'string', enum: ['PUT'] },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Headers required on the signed PUT request' },
      },
    }],
    ['/api/v1/storage/uploads/{objectId}/complete', 'post', 'completeSignedUpload', undefined, objectResponse],
    ['/api/v1/actions/notification', 'post', 'queueNotification', undefined, {
      type: 'object', required: ['eventId', 'status'], properties: { eventId: { type: 'string' }, status: { type: 'string', enum: ['queued'] } },
    }],
  ] as const) {
    if ((path.includes('/storage/') && !deps.storage) || (path.includes('/actions/') && !deps.asyncActions) ||
        (path.includes('/uploads') && !(deps.storage?.signedUploadUrl && deps.storage.completeUpload))) continue;
    paths[path] = { [method]: { operationId, security: [{ bearerAuth: [] }],
      ...(path.includes('{objectId}') ? { parameters: [{ name: 'objectId', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-f-]{36}$' } }] } : {}),
      ...(path.includes('/actions/') ? { parameters: [{ name: 'Idempotency-Key', in: 'header', required: true,
        description: 'Key for retrying the same notification request; conflicting or in-progress reuse returns 409.',
        schema: { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9:_-]{8,200}$' } }] } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      responses: Object.fromEntries([200, 400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map(status => [status, {
        description: status === 200 ? 'Success' : 'Error',
        ...(status === 429 ? { headers: { 'Retry-After': { description: 'Seconds before retrying', schema: { type: 'integer', minimum: 1 } } } } : {}),
        content: { 'application/json': { schema: status === 200 ? response : errorSchema } },
      }])),
    } };
  }
  // Encapsulation keeps raw bytes local to the signature-verifying endpoint.
  app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    scope.post('/api/v1/webhooks/events', async request => {
      const signature = request.headers['x-webhook-signature'];
      if (typeof signature !== 'string' || !signature || signature.length > 4096) throw new ApiError(401, 'UNAUTHORIZED');
      if (!Buffer.isBuffer(request.body)) throw new ApiError(400, 'BAD_REQUEST');
      if (!await deps.webhooks.receive({ body: request.body, signature, requestId: request.id })) throw new ApiError(401, 'UNAUTHORIZED');
      return { status: 'accepted' };
    });
  });
  paths['/api/v1/webhooks/events'] = { post: { operationId: 'receiveWebhook', security: [{ webhookSignature: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
    responses: Object.fromEntries([200, 400, 401, 413, 415, 429, 500].map(status => [status, { description: status === 200 ? 'Accepted' : 'Error', content: { 'application/json': { schema: status === 200 ? statusSchema : errorSchema } } }])),
  } };
  app.get('/openapi.json', async () => ({ openapi: '3.0.3', info: { title: 'Soundpub API', version: '1.0.0' }, paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' }, webhookSignature: { type: 'apiKey', in: 'header', name: 'x-webhook-signature' } } },
  }));
  return app;
}
