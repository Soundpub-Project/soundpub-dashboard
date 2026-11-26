import { createHash } from 'node:crypto';
import { z } from 'zod';
import { artistSocialLinks } from '../artists/contracts.js';
import { adminDefaults, adminSettings } from '../audit-settings/contracts.js';

const sourceRole = z.enum(['superadmin', 'admin', 'label', 'copyright', 'whitelabel', 'artist', 'user']);
const sourceStatus = z.enum(['active', 'inactive', 'suspended']);
const sourceTimestamp = z.iso.datetime({ offset: true });
const sourceAuthUser = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  email: z.email().max(320).nullable(),
  email_confirmed_at: sourceTimestamp.nullable(),
  created_at: sourceTimestamp,
});
const amount = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
const unmappedProfileField = z.enum([
  'avatar_url', 'city', 'logo_url', 'logo_url_light', 'logo_url_dark', 'province',
  'sso_provider', 'sso_user_id', 'sso_user_type', 'subscription_status',
  'subscription_upgraded_at', 'verification_token', 'verification_token_expires_at',
  'verification_sent_at', 'password_reset_token', 'password_reset_token_expires_at',
  'password_reset_sent_at',
]);
const sourceProfile = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  email: z.email().max(320),
  full_name: z.string().max(200),
  phone: z.string().max(50).nullable(),
  address: z.string().max(2000).nullable(),
  parent_label_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  status: sourceStatus,
  balance: amount,
  label_revenue: amount,
  artist_revenue: amount,
  password_set: z.boolean().nullable(),
  composer_code: z.string().max(100).nullable(),
  artist_profile_completed: z.boolean(),
  email_verified: z.boolean(),
  email_notif_payout: z.boolean(),
  email_notif_release: z.boolean(),
  email_notif_payment: z.boolean(),
  email_notif_announcement: z.boolean(),
  is_managed_artist: z.boolean(),
  auth_user_status: z.enum(['linked', 'managed_only', 'missing_auth', 'invited']),
  created_at: sourceTimestamp,
  updated_at: sourceTimestamp,
  _unmapped_nonempty_fields: z.array(unmappedProfileField),
});
const sourceUserRole = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  user_id: z.uuid().transform(value => value.toLowerCase()),
  role: sourceRole,
  created_at: sourceTimestamp,
});
const sourceArtistProfile = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  user_id: z.uuid().transform(value => value.toLowerCase()),
  artist_name: z.string().trim().min(1).max(200),
  artist_type: z.string().trim().min(1).max(100),
  bio: z.string().max(10000).nullable(),
  genre: z.string().max(100).nullable(),
  social_links: artistSocialLinks.nullable(),
  legal_name: z.string().max(200).nullable(),
  country: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  language: z.string().max(100).nullable(),
  gender: z.string().max(100).nullable(),
  date_of_birth: z.iso.date().nullable(),
  verified: z.boolean().nullable(),
  verified_at: sourceTimestamp.nullable(),
  created_at: sourceTimestamp.nullable(),
  updated_at: sourceTimestamp.nullable(),
  _unmapped_nonempty_fields: z.array(z.enum([
    'profile_image_url', 'spotify_artist_id', 'spotify_artist_url', 'spotify_data', 'spotify_synced_at',
  ])),
});
const sourceArtistRosterRow = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  label_id: z.uuid().transform(value => value.toLowerCase()),
  name: z.string().trim().min(1).max(200),
  created_at: sourceTimestamp.nullable(),
  updated_at: sourceTimestamp.nullable(),
});
const sourceNotification = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  user_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
  is_read: z.boolean(),
  is_global: z.boolean(),
  created_by: z.uuid().transform(value => value.toLowerCase()).nullable(),
  created_at: sourceTimestamp,
  _has_nonempty_metadata: z.boolean(),
});
const sourceArtistDeletionRequest = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  artist_id: z.uuid().transform(value => value.toLowerCase()),
  label_id: z.uuid().transform(value => value.toLowerCase()),
  reason: z.string().max(10000).nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  created_at: sourceTimestamp,
  updated_at: sourceTimestamp,
});
const sourceAppSetting = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  key: z.string().min(1).max(200),
  value: z.string().nullable(),
});
const sourceAuditLog = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  action: z.string().trim().min(1).max(500),
  actor_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  target_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  target_type: z.string().trim().min(1).max(200).nullable(),
  request_id: z.string().max(200).regex(/^[^\x00-\x1f\x7f]*$/).nullable(),
  created_at: sourceTimestamp,
  _has_details: z.boolean(),
  _has_ip_address: z.boolean(),
  _has_actor_role: z.boolean(),
  _has_before_data: z.boolean(),
  _has_after_data: z.boolean(),
  _has_changed_fields: z.boolean(),
  _has_user_agent: z.boolean(),
});
const sourceAuthEvent = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  user_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  event_type: z.string().trim().min(1).max(100),
  created_at: sourceTimestamp,
  _has_ip_address: z.boolean(),
  _has_user_agent: z.boolean(),
  _has_nonempty_metadata: z.boolean(),
});
const authEventActions = new Map([
  ['email_verified', 'auth.email_verified'],
  ['email_verification_sent', 'auth.email_verification_sent'],
  ['password_reset_completed', 'auth.password_reset_completed'],
  ['password_reset_requested', 'auth.password_reset_requested'],
]);
const sourceRelease = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  label_id: z.uuid().transform(value => value.toLowerCase()),
  artist_user_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  created_by: z.uuid().transform(value => value.toLowerCase()).nullable(),
  title: z.string().trim().min(1).max(200),
  artist_name: z.string().trim().min(1).max(200),
  release_type: z.enum(['single', 'ep', 'album', 'compilation']),
  genre: z.string().max(100).nullable(),
  release_date: z.iso.date().nullable(),
  upc: z.string().trim().regex(/^\d{12,13}$/).nullable(),
  cover_url: z.string().max(2048).nullable().optional(),
  _has_cover_media: z.boolean().optional(),
  status: z.enum([
    'draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected',
    'revision_submitted', 'inactive',
  ]),
  _has_rejection_reason: z.boolean().optional(),
  distribution_service: z.enum(['standard', 'custom_label']),
  custom_label_name: z.string().max(200).nullable(),
  custom_record_name: z.string().max(200).nullable(),
  price_per_track_snapshot: amount.nullable().optional(),
  total_payment_snapshot: amount.nullable().optional(),
  _has_price_snapshot: z.boolean().optional(),
  _has_total_payment_snapshot: z.boolean().optional(),
  archived_at: sourceTimestamp.nullable(),
  created_at: sourceTimestamp.nullable(),
  updated_at: sourceTimestamp.nullable(),
});
const sourceTrack = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()),
  release_id: z.uuid().transform(value => value.toLowerCase()),
  artist_user_id: z.uuid().transform(value => value.toLowerCase()).nullable(),
  title: z.string().trim().min(1).max(200),
  artist_name: z.string().trim().min(1).max(200),
  artists: z.array(z.unknown()).nullable().optional(),
  contributors: z.array(z.unknown()).nullable().optional(),
  _has_nonempty_contributors: z.boolean().optional(),
  composer: z.string().max(500).nullable(),
  lyricist: z.string().max(500).nullable(),
  genre: z.string().max(100).nullable(),
  lyrics: z.string().max(50000).nullable().optional(),
  _has_lyrics: z.boolean().optional(),
  explicit_lyrics: z.boolean(),
  isrc: z.string().max(20).nullable(),
  duration: z.number().int().nullable(),
  audio_url: z.string().max(2048).nullable().optional(),
  clip_url: z.string().max(2048).nullable().optional(),
  video_url: z.string().max(2048).nullable().optional(),
  _has_legacy_media: z.boolean().optional(),
  created_at: sourceTimestamp.nullable(),
  updated_at: sourceTimestamp.nullable(),
});
const targetNotificationType = z.enum([
  'info', 'success', 'warning', 'error', 'release', 'announcement', 'payout',
]);
const inputSchema = z.strictObject({
  namespace: z.uuid(),
  approvedParentLabelIds: z.array(z.uuid().transform(value => value.toLowerCase())),
  authUsers: z.array(z.unknown()),
  profiles: z.array(z.unknown()),
  userRoles: z.array(z.unknown()),
  artistProfiles: z.array(z.unknown()),
  artists: z.array(z.unknown()),
  releases: z.array(z.unknown()).default([]),
  tracks: z.array(z.unknown()).default([]),
  trackPositionCrosswalk: z.array(z.strictObject({
    source_track_id: z.uuid().transform(value => value.toLowerCase()),
    position: z.number().int().min(1).max(10000),
  })).default([]),
  notifications: z.array(z.unknown()),
  artistDeletionRequests: z.array(z.unknown()),
  appSettings: z.array(z.unknown()),
  artistRosterCrosswalk: z.array(z.strictObject({
    source_artist_id: z.uuid().transform(value => value.toLowerCase()),
    source_artist_user_id: z.uuid().transform(value => value.toLowerCase()),
  })),
  auditLogs: z.array(z.unknown()).default([]),
  authEvents: z.array(z.unknown()).default([]),
  tableCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const unmappedSoundpubTables = [
  'copyright_registrations', 'copyright_contracts', 'archived_royalties',
  'balance_adjustments', 'composer_royalties', 'copyright_registration_files',
  'copyright_registration_payments', 'copyright_registration_works', 'email_send_log',
  'payout_balance_reservations', 'payout_requests', 'rate_limits',
  'release_payments', 'royalties', 'royalty_uploads', 'storage_backup_log',
  'storage_backup_runs', 'takedown_request_documents', 'takedown_request_items',
  'takedown_request_targets', 'takedown_requests', 'takedown_status_history',
] as const;

type UnmappedTable = typeof unmappedSoundpubTables[number];
type UnmappedTableDisposition = 'converter_required' | 'archive_only' | 'rebuild_empty';

const unmappedTablePolicies = {
  copyright_registrations: { disposition: 'converter_required', reason_code: 'LEGAL_CONSENT_AND_IDENTITY' },
  copyright_contracts: { disposition: 'converter_required', reason_code: 'CONTRACT_STATE_AND_MEDIA_EVIDENCE' },
  archived_royalties: { disposition: 'archive_only', reason_code: 'RESTRICTED_ARCHIVE_NO_REPOST' },
  balance_adjustments: { disposition: 'converter_required', reason_code: 'FINANCE_LEDGER_RECONCILIATION' },
  composer_royalties: { disposition: 'converter_required', reason_code: 'BENEFICIARY_AND_PERIOD_RECONCILIATION' },
  copyright_registration_files: { disposition: 'converter_required', reason_code: 'PRIVATE_MEDIA_VERIFICATION' },
  copyright_registration_payments: { disposition: 'converter_required', reason_code: 'PROVIDER_EVIDENCE_RECONCILIATION' },
  copyright_registration_works: { disposition: 'converter_required', reason_code: 'APPROVED_WORK_ORDER_AND_OWNERSHIP' },
  email_send_log: { disposition: 'archive_only', reason_code: 'NO_HISTORICAL_EMAIL_REPLAY' },
  payout_balance_reservations: { disposition: 'converter_required', reason_code: 'PAYOUT_LIFECYCLE_RECONCILIATION' },
  payout_requests: { disposition: 'converter_required', reason_code: 'PAYOUT_LIFECYCLE_RECONCILIATION' },
  rate_limits: { disposition: 'rebuild_empty', reason_code: 'EPHEMERAL_COUNTERS_RESET' },
  release_payments: { disposition: 'converter_required', reason_code: 'PROVIDER_SNAPSHOT_RECONCILIATION' },
  royalties: { disposition: 'converter_required', reason_code: 'ROYALTY_BASIS_AND_LEDGER_RECONCILIATION' },
  royalty_uploads: { disposition: 'converter_required', reason_code: 'UPLOAD_PROVENANCE_INCOMPLETE' },
  storage_backup_log: { disposition: 'archive_only', reason_code: 'OPERATIONAL_ARCHIVE_ONLY' },
  storage_backup_runs: { disposition: 'archive_only', reason_code: 'OPERATIONAL_ARCHIVE_ONLY' },
  takedown_request_documents: { disposition: 'converter_required', reason_code: 'LEGAL_DOCUMENT_MEDIA_VERIFICATION' },
  takedown_request_items: { disposition: 'converter_required', reason_code: 'RELEASE_TRACK_IDENTITY_CROSSWALK' },
  takedown_request_targets: { disposition: 'converter_required', reason_code: 'TARGET_STATUS_ALLOWLIST' },
  takedown_requests: { disposition: 'converter_required', reason_code: 'LEGAL_CONSENT_EVIDENCE' },
  takedown_status_history: { disposition: 'converter_required', reason_code: 'ACTOR_ATTRIBUTION_AND_STATUS_MAPPING' },
} as const satisfies Record<
  UnmappedTable,
  { disposition: UnmappedTableDisposition; reason_code: string }
>;

type IssueTable = 'auth.users' | 'soundpub.profiles' | 'soundpub.user_roles'
  | 'soundpub.artist_profiles' | 'soundpub.artists' | 'soundpub.notifications'
  | 'soundpub.artist_deletion_requests' | 'soundpub.app_settings'
  | 'soundpub.releases' | 'soundpub.tracks' | 'soundpub.audit_logs'
  | 'soundpub.auth_events';

export interface MappingIssue {
  table: IssueTable;
  row: number;
  reason: string;
  sourceId?: string;
}

interface BackendUserCandidate {
  id: string;
  email: string | null;
  email_verified_at: null;
  status: 'inactive';
  migration_source: {
    source_system: 'supabase';
    source_auth_user_id: string;
    source_email_confirmed_at: string | null;
    requires_reauthentication: true;
    source_profile_status?: z.infer<typeof sourceStatus>;
  };
  created_at: string;
}

interface ProfileCandidate {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  parent_label_id: string | null;
  composer_code: string | null;
  balance: '0.00';
  password_set: false;
  artist_profile_completed: boolean;
  updated_at: string;
}

interface RoleCandidate {
  source_role_id: string;
  source_user_id: string;
  target_user_id: string;
  role: z.infer<typeof sourceRole>;
  source_created_at: string;
  requires_tenant_review: true;
  requires_authorized_verification: true;
}

interface ArtistProfileCandidate {
  id: string;
  user_id: string;
  artist_name: string;
  artist_type: string;
  bio: string | null;
  genre: string | null;
  social_links: z.infer<typeof artistSocialLinks>;
  profile_image_url: null;
  profile_image_media_id: null;
  legal_name: string | null;
  country: string | null;
  city: string | null;
  language: string | null;
  gender: string | null;
  date_of_birth: string | null;
  verified: false;
  verified_at: null;
  created_at: string;
  updated_at: string;
}

interface ArtistRosterCandidate {
  id: string;
  label_id: string;
  artist_user_id: string;
  name: string;
  verified_at: null;
  created_at: string;
  updated_at: string;
}

interface NotificationCandidate {
  id: string;
  recipient_user_id: string;
  kind: 'USER_NOTIFICATION';
  type: z.infer<typeof targetNotificationType>;
  title: string;
  body: string;
  metadata_safe: Record<string, never>;
  created_by: string | null;
  created_at: string;
}

interface AuditLogCandidate {
  id: string;
  actor_user_id: string | null;
  actor_reference_id: null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  request_id: string | null;
  metadata: Record<string, never>;
  created_at: string;
}

interface ArtistDeletionRequestCandidate {
  id: string;
  artist_id: string;
  label_id: string;
  reason: string;
  status: z.infer<typeof sourceArtistDeletionRequest>['status'];
  created_at: string;
  updated_at: string;
}

interface ReleaseCandidate {
  id: string;
  label_id: string;
  artist_user_id: string | null;
  created_by: string | null;
  title: string;
  artist_name: string;
  release_type: z.infer<typeof sourceRelease>['release_type'];
  genre: string | null;
  release_date: string | null;
  upc: string | null;
  cover_url: null;
  status: 'inactive';
  rejection_reason: null;
  distribution_service: 'standard';
  custom_label_name: string | null;
  custom_record_name: string | null;
  archived_at: string | null;
  version: 1;
  created_at: string;
  updated_at: string;
  migration_source: {
    source_release_id: string;
    source_status: z.infer<typeof sourceRelease>['status'];
  };
}

interface TrackCandidate {
  id: string;
  release_id: string;
  artist_user_id: string | null;
  title: string;
  artist_name: string;
  artists: [];
  contributors: [];
  composer: string | null;
  lyricist: string | null;
  genre: string | null;
  lyrics: string | null;
  explicit_lyrics: boolean;
  isrc: string | null;
  duration: number | null;
  audio_url: null;
  clip_url: null;
  video_url: null;
  position: number;
  version: 1;
  created_at: string;
  updated_at: string;
  migration_source: {
    source_track_id: string;
    source_release_id: string;
  };
}

interface TableDisposition {
  source_rows: number;
  planned_rows: number;
  rejected_rows: number;
  blocked_rows: number;
}

type AdminSettings = z.infer<typeof adminSettings>;

function normalizeSettingMoney(value: string | null, allowZero: boolean): string | null | undefined {
  if (value === null) return null;
  const storagePattern = allowZero
    ? /^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/
    : /^[1-9][0-9]{0,15}\.[0-9]{2}$/;
  if (storagePattern.test(value)) return value;
  const inputPattern = allowZero
    ? /^(?:0|[1-9][0-9]{0,15})$/
    : /^[1-9][0-9]{0,15}$/;
  return inputPattern.test(value) ? `${value}.00` : undefined;
}

function applyAppSetting(
  settings: AdminSettings,
  key: string,
  value: string | null,
): { disposition: 'mapped' } | { disposition: 'blocked' | 'rejected'; reason: string } {
  switch (key) {
    case 'dashboard_logo_light':
    case 'dashboard_logo_dark':
    case 'favicon':
      if (value !== null) {
        return { disposition: 'blocked', reason: 'LEGACY_MEDIA_REFERENCE_REQUIRES_MEDIA_MIGRATION' };
      }
      settings[key] = null;
      return { disposition: 'mapped' };
    case 'maintenance_enabled':
      if (value !== 'true' && value !== 'false') {
        return { disposition: 'rejected', reason: 'INVALID_BOOLEAN_SETTING' };
      }
      settings.maintenance_enabled = value === 'true';
      return { disposition: 'mapped' };
    case 'min_payout_amount': {
      const normalized = normalizeSettingMoney(value, true);
      if (normalized === undefined) return { disposition: 'rejected', reason: 'INVALID_MONEY_SETTING' };
      settings.min_payout_amount = normalized;
      return { disposition: 'mapped' };
    }
    case 'release_price_per_track':
    case 'release_price_single':
    case 'release_price_ep':
    case 'release_price_album':
    case 'release_price_custom_label': {
      const normalized = normalizeSettingMoney(value, false);
      if (normalized === undefined) return { disposition: 'rejected', reason: 'INVALID_MONEY_SETTING' };
      settings[key] = normalized;
      return { disposition: 'mapped' };
    }
    case 'release_pricing_mode':
      if (value !== 'per_track' && value !== 'per_category') {
        return { disposition: 'rejected', reason: 'INVALID_PRICING_MODE' };
      }
      settings.release_pricing_mode = value;
      return { disposition: 'mapped' };
    case 'auth_notice_config': {
      if (value === null) return { disposition: 'rejected', reason: 'INVALID_AUTH_NOTICE_SETTING' };
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return { disposition: 'rejected', reason: 'INVALID_AUTH_NOTICE_SETTING' };
      }
      const result = adminSettings.shape.auth_notice_config.safeParse(parsed);
      if (!result.success) return { disposition: 'rejected', reason: 'INVALID_AUTH_NOTICE_SETTING' };
      settings.auth_notice_config = result.data;
      return { disposition: 'mapped' };
    }
    default:
      return { disposition: 'blocked', reason: 'SETTING_NOT_IN_TARGET_ALLOWLIST' };
  }
}

export interface SoundpubDryRunReport {
  version: 1;
  mode: 'dry-run-only';
  namespace: string;
  apply_supported: false;
  target_candidates: {
    backend_users: BackendUserCandidate[];
    profiles: ProfileCandidate[];
    artist_profiles: ArtistProfileCandidate[];
    artists: ArtistRosterCandidate[];
    releases: ReleaseCandidate[];
    tracks: TrackCandidate[];
    notifications: NotificationCandidate[];
    audit_logs: AuditLogCandidate[];
    artist_deletion_requests: ArtistDeletionRequestCandidate[];
    application_settings: { id: true; settings: z.infer<typeof adminSettings>; version: 1 } | null;
    user_settings: Array<{
      user_id: string;
      settings: {
        email_notif_payout: boolean;
        email_notif_release: boolean;
        email_notif_payment: boolean;
        email_notif_announcement: boolean;
      };
    }>;
  };
  identity_crosswalk: Array<{ source_auth_user_id: string; backend_user_id: string }>;
  artist_profile_crosswalk: Array<{ source_artist_profile_id: string; target_artist_profile_id: string }>;
  artist_roster_crosswalk: Array<{ source_artist_id: string; target_artist_id: string }>;
  artist_deletion_request_crosswalk: Array<{ source_request_id: string; target_request_id: string }>;
  audit_log_crosswalk: Array<{ source_audit_log_id: string; target_audit_log_id: string }>;
  auth_event_crosswalk: Array<{ source_auth_event_id: string; target_audit_log_id: string }>;
  release_crosswalk: Array<{ source_release_id: string; target_release_id: string }>;
  track_crosswalk: Array<{ source_track_id: string; target_track_id: string }>;
  role_candidates: RoleCandidate[];
  issues: MappingIssue[];
  reconciliation: {
    auth_users: TableDisposition;
    profiles: TableDisposition;
    user_roles: TableDisposition;
    artist_profiles: TableDisposition;
    artists: TableDisposition;
    releases: TableDisposition;
    tracks: TableDisposition;
    notifications: TableDisposition;
    artist_deletion_requests: TableDisposition;
    app_settings: TableDisposition;
    audit_logs: TableDisposition;
    auth_events: TableDisposition;
    unmapped_tables: Array<{
      table: UnmappedTable;
      source_rows: number | null;
      disposition: UnmappedTableDisposition;
      reason_code: string;
    }>;
    unmapped_table_summary: Record<UnmappedTableDisposition, number>;
  };
}

function stableTargetId(
  namespace: string,
  kind: 'auth-user' | 'artist-profile' | 'artist-roster' | 'notification'
    | 'artist-deletion-request' | 'audit-log' | 'auth-event' | 'release' | 'track',
  sourceId: string,
): string {
  const bytes = createHash('sha256')
    .update(`soundpub:${kind}:v1:${namespace.toLowerCase()}:${sourceId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourceIdFrom(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined;
  const parsed = z.uuid().safeParse(value.id);
  return parsed.success ? parsed.data.toLowerCase() : undefined;
}

function minorUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function issue(
  table: IssueTable,
  row: number,
  reason: string,
  sourceId?: string,
): MappingIssue {
  return sourceId === undefined ? { table, row, reason } : { table, row, reason, sourceId };
}

function uniqueRows<T extends { id: string }>(
  rows: Array<{ row: number; data: T }>,
): Set<number> {
  const counts = new Map<string, number>();
  for (const { data } of rows) counts.set(data.id, (counts.get(data.id) ?? 0) + 1);
  return new Set(rows.filter(({ data }) => counts.get(data.id)! > 1).map(({ row }) => row));
}

export function planSoundpubIdentityDryRun(input: unknown): SoundpubDryRunReport {
  const parsedInput = inputSchema.parse(input);
  const namespace = parsedInput.namespace.toLowerCase();
  const approvedParentLabelIds = new Set(parsedInput.approvedParentLabelIds);
  if (approvedParentLabelIds.size !== parsedInput.approvedParentLabelIds.length) {
    throw new Error('Duplicate parent-label approval');
  }
  const issues: MappingIssue[] = [];
  const authRejected = new Set<number>();
  const profileRejected = new Set<number>();
  const profileBlocked = new Set<number>();
  const roleRejected = new Set<number>();
  const roleBlocked = new Set<number>();
  const artistProfileRejected = new Set<number>();
  const artistProfileBlocked = new Set<number>();
  const artistRosterRejected = new Set<number>();
  const artistRosterBlocked = new Set<number>();
  const notificationRejected = new Set<number>();
  const notificationBlocked = new Set<number>();
  const deletionRequestRejected = new Set<number>();
  const deletionRequestBlocked = new Set<number>();
  const appSettingRejected = new Set<number>();
  const appSettingBlocked = new Set<number>();
  const auditLogRejected = new Set<number>();
  const auditLogBlocked = new Set<number>();
  const authEventRejected = new Set<number>();
  const authEventBlocked = new Set<number>();

  const tableCounts = parsedInput.tableCounts ?? {};
  const canonicalTables = new Set<string>([
    'profiles', 'user_roles', 'artist_profiles', 'artists', 'releases', 'tracks',
    'notifications', 'app_settings', 'audit_logs', 'auth_events',
    'artist_deletion_requests', ...unmappedSoundpubTables,
  ]);
  for (const [table, count] of Object.entries(tableCounts)) {
    if (!canonicalTables.has(table)) throw new Error(`Unknown source table count: ${table}`);
    if (table === 'profiles' && count !== parsedInput.profiles.length) {
      throw new Error('Profile source row count mismatch');
    }
    if (table === 'user_roles' && count !== parsedInput.userRoles.length) {
      throw new Error('User-role source row count mismatch');
    }
    if (table === 'artist_profiles' && count !== parsedInput.artistProfiles.length) {
      throw new Error('Artist-profile source row count mismatch');
    }
    if (table === 'artists' && count !== parsedInput.artists.length) {
      throw new Error('Artist-roster source row count mismatch');
    }
    if (table === 'releases' && count !== parsedInput.releases.length) {
      throw new Error('Release source row count mismatch');
    }
    if (table === 'tracks' && count !== parsedInput.tracks.length) {
      throw new Error('Track source row count mismatch');
    }
    if (table === 'notifications' && count !== parsedInput.notifications.length) {
      throw new Error('Notification source row count mismatch');
    }
    if (table === 'artist_deletion_requests' && count !== parsedInput.artistDeletionRequests.length) {
      throw new Error('Artist-deletion-request source row count mismatch');
    }
    if (table === 'app_settings' && count !== parsedInput.appSettings.length) {
      throw new Error('App-setting source row count mismatch');
    }
    if (table === 'audit_logs' && count !== parsedInput.auditLogs.length) {
      throw new Error('Audit-log source row count mismatch');
    }
    if (table === 'auth_events' && count !== parsedInput.authEvents.length) {
      throw new Error('Auth-event source row count mismatch');
    }
  }

  const parsedAppSettings = parsedInput.appSettings.flatMap((value, index) => {
    const result = sourceAppSetting.safeParse(value);
    if (!result.success) {
      appSettingRejected.add(index + 1);
      issues.push(issue('soundpub.app_settings', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateSettingIds = uniqueRows(parsedAppSettings);
  const settingKeyCounts = new Map<string, number>();
  for (const { data } of parsedAppSettings) {
    settingKeyCounts.set(data.key, (settingKeyCounts.get(data.key) ?? 0) + 1);
  }
  const duplicateSettingKeys = new Set(
    parsedAppSettings.filter(({ data }) => settingKeyCounts.get(data.key)! > 1).map(({ row }) => row),
  );
  const appSettings = { ...adminDefaults };
  const mappedAppSettingRows = new Set<number>();
  for (const { row, data } of parsedAppSettings) {
    if (duplicateSettingIds.has(row) || duplicateSettingKeys.has(row)) {
      appSettingBlocked.add(row);
      issues.push(issue(
        'soundpub.app_settings',
        row,
        duplicateSettingIds.has(row) ? 'DUPLICATE_SETTING_ID' : 'DUPLICATE_SETTING_KEY',
        data.id,
      ));
      continue;
    }
    const result = applyAppSetting(appSettings, data.key, data.value);
    if (result.disposition === 'mapped') {
      mappedAppSettingRows.add(row);
      continue;
    }
    if (result.disposition === 'rejected') appSettingRejected.add(row);
    else appSettingBlocked.add(row);
    issues.push(issue('soundpub.app_settings', row, result.reason, data.id));
  }
  if (appSettingRejected.size > 0 || appSettingBlocked.size > 0) {
    for (const row of mappedAppSettingRows) {
      appSettingBlocked.add(row);
      const sourceId = parsedAppSettings.find(setting => setting.row === row)?.data.id;
      issues.push(issue('soundpub.app_settings', row, 'SETTINGS_BUNDLE_INCOMPLETE', sourceId));
    }
  }
  const applicationSettings = parsedInput.appSettings.length > 0
    && appSettingRejected.size === 0 && appSettingBlocked.size === 0
    ? { id: true as const, settings: adminSettings.parse(appSettings), version: 1 as const }
    : null;

  const parsedAuth = parsedInput.authUsers.flatMap((value, index) => {
    const result = sourceAuthUser.safeParse(value);
    if (!result.success) {
      authRejected.add(index + 1);
      issues.push(issue('auth.users', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateAuthIds = uniqueRows(parsedAuth);
  const emailCounts = new Map<string, number>();
  for (const { data } of parsedAuth) {
    if (data.email !== null) {
      const email = normalizedEmail(data.email);
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }
  const validAuth = new Map<string, (typeof parsedAuth)[number]['data']>();
  const targetIdOwners = new Map<string, string>();
  const targetIdBySourceId = new Map<string, string>();

  for (const { row, data } of parsedAuth) {
    if (duplicateAuthIds.has(row)) {
      authRejected.add(row);
      issues.push(issue('auth.users', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    if (data.email !== null && emailCounts.get(normalizedEmail(data.email))! > 1) {
      authRejected.add(row);
      issues.push(issue('auth.users', row, 'AMBIGUOUS_EMAIL', data.id));
      continue;
    }
    const targetId = stableTargetId(namespace, 'auth-user', data.id);
    const existingOwner = targetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      authRejected.add(row);
      issues.push(issue('auth.users', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    targetIdOwners.set(targetId, data.id);
    targetIdBySourceId.set(data.id, targetId);
    validAuth.set(data.id, data);
  }
  for (const approvedId of approvedParentLabelIds) {
    if (!validAuth.has(approvedId)) throw new Error('Parent-label approval has no resolved source identity');
  }

  const parsedProfiles = parsedInput.profiles.flatMap((value, index) => {
    const result = sourceProfile.safeParse(value);
    if (!result.success) {
      profileRejected.add(index + 1);
      issues.push(issue('soundpub.profiles', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateProfileIds = uniqueRows(parsedProfiles);
  const resolvedProfileIds = new Set(
    parsedProfiles.filter(({ row }) => !duplicateProfileIds.has(row)).map(({ data }) => data.id),
  );
  const acceptedProfiles: Array<{ row: number; data: z.infer<typeof sourceProfile> }> = [];
  const profileStatuses = new Map<string, z.infer<typeof sourceStatus>>();

  for (const { row, data } of parsedProfiles) {
    if (duplicateProfileIds.has(row)) {
      profileRejected.add(row);
      issues.push(issue('soundpub.profiles', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    profileStatuses.set(data.id, data.status);
    const block = (reason: string): void => {
      profileBlocked.add(row);
      issues.push(issue('soundpub.profiles', row, reason, data.id));
    };
    const auth = validAuth.get(data.id);
    if (!auth) {
      block('UNRESOLVED_AUTH_IDENTITY');
      continue;
    }
    if (auth.email === null) {
      block('AUTH_EMAIL_REQUIRED_FOR_REAUTHENTICATION');
    } else if (normalizedEmail(auth.email) !== normalizedEmail(data.email)) {
      block('AUTH_PROFILE_EMAIL_MISMATCH');
    }
    if (data.email_verified !== (auth.email_confirmed_at !== null)) {
      block('EMAIL_VERIFICATION_EVIDENCE_MISMATCH');
    }
    if (data.parent_label_id !== null) {
      if (!validAuth.has(data.parent_label_id)) block('UNRESOLVED_PARENT_IDENTITY');
      if (!resolvedProfileIds.has(data.parent_label_id)) block('UNRESOLVED_PARENT_PROFILE');
      if (validAuth.has(data.parent_label_id) && !approvedParentLabelIds.has(data.parent_label_id)) {
        block('PARENT_LABEL_SCOPE_REVIEW_REQUIRED');
      }
    }
    if (data.parent_label_id === data.id) block('INVALID_SELF_PARENT');
    if (data.is_managed_artist || data.auth_user_status !== 'linked') {
      block('MANAGED_OR_UNLINKED_ACCOUNT_REVIEW_REQUIRED');
    }
    if (data._unmapped_nonempty_fields.length > 0) block('UNMAPPED_PROFILE_FIELDS');
    if ([data.balance, data.label_revenue, data.artist_revenue].some(value => minorUnits(value) !== 0n)) {
      block('LEGACY_FINANCE_RECONCILIATION_REQUIRED');
    }
    if (!profileBlocked.has(row)) acceptedProfiles.push({ row, data });
  }

  const parsedRoles = parsedInput.userRoles.flatMap((value, index) => {
    const result = sourceUserRole.safeParse(value);
    if (!result.success) {
      roleRejected.add(index + 1);
      issues.push(issue('soundpub.user_roles', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateRoleIds = uniqueRows(parsedRoles);
  const rolePairCounts = new Map<string, number>();
  for (const { data } of parsedRoles) {
    const key = `${data.user_id}:${data.role}`;
    rolePairCounts.set(key, (rolePairCounts.get(key) ?? 0) + 1);
  }
  const roleCandidates: RoleCandidate[] = [];
  for (const { row, data } of parsedRoles) {
    if (duplicateRoleIds.has(row)) {
      roleRejected.add(row);
      issues.push(issue('soundpub.user_roles', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    if (rolePairCounts.get(`${data.user_id}:${data.role}`)! > 1) {
      roleRejected.add(row);
      issues.push(issue('soundpub.user_roles', row, 'DUPLICATE_ROLE_ASSIGNMENT', data.id));
      continue;
    }
    const targetId = targetIdBySourceId.get(data.user_id);
    if (!targetId) {
      roleBlocked.add(row);
      issues.push(issue('soundpub.user_roles', row, 'UNRESOLVED_ROLE_USER', data.id));
      continue;
    }
    roleCandidates.push({
      source_role_id: data.id,
      source_user_id: data.user_id,
      target_user_id: targetId,
      role: data.role,
      source_created_at: data.created_at,
      requires_tenant_review: true,
      requires_authorized_verification: true,
    });
  }

  const parsedArtistRoster = parsedInput.artists.flatMap((value, index) => {
    const result = sourceArtistRosterRow.safeParse(value);
    if (!result.success) {
      artistRosterRejected.add(index + 1);
      issues.push(issue('soundpub.artists', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateArtistIds = uniqueRows(parsedArtistRoster);
  const artistRowsBySourceId = new Map(parsedArtistRoster.map(({ data }) => [data.id, data]));
  const rosterMappings = new Map<string, string>();
  const rosterUsers = new Set<string>();
  for (const mapping of parsedInput.artistRosterCrosswalk) {
    if (!artistRowsBySourceId.has(mapping.source_artist_id)) {
      throw new Error('Artist roster crosswalk references an unknown source row');
    }
    if (rosterMappings.has(mapping.source_artist_id) || rosterUsers.has(mapping.source_artist_user_id)) {
      throw new Error('Artist roster crosswalk must be one-to-one');
    }
    rosterMappings.set(mapping.source_artist_id, mapping.source_artist_user_id);
    rosterUsers.add(mapping.source_artist_user_id);
  }
  const acceptedTargetProfiles = new Map(
    acceptedProfiles.map(({ data }) => [data.id, data]),
  );
  const artistRosterCandidates: ArtistRosterCandidate[] = [];
  const artistRosterCrosswalk: SoundpubDryRunReport['artist_roster_crosswalk'] = [];
  const artistTargetIdOwners = new Map<string, string>();
  for (const { row, data } of parsedArtistRoster) {
    if (duplicateArtistIds.has(row)) {
      artistRosterRejected.add(row);
      issues.push(issue('soundpub.artists', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      artistRosterBlocked.add(row);
      issues.push(issue('soundpub.artists', row, reason, data.id));
    };
    const sourceArtistUserId = rosterMappings.get(data.id);
    if (!sourceArtistUserId) {
      block('MISSING_EXPLICIT_ARTIST_IDENTITY_MAPPING');
      continue;
    }
    const artistUser = acceptedTargetProfiles.get(sourceArtistUserId);
    if (!artistUser) {
      block('UNRESOLVED_ARTIST_USER_PROFILE');
      continue;
    }
    if (artistUser.parent_label_id !== data.label_id) {
      block('ARTIST_LABEL_PARENT_MISMATCH');
    }
    if (!roleCandidates.some(candidate =>
      candidate.source_user_id === sourceArtistUserId && candidate.role === 'artist')) {
      block('UNRESOLVED_ARTIST_ROLE');
    }
    const labelTargetId = targetIdBySourceId.get(data.label_id);
    if (!labelTargetId || !acceptedTargetProfiles.has(data.label_id)) {
      block('UNRESOLVED_LABEL_PROFILE');
    }
    if (data.created_at === null || data.updated_at === null) {
      block('MISSING_TARGET_REQUIRED_TIMESTAMP');
    }
    if (artistRosterBlocked.has(row)) continue;

    const targetId = stableTargetId(namespace, 'artist-roster', data.id);
    const existingOwner = artistTargetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      artistRosterRejected.add(row);
      issues.push(issue('soundpub.artists', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    artistTargetIdOwners.set(targetId, data.id);
    artistRosterCandidates.push({
      id: targetId,
      label_id: targetIdBySourceId.get(data.label_id)!,
      artist_user_id: targetIdBySourceId.get(sourceArtistUserId)!,
      name: data.name,
      verified_at: null,
      created_at: data.created_at!,
      updated_at: data.updated_at!,
    });
    artistRosterCrosswalk.push({ source_artist_id: data.id, target_artist_id: targetId });
  }

  const releaseRejected = new Set<number>();
  const releaseBlocked = new Set<number>();
  const trackRejected = new Set<number>();
  const trackBlocked = new Set<number>();
  const parsedReleases = parsedInput.releases.flatMap((value, index) => {
    const result = sourceRelease.safeParse(value);
    if (!result.success) {
      releaseRejected.add(index + 1);
      issues.push(issue('soundpub.releases', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateReleaseIds = uniqueRows(parsedReleases);
  const releaseTargetIdOwners = new Map<string, string>();
  const releaseDrafts = new Map<string, { row: number; candidate: ReleaseCandidate }>();
  for (const { row, data } of parsedReleases) {
    if (duplicateReleaseIds.has(row)) {
      releaseRejected.add(row);
      issues.push(issue('soundpub.releases', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      releaseBlocked.add(row);
      issues.push(issue('soundpub.releases', row, reason, data.id));
    };
    const labelTargetId = targetIdBySourceId.get(data.label_id);
    if (!labelTargetId || !acceptedTargetProfiles.has(data.label_id)) block('UNRESOLVED_RELEASE_LABEL_PROFILE');
    const artistTargetId = data.artist_user_id === null ? null : targetIdBySourceId.get(data.artist_user_id);
    if (data.artist_user_id !== null &&
        (!artistTargetId || !acceptedTargetProfiles.has(data.artist_user_id))) {
      block('UNRESOLVED_RELEASE_ARTIST_PROFILE');
    }
    const creatorTargetId = data.created_by === null ? null : targetIdBySourceId.get(data.created_by);
    if (data.created_by !== null &&
        (!creatorTargetId || !acceptedTargetProfiles.has(data.created_by))) {
      block('UNRESOLVED_RELEASE_CREATOR_PROFILE');
    }
    if (data.cover_url?.trim() || data._has_cover_media) {
      block('LEGACY_RELEASE_MEDIA_REQUIRES_MEDIA_MIGRATION');
    }
    if (data.price_per_track_snapshot != null || data.total_payment_snapshot != null ||
        data._has_price_snapshot || data._has_total_payment_snapshot) {
      block('RELEASE_FINANCE_SNAPSHOT_RECONCILIATION_REQUIRED');
    }
    if (data._has_rejection_reason) block('RELEASE_REJECTION_TEXT_REQUIRES_REVIEW');
    if (data.distribution_service !== 'standard') block('CUSTOM_LABEL_RELEASE_REVIEW_REQUIRED');
    if (data.created_at === null || data.updated_at === null) block('MISSING_TARGET_REQUIRED_TIMESTAMP');
    if (releaseBlocked.has(row)) continue;

    const targetId = stableTargetId(namespace, 'release', data.id);
    const collision = releaseTargetIdOwners.get(targetId);
    if (collision !== undefined && collision !== data.id) {
      releaseRejected.add(row);
      issues.push(issue('soundpub.releases', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    releaseTargetIdOwners.set(targetId, data.id);
    releaseDrafts.set(data.id, {
      row,
      candidate: {
        id: targetId,
        label_id: labelTargetId!,
        artist_user_id: artistTargetId ?? null,
        created_by: creatorTargetId ?? null,
        title: data.title,
        artist_name: data.artist_name,
        release_type: data.release_type,
        genre: data.genre,
        release_date: data.release_date,
        upc: data.upc,
        cover_url: null,
        status: 'inactive',
        rejection_reason: null,
        distribution_service: 'standard',
        custom_label_name: data.custom_label_name,
        custom_record_name: data.custom_record_name,
        archived_at: data.archived_at,
        version: 1,
        created_at: data.created_at!,
        updated_at: data.updated_at!,
        migration_source: { source_release_id: data.id, source_status: data.status },
      },
    });
  }

  const sourceTrackIds = new Set(parsedInput.tracks.map(value => sourceIdFrom(value)).filter(
    (value): value is string => value !== undefined,
  ));
  const trackPositions = new Map<string, number>();
  for (const mapping of parsedInput.trackPositionCrosswalk) {
    if (!sourceTrackIds.has(mapping.source_track_id)) {
      throw new Error('Track position crosswalk references an unknown source row');
    }
    if (trackPositions.has(mapping.source_track_id)) {
      throw new Error('Track position crosswalk must be one-to-one');
    }
    trackPositions.set(mapping.source_track_id, mapping.position);
  }
  const invalidTrackReleaseIds = new Set<string>();
  const parsedTracks = parsedInput.tracks.flatMap((value, index) => {
    const result = sourceTrack.safeParse(value);
    if (!result.success) {
      trackRejected.add(index + 1);
      issues.push(issue('soundpub.tracks', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      if (typeof value === 'object' && value !== null && 'release_id' in value) {
        const releaseId = z.uuid().safeParse(value.release_id);
        if (releaseId.success) invalidTrackReleaseIds.add(releaseId.data.toLowerCase());
      }
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateTrackIds = uniqueRows(parsedTracks);
  const tracksByRelease = new Map<string, Array<(typeof parsedTracks)[number]>>();
  for (const track of parsedTracks) {
    const current = tracksByRelease.get(track.data.release_id) ?? [];
    current.push(track);
    tracksByRelease.set(track.data.release_id, current);
  }
  const plannedTracks = new Map<string, TrackCandidate>();
  const trackTargetIdOwners = new Map<string, string>();
  for (const [sourceReleaseId, group] of tracksByRelease) {
    const releaseDraft = releaseDrafts.get(sourceReleaseId);
    const blockGroup = (reason: string): void => {
      for (const { row, data } of group) {
        if (trackRejected.has(row)) continue;
        trackBlocked.add(row);
        issues.push(issue('soundpub.tracks', row, reason, data.id));
      }
    };
    if (!releaseDraft || invalidTrackReleaseIds.has(sourceReleaseId)) {
      blockGroup(releaseDraft ? 'RELEASE_TRACK_SET_INCOMPLETE' : 'UNRESOLVED_SOURCE_RELEASE');
      continue;
    }
    const groupPositions = group.map(({ data }) => trackPositions.get(data.id));
    const orderedPositions = groupPositions.filter((position): position is number => position !== undefined)
      .sort((left, right) => left - right);
    if (groupPositions.some(position => position === undefined) ||
        new Set(groupPositions).size !== group.length ||
        orderedPositions.some((position, index) => position !== index + 1)) {
      blockGroup('EXPLICIT_CONTIGUOUS_TRACK_ORDER_REQUIRED');
      continue;
    }

    const draftGroup: TrackCandidate[] = [];
    let groupRejected = false;
    for (const { row, data } of group) {
      if (duplicateTrackIds.has(row)) {
        trackRejected.add(row);
        issues.push(issue('soundpub.tracks', row, 'DUPLICATE_SOURCE_ID', data.id));
        groupRejected = true;
        continue;
      }
      let blocked = false;
      const block = (reason: string): void => {
        trackBlocked.add(row);
        issues.push(issue('soundpub.tracks', row, reason, data.id));
        blocked = true;
      };
      if (data.artist_user_id !== null &&
          (!targetIdBySourceId.has(data.artist_user_id) || !acceptedTargetProfiles.has(data.artist_user_id))) {
        block('UNRESOLVED_TRACK_ARTIST_PROFILE');
      }
      if ((data.artists?.length ?? 0) > 0 || (data.contributors?.length ?? 0) > 0 ||
          data._has_nonempty_contributors) {
        block('TRACK_CONTRIBUTOR_MAPPING_REQUIRES_REVIEW');
      }
      if ([data.audio_url, data.clip_url, data.video_url].some(value => value?.trim())) {
        block('LEGACY_TRACK_MEDIA_REQUIRES_MEDIA_MIGRATION');
      }
      if (data._has_legacy_media) block('LEGACY_TRACK_MEDIA_REQUIRES_MEDIA_MIGRATION');
      if (data._has_lyrics) block('TRACK_LYRICS_REQUIRE_EXPLICIT_MIGRATION_APPROVAL');
      if (data.created_at === null || data.updated_at === null) block('MISSING_TARGET_REQUIRED_TIMESTAMP');
      if (data.duration !== null && (data.duration < 1 || data.duration > 86400)) {
        trackRejected.add(row);
        issues.push(issue('soundpub.tracks', row, 'INVALID_TRACK_DURATION', data.id));
        groupRejected = true;
        continue;
      }
      const normalizedIsrc = data.isrc?.trim().replaceAll('-', '').toUpperCase() ?? null;
      if (normalizedIsrc !== null && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(normalizedIsrc)) {
        trackRejected.add(row);
        issues.push(issue('soundpub.tracks', row, 'INVALID_TRACK_ISRC', data.id));
        groupRejected = true;
        continue;
      }
      if (blocked) continue;

      const targetId = stableTargetId(namespace, 'track', data.id);
      const collision = trackTargetIdOwners.get(targetId);
      if (collision !== undefined && collision !== data.id) {
        trackRejected.add(row);
        issues.push(issue('soundpub.tracks', row, 'TARGET_ID_COLLISION', data.id));
        groupRejected = true;
        continue;
      }
      trackTargetIdOwners.set(targetId, data.id);
      draftGroup.push({
        id: targetId,
        release_id: releaseDraft.candidate.id,
        artist_user_id: data.artist_user_id === null ? null : targetIdBySourceId.get(data.artist_user_id)!,
        title: data.title,
        artist_name: data.artist_name,
        artists: [],
        contributors: [],
        composer: data.composer,
        lyricist: data.lyricist,
        genre: data.genre,
        lyrics: data.lyrics ?? null,
        explicit_lyrics: data.explicit_lyrics,
        isrc: normalizedIsrc,
        duration: data.duration,
        audio_url: null,
        clip_url: null,
        video_url: null,
        position: trackPositions.get(data.id)!,
        version: 1,
        created_at: data.created_at!,
        updated_at: data.updated_at!,
        migration_source: { source_track_id: data.id, source_release_id: data.release_id },
      });
    }
    if (groupRejected || draftGroup.length !== group.length) {
      blockGroup('RELEASE_TRACK_SET_INCOMPLETE');
      continue;
    }
    for (const candidate of draftGroup) {
      plannedTracks.set(candidate.migration_source.source_track_id, candidate);
    }
  }
  for (const { row, data } of parsedReleases) {
    if (duplicateReleaseIds.has(row) || releaseRejected.has(row) || releaseBlocked.has(row)) continue;
    const group = tracksByRelease.get(data.id) ?? [];
    if (invalidTrackReleaseIds.has(data.id) || group.some(({ row: trackRow }) =>
      trackBlocked.has(trackRow) || trackRejected.has(trackRow)) ||
      group.some(({ data: track }) => !plannedTracks.has(track.id))) {
      releaseBlocked.add(row);
      issues.push(issue('soundpub.releases', row, 'RELEASE_TRACK_SET_INCOMPLETE', data.id));
      releaseDrafts.delete(data.id);
    }
  }
  for (const [sourceReleaseId, group] of tracksByRelease) {
    if (!releaseDrafts.has(sourceReleaseId)) {
      for (const { row, data } of group) {
        if (trackRejected.has(row) || trackBlocked.has(row)) continue;
        trackBlocked.add(row);
        issues.push(issue('soundpub.tracks', row, 'UNRESOLVED_TARGET_RELEASE', data.id));
      }
    }
  }
  const releaseCandidates = [...releaseDrafts.values()].map(({ candidate }) => candidate);
  const releaseCrosswalk = releaseCandidates.map(candidate => ({
    source_release_id: candidate.migration_source.source_release_id,
    target_release_id: candidate.id,
  }));
  const trackCandidates = [...plannedTracks.values()].filter(candidate =>
    releaseDrafts.has(candidate.migration_source.source_release_id));
  const trackCrosswalk = trackCandidates.map(candidate => ({
    source_track_id: candidate.migration_source.source_track_id,
    target_track_id: candidate.id,
  }));

  const parsedNotifications = parsedInput.notifications.flatMap((value, index) => {
    const result = sourceNotification.safeParse(value);
    if (!result.success) {
      notificationRejected.add(index + 1);
      issues.push(issue('soundpub.notifications', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateNotificationIds = uniqueRows(parsedNotifications);
  const notificationCandidates: NotificationCandidate[] = [];
  const notificationTargetIdOwners = new Map<string, string>();
  for (const { row, data } of parsedNotifications) {
    if (duplicateNotificationIds.has(row)) {
      notificationRejected.add(row);
      issues.push(issue('soundpub.notifications', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      notificationBlocked.add(row);
      issues.push(issue('soundpub.notifications', row, reason, data.id));
    };
    if (data.is_global) block('GLOBAL_ANNOUNCEMENT_AUDIENCE_REVIEW_REQUIRED');
    if (data.user_id === null) block('MISSING_NOTIFICATION_RECIPIENT');
    if (data.user_id !== null && !targetIdBySourceId.has(data.user_id)) {
      block('UNRESOLVED_NOTIFICATION_RECIPIENT');
    }
    if (data.is_read) block('READ_TIMESTAMP_EVIDENCE_MISSING');
    if (data._has_nonempty_metadata) block('UNREVIEWED_NOTIFICATION_METADATA');
    const type = targetNotificationType.safeParse(data.type);
    if (!type.success) block('UNSUPPORTED_NOTIFICATION_TYPE');
    let createdBy: string | null = null;
    if (data.created_by !== null) {
      createdBy = targetIdBySourceId.get(data.created_by) ?? null;
      if (createdBy === null) block('UNRESOLVED_NOTIFICATION_CREATOR');
    }
    if (notificationBlocked.has(row) || !type.success || data.user_id === null) continue;

    const targetId = stableTargetId(namespace, 'notification', data.id);
    const existingOwner = notificationTargetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      notificationRejected.add(row);
      issues.push(issue('soundpub.notifications', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    notificationTargetIdOwners.set(targetId, data.id);
    notificationCandidates.push({
      id: targetId,
      recipient_user_id: targetIdBySourceId.get(data.user_id)!,
      kind: 'USER_NOTIFICATION',
      type: type.data,
      title: data.title,
      body: data.message,
      metadata_safe: {},
      created_by: createdBy,
      created_at: data.created_at,
    });
  }

  const parsedDeletionRequests = parsedInput.artistDeletionRequests.flatMap((value, index) => {
    const result = sourceArtistDeletionRequest.safeParse(value);
    if (!result.success) {
      deletionRequestRejected.add(index + 1);
      issues.push(issue(
        'soundpub.artist_deletion_requests',
        index + 1,
        'INVALID_OR_FORBIDDEN_FIELDS',
        sourceIdFrom(value),
      ));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateDeletionRequestIds = uniqueRows(parsedDeletionRequests);
  const pendingRequestCounts = new Map<string, number>();
  for (const { data } of parsedDeletionRequests) {
    if (data.status === 'pending') {
      pendingRequestCounts.set(data.artist_id, (pendingRequestCounts.get(data.artist_id) ?? 0) + 1);
    }
  }
  const deletionRequestCandidates: ArtistDeletionRequestCandidate[] = [];
  const deletionRequestCrosswalk: SoundpubDryRunReport['artist_deletion_request_crosswalk'] = [];
  const deletionRequestTargetIdOwners = new Map<string, string>();
  for (const { row, data } of parsedDeletionRequests) {
    if (duplicateDeletionRequestIds.has(row)) {
      deletionRequestRejected.add(row);
      issues.push(issue('soundpub.artist_deletion_requests', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      deletionRequestBlocked.add(row);
      issues.push(issue('soundpub.artist_deletion_requests', row, reason, data.id));
    };
    if (data.artist_id === data.label_id) block('ARTIST_AND_LABEL_MUST_DIFFER');
    if (!targetIdBySourceId.has(data.artist_id) || !acceptedTargetProfiles.has(data.artist_id)) {
      block('UNRESOLVED_ARTIST_PROFILE');
    }
    if (!targetIdBySourceId.has(data.label_id) || !acceptedTargetProfiles.has(data.label_id)) {
      block('UNRESOLVED_LABEL_PROFILE');
    }
    if (data.reason === null || data.reason.trim().length === 0) {
      block('MISSING_REQUEST_REASON');
    } else if (data.reason.length > 2000) {
      block('REQUEST_REASON_EXCEEDS_TARGET_LIMIT');
    }
    if (data.status === 'pending' && pendingRequestCounts.get(data.artist_id)! > 1) {
      block('MULTIPLE_PENDING_REQUESTS_FOR_ARTIST');
    }
    if (deletionRequestBlocked.has(row)) continue;

    const targetId = stableTargetId(namespace, 'artist-deletion-request', data.id);
    const existingOwner = deletionRequestTargetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      deletionRequestRejected.add(row);
      issues.push(issue('soundpub.artist_deletion_requests', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    deletionRequestTargetIdOwners.set(targetId, data.id);
    deletionRequestCandidates.push({
      id: targetId,
      artist_id: targetIdBySourceId.get(data.artist_id)!,
      label_id: targetIdBySourceId.get(data.label_id)!,
      reason: data.reason!,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
    deletionRequestCrosswalk.push({ source_request_id: data.id, target_request_id: targetId });
  }

  const backendUsers: BackendUserCandidate[] = [];
  const identityCrosswalk: SoundpubDryRunReport['identity_crosswalk'] = [];
  for (const [sourceId, auth] of validAuth) {
    const targetId = targetIdBySourceId.get(sourceId)!;
    const sourceProfileStatus = profileStatuses.get(sourceId);
    const migrationSource: BackendUserCandidate['migration_source'] = {
      source_system: 'supabase',
      source_auth_user_id: sourceId,
      source_email_confirmed_at: auth.email_confirmed_at,
      requires_reauthentication: true,
      ...(sourceProfileStatus === undefined ? {} : { source_profile_status: sourceProfileStatus }),
    };
    backendUsers.push({
      id: targetId,
      email: auth.email,
      email_verified_at: null,
      status: 'inactive',
      migration_source: migrationSource,
      created_at: auth.created_at,
    });
    identityCrosswalk.push({ source_auth_user_id: sourceId, backend_user_id: targetId });
  }

  const parsedAuditLogs = parsedInput.auditLogs.flatMap((value, index) => {
    const result = sourceAuditLog.safeParse(value);
    if (!result.success) {
      auditLogRejected.add(index + 1);
      issues.push(issue('soundpub.audit_logs', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateAuditLogIds = uniqueRows(parsedAuditLogs);
  const auditLogCandidates: AuditLogCandidate[] = [];
  const auditLogCrosswalk: SoundpubDryRunReport['audit_log_crosswalk'] = [];
  const auditLogTargetIdOwners = new Map<string, string>();
  for (const { row, data } of parsedAuditLogs) {
    if (duplicateAuditLogIds.has(row)) {
      auditLogRejected.add(row);
      issues.push(issue('soundpub.audit_logs', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      auditLogBlocked.add(row);
      issues.push(issue('soundpub.audit_logs', row, reason, data.id));
    };
    if (data.actor_id !== null && !targetIdBySourceId.has(data.actor_id)) {
      block('UNRESOLVED_AUDIT_ACTOR');
    }
    if (data.target_type === null) block('MISSING_AUDIT_RESOURCE_TYPE');
    if (data._has_details || data._has_ip_address || data._has_actor_role ||
        data._has_before_data || data._has_after_data || data._has_changed_fields ||
        data._has_user_agent) {
      block('AUDIT_SOURCE_FIELDS_REQUIRE_REVIEW');
    }
    if (auditLogBlocked.has(row)) continue;

    const targetId = stableTargetId(namespace, 'audit-log', data.id);
    const existingOwner = auditLogTargetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      auditLogRejected.add(row);
      issues.push(issue('soundpub.audit_logs', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    auditLogTargetIdOwners.set(targetId, data.id);
    auditLogCandidates.push({
      id: targetId,
      actor_user_id: data.actor_id === null ? null : targetIdBySourceId.get(data.actor_id)!,
      actor_reference_id: null,
      action: data.action,
      resource_type: data.target_type!,
      resource_id: data.target_id,
      request_id: data.request_id,
      metadata: {},
      created_at: data.created_at,
    });
    auditLogCrosswalk.push({ source_audit_log_id: data.id, target_audit_log_id: targetId });
  }

  const parsedAuthEvents = parsedInput.authEvents.flatMap((value, index) => {
    const result = sourceAuthEvent.safeParse(value);
    if (!result.success) {
      authEventRejected.add(index + 1);
      issues.push(issue('soundpub.auth_events', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateAuthEventIds = uniqueRows(parsedAuthEvents);
  const authEventCandidates: AuditLogCandidate[] = [];
  const authEventCrosswalk: SoundpubDryRunReport['auth_event_crosswalk'] = [];
  const authEventTargetIdOwners = new Map<string, string>();
  for (const { row, data } of parsedAuthEvents) {
    if (duplicateAuthEventIds.has(row)) {
      authEventRejected.add(row);
      issues.push(issue('soundpub.auth_events', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      authEventBlocked.add(row);
      issues.push(issue('soundpub.auth_events', row, reason, data.id));
    };
    const action = authEventActions.get(data.event_type);
    const targetUserId = data.user_id === null ? undefined : targetIdBySourceId.get(data.user_id);
    if (action === undefined) block('UNSUPPORTED_AUTH_EVENT_TYPE');
    if (data.user_id === null) {
      block('MISSING_AUTH_EVENT_USER');
    } else if (targetUserId === undefined) {
      block('UNRESOLVED_AUTH_EVENT_USER');
    }
    if (data._has_ip_address || data._has_user_agent || data._has_nonempty_metadata) {
      block('AUTH_EVENT_SENSITIVE_FIELDS_REQUIRE_REVIEW');
    }
    if (authEventBlocked.has(row) || action === undefined || targetUserId === undefined) continue;

    const targetId = stableTargetId(namespace, 'auth-event', data.id);
    const existingOwner = authEventTargetIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      authEventRejected.add(row);
      issues.push(issue('soundpub.auth_events', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    authEventTargetIdOwners.set(targetId, data.id);
    authEventCandidates.push({
      id: targetId,
      actor_user_id: null,
      actor_reference_id: null,
      action,
      resource_type: 'auth_user',
      resource_id: targetUserId,
      request_id: null,
      metadata: {},
      created_at: data.created_at,
    });
    authEventCrosswalk.push({ source_auth_event_id: data.id, target_audit_log_id: targetId });
  }

  const profileCandidates: ProfileCandidate[] = acceptedProfiles.map(({ data }) => ({
    id: targetIdBySourceId.get(data.id)!,
    full_name: data.full_name,
    phone: data.phone,
    address: data.address,
    parent_label_id: data.parent_label_id === null ? null : targetIdBySourceId.get(data.parent_label_id)!,
    composer_code: data.composer_code,
    balance: '0.00',
    password_set: false,
    artist_profile_completed: data.artist_profile_completed,
    updated_at: data.updated_at,
  }));
  const userSettings = acceptedProfiles.map(({ data }) => ({
    user_id: targetIdBySourceId.get(data.id)!,
    settings: {
      email_notif_payout: data.email_notif_payout,
      email_notif_release: data.email_notif_release,
      email_notif_payment: data.email_notif_payment,
      email_notif_announcement: data.email_notif_announcement,
    },
  }));
  const acceptedProfileIds = new Set(acceptedProfiles.map(({ data }) => data.id));

  const parsedArtistProfiles = parsedInput.artistProfiles.flatMap((value, index) => {
    const result = sourceArtistProfile.safeParse(value);
    if (!result.success) {
      artistProfileRejected.add(index + 1);
      issues.push(issue('soundpub.artist_profiles', index + 1, 'INVALID_OR_FORBIDDEN_FIELDS', sourceIdFrom(value)));
      return [];
    }
    return [{ row: index + 1, data: result.data }];
  });
  const duplicateArtistProfileIds = uniqueRows(parsedArtistProfiles);
  const artistProfileUserCounts = new Map<string, number>();
  for (const { data } of parsedArtistProfiles) {
    artistProfileUserCounts.set(data.user_id, (artistProfileUserCounts.get(data.user_id) ?? 0) + 1);
  }
  const acceptedArtistProfiles: Array<{ row: number; data: z.infer<typeof sourceArtistProfile> }> = [];
  for (const { row, data } of parsedArtistProfiles) {
    if (duplicateArtistProfileIds.has(row)) {
      artistProfileRejected.add(row);
      issues.push(issue('soundpub.artist_profiles', row, 'DUPLICATE_SOURCE_ID', data.id));
      continue;
    }
    const block = (reason: string): void => {
      artistProfileBlocked.add(row);
      issues.push(issue('soundpub.artist_profiles', row, reason, data.id));
    };
    if (artistProfileUserCounts.get(data.user_id)! > 1) {
      artistProfileRejected.add(row);
      issues.push(issue('soundpub.artist_profiles', row, 'DUPLICATE_ARTIST_PROFILE_USER', data.id));
      continue;
    }
    if (!targetIdBySourceId.has(data.user_id)) block('UNRESOLVED_USER_IDENTITY');
    if (!acceptedProfileIds.has(data.user_id)) {
      block('UNRESOLVED_TARGET_PROFILE');
    }
    if (data._unmapped_nonempty_fields.length > 0) block('UNMAPPED_ARTIST_PROFILE_FIELDS');
    if (data.verified !== false || data.verified_at !== null) {
      block('LEGACY_ARTIST_VERIFICATION_REVIEW_REQUIRED');
    }
    if (data.created_at === null || data.updated_at === null) {
      block('MISSING_TARGET_REQUIRED_TIMESTAMP');
    }
    if (!artistProfileBlocked.has(row)) acceptedArtistProfiles.push({ row, data });
  }

  const artistProfileCrosswalk: SoundpubDryRunReport['artist_profile_crosswalk'] = [];
  const artistProfileIdOwners = new Map<string, string>();
  const artistProfileTargetIds = new Map<string, string>();
  for (const { row, data } of acceptedArtistProfiles) {
    const targetId = stableTargetId(namespace, 'artist-profile', data.id);
    const existingOwner = artistProfileIdOwners.get(targetId);
    if (existingOwner !== undefined && existingOwner !== data.id) {
      artistProfileRejected.add(row);
      issues.push(issue('soundpub.artist_profiles', row, 'TARGET_ID_COLLISION', data.id));
      continue;
    }
    artistProfileIdOwners.set(targetId, data.id);
    artistProfileTargetIds.set(data.id, targetId);
    artistProfileCrosswalk.push({
      source_artist_profile_id: data.id,
      target_artist_profile_id: targetId,
    });
  }
  const artistProfileCandidates: ArtistProfileCandidate[] = acceptedArtistProfiles
    .filter(({ data }) => artistProfileTargetIds.has(data.id))
    .map(({ data }) => ({
      id: artistProfileTargetIds.get(data.id)!,
      user_id: targetIdBySourceId.get(data.user_id)!,
      artist_name: data.artist_name,
      artist_type: data.artist_type,
      bio: data.bio,
      genre: data.genre,
      social_links: data.social_links ?? {},
      profile_image_url: null,
      profile_image_media_id: null,
      legal_name: data.legal_name,
      country: data.country,
      city: data.city,
      language: data.language,
      gender: data.gender,
      date_of_birth: data.date_of_birth,
      verified: false,
      verified_at: null,
      created_at: data.created_at!,
      updated_at: data.updated_at!,
    }));

  const unmappedTables = unmappedSoundpubTables.map(table => ({
    table,
    source_rows: tableCounts[table] ?? null,
    ...unmappedTablePolicies[table],
  }));
  const unmappedTableSummary: Record<UnmappedTableDisposition, number> = {
    converter_required: 0,
    archive_only: 0,
    rebuild_empty: 0,
  };
  for (const table of unmappedTables) {
    unmappedTableSummary[table.disposition] += 1;
  }
  return {
    version: 1,
    mode: 'dry-run-only',
    namespace,
    apply_supported: false,
    target_candidates: {
      backend_users: backendUsers,
      profiles: profileCandidates,
      artist_profiles: artistProfileCandidates,
      artists: artistRosterCandidates,
      releases: releaseCandidates,
      tracks: trackCandidates,
      notifications: notificationCandidates,
      audit_logs: [...auditLogCandidates, ...authEventCandidates],
      artist_deletion_requests: deletionRequestCandidates,
      application_settings: applicationSettings,
      user_settings: userSettings,
    },
    identity_crosswalk: identityCrosswalk,
    artist_profile_crosswalk: artistProfileCrosswalk,
    artist_roster_crosswalk: artistRosterCrosswalk,
    artist_deletion_request_crosswalk: deletionRequestCrosswalk,
    audit_log_crosswalk: auditLogCrosswalk,
    auth_event_crosswalk: authEventCrosswalk,
    release_crosswalk: releaseCrosswalk,
    track_crosswalk: trackCrosswalk,
    role_candidates: roleCandidates,
    issues,
    reconciliation: {
      auth_users: {
        source_rows: parsedInput.authUsers.length,
        planned_rows: backendUsers.length,
        rejected_rows: authRejected.size,
        blocked_rows: 0,
      },
      profiles: {
        source_rows: parsedInput.profiles.length,
        planned_rows: profileCandidates.length,
        rejected_rows: profileRejected.size,
        blocked_rows: profileBlocked.size,
      },
      user_roles: {
        source_rows: parsedInput.userRoles.length,
        planned_rows: roleCandidates.length,
        rejected_rows: roleRejected.size,
        blocked_rows: roleBlocked.size,
      },
      artist_profiles: {
        source_rows: parsedInput.artistProfiles.length,
        planned_rows: artistProfileCandidates.length,
        rejected_rows: artistProfileRejected.size,
        blocked_rows: artistProfileBlocked.size,
      },
      artists: {
        source_rows: parsedInput.artists.length,
        planned_rows: artistRosterCandidates.length,
        rejected_rows: artistRosterRejected.size,
        blocked_rows: artistRosterBlocked.size,
      },
      releases: {
        source_rows: parsedInput.releases.length,
        planned_rows: releaseCandidates.length,
        rejected_rows: releaseRejected.size,
        blocked_rows: releaseBlocked.size,
      },
      tracks: {
        source_rows: parsedInput.tracks.length,
        planned_rows: trackCandidates.length,
        rejected_rows: trackRejected.size,
        blocked_rows: trackBlocked.size,
      },
      notifications: {
        source_rows: parsedInput.notifications.length,
        planned_rows: notificationCandidates.length,
        rejected_rows: notificationRejected.size,
        blocked_rows: notificationBlocked.size,
      },
      artist_deletion_requests: {
        source_rows: parsedInput.artistDeletionRequests.length,
        planned_rows: deletionRequestCandidates.length,
        rejected_rows: deletionRequestRejected.size,
        blocked_rows: deletionRequestBlocked.size,
      },
      app_settings: {
        source_rows: parsedInput.appSettings.length,
        planned_rows: applicationSettings === null ? 0 : mappedAppSettingRows.size,
        rejected_rows: appSettingRejected.size,
        blocked_rows: appSettingBlocked.size,
      },
      audit_logs: {
        source_rows: parsedInput.auditLogs.length,
        planned_rows: auditLogCandidates.length,
        rejected_rows: auditLogRejected.size,
        blocked_rows: auditLogBlocked.size,
      },
      auth_events: {
        source_rows: parsedInput.authEvents.length,
        planned_rows: authEventCandidates.length,
        rejected_rows: authEventRejected.size,
        blocked_rows: authEventBlocked.size,
      },
      unmapped_tables: unmappedTables,
      unmapped_table_summary: unmappedTableSummary,
    },
  };
}
