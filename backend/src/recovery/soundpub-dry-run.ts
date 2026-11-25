import { createHash } from 'node:crypto';
import { z } from 'zod';
import { artistSocialLinks } from '../artists/contracts.js';

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
  'subscription_upgraded_at',
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
const inputSchema = z.strictObject({
  namespace: z.uuid(),
  approvedParentLabelIds: z.array(z.uuid().transform(value => value.toLowerCase())),
  authUsers: z.array(z.unknown()),
  profiles: z.array(z.unknown()),
  userRoles: z.array(z.unknown()),
  artistProfiles: z.array(z.unknown()),
  tableCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const unmappedSoundpubTables = [
  'copyright_registrations', 'copyright_contracts', 'app_settings', 'archived_royalties',
  'artist_deletion_requests', 'artists', 'audit_logs', 'auth_events',
  'balance_adjustments', 'composer_royalties', 'copyright_registration_files',
  'copyright_registration_payments', 'copyright_registration_works', 'email_send_log',
  'notifications', 'payout_balance_reservations', 'payout_requests', 'rate_limits',
  'release_payments', 'releases', 'royalties', 'royalty_uploads', 'storage_backup_log',
  'storage_backup_runs', 'takedown_request_documents', 'takedown_request_items',
  'takedown_request_targets', 'takedown_requests', 'takedown_status_history', 'tracks',
] as const;

type UnmappedTable = typeof unmappedSoundpubTables[number];
type IssueTable = 'auth.users' | 'soundpub.profiles' | 'soundpub.user_roles' | 'soundpub.artist_profiles';

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

interface TableDisposition {
  source_rows: number;
  planned_rows: number;
  rejected_rows: number;
  blocked_rows: number;
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
  role_candidates: RoleCandidate[];
  issues: MappingIssue[];
  reconciliation: {
    auth_users: TableDisposition;
    profiles: TableDisposition;
    user_roles: TableDisposition;
    artist_profiles: TableDisposition;
    unmapped_tables: Array<{ table: UnmappedTable; source_rows: number | null }>;
  };
}

function stableTargetId(namespace: string, kind: 'auth-user' | 'artist-profile', sourceId: string): string {
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

  const tableCounts = parsedInput.tableCounts ?? {};
  const canonicalTables = new Set<string>(['profiles', 'user_roles', 'artist_profiles', ...unmappedSoundpubTables]);
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
  }

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
  }));
  return {
    version: 1,
    mode: 'dry-run-only',
    namespace,
    apply_supported: false,
    target_candidates: {
      backend_users: backendUsers,
      profiles: profileCandidates,
      artist_profiles: artistProfileCandidates,
      user_settings: userSettings,
    },
    identity_crosswalk: identityCrosswalk,
    artist_profile_crosswalk: artistProfileCrosswalk,
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
      unmapped_tables: unmappedTables,
    },
  };
}
