import assert from 'node:assert/strict';
import test from 'node:test';
import { planSoundpubIdentityDryRun } from '../src/recovery/soundpub-dry-run.js';

const namespace = '64db9734-4dca-4fd8-89a8-88b6d0846ce1';
const labelId = 'c0d0a6ee-41c5-4fad-9c18-015a87d73f11';
const artistId = 'd518e638-bdb0-4be8-8c31-f534cab9d35b';
const artistProfileId = '82dd2b37-b03c-49fe-9258-87d785d33421';
const artistRosterId = '3491a05b-6875-47af-b495-850a13b17d7f';
const releaseId = '9d3e2235-c3e8-47bd-8f8c-f5cae1062aa3';
const trackId = '42fc282c-bc15-46c1-8c85-2b3ded8e0ef7';
const notificationId = 'd20132ca-4925-4bdb-ae72-58a43cc256c3';
const deletionRequestId = '4a9d8bd8-e4f4-4d85-9e03-7e9018e51b42';
const auditLogId = 'f7f44a36-51bd-4eb6-8ca0-65ad02869e5e';
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

function artistRoster(id = artistRosterId, label_id = labelId) {
  return {
    id,
    label_id,
    name: 'Synthetic Artist',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function notification(id = notificationId, user_id = artistId) {
  return {
    id,
    user_id,
    type: 'release',
    title: 'Release update',
    message: 'A synthetic release update.',
    is_read: false,
    is_global: false,
    created_by: labelId,
    created_at: timestamp,
    _has_nonempty_metadata: false,
  };
}

function artistDeletionRequest(id = deletionRequestId) {
  return {
    id,
    artist_id: artistId,
    label_id: labelId,
    reason: 'Synthetic account separation request.',
    status: 'pending',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function appSetting(id: string, key: string, value: string | null) {
  return { id, key, value };
}

function auditLog(id = auditLogId, actor_id: string | null = labelId) {
  return {
    id,
    action: 'profile.updated',
    actor_id,
    target_id: artistId,
    target_type: 'profile',
    request_id: null,
    created_at: timestamp,
    _has_details: false,
    _has_ip_address: false,
    _has_actor_role: false,
    _has_before_data: false,
    _has_after_data: false,
    _has_changed_fields: false,
    _has_user_agent: false,
  };
}

function authEvent(id = '907e970a-1470-4b72-891c-065d7d1ebd10', user_id: string | null = labelId) {
  return {
    id,
    user_id,
    event_type: 'email_verified',
    created_at: timestamp,
    _has_ip_address: false,
    _has_user_agent: false,
    _has_nonempty_metadata: false,
  };
}

function release(id = releaseId) {
  return {
    id,
    label_id: labelId,
    artist_user_id: artistId,
    created_by: labelId,
    title: 'Synthetic Release',
    artist_name: 'Synthetic Artist',
    release_type: 'single',
    genre: 'Electronic',
    release_date: '2025-01-02',
    upc: '123456789012',
    cover_url: null,
    status: 'active',
    distribution_service: 'standard',
    custom_label_name: null,
    custom_record_name: null,
    price_per_track_snapshot: null,
    total_payment_snapshot: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function track(id = trackId, release_id = releaseId) {
  return {
    id,
    release_id,
    artist_user_id: artistId,
    title: 'Synthetic Track',
    artist_name: 'Synthetic Artist',
    artists: [],
    contributors: [],
    composer: null,
    lyricist: null,
    genre: 'Electronic',
    lyrics: null,
    explicit_lyrics: false,
    isrc: 'usabc1234567',
    duration: 180,
    audio_url: null,
    clip_url: null,
    video_url: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function plan(input: {
  approvedParentLabelIds?: string[];
  authUsers?: unknown[];
  profiles?: unknown[];
  userRoles?: unknown[];
  artistProfiles?: unknown[];
  artists?: unknown[];
  notifications?: unknown[];
  artistDeletionRequests?: unknown[];
  appSettings?: unknown[];
  auditLogs?: unknown[];
  authEvents?: unknown[];
  releases?: unknown[];
  tracks?: unknown[];
  trackPositionCrosswalk?: Array<{ source_track_id: string; position: number }>;
  artistRosterCrosswalk?: Array<{ source_artist_id: string; source_artist_user_id: string }>;
  tableCounts?: Record<string, number>;
} = {}) {
  return planSoundpubIdentityDryRun({
    namespace,
    approvedParentLabelIds: input.approvedParentLabelIds ?? [],
    authUsers: input.authUsers ?? [],
    profiles: input.profiles ?? [],
    userRoles: input.userRoles ?? [],
    artistProfiles: input.artistProfiles ?? [],
    artists: input.artists ?? [],
    releases: input.releases ?? [],
    tracks: input.tracks ?? [],
    trackPositionCrosswalk: input.trackPositionCrosswalk ?? [],
    notifications: input.notifications ?? [],
    artistDeletionRequests: input.artistDeletionRequests ?? [],
    appSettings: input.appSettings ?? [],
    auditLogs: input.auditLogs ?? [],
    authEvents: input.authEvents ?? [],
    artistRosterCrosswalk: input.artistRosterCrosswalk ?? [],
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
    artists: [],
    artistRosterCrosswalk: [],
    notifications: [],
    artistDeletionRequests: [],
    appSettings: [],
  });
  assert.deepEqual(rerun.identity_crosswalk, report.identity_crosswalk);
  const differentNamespace = planSoundpubIdentityDryRun({
    namespace: 'bca21d0c-13e4-4b38-804b-3fc9145ef3ec',
    approvedParentLabelIds: [],
    authUsers: [authUser(labelId, 'label@example.test')],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
    artists: [],
    artistRosterCrosswalk: [],
    notifications: [],
    artistDeletionRequests: [],
    appSettings: [],
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

test('blocks profiles with verification or reset-token fields without exposing token values', () => {
  const row = {
    ...profile(labelId, 'label@example.test'),
    _unmapped_nonempty_fields: ['verification_token', 'password_reset_token_expires_at'],
  };
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    profiles: [row],
  });

  assert.equal(report.target_candidates.profiles.length, 0);
  assert.equal(report.reconciliation.profiles.blocked_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'UNMAPPED_PROFILE_FIELDS'));
  assert.equal(JSON.stringify(report).includes('verification_token'), false);
  assert.equal(JSON.stringify(report).includes('password_reset_token'), false);
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
  assert.equal(report.reconciliation.unmapped_tables.length, 22);
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

test('maps roster rows only through explicit identity crosswalks and keeps them unverified', () => {
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
    artists: [artistRoster()],
    artistRosterCrosswalk: [{
      source_artist_id: artistRosterId,
      source_artist_user_id: artistId,
    }],
    tableCounts: { artists: 1 },
  });
  const mapped = report.target_candidates.artists[0]!;
  const labelTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === labelId)!.backend_user_id;
  const artistTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === artistId)!.backend_user_id;

  assert.equal(report.reconciliation.artists.planned_rows, 1);
  assert.equal(report.reconciliation.unmapped_tables.length, 22);
  assert.equal(mapped.label_id, labelTargetId);
  assert.equal(mapped.artist_user_id, artistTargetId);
  assert.equal(mapped.name, 'Synthetic Artist');
  assert.equal(mapped.verified_at, null);
  assert.deepEqual(report.artist_roster_crosswalk, [{
    source_artist_id: artistRosterId,
    target_artist_id: mapped.id,
  }]);
});

test('blocks roster rows with missing explicit mapping, parent mismatch, or unreviewed artist role', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [
      profile(labelId, 'label@example.test'),
      profile(artistId, 'artist@example.test'),
    ],
    artists: [artistRoster(), artistRoster('0b2469a8-f0b4-4a2c-9198-2e93fe710e64')],
    artistRosterCrosswalk: [{
      source_artist_id: artistRosterId,
      source_artist_user_id: artistId,
    }],
  });

  assert.equal(report.target_candidates.artists.length, 0);
  assert.equal(report.reconciliation.artists.blocked_rows, 2);
  assert.ok(report.issues.some(entry => entry.reason === 'MISSING_EXPLICIT_ARTIST_IDENTITY_MAPPING'));
  assert.ok(report.issues.some(entry => entry.reason === 'ARTIST_LABEL_PARENT_MISMATCH'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_ARTIST_ROLE'));
});

test('rejects duplicate or dangling artist roster crosswalks before planning', () => {
  const common = {
    namespace,
    approvedParentLabelIds: [],
    authUsers: [],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
    artists: [artistRoster()],
    notifications: [],
    artistDeletionRequests: [],
    appSettings: [],
  };
  assert.throws(() => planSoundpubIdentityDryRun({
    ...common,
    artistRosterCrosswalk: [
      { source_artist_id: artistRosterId, source_artist_user_id: artistId },
      { source_artist_id: artistRosterId, source_artist_user_id: artistId },
    ],
  }), /Artist roster crosswalk must be one-to-one/);
  assert.throws(() => planSoundpubIdentityDryRun({
    ...common,
    artistRosterCrosswalk: [{
      source_artist_id: '0b2469a8-f0b4-4a2c-9198-2e93fe710e64',
      source_artist_user_id: artistId,
    }],
  }), /Artist roster crosswalk references an unknown source row/);
});

test('maps release bundles inactive with explicit track order and deterministic crosswalks', () => {
  const secondTrackId = 'c0c3f197-3670-47b6-a41b-cae156a54733';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [{ ...release(), custom_label_name: 'Legacy Label', custom_record_name: 'Legacy Catalog' }],
    tracks: [track(), track(secondTrackId)],
    trackPositionCrosswalk: [
      { source_track_id: secondTrackId, position: 2 },
      { source_track_id: trackId, position: 1 },
    ],
    tableCounts: { releases: 1, tracks: 2 },
  });
  const targetRelease = report.target_candidates.releases[0]!;
  const targetTracks = report.target_candidates.tracks;
  const targetArtistId = report.identity_crosswalk.find(row => row.source_auth_user_id === artistId)!.backend_user_id;

  assert.equal(report.reconciliation.releases.planned_rows, 1);
  assert.equal(report.reconciliation.tracks.planned_rows, 2);
  assert.equal(targetRelease.status, 'inactive');
  assert.equal(targetRelease.migration_source.source_status, 'active');
  assert.equal(targetRelease.custom_label_name, 'Legacy Label');
  assert.equal(targetRelease.custom_record_name, 'Legacy Catalog');
  assert.equal(targetRelease.artist_user_id, targetArtistId);
  assert.equal(targetTracks[0]!.release_id, targetRelease.id);
  assert.equal(targetTracks[0]!.artist_user_id, targetArtistId);
  assert.deepEqual(targetTracks.map(item => item.position), [1, 2]);
  assert.equal(targetTracks[0]!.isrc, 'USABC1234567');
  assert.equal(targetTracks[0]!.audio_url, null);
  assert.deepEqual(report.release_crosswalk, [{
    source_release_id: releaseId,
    target_release_id: targetRelease.id,
  }]);
  assert.equal(report.track_crosswalk.length, 2);
  assert.equal(report.reconciliation.unmapped_tables.length, 22);
});

test('blocks a complete release bundle when track ordering is absent or not contiguous', () => {
  const secondTrackId = 'c0c3f197-3670-47b6-a41b-cae156a54733';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [release()],
    tracks: [track(), track(secondTrackId)],
    trackPositionCrosswalk: [
      { source_track_id: trackId, position: 1 },
      { source_track_id: secondTrackId, position: 3 },
    ],
  });

  assert.equal(report.target_candidates.releases.length, 0);
  assert.equal(report.target_candidates.tracks.length, 0);
  assert.equal(report.reconciliation.releases.blocked_rows, 1);
  assert.equal(report.reconciliation.tracks.blocked_rows, 2);
  assert.ok(report.issues.some(entry => entry.reason === 'EXPLICIT_CONTIGUOUS_TRACK_ORDER_REQUIRED'));
});

test('blocks release and track media or unreconciled pricing without leaking source values', () => {
  const privateMediaPath = 'private://legacy-audio/object-7';
  const mediaReport = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [release()],
    tracks: [{ ...track(), audio_url: privateMediaPath }],
    trackPositionCrosswalk: [{ source_track_id: trackId, position: 1 }],
  });
  const financeReport = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [{ ...release(), price_per_track_snapshot: '1200.00' }],
  });

  assert.equal(mediaReport.target_candidates.releases.length, 0);
  assert.equal(mediaReport.target_candidates.tracks.length, 0);
  assert.ok(mediaReport.issues.some(entry => entry.reason === 'LEGACY_TRACK_MEDIA_REQUIRES_MEDIA_MIGRATION'));
  assert.equal(JSON.stringify(mediaReport).includes(privateMediaPath), false);
  assert.equal(financeReport.target_candidates.releases.length, 0);
  assert.ok(financeReport.issues.some(entry => entry.reason === 'RELEASE_FINANCE_SNAPSHOT_RECONCILIATION_REQUIRED'));
  assert.equal(JSON.stringify(financeReport).includes('1200.00'), false);
});

