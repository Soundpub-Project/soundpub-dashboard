import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LocalAuthService } from '../local-auth/index.js';
import { ApiError } from './types.js';
import { acceptedResponseSchema, okResponseSchema } from '../local-auth/contracts.js';

const cookieName = 'soundpub_session';
const sessionCookie = (token: string, maxAge: number) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
export function sessionToken(request: FastifyRequest) {
  const raw = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`));
  return raw ? raw.slice(cookieName.length + 1) : null;
}
export function registerLocalAuthRoutes(app: FastifyInstance, service: LocalAuthService,
  paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const authResponse = { type: 'object', required: ['user','csrfToken','expiresAt'], additionalProperties: false, properties: {
    user: { type: 'object', required: ['id','roles'], additionalProperties: false, properties: {
      id: { type: 'string', format: 'uuid' }, roles: { type: 'array', items: { type: 'string' } },
    } }, csrfToken: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' },
  } };
  app.post('/api/v1/auth/login', { schema: { body: { type: 'object', required: ['email','password'], additionalProperties: false,
    properties: { email: { type: 'string', format: 'email', maxLength: 320 }, password: { type: 'string', minLength: 1, maxLength: 1024 } } } } }, async (request, reply) => {
    const result = await service.login(request.body, request.id);
    reply.header('set-cookie', sessionCookie(result.token, 6 * 60 * 60));
    return { user: { id: result.principal.id, roles: result.principal.roles }, csrfToken: result.csrfToken, expiresAt: result.expiresAt };
  });
  app.get('/api/v1/auth/session', async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    const result = await service.rotateCsrf(token);
    reply.header('cache-control', 'no-store');
    return { user: { id: result.principal.id, roles: result.principal.roles }, csrfToken: result.csrfToken, expiresAt: result.expiresAt };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = sessionToken(request);
    if (token) await service.logout(token, String(request.headers['x-csrf-token'] ?? ''), request.id);
    reply.header('set-cookie', sessionCookie('', 0));
    return { status: 'ok' };
  });
  app.post('/api/v1/auth/password', { schema: { body: { type: 'object', required: ['currentPassword','newPassword'],
    additionalProperties: false, properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 1024 },
      newPassword: { type: 'string', minLength: 12, maxLength: 1024 } } } } }, async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    await service.changePassword(token, String(request.headers['x-csrf-token'] ?? ''), request.body, request.id);
    reply.header('set-cookie', sessionCookie('', 0));
    return { status: 'ok' };
  });
  const requestBody = { type: 'object', required: ['email'], additionalProperties: false,
    properties: { email: { type: 'string', format: 'email', maxLength: 320 } } } as const;
  const tokenBody = { type: 'object', required: ['token'], additionalProperties: false,
    properties: { token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } } } as const;
  app.post('/api/v1/auth/email-verification/request', { schema: { body: requestBody } }, async (request, reply) => {
    await service.requestEmailVerification(request.body, request.id);
    reply.code(202);
    return { status: 'accepted' };
  });
  app.post('/api/v1/auth/email-verification/confirm', { schema: { body: tokenBody } }, async request => {
    await service.confirmEmailVerification(request.body, request.id);
    return { status: 'ok' };
  });
  app.post('/api/v1/auth/password-recovery/request', { schema: { body: requestBody } }, async (request, reply) => {
    await service.requestPasswordRecovery(request.body, request.id);
    reply.code(202);
    return { status: 'accepted' };
  });
  app.post('/api/v1/auth/password-recovery/reset', { schema: { body: { ...tokenBody, required: ['token','newPassword'],
    properties: { ...tokenBody.properties, newPassword: { type: 'string', minLength: 12, maxLength: 1024 } } } } }, async request => {
    await service.resetRecoveredPassword(request.body, request.id);
    return { status: 'ok' };
  });
  for (const [path, method, operationId, response, successStatus = 200] of [
    ['/api/v1/auth/login','post','login',authResponse], ['/api/v1/auth/session','get','getSession',authResponse],
    ['/api/v1/auth/logout','post','logout',okResponseSchema],
    ['/api/v1/auth/password','post','changePassword',okResponseSchema],
    ['/api/v1/auth/email-verification/request','post','requestEmailVerification',acceptedResponseSchema,202],
    ['/api/v1/auth/email-verification/confirm','post','confirmEmailVerification',okResponseSchema],
    ['/api/v1/auth/password-recovery/request','post','requestPasswordRecovery',acceptedResponseSchema,202],
    ['/api/v1/auth/password-recovery/reset','post','resetRecoveredPassword',okResponseSchema],
  ] as const) paths[path] = { [method]: { operationId, security: [], responses: Object.fromEntries(
    [...new Set([successStatus,400,401,403,409,429,500])].map(status => [status, {
    description: status === successStatus ? 'Success' : 'Error', content: { 'application/json': { schema: status === successStatus ? response : errorSchema } },
  }])) } };
}
