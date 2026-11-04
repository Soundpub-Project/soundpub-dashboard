import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerNotificationsRoutes } from '../src/api/notifications.js';
import { registerAuditSettingsRoutes } from '../src/api/audit-settings.js';
import type { NotificationsService } from '../src/notifications/index.js';
import type { AuditSettingsService } from '../src/audit-settings/index.js';

test('HTTP query parameters remain strings until domain validation', async () => {
  const app = Fastify();
  const actor = { id: '00000000-0000-4000-8000-000000000004', status: 'active', roles: ['admin'] as const };
  const authenticate = async () => actor;
  const notifications = { list: async () => ({ items: [], nextCursor: null }) } as unknown as NotificationsService;
  const settings = { listAudit: async () => ({ items: [], nextOffset: null }) } as unknown as AuditSettingsService;
  registerNotificationsRoutes(app, notifications, authenticate, {}, {});
  registerAuditSettingsRoutes(app, settings, authenticate, {}, {});
  try {
    assert.equal((await app.inject('/api/v1/notifications?limit=50')).statusCode, 200);
    assert.equal((await app.inject('/api/v1/admin/audit?limit=50&offset=0')).statusCode, 200);
    assert.equal((await app.inject('/api/v1/admin/audit')).statusCode, 200);
    assert.equal((await app.inject('/api/v1/notifications?limit=201')).statusCode, 400);
    assert.equal((await app.inject('/api/v1/admin/audit?offset=-1')).statusCode, 400);
  } finally { await app.close(); }
});