test('rejects release UPC values outside the target contract', () => {
  const report = plan({
    releases: [{ ...release(), upc: 'legacy-upc' }],
  });

  assert.equal(report.reconciliation.releases.rejected_rows, 1);
  assert.equal(report.target_candidates.releases.length, 0);
  assert.ok(report.issues.some(entry =>
    entry.table === 'soundpub.releases' && entry.reason === 'INVALID_OR_FORBIDDEN_FIELDS'));
  assert.equal(JSON.stringify(report).includes('legacy-upc'), false);
});

test('blocks releases with legacy rejection text without loading that text', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [{ ...release(), _has_rejection_reason: true }],
  });

  assert.equal(report.target_candidates.releases.length, 0);
  assert.ok(report.issues.some(entry => entry.reason === 'RELEASE_REJECTION_TEXT_REQUIRES_REVIEW'));
});

test('rejects malformed track payloads and blocks their release bundle', () => {
  const sensitiveValue = 'synthetic-track-private-field';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test', labelId)],
    approvedParentLabelIds: [labelId],
    releases: [release()],
    tracks: [{ ...track(), legacy_payload: sensitiveValue }],
    trackPositionCrosswalk: [{ source_track_id: trackId, position: 1 }],
  });

  assert.equal(report.reconciliation.tracks.rejected_rows, 1);
  assert.equal(report.target_candidates.releases.length, 0);
  assert.equal(report.target_candidates.tracks.length, 0);
  assert.ok(report.issues.some(entry => entry.reason === 'INVALID_OR_FORBIDDEN_FIELDS'));
  assert.equal(JSON.stringify(report).includes(sensitiveValue), false);
});

