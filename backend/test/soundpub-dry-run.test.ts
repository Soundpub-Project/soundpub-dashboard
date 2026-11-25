import assert from 'node:assert/strict';
import test from 'node:test';
import { planSoundpubIdentityDryRun } from '../src/recovery/soundpub-dry-run.js';

const namespace = '64db9734-4dca-4fd8-89a8-88b6d0846ce1';
const labelId = 'c0d0a6ee-41c5-4fad-9c18-015a87d73f11';
const artistId = 'd518e638-bdb0-4be8-8c31-f534cab9d35b';
const artistProfileId = '82dd2b37-b03c-49fe-9258-87d785d33421';
const timestamp = '2025-01-02T03:04:05.000Z';

function authUser(id: string, email: string) {
  return { id, email, email_confirmed_at: timestamp, created_at: timestamp };
}

function profile(id: string, email: string, parent_label_id: string | null = null) {
  return {
    id,
    email,
    full_name: 'Synthetic User',
    phone: null,
    address: null,
    parent_label_id,
    status: 'active',
    balance: '0.00',
    label_revenue: '0.00',
    artist_revenue: '0.00',
    password_set: true,
    composer_code: null,
    artist_profile_completed: false,
    email_verified: true,
    email_notif_payout: false,
    email_notif_release: true,
    email_notif_payment: false,
    email_notif_announcement: true,
    is_managed_artist: false,
    auth_user_status: 'linked',
    created_at: timestamp,
    updated_at: timestamp,
    _unmapped_nonempty_fields: [],
  };
}

function artistProfile(id = artistProfileId, user_id = artistId) {
  return {
    id,
    user_id,
    artist_name: 'Synthetic Artist',
    artist_type: 'solo',
    bio: null,
    genre: 'Electronic',
    social_links: { spotify: true, website: 'https://artist.example.test' },
    legal_name: null,
    country: 'ID',
    city: null,
    language: 'id',
    gender: null,
    date_of_birth: null,
    verified: false,
    verified_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    _unmapped_nonempty_fields: [],
  };
}

function plan(input: {
  approvedParentLabelIds?: string[];
  authUsers?: unknown[];
  profiles?: unknown[];
  userRoles?: unknown[];
  artistProfiles?: unknown[];
  tableCounts?: Record<string, number>;
} = {}) {
  return planSoundpubIdentityDryRun({
    namespace,
    approvedParentLabelIds: input.approvedParentLabelIds ?? [],
    authUsers: input.authUsers ?? [],
    profiles: input.profiles ?? [],
    userRoles: input.userRoles ?? [],
    artistProfiles: input.artistProfiles ?? [],
    ...(input.tableCounts === undefined ? {} : { tableCounts: input.tableCounts }),
  });
}

test('plans deterministic inactive identities, safe profiles, settings, and review-only role candidates', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [
      profile(labelId, 'label@example.test'),
      profile(artistId, 'artist@example.test', labelId),
    ],
    approvedParentLabelIds: [labelId],
    userRoles: [{
      id: '6030848a-dd53-4b89-a78c-6e9a1ca302ea',
      user_id: artistId,
      role: 'artist',
      created_at: timestamp,
    }],
  });

  assert.equal(report.mode, 'dry-run-only');
  assert.equal(report.apply_supported, false);
  assert.equal(report.target_candidates.backend_users.length, 2);
  assert.equal(report.target_candidates.profiles.length, 2);
  assert.equal(report.target_candidates.user_settings.length, 2);

  const labelTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === labelId)!.backend_user_id;
  const artistTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === artistId)!.backend_user_id;
  const labelUser = report.target_candidates.backend_users.find(row => row.id === labelTargetId)!;
  const artistProfile = report.target_candidates.profiles.find(row => row.id === artistTargetId)!;
  assert.equal(labelUser.status, 'inactive');
  assert.equal(labelUser.email_verified_at, null);
  assert.equal(labelUser.migration_source.requires_reauthentication, true);
  assert.equal(artistProfile.parent_label_id, labelTargetId);
  assert.equal(artistProfile.balance, '0.00');
  assert.equal(artistProfile.password_set, false);
  assert.deepEqual(report.target_candidates.user_settings[0]!.settings, {
    email_notif_payout: false,
    email_notif_release: true,
    email_notif_payment: false,
    email_notif_announcement: true,
  });
  assert.deepEqual(report.role_candidates[0], {
    source_role_id: '6030848a-dd53-4b89-a78c-6e9a1ca302ea',
    source_user_id: artistId,
    target_user_id: artistTargetId,
    role: 'artist',
    source_created_at: timestamp,
    requires_tenant_review: true,
    requires_authorized_verification: true,
  });

  const rerun = planSoundpubIdentityDryRun({
    namespace,
    approvedParentLabelIds: [],
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
  });
  assert.deepEqual(rerun.identity_crosswalk, report.identity_crosswalk);
  const differentNamespace = planSoundpubIdentityDryRun({
    namespace: 'bca21d0c-13e4-4b38-804b-3fc9145ef3ec',
    approvedParentLabelIds: [],
    authUsers: [authUser(labelId, 'label@example.test')],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
  });
  assert.notEqual(differentNamespace.identity_crosswalk[0]!.backend_user_id, labelTargetId);
});

test('blocks cached finance balances without exposing their values or importing them', () => {
  const row = profile(labelId, 'label@example.test') as ReturnType<typeof profile> & { balance: string };
  row.balance = '90071992547409.93';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    profiles: [row],
  });

  assert.equal(report.target_candidates.profiles.length, 0);
  assert.equal(report.reconciliation.profiles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'LEGACY_FINANCE_RECONCILIATION_REQUIRED'));
  assert.equal(JSON.stringify(report).includes(row.balance), false);
});

