import type { OutboxHandler } from './index.js';

export const OUTBOX_TOPICS = [
  'notification.requested',
  'audit.notification',
  'webhook.received',
  'finance.event',
  'royalty.changed',
  'payout.changed',
  'payout.readiness',
  'finance.reconciliation',
  'copyright.royalty.changed',
  'takedown.submitted',
  'takedown.status.changed',
  'takedown.target.changed',
] as const;

export type OutboxTopic = typeof OUTBOX_TOPICS[number];

export function assertOutboxHandlers(handlers: Record<string, OutboxHandler>): void {
  const missing = OUTBOX_TOPICS.filter(topic => !Object.hasOwn(handlers, topic));
  if (missing.length) throw new Error(`Missing outbox handlers: ${missing.join(', ')}`);
}