test('rejects dangling and duplicate track-position crosswalk entries', () => {
  const common = {
    namespace,
    approvedParentLabelIds: [],
    authUsers: [],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
    artists: [],
    artistRosterCrosswalk: [],
    notifications: [],
    artistDeletionRequests: [],
    appSettings: [],
    releases: [release()],
    tracks: [track()],
  };
  assert.throws(() => planSoundpubIdentityDryRun({
    ...common,
    trackPositionCrosswalk: [
      { source_track_id: trackId, position: 1 },
      { source_track_id: trackId, position: 2 },
    ],
  }), /Track position crosswalk must be one-to-one/);
  assert.throws(() => planSoundpubIdentityDryRun({
    ...common,
    trackPositionCrosswalk: [{
      source_track_id: 'cfb49399-51e2-47a5-b208-26395d954933',
      position: 1,
    }],
  }), /Track position crosswalk references an unknown source row/);
});

test('maps allowlisted application settings with exact money and strict config parsing', () => {
  const report = plan({
    appSettings: [
      appSetting('10000000-0000-4000-8000-000000000001', 'maintenance_enabled', 'true'),
      appSetting('10000000-0000-4000-8000-000000000002', 'min_payout_amount', '75000'),
      appSetting('10000000-0000-4000-8000-000000000003', 'release_pricing_mode', 'per_category'),
      appSetting('10000000-0000-4000-8000-000000000004', 'auth_notice_config', JSON.stringify({
        enabled: true,
        title: 'Synthetic notice',
        badge: '',
        message: 'A generated test message.',
        detail: '',
        buttonText: '',
        revision: '2',
      })),
    ],
    tableCounts: { app_settings: 4 },
  });

  assert.equal(report.reconciliation.app_settings.planned_rows, 4);
  assert.equal(report.reconciliation.app_settings.rejected_rows, 0);
  assert.equal(report.reconciliation.app_settings.blocked_rows, 0);
  assert.equal(report.target_candidates.application_settings?.settings.maintenance_enabled, true);
  assert.equal(report.target_candidates.application_settings?.settings.min_payout_amount, '75000.00');
  assert.equal(report.target_candidates.application_settings?.settings.release_pricing_mode, 'per_category');
  assert.equal(report.target_candidates.application_settings?.settings.auth_notice_config.title, 'Synthetic notice');
});

