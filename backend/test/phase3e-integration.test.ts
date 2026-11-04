import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { buildApp } from '../src/api/index.js';
import type { Principal } from '../src/auth/index.js';
import { webhookSignature } from '../src/integrations/webhook.js';
import { createPaymentsService, paymentSubmissionDependency } from '../src/payments/index.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { databasePayoutPolicy } from '../src/payouts/policy.js';
import { createReleasesService } from '../src/releases/index.js';
import { createTracksService } from '../src/tracks/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createSubmissionService, MockSubmissionProvider } from '../src/submissions/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const secret = 'phase3e-synthetic-callback-secret-32-characters';

test('Phase 3E integration gates reconciliation, snapshots trusted prices and submits paid releases', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
  const database = await concurrencyPostgres();
  try {
    const label: Principal = { id: randomUUID(), roles: ['label'], status: 'active' };
    const artist: Principal = { id: randomUUID(), roles: ['artist'], status: 'active' };
    const admin: Principal = { id: randomUUID(), roles: ['superadmin'], status: 'active' };
    for (const actor of [label, artist, admin]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [actor.id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES($1,$2,$3)',
        [actor.id, actor.roles[0], actor.id === artist.id ? label.id : null]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [actor.id,actor.roles[0]]);
    }
    await database.owner.query("INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES($1,$2,'Artist',now())", [label.id,artist.id]);

    const settings = createAuditSettingsService(database.runtime);
    const initial = await settings.adminSettings(admin);
    assert.equal(initial.settings.min_payout_amount, null);
    assert.equal(initial.settings.release_price_per_track, null);
    const configured = await settings.updateAdminSettings(admin, { version: initial.version,
      settings: { min_payout_amount: '100.00', release_price_per_track: '50000.00' } }, 'finance-settings');
    const preserved = await settings.updateAdminSettings(admin, { version: configured.version,
      settings: { maintenance_enabled: true } }, 'other-setting');
    assert.equal(preserved.settings.min_payout_amount, '100.00');
    assert.equal(preserved.settings.release_price_per_track, '50000.00');

    const releases = createReleasesService(database.runtime);
    const aggregate = await releases.createAggregate(label, { artist_user_id: artist.id, status: 'draft', title: 'Paid release',
      artist_name: 'Artist', release_type: 'single', genre: 'Pop', release_date: '2026-11-01',
      tracks: [{ title: 'Track', artist_name: 'Artist' }] }, 'release-create');
    const snapshot = (await database.owner.query('SELECT total_payment_snapshot::text AS total FROM soundpub.releases WHERE id=$1', [aggregate.release.id])).rows[0];
    assert.equal(snapshot.total, '50000.00');
    assert.equal(aggregate.release.version, 1);
    const edited = await releases.updateAggregate(label, aggregate.release.id, { version: aggregate.release.version,
      title: 'Edited paid release', tracks: aggregate.tracks.map(track => ({ id: track.id, version: track.version,
        title: track.title, artist_name: track.artist_name })) }, 'release-update');
    assert.equal(edited.release.version, 2);
    assert.equal((await database.owner.query('SELECT total_payment_snapshot::text AS total FROM soundpub.releases WHERE id=$1',
      [aggregate.release.id])).rows[0].total, '50000.00');

    const payments = createPaymentsService(database.runtime, { callbackSecret: secret });
    const stale = await releases.createAggregate(label, { artist_user_id: artist.id, title: 'Disabled price',
      artist_name: 'Artist', release_type: 'single', tracks: [{ title: 'First', artist_name: 'Artist' }] }, 'price-create');
    const disabled = await settings.updateAdminSettings(admin, { version: preserved.version,
      settings: { release_price_per_track: null } }, 'price-disabled');
    const cleared = await releases.updateAggregate(label, stale.release.id, { version: stale.release.version,
      tracks: [...stale.tracks.map(track => ({ id: track.id, version: track.version, title: track.title,
        artist_name: track.artist_name })), { title: 'Second', artist_name: 'Artist' }] }, 'price-cleared');
    assert.equal(cleared.release.version, 2);
    assert.equal((await database.owner.query('SELECT total_payment_snapshot FROM soundpub.releases WHERE id=$1',
      [stale.release.id])).rows[0].total_payment_snapshot, null);
    await assert.rejects(payments.createInvoice(artist, { release_id: stale.release.id,
      idempotency_key: 'disabled-price' }, 'invoice-denied'), { code: 'PAYMENT_PRICE_UNAVAILABLE' });
    await settings.updateAdminSettings(admin, { version: disabled.version,
      settings: { release_price_per_track: '50000.00' } }, 'price-restored');
    const tracks = createTracksService(database.runtime);
    await assert.rejects(tracks.create(artist, aggregate.release.id, { release_version: edited.release.version,
      title: 'Blocked repricing', artist_name: 'Artist' }, 'track-before-invoice'), { code: 'PAYMENT_PRICE_CHANGED' });
    const invoice = await payments.createInvoice(artist, { release_id: aggregate.release.id, idempotency_key: 'invoice-paid-release' }, 'invoice');
    await assert.rejects(tracks.create(artist, aggregate.release.id, { release_version: edited.release.version,
      title: 'Blocked repricing', artist_name: 'Artist' }, 'track-after-invoice'), { code: 'PAYMENT_PRICE_CHANGED' });
    const rawBody = Buffer.from(JSON.stringify({ provider_invoice_id: invoice.provider_invoice_id, status: 'PAID',
      amount_minor: invoice.amount_minor, currency: invoice.currency }));
    const callback = { provider: 'mock-payment', eventId: 'paid-release', timestamp: String(Math.floor(Date.now()/1000)), rawBody, signature: '' };
    callback.signature = webhookSignature(secret, callback);
    assert.equal(await payments.callback(callback), 'accepted');

    const submissions = createSubmissionService(database.runtime, { payment: paymentSubmissionDependency,
      media: { check: async () => ({ cover: true, audio: true }) }, provider: new MockSubmissionProvider() });
    const readiness = await submissions.readiness(label, aggregate.release.id);
    assert.equal(readiness.ready, true);
    const submitted = await submissions.submit(label, aggregate.release.id, { version: edited.release.version }, 'submit');
    assert.equal(submitted.status, 'pending_paid');
    const processing = await releases.update(admin, submitted.id, { version: submitted.version, status: 'processing' }, 'process');
    assert.equal(processing.status, 'processing');

    const royalties = createRoyaltiesService(database.runtime);
    await royalties.commit(admin, { source: 'synthetic', period: '2026-10', currency: 'IDR', filename: 'synthetic.json', rows: [{
      source_row_id: 'row-1', beneficiary_id: artist.id, release_id: aggregate.release.id, track_id: aggregate.tracks[0]!.id,
      gross_amount: '1000.00', deduction_amount: '0.00', net_amount: '1000.00',
    }] }, 'royalty-import');
    const payouts = createPayoutsService(database.runtime, createPgPayoutFinance(databasePayoutPolicy));
    const eligibility = await payouts.eligibility(label);
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.reasons.includes('RECONCILIATION_REQUIRED'));
    assert.equal(eligibility.available, null);
    await assert.rejects(payouts.request(label, { amount: '800.00', currency: 'IDR', bank_name: 'Synthetic',
      account_number: '12345678', account_holder_name: 'Label' }, 'blocked-unreconciled'), { code: 'PAYOUT_INELIGIBLE' });

    const app = buildApp({ payouts, auth: { authenticate: async () => admin }, readiness: { check: async () => true },
      admin: { suspendUser: async () => undefined }, webhooks: { receive: async () => false },
      rateLimiter: { consume: async () => ({ allowed: true }) } });
    assert.equal(app.hasRoute({ method: 'POST', url: '/api/v1/admin/payouts/:id/mock-settle' }), false);
    await app.close();
  } finally { await database.close(); }
});