test('requires explicit parent-label approval before mapping tenant relationships', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(artistId, 'artist@example.test', labelId)],
  });

  assert.equal(report.target_candidates.profiles.length, 0);
  assert.equal(report.reconciliation.profiles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'PARENT_LABEL_SCOPE_REVIEW_REQUIRED'));
});

test('maps supported artist-profile fields while clearing verification and staging media IDs', () => {
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    profiles: [profile(artistId, 'artist@example.test')],
    artistProfiles: [artistProfile()],
    tableCounts: { artist_profiles: 1 },
  });
  const mapped = report.target_candidates.artist_profiles[0]!;

  assert.equal(report.reconciliation.artist_profiles.planned_rows, 1);
  assert.equal(report.reconciliation.unmapped_tables.length, 30);
  assert.equal(mapped.user_id, report.identity_crosswalk[0]!.backend_user_id);
  assert.equal(mapped.artist_name, 'Synthetic Artist');
  assert.deepEqual(mapped.social_links, { spotify: true, website: 'https://artist.example.test' });
  assert.equal(mapped.profile_image_url, null);
  assert.equal(mapped.profile_image_media_id, null);
  assert.equal(mapped.verified, false);
  assert.equal(mapped.verified_at, null);
  assert.deepEqual(report.artist_profile_crosswalk, [{
    source_artist_profile_id: artistProfileId,
    target_artist_profile_id: mapped.id,
  }]);
});

test('blocks legacy artist verification, images, and Spotify fields pending separate mapping', () => {
  const row = {
    ...artistProfile(),
    verified: true,
    verified_at: timestamp,
    _unmapped_nonempty_fields: ['profile_image_url', 'spotify_data'],
  };
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    profiles: [profile(artistId, 'artist@example.test')],
    artistProfiles: [row],
  });

  assert.equal(report.target_candidates.artist_profiles.length, 0);
  assert.equal(report.reconciliation.artist_profiles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'UNMAPPED_ARTIST_PROFILE_FIELDS'));
  assert.ok(report.issues.some(entry => entry.reason === 'LEGACY_ARTIST_VERIFICATION_REVIEW_REQUIRED'));
});

test('rejects artist profile rows that include unsupported raw Spotify fields', () => {
  const row = { ...artistProfile(), spotify_artist_id: 'synthetic-provider-id' };
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    profiles: [profile(artistId, 'artist@example.test')],
    artistProfiles: [row],
  });

  assert.equal(report.reconciliation.artist_profiles.rejected_rows, 1);
  assert.equal(report.target_candidates.artist_profiles.length, 0);
  assert.equal(JSON.stringify(report).includes('synthetic-provider-id'), false);
});

test('blocks artist-profile rows whose identity has no planned base profile', () => {
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    artistProfiles: [artistProfile()],
  });

  assert.equal(report.target_candidates.artist_profiles.length, 0);
  assert.equal(report.reconciliation.artist_profiles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_TARGET_PROFILE'));
});

test('blocks a parent reference whose source profile row is missing', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
  });

  assert.equal(report.target_candidates.profiles.length, 0);
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_PARENT_PROFILE'));
});

test('rejects duplicate identities and blocks dependent profile and role rows', () => {
  const report = plan({
    authUsers: [
      authUser(labelId, 'same@example.test'),
      authUser(artistId, 'SAME@example.test'),
    ],
    profiles: [
      profile(labelId, 'same@example.test'),
      profile(artistId, 'same@example.test'),
    ],
    userRoles: [{
      id: '6030848a-dd53-4b89-a78c-6e9a1ca302ea',
      user_id: artistId,
      role: 'artist',
      created_at: timestamp,
    }],
  });

  assert.equal(report.target_candidates.backend_users.length, 0);
  assert.equal(report.reconciliation.auth_users.rejected_rows, 2);
  assert.equal(report.reconciliation.profiles.blocked_rows, 2);
  assert.equal(report.reconciliation.user_roles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'AMBIGUOUS_EMAIL'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_AUTH_IDENTITY'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_ROLE_USER'));
});

test('rejects credential-bearing or unknown fields without echoing their contents', () => {
  const secret = 'synthetic-password-hash-must-not-leak';
  const user = { ...authUser(labelId, 'label@example.test'), encrypted_password: secret };
  const report = plan({ authUsers: [user] });

  assert.equal(report.target_candidates.backend_users.length, 0);
  assert.equal(report.reconciliation.auth_users.rejected_rows, 1);
  assert.equal(report.issues[0]!.reason, 'INVALID_OR_FORBIDDEN_FIELDS');
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('requires exact decimal strings and reports unsupported table coverage', () => {
  const invalidPrecision = profile(labelId, 'label@example.test') as ReturnType<typeof profile> & { balance: string };
  invalidPrecision.balance = '0.001';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    profiles: [invalidPrecision],
    tableCounts: { profiles: 1, user_roles: 0, royalties: 14, tracks: 0 },
  });

  assert.equal(report.reconciliation.profiles.rejected_rows, 1);
  assert.equal(report.reconciliation.unmapped_tables.find(row => row.table === 'royalties')!.source_rows, 14);
  assert.equal(report.reconciliation.unmapped_tables.find(row => row.table === 'tracks')!.source_rows, 0);
  assert.equal(report.reconciliation.unmapped_tables.find(row => row.table === 'payout_requests')!.source_rows, null);
  assert.equal(report.apply_supported, false);
  assert.throws(() => planSoundpubIdentityDryRun({
    namespace,
    approvedParentLabelIds: [],
    authUsers: [],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
    tableCounts: { unknown_table: 1 },
  }), /Unknown source table count/);
});