test('blocks unknown and legacy media settings without emitting a partial settings bundle', () => {
  const secret = 'synthetic-provider-secret';
  const report = plan({
    appSettings: [
      appSetting('20000000-0000-4000-8000-000000000001', 'min_payout_amount', '80000'),
      appSetting('20000000-0000-4000-8000-000000000002', 'xendit_secret_key', secret),
      appSetting('20000000-0000-4000-8000-000000000003', 'dashboard_logo_light', 'https://legacy.example.test/logo.png'),
    ],
  });

  assert.equal(report.target_candidates.application_settings, null);
  assert.equal(report.reconciliation.app_settings.planned_rows, 0);
  assert.equal(report.reconciliation.app_settings.blocked_rows, 3);
  assert.ok(report.issues.some(entry => entry.reason === 'SETTING_NOT_IN_TARGET_ALLOWLIST'));
  assert.ok(report.issues.some(entry => entry.reason === 'LEGACY_MEDIA_REFERENCE_REQUIRES_MEDIA_MIGRATION'));
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('rejects malformed app settings and blocks duplicate keys', () => {
  const invalid = plan({
    appSettings: [appSetting('30000000-0000-4000-8000-000000000001', 'maintenance_enabled', 'yes')],
  });
  assert.equal(invalid.target_candidates.application_settings, null);
  assert.equal(invalid.reconciliation.app_settings.rejected_rows, 1);
  assert.ok(invalid.issues.some(entry => entry.reason === 'INVALID_BOOLEAN_SETTING'));

  const duplicate = plan({
    appSettings: [
      appSetting('30000000-0000-4000-8000-000000000002', 'maintenance_enabled', 'true'),
      appSetting('30000000-0000-4000-8000-000000000003', 'maintenance_enabled', 'false'),
    ],
  });
  assert.equal(duplicate.target_candidates.application_settings, null);
  assert.equal(duplicate.reconciliation.app_settings.blocked_rows, 2);
  assert.ok(duplicate.issues.filter(entry => entry.reason === 'DUPLICATE_SETTING_KEY').length === 2);
});

test('maps unread private notifications with explicit recipient and creator identities', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    notifications: [notification()],
    tableCounts: { notifications: 1 },
  });
  const mapped = report.target_candidates.notifications[0]!;
  const recipient = report.identity_crosswalk.find(row => row.source_auth_user_id === artistId)!.backend_user_id;
  const creator = report.identity_crosswalk.find(row => row.source_auth_user_id === labelId)!.backend_user_id;

  assert.equal(report.reconciliation.notifications.planned_rows, 1);
  assert.equal(report.reconciliation.unmapped_tables.length, 22);
  assert.equal(mapped.recipient_user_id, recipient);
  assert.equal(mapped.created_by, creator);
  assert.equal(mapped.kind, 'USER_NOTIFICATION');
  assert.equal(mapped.body, 'A synthetic release update.');
  assert.deepEqual(mapped.metadata_safe, {});
});

