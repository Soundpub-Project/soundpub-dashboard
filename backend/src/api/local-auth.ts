import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LocalAuthService } from '../local-auth/index.js';
import type { Identity } from '../auth/index.js';
import { ApiError } from './types.js';
import { acceptedResponseSchema, okResponseSchema } from '../local-auth/contracts.js';

const cookieName = 'soundpub_session';
const partnerTransactionCookieName = 'soundpub_partner_oauth';
const cookieSecurity = (request: FastifyRequest) => request.protocol === 'https' ? '; Secure' : '';
const sessionCookie = (request: FastifyRequest, token: string, maxAge: number) =>
  `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieSecurity(request)}`;
const partnerCookie = (request: FastifyRequest, token: string, maxAge: number) =>
  `${partnerTransactionCookieName}=${token}; Path=/api/v1/auth/partner; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecurity(request)}`;
function cookieValue(request: FastifyRequest, name: string) {
  const raw = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : null;
}
function preventAuthCaching(reply: FastifyReply) {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}
export function sessionToken(request: FastifyRequest) {
  return cookieValue(request, cookieName);
}
export function registerLocalAuthRoutes(app: FastifyInstance, service: LocalAuthService,
  paths: Record<string, Record<string, unknown>>, errorSchema: object,
  partner?: { start(redirectUri: string): { authorizationUrl: string; transaction: string } | null;
    exchange(input: { code: string; state: string; transaction: string }): Promise<Identity | null>; labelId: string }) {
  const authResponse = { type: 'object', required: ['user','csrfToken','expiresAt'], additionalProperties: false, properties: {
    user: { type: 'object', required: ['id','roles'], additionalProperties: false, properties: {
      id: { type: 'string', format: 'uuid' }, roles: { type: 'array', items: { type: 'string' } },
    } }, csrfToken: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' },
    impersonation: { anyOf: [{ type: 'null' }, { type: 'object', required: ['active','actorUserId','targetUserId','reason','expiresAt'],
      additionalProperties: false, properties: { active: { const: true }, actorUserId: { type: 'string', format: 'uuid' },
        targetUserId: { type: 'string', format: 'uuid' }, reason: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' } } }] },
  } };
  const authBody = (result: { principal: { id: string; roles: readonly string[] }; csrfToken: string; expiresAt: string;
    impersonation?: Awaited<ReturnType<LocalAuthService['impersonation']>> }) => ({
    user: { id: result.principal.id, roles: result.principal.roles }, csrfToken: result.csrfToken,
    expiresAt: result.expiresAt, ...(result.impersonation !== undefined ? { impersonation: result.impersonation } : {}),
  });
  app.post('/api/v1/auth/login', { schema: { body: { type: 'object', required: ['email','password'], additionalProperties: false,
    properties: { email: { type: 'string', format: 'email', maxLength: 320 }, password: { type: 'string', minLength: 1, maxLength: 1024 } } } } }, async (request, reply) => {
    preventAuthCaching(reply);
    const result = await service.login(request.body, request.id);
    reply.header('set-cookie', sessionCookie(request, result.token, 6 * 60 * 60));
    return { user: { id: result.principal.id, roles: result.principal.roles }, csrfToken: result.csrfToken, expiresAt: result.expiresAt };
  });
  const partnerStartBody = { type: 'object', required: ['redirectUri'], additionalProperties: false,
    properties: { redirectUri: { type: 'string', format: 'uri', maxLength: 2048 } } } as const;
  const partnerBody = { type: 'object', required: ['code','state'], additionalProperties: false,
    properties: { code: { type: 'string', minLength: 8, maxLength: 2048, pattern: '^[A-Za-z0-9._~-]+$' },
      state: { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]+$' } } } as const;
  if (partner) app.post('/api/v1/auth/partner/start', { schema: { body: partnerStartBody } }, async (request, reply) => {
    preventAuthCaching(reply);
    const started = partner.start((request.body as { redirectUri: string }).redirectUri);
    if (!started) throw new ApiError(400, 'BAD_REQUEST');
    reply.header('set-cookie', partnerCookie(request, started.transaction, 10 * 60));
    return { authorizationUrl: started.authorizationUrl };
  });
  if (partner) app.post('/api/v1/auth/partner', { schema: { body: partnerBody } }, async (request, reply) => {
    preventAuthCaching(reply);
    const transaction = cookieValue(request, partnerTransactionCookieName);
    reply.header('set-cookie', partnerCookie(request, '', 0));
    if (!transaction) throw new ApiError(401, 'UNAUTHORIZED');
    const body = request.body as { code: string; state: string };
    const identity = await partner.exchange({ ...body, transaction });
    if (!identity) throw new ApiError(401, 'UNAUTHORIZED');
    const result = await service.loginPartner(identity, partner.labelId, request.id);
    reply.header('set-cookie', [partnerCookie(request, '', 0), sessionCookie(request, result.token, 6 * 60 * 60)]);
    return authBody(result);
  });
  const impersonationBody = { type: 'object', required: ['targetUserId','reason','currentPassword'], additionalProperties: false,
    properties: { targetUserId: { type: 'string', format: 'uuid' }, reason: { type: 'string', minLength: 10, maxLength: 500 },
      currentPassword: { type: 'string', minLength: 1, maxLength: 1024 } } } as const;
  app.post('/api/v1/admin/impersonations', { schema: { body: impersonationBody } }, async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    const result = await service.startImpersonation(token, String(request.headers['x-csrf-token'] ?? ''), request.body, request.id);
    preventAuthCaching(reply);
    reply.header('set-cookie', sessionCookie(request, result.token, 15 * 60));
    return authBody(result);
  });
  app.post('/api/v1/admin/impersonations/stop', async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    try {
      const result = await service.stopImpersonation(token, String(request.headers['x-csrf-token'] ?? ''), request.id);
      preventAuthCaching(reply);
      reply.header('set-cookie', sessionCookie(request, result.token, 6 * 60 * 60));
      return authBody(result);
    } catch (error) {
      preventAuthCaching(reply);
      if (error instanceof ApiError && error.code === 'IMPERSONATION_INVALIDATED') {
        reply.header('set-cookie', sessionCookie(request, '', 0));
      }
      throw error;
    }
  });
  app.get('/api/v1/auth/session', async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    const result = await service.rotateCsrf(token);
    preventAuthCaching(reply);
    return authBody(result);
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = sessionToken(request);
    if (token) await service.logout(token, String(request.headers['x-csrf-token'] ?? ''), request.id);
    preventAuthCaching(reply);
    reply.header('set-cookie', sessionCookie(request, '', 0));
    return { status: 'ok' };
  });
  app.post('/api/v1/auth/password', { schema: { body: { type: 'object', required: ['currentPassword','newPassword'],
    additionalProperties: false, properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 1024 },
      newPassword: { type: 'string', minLength: 12, maxLength: 1024 } } } } }, async (request, reply) => {
    const token = sessionToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED');
    await service.changePassword(token, String(request.headers['x-csrf-token'] ?? ''), request.body, request.id);
    reply.header('set-cookie', sessionCookie(request, '', 0));
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
    ['/api/v1/auth/login','post','login',authResponse],
    ...(partner ? [['/api/v1/auth/partner/start','post','startPartnerLogin',{
      type: 'object', required: ['authorizationUrl'], additionalProperties: false,
      properties: { authorizationUrl: { type: 'string', format: 'uri' } },
    }] as const, ['/api/v1/auth/partner','post','partnerLogin',authResponse] as const] : []),
    ['/api/v1/auth/session','get','getSession',authResponse],
    ['/api/v1/admin/impersonations','post','startImpersonation',authResponse],
    ['/api/v1/admin/impersonations/stop','post','stopImpersonation',authResponse],
    ['/api/v1/auth/logout','post','logout',okResponseSchema],
    ['/api/v1/auth/password','post','changePassword',okResponseSchema],
    ['/api/v1/auth/email-verification/request','post','requestEmailVerification',acceptedResponseSchema,202],
    ['/api/v1/auth/email-verification/confirm','post','confirmEmailVerification',okResponseSchema],
    ['/api/v1/auth/password-recovery/request','post','requestPasswordRecovery',acceptedResponseSchema,202],
    ['/api/v1/auth/password-recovery/reset','post','resetRecoveredPassword',okResponseSchema],
  ] as const) paths[path] = { [method]: { operationId, security: [],
    ...(path === '/api/v1/admin/impersonations' ? { requestBody: { required: true,
      content: { 'application/json': { schema: impersonationBody } } } } : {}),
    ...(path === '/api/v1/auth/partner' || path === '/api/v1/auth/partner/start' ? { requestBody: { required: true,
      content: { 'application/json': { schema: path.endsWith('/start') ? partnerStartBody : partnerBody } } } } : {}),
    responses: Object.fromEntries(
    [...new Set([successStatus,400,401,403,409,429,500])].map(status => [status, {
    description: status === successStatus ? 'Success' : 'Error', content: { 'application/json': { schema: status === successStatus ? response : errorSchema } },
  }])) } };
}
