import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createAuditSettingsService } from '../src/audit-settings/index.js';
import { createBalanceService } from '../src/finance/service.js';
import { createLabelCustomService } from '../src/label-custom/index.js';
import { createPgPayoutFinance } from '../src/payouts/finance.js';
import { createPayoutsService } from '../src/payouts/index.js';
import { databasePayoutPolicy } from '../src/payouts/policy.js';
import { createReleasesService } from '../src/releases/index.js';
import { createRoyaltiesService } from '../src/royalties/index.js';
import { createTracksService } from '../src/tracks/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

// Opt in with RUN_DOCKER_TESTS=1. The helper owns a disposable, loopback-only
// PostgreSQL container in dashboard-sounpub-dev; no HTTP server or provider runs.
test('Label Custom Docker E2E: login-free artist, canonical royalties, admin readiness and PIC payout', {
  skip: dockerTestsEnabled ? false : 'Set RUN_DOCKER_TESTS=1 for disposable Docker integration',
  timeout: 180_000,
}, async t => {
  const database = await concurrencyPostgres();
  t.after(() => database.close());
  const { owner, runtime } = database;
  const pic: Principal = { id: randomUUID(), roles: ['label_custom'], status: 'active' };
  const admin: Principal = { id: randomUUID(), roles: ['admin'], status: 'active' };

  // Only authority roots are seeded directly. Domain writes use real services
  // and the least-privileged soundpub_app pool, including real ledger triggers.
  for (const actor of [pic, admin]) {
    await owner.query(`INSERT INTO soundpub.backend_users(id,status,email_verified_at)
      VALUES($1,'active',now())`, [actor.id]);
    await owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES($1,$2)',
      [actor.id, actor.id === pic.id ? 'Synthetic PIC' : 'Synthetic Reviewer']);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
      VALUES($1,$2,now())`, [actor.id, actor.roles[0]]);
  }
  const settings = createAuditSettingsService(runtime);
  const initial = await settings.adminSettings(admin);
  await settings.updateAdminSettings(admin, {
    version: initial.version, settings: { min_payout_amount: '100.00' },
  }, 'label-custom-e2e-settings');

  const catalog = createLabelCustomService(runtime);
  const releases = createReleasesService(runtime);
  const tracks = createTracksService(runtime);
  const royalties = createRoyaltiesService(runtime);
  const payouts = createPayoutsService(runtime, createPgPayoutFinance(databasePayoutPolicy));
  const balances = createBalanceService(runtime);

  const unit = await catalog.createUnit(pic, { name: 'Synthetic Custom Unit' }, 'label-custom-e2e-unit');
  assert.equal(unit.owner_user_id, pic.id);
  assert.equal(unit.status, 'active');
  const artist = await catalog.createArtist(pic, {
    name: 'Synthetic Managed Artist', contact_email: 'managed-artist@example.invalid',
    contact_phone: '+62 000 12345678',
  }, 'label-custom-e2e-artist');
  assert.equal(artist.label_id, pic.id);
  assert.equal(artist.label_custom_unit_id, unit.id);
  assert.equal(artist.management_mode, 'LABEL_CUSTOM_MANAGED');
  assert.equal(artist.artist_user_id, null);
  assert.equal(artist.status, 'active');
  assert.ok(artist.verified_at);
  assert.deepEqual((await owner.query(`SELECT artist_id,user_id,artist_name
    FROM soundpub.artist_profiles WHERE artist_id=$1`, [artist.id])).rows, [{
    artist_id: artist.id, user_id: null, artist_name: artist.name,
  }]);

  async function assertNoArtistLogin() {
    assert.deepEqual((await owner.query(`SELECT
      (SELECT count(*)::int FROM soundpub.backend_users) AS users,
      (SELECT count(*)::int FROM soundpub.profiles) AS profiles,
      (SELECT count(*)::int FROM soundpub.user_roles WHERE role='artist') AS artist_roles,
      (SELECT count(*)::int FROM soundpub.external_identities) AS identities,
      (SELECT count(*)::int FROM soundpub.local_auth_credentials) AS credentials,
      (SELECT count(*)::int FROM soundpub.auth_sessions) AS sessions`)).rows, [{
      users: 2, profiles: 2, artist_roles: 0, identities: 0, credentials: 0, sessions: 0,
    }]);
  }
  await assertNoArtistLogin();

  const release = await releases.create(pic, {
    artist_id: artist.id, title: 'Synthetic Custom Release', artist_name: artist.name,
    release_type: 'single', genre: 'Pop', release_date: '2026-12-01',
  }, 'label-custom-e2e-release');
  assert.equal(release.artist_id, artist.id);
  assert.equal(release.artist_user_id, null);
  assert.equal(release.label_id, pic.id);
  const { track } = await tracks.create(pic, release.id, {
    release_version: release.version, title: 'Synthetic Custom Track', artist_name: artist.name,
  }, 'label-custom-e2e-track');
  assert.equal(track.artist_id, artist.id);
  assert.equal(track.release_id, release.id);
  assert.deepEqual((await owner.query(`SELECT artist_id,artist_user_id FROM soundpub.tracks
    WHERE id=$1`, [track.id])).rows, [{ artist_id: artist.id, artist_user_id: null }]);

  // Omit beneficiary_id and artist_id: import must derive both from canonical
  // track/release identity, despite the managed artist having no login account.
  const statement = {
    source: 'synthetic-label-custom-e2e', period: '2026-10', currency: 'IDR', filename: 'synthetic.json',
    rows: [{ source_row_id: 'synthetic-row-1', release_id: release.id, track_id: track.id,
      gross_amount: '1250.00', deduction_amount: '250.00', net_amount: '1000.00' }],
  };
  const preview = await royalties.preview(admin, statement);
  assert.equal(preview.valid_rows, 1);
  assert.equal(preview.invalid_rows, 0);
  assert.equal(preview.unknown_mappings, 0);
  assert.equal(preview.total_amount, '1000.00');
  const forged = { ...statement, rows: statement.rows.map(row => ({ ...row, beneficiary_id: artist.id })) };
  assert.equal((await royalties.preview(admin, forged)).unknown_mappings, 1);
  await assert.rejects(royalties.commit(admin, forged, 'label-custom-e2e-forged-owner'),
    { code: 'ROYALTY_IMPORT_INVALID' });
  const batch = await royalties.commit(admin, statement, 'label-custom-e2e-import');
  assert.equal(batch.replayed, false);
  assert.deepEqual(await royalties.commit(admin, statement, 'label-custom-e2e-import-retry'),
    { id: batch.id, replayed: true });
  assert.deepEqual((await owner.query(`SELECT artist_id,financial_owner_user_id,beneficiary_id,
    release_id,track_id,net_amount::text FROM soundpub.royalty_import_entries WHERE batch_id=$1`, [batch.id])).rows, [{
    artist_id: artist.id, financial_owner_user_id: pic.id, beneficiary_id: pic.id,
    release_id: release.id, track_id: track.id, net_amount: '1000.00',
  }]);
  const breakdown = await royalties.breakdown(pic, {
    artist_id: artist.id, release_id: release.id, period: statement.period,
  });
  assert.equal(breakdown.owner_id, pic.id);
  assert.equal(breakdown.currency, 'IDR');
  assert.deepEqual(breakdown.items, [{ artist_id: artist.id, release_id: release.id, track_id: track.id,
    platform: 'UNKNOWN', period: statement.period, gross_earnings: '1250.00', corrections: '0', net_earnings: '1000.00' }]);
  assert.equal((await balances.get(pic)).available, null);

  const bank = { bank_name: 'Synthetic Bank', account_number: '12345678', account_holder_name: 'Synthetic PIC' };
  const request = { ...bank, amount: '600.00', currency: 'IDR' };
  const pending = (await payouts.updateDestination(pic, bank)).destination;
  assert.equal(pending.owner_id, pic.id);
  assert.equal((await payouts.updateDestination(pic, bank)).destination.id, pending.id);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.pic_payout_destinations WHERE owner_id=$1', [pic.id])).rows[0].n, 1);
  assert.equal(pending.verified, false);
  assert.equal((await payouts.destination(pic)).destination?.verified, false);
  const closed = await payouts.eligibility(pic);
  assert.equal(closed.eligible, false);
  assert.equal(closed.available, null);
  assert.deepEqual(closed.reasons, ['DESTINATION_REQUIRED', 'RECONCILIATION_REQUIRED']);
  await assert.rejects(payouts.request(pic, request, 'label-custom-e2e-pending-destination'),
    { code: 'PAYOUT_INELIGIBLE' });
  await assert.rejects(payouts.reviewReadiness(pic, pic.id, {
    action: 'approve_reconciliation', evidence: 'synthetic-self-review',
  }, 'self-review'), { code: 'FORBIDDEN' });

  await payouts.reviewReadiness(admin, pic.id, {
    action: 'verify_destination', destination_id: pending.id, evidence: 'synthetic-bank-review',
  }, 'verify-destination');
  assert.equal((await payouts.reviewReadiness(admin, pic.id, {
    action: 'verify_destination', destination_id: pending.id, evidence: 'synthetic-bank-review',
  }, 'verify-destination')).id, pending.id);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.pic_destination_verifications WHERE destination_id=$1', [pending.id])).rows[0].n, 1);
  assert.equal((await payouts.destination(pic)).destination?.verified, true);
  const unreconciled = await payouts.eligibility(pic);
  assert.equal(unreconciled.eligible, false);
  assert.equal(unreconciled.available, null);
  assert.deepEqual(unreconciled.reasons, ['RECONCILIATION_REQUIRED']);
  await assert.rejects(payouts.request(pic, request, 'label-custom-e2e-unreconciled'),
    { code: 'PAYOUT_INELIGIBLE' });
  const approval = await payouts.reviewReadiness(admin, pic.id, {
    action: 'approve_reconciliation', evidence: 'synthetic-import-ledger-reviewed',
  }, 'approve-reconciliation');
  assert.equal((await payouts.reviewReadiness(admin, pic.id, {
    action: 'approve_reconciliation', evidence: 'synthetic-import-ledger-reviewed',
  }, 'approve-reconciliation')).id, approval.id);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.pic_reconciliation_approvals WHERE owner_id=$1', [pic.id])).rows[0].n, 1);
  assert.deepEqual((await owner.query(`SELECT destination_id,actor_id
    FROM soundpub.pic_destination_verifications WHERE destination_id=$1`, [pending.id])).rows,
  [{ destination_id: pending.id, actor_id: admin.id }]);
  const approved = (await owner.query(`SELECT owner_id,actor_id,snapshot
    FROM soundpub.pic_reconciliation_approvals WHERE id=$1`, [approval.id])).rows[0]!;
  assert.equal(approved.owner_id, pic.id);
  assert.equal(approved.actor_id, admin.id);
  assert.equal(approved.snapshot.batches.length, 1);
  assert.equal(approved.snapshot.batches[0][0], batch.id);
  assert.equal(approved.snapshot.events.length, 1);
  assert.deepEqual(await payouts.eligibility(pic), {
    eligible: true, reasons: [], available: '1000.00', minimum: '100.00', currency: 'IDR',
  });

  // Every failed request above must leave both payout and reservation absent.
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.payout_requests')).rows[0].n, 0);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.payout_allocations')).rows[0].n, 0);
  await assert.rejects(payouts.request(pic, { ...request, account_number: '99999999' }, 'label-custom-e2e-wrong-bank'),
    { code: 'DESTINATION_MISMATCH' });
  const payout = await payouts.request(pic, request, 'label-custom-e2e-payout');
  assert.equal(payout.user_id, pic.id);
  assert.equal(payout.status, 'pending');
  assert.equal(payout.amount, '600.00');
  assert.equal((await payouts.request(pic, request, 'label-custom-e2e-payout')).id, payout.id);
  assert.deepEqual((await owner.query(`SELECT payout_id,owner_id,amount::text
    FROM soundpub.payout_allocations ORDER BY owner_id`)).rows,
  [{ payout_id: payout.id, owner_id: pic.id, amount: '600.00' }]);
  assert.deepEqual((await owner.query(`SELECT owner_id,kind,amount_minor::text,business_reference
    FROM soundpub.finance_events ORDER BY kind`)).rows, [
    { owner_id: pic.id, kind: 'PAYOUT_RESERVATION', amount_minor: '60000', business_reference: payout.id },
    { owner_id: pic.id, kind: 'ROYALTY_EARNING', amount_minor: '100000', business_reference: `royalty:${batch.id}` },
  ]);
  const balance = await balances.get(pic);
  assert.equal(balance.owner_id, pic.id);
  assert.equal(balance.aggregate, false);
  assert.equal(balance.account_count, 1);
  assert.equal(balance.status, 'RECONCILED');
  assert.equal(balance.available, '400.00');
  assert.equal(balance.reserved, '600.00');
  const reserved = await payouts.eligibility(pic);
  assert.equal(reserved.eligible, false);
  assert.equal(reserved.available, '400.00');
  assert.deepEqual(reserved.reasons, ['PENDING_PAYOUT']);
  assert.equal((await payouts.list(pic)).items.length, 1);
  await assert.rejects(payouts.request(pic, request, 'label-custom-e2e-second-payout'),
    { code: 'PAYOUT_INELIGIBLE' });
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.payout_requests')).rows[0].n, 1);
  assert.deepEqual((await owner.query('SELECT owner_id FROM soundpub.finance_accounts')).rows,
    [{ owner_id: pic.id }]);
  assert.equal((await owner.query(`SELECT count(*)::int AS n FROM soundpub.finance_events e
    JOIN soundpub.finance_audit a ON a.event_id=e.id
    JOIN soundpub.outbox_events o ON o.id=a.outbox_id
    WHERE e.owner_id=$1 AND a.old_state=e.old_state AND a.new_state=e.new_state
      AND o.topic='finance.event' AND o.payload=jsonb_build_object('eventId',e.id)
      AND o.idempotency_key='finance:'||e.id::text`, [pic.id])).rows[0].n, 2);
  const reconciliationRevocation = await payouts.reviewReadiness(admin, pic.id, {
    action: 'revoke_reconciliation', approval_id: approval.id, reason: 'synthetic-final-revoke',
  }, 'revoke-reconciliation');
  assert.equal((await payouts.reviewReadiness(admin, pic.id, {
    action: 'revoke_reconciliation', approval_id: approval.id, reason: 'synthetic-final-revoke',
  }, 'revoke-reconciliation')).id, reconciliationRevocation.id);
  const destinationRevocation = await payouts.reviewReadiness(admin, pic.id, {
    action: 'revoke_destination', destination_id: pending.id, reason: 'synthetic-final-revoke',
  }, 'revoke-destination');
  assert.equal((await payouts.reviewReadiness(admin, pic.id, {
    action: 'revoke_destination', destination_id: pending.id, reason: 'synthetic-final-revoke',
  }, 'revoke-destination')).id, destinationRevocation.id);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.pic_readiness_revocations WHERE actor_id=$1', [admin.id])).rows[0].n, 2);
  assert.equal((await payouts.reviewReadiness(admin, pic.id, {
    action: 'approve_reconciliation', evidence: 'synthetic-import-ledger-reviewed',
  }, 'approve-reconciliation')).id, approval.id);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM soundpub.pic_reconciliation_approvals WHERE owner_id=$1', [pic.id])).rows[0].n, 1);
  assert.equal((await payouts.eligibility(pic)).eligible, false);
  const replacementDestination = (await payouts.updateDestination(pic, bank)).destination;
  assert.notEqual(replacementDestination.id, pending.id);
  assert.equal(replacementDestination.verified, false);
  await assertNoArtistLogin();
});