test('blocks global, read-without-timestamp, metadata-bearing, and unresolved notifications', () => {
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    notifications: [
      { ...notification(notificationId), is_global: true },
      { ...notification('cfb49399-51e2-47a5-b208-26395d954933'), is_read: true },
      { ...notification('ed270ec1-8984-4164-9f35-3cc2ffdf946b'), _has_nonempty_metadata: true },
      { ...notification('3ffeb76e-56be-4b92-8f91-8bf7230e72fc'), type: 'legacy-custom' },
      { ...notification('81b1ae14-60e8-4870-98ac-a706ae97caf9'), user_id: labelId, created_by: null },
    ],
  });

  assert.equal(report.target_candidates.notifications.length, 0);
  assert.equal(report.reconciliation.notifications.blocked_rows, 5);
  assert.ok(report.issues.some(entry => entry.reason === 'GLOBAL_ANNOUNCEMENT_AUDIENCE_REVIEW_REQUIRED'));
  assert.ok(report.issues.some(entry => entry.reason === 'READ_TIMESTAMP_EVIDENCE_MISSING'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNREVIEWED_NOTIFICATION_METADATA'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNSUPPORTED_NOTIFICATION_TYPE'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_NOTIFICATION_RECIPIENT'));
});

test('rejects notification credential or unknown payload fields without echoing values', () => {
  const payload = { ...notification(), metadata: { token: 'synthetic-notification-secret' } };
  const report = plan({
    authUsers: [authUser(artistId, 'artist@example.test')],
    notifications: [payload],
  });

  assert.equal(report.reconciliation.notifications.rejected_rows, 1);
  assert.equal(JSON.stringify(report).includes('synthetic-notification-secret'), false);
});

