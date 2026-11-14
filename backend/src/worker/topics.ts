import type { OutboxHandler } from './index.js';

export const OUTBOX_TOPICS = [
  'notification.requested',
  'auth.email_verification.requested',
  'auth.password_reset.requested',
  'auth.email_verified',
  'auth.password_reset.completed',
  'audit.notification',
  'webhook.received',
  'finance.event',
  'release.submission.requested',
  'royalty.changed',
  'payout.changed',
  'payout.readiness',
  'finance.reconciliation',
  'copyright.royalty.changed',
  'copyright_registration.created',
  'copyright_registration.draft_replaced',
  'copyright_registration.submitted',
  'copyright_registration.reviewed',
  'copyright_contract.changed',
  'copyright_registration.payment_changed',
  'takedown.submitted',
  'takedown.status.changed',
  'takedown.target.changed',
] as const;

export type OutboxTopic = typeof OUTBOX_TOPICS[number];

export function assertOutboxHandlers(handlers: Record<string, OutboxHandler>): void {
  const missing = OUTBOX_TOPICS.filter(topic => !Object.hasOwn(handlers, topic));
  if (missing.length) throw new Error(`Missing outbox handlers: ${missing.join(', ')}`);
}