test('maps deletion requests through explicit target identities and preserves validated state', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test')],
    artistDeletionRequests: [artistDeletionRequest()],
    tableCounts: { artist_deletion_requests: 1 },
  });
  const mapped = report.target_candidates.artist_deletion_requests[0]!;
  const artistTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === artistId)!.backend_user_id;
  const labelTargetId = report.identity_crosswalk.find(row => row.source_auth_user_id === labelId)!.backend_user_id;

  assert.equal(report.reconciliation.artist_deletion_requests.planned_rows, 1);
  assert.equal(report.reconciliation.unmapped_tables.length, 22);
  assert.equal(mapped.artist_id, artistTargetId);
  assert.equal(mapped.label_id, labelTargetId);
  assert.equal(mapped.status, 'pending');
  assert.equal(mapped.reason, 'Synthetic account separation request.');
  assert.deepEqual(report.artist_deletion_request_crosswalk, [{
    source_request_id: deletionRequestId,
    target_request_id: mapped.id,
  }]);
});

test('blocks invalid deletion request relationships, reasons, and conflicting pending requests', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test'), authUser(artistId, 'artist@example.test')],
    profiles: [profile(labelId, 'label@example.test'), profile(artistId, 'artist@example.test')],
    artistDeletionRequests: [
      artistDeletionRequest(),
      artistDeletionRequest('4b2d8af9-9f8b-4e31-bd6e-c4518ec4d203'),
      { ...artistDeletionRequest('9718a41e-0b8d-4c72-93f5-35ff4e3a8b7b'), reason: null, status: 'approved' },
      { ...artistDeletionRequest('726e3b53-b6e5-4ce8-92de-83d53e70bac4'), artist_id: labelId, status: 'rejected' },
    ],
  });

  assert.equal(report.target_candidates.artist_deletion_requests.length, 0);
  assert.equal(report.reconciliation.artist_deletion_requests.blocked_rows, 4);
  assert.ok(report.issues.some(entry => entry.reason === 'MULTIPLE_PENDING_REQUESTS_FOR_ARTIST'));
  assert.ok(report.issues.some(entry => entry.reason === 'MISSING_REQUEST_REASON'));
  assert.ok(report.issues.some(entry => entry.reason === 'ARTIST_AND_LABEL_MUST_DIFFER'));
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
  assert.equal(report.reconciliation.tracks.source_rows, 0);
  assert.equal(report.reconciliation.unmapped_tables.find(row => row.table === 'payout_requests')!.source_rows, null);
  assert.equal(report.apply_supported, false);
  assert.throws(() => planSoundpubIdentityDryRun({
    namespace,
    approvedParentLabelIds: [],
    authUsers: [],
    profiles: [],
    userRoles: [],
    artistProfiles: [],
    artists: [],
    artistRosterCrosswalk: [],
    notifications: [],
    artistDeletionRequests: [],
    appSettings: [],
    tableCounts: { unknown_table: 1 },
  }), /Unknown source table count/);
});

test('classifies every remaining table by its safe migration disposition', () => {
  const report = plan({
    tableCounts: {
      archived_royalties: 2,
      rate_limits: 3,
    },
  });
  const tables = report.reconciliation.unmapped_tables;

  assert.equal(tables.length, 22);
  assert.deepEqual(report.reconciliation.unmapped_table_summary, {
    converter_required: 17,
    archive_only: 4,
    rebuild_empty: 1,
  });
  assert.equal(tables.find(row => row.table === 'archived_royalties')!.disposition, 'archive_only');
  assert.equal(tables.find(row => row.table === 'archived_royalties')!.source_rows, 2);
  assert.equal(tables.find(row => row.table === 'rate_limits')!.disposition, 'rebuild_empty');
  assert.equal(tables.find(row => row.table === 'rate_limits')!.source_rows, 3);
  assert.ok(tables.every(row => row.reason_code.length > 0));
});

test('maps audit records with only supported fields and a resolved actor', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    auditLogs: [auditLog()],
    tableCounts: { audit_logs: 1 },
  });
  const mapped = report.target_candidates.audit_logs[0]!;

  assert.equal(report.reconciliation.audit_logs.planned_rows, 1);
  assert.equal(report.reconciliation.audit_logs.rejected_rows, 0);
  assert.equal(report.reconciliation.audit_logs.blocked_rows, 0);
  assert.equal(mapped.actor_user_id, report.identity_crosswalk[0]!.backend_user_id);
  assert.equal(mapped.actor_reference_id, null);
  assert.equal(mapped.action, 'profile.updated');
  assert.equal(mapped.resource_type, 'profile');
  assert.equal(mapped.resource_id, artistId);
  assert.deepEqual(mapped.metadata, {});
  assert.deepEqual(report.audit_log_crosswalk, [{
    source_audit_log_id: auditLogId,
    target_audit_log_id: mapped.id,
  }]);
  assert.equal(report.apply_supported, false);
});

test('blocks audit rows needing sensitive payload review and never echoes omitted values', () => {
  const secret = 'synthetic-audit-payload-must-not-leak';
  const withIp = { ...auditLog(), _has_ip_address: true };
  const unresolvedActor = auditLog('d64dc381-50fc-401e-8e7c-326969536b2d', artistId);
  const unknownField = { ...auditLog('522f9213-3cf8-493a-a989-10e72707f82a'), details: secret };
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    auditLogs: [withIp, unresolvedActor, unknownField],
  });

  assert.equal(report.reconciliation.audit_logs.planned_rows, 0);
  assert.equal(report.reconciliation.audit_logs.blocked_rows, 2);
  assert.equal(report.reconciliation.audit_logs.rejected_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'AUDIT_SOURCE_FIELDS_REQUIRE_REVIEW'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_AUDIT_ACTOR'));
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('maps allowlisted auth events to audit history without treating the subject as actor', () => {
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    authEvents: [authEvent()],
    tableCounts: { auth_events: 1 },
  });
  const mapped = report.target_candidates.audit_logs[0]!;

  assert.equal(report.reconciliation.auth_events.planned_rows, 1);
  assert.equal(report.reconciliation.auth_events.blocked_rows, 0);
  assert.equal(mapped.actor_user_id, null);
  assert.equal(mapped.resource_type, 'auth_user');
  assert.equal(mapped.resource_id, report.identity_crosswalk[0]!.backend_user_id);
  assert.equal(mapped.action, 'auth.email_verified');
  assert.deepEqual(report.auth_event_crosswalk, [{
    source_auth_event_id: authEvent().id,
    target_audit_log_id: mapped.id,
  }]);
});

test('blocks unapproved auth event types and sensitive fields without exposing payloads', () => {
  const secret = 'synthetic-auth-event-email-must-not-leak';
  const report = plan({
    authUsers: [authUser(labelId, 'label@example.test')],
    authEvents: [
      authEvent(),
      { ...authEvent('cc329cbf-f2d7-4e8d-b8c0-5ebc3ce126ac'), event_type: 'unknown_event' },
      { ...authEvent('b455c60a-689b-4aeb-ae64-b02dad270c98'), _has_nonempty_metadata: true },
      { ...authEvent('297a9f43-d8d1-47ec-8ea4-f6ef8d271995'), user_id: artistId },
      { ...authEvent('0717873c-3a8b-47bd-8319-820f1b6c532b'), metadata: { email: secret } },
    ],
  });

  assert.equal(report.reconciliation.auth_events.planned_rows, 1);
  assert.equal(report.reconciliation.auth_events.blocked_rows, 3);
  assert.equal(report.reconciliation.auth_events.rejected_rows, 1);
  assert.ok(report.issues.some(entry => entry.reason === 'UNSUPPORTED_AUTH_EVENT_TYPE'));
  assert.ok(report.issues.some(entry => entry.reason === 'AUTH_EVENT_SENSITIVE_FIELDS_REQUIRE_REVIEW'));
  assert.ok(report.issues.some(entry => entry.reason === 'UNRESOLVED_AUTH_EVENT_USER'));
  assert.equal(JSON.stringify(report).includes(secret), false);
});
