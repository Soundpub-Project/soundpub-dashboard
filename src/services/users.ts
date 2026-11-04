import { usesBackendDomain } from '@/api/routing';
import { usersApi, type ProfileUpdate, type AppRole } from '@/api/users';
import { labelsApi } from '@/api/labels';
import { supabase } from '@/integrations/supabase/client';

export type { AppRole } from '@/api/users';
export type UserStatus = 'active' | 'inactive' | 'suspended';

const rolePriority: AppRole[] = ['superadmin', 'admin', 'whitelabel', 'label_custom', 'label', 'artist', 'copyright', 'user'];
export const primaryRole = (roles: readonly string[]) => rolePriority.find(role => roles.includes(role)) ?? 'user';
const usesBackendUsers = () => usesBackendDomain('users');

export async function updateCurrentProfile(userId: string, patch: ProfileUpdate) {
  if (usesBackendUsers()) return usersApi.updateProfile(patch);
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

export async function getCurrentProfile(userId: string) {
  if (usesBackendUsers()) {
    const result = await usersApi.profile();
    return { profile: result.profile, role: primaryRole(result.roles) };
  }
  const [profileResult, roleResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).limit(1),
    supabase.from('user_roles').select('role').eq('user_id', userId).limit(10),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (roleResult.error) throw roleResult.error;
  return { profile: profileResult.data?.[0] ?? null, role: primaryRole(roleResult.data?.map(item => item.role) ?? []) };
}

export async function listUsers() {
  if (usesBackendUsers()) {
    const items: Awaited<ReturnType<typeof usersApi.list>>['items'] = [];
    const visited = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await usersApi.list(cursor ?? undefined);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && visited.has(cursor)) throw new Error('Invalid users pagination');
      if (cursor) visited.add(cursor);
    } while (cursor);
    const names = new Map(items.map(item => [item.id, item.full_name ?? item.email ?? 'User']));
    return items.map(item => ({ ...item, role: primaryRole(item.roles), parent_label_name: item.parent_label_name ?? (item.parent_label_id ? names.get(item.parent_label_id) ?? null : null) }));
  }
  const [profilesResult, rolesResult] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('user_roles').select('user_id, role'),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;
  const roles = new Map<string, string[]>();
  for (const item of rolesResult.data ?? []) roles.set(item.user_id, [...(roles.get(item.user_id) ?? []), item.role]);
  const names = new Map(profilesResult.data?.map(profile => [profile.id, profile.full_name]) ?? []);
  return (profilesResult.data ?? []).map(profile => ({
    ...profile,
    roles: roles.get(profile.id) ?? [],
    role: primaryRole(roles.get(profile.id) ?? []),
    parent_label_name: profile.parent_label_id ? names.get(profile.parent_label_id) ?? null : null,
  }));
}

export async function listLabels() {
  const users = await listUsers();
  return users
    .filter(user => user.status === 'active' && (user.roles?.includes('label') || user.roles?.includes('whitelabel')))
    .map(user => ({ id: user.id, full_name: `${user.full_name ?? user.email ?? 'Label'}${user.roles?.includes('whitelabel') ? ' (Whitelabel)' : ''}` }));
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (usesBackendUsers()) return usersApi.status(userId, status);
  const { data: { session } } = await supabase.auth.getSession();
  const response = await supabase.functions.invoke('update-user-status', {
    body: { user_id: userId, status },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (response.error) throw response.error;
  if (!response.data?.success) throw new Error(response.data?.error || 'Failed to update status');
}

export async function updateUserRole(input: {
  userId: string;
  fullName: string;
  role: AppRole;
  previousRole: AppRole;
  parentLabelId: string | null;
  previousParentLabelId: string | null;
  transferConfirmation: string;
}) {
  if (usesBackendUsers()) {
    const relationshipChanged = input.parentLabelId !== input.previousParentLabelId;
    if (relationshipChanged) {
      if (!usesBackendDomain('users') || !usesBackendDomain('artists') || !usesBackendDomain('labels')) {
        throw new Error('PHASE3B_ARTISTS_LABELS: Perpindahan label belum tersedia');
      }
      if (input.role === 'artist' && input.previousRole !== 'artist' && input.parentLabelId) {
        return usersApi.roles(input.userId, [input.role], input.parentLabelId);
      }
      if (input.role !== 'artist' || input.previousRole !== 'artist') {
        throw new Error('Perubahan role dan relasi label harus dilakukan terpisah');
      }
      if (input.parentLabelId && input.previousParentLabelId) {
        return labelsApi.transfer(input.userId, input.parentLabelId, input.previousParentLabelId, input.transferConfirmation);
      }
      if (input.parentLabelId) return labelsApi.assign(input.userId, input.parentLabelId);
      if (input.previousParentLabelId) return labelsApi.remove(input.userId, input.previousParentLabelId);
    }
    return usersApi.roles(input.userId, [input.role]);
  }
  if (input.role !== input.previousRole) {
    const { data, error } = await supabase.functions.invoke('update-user-role', { body: { user_id: input.userId, new_role: input.role } });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Gagal mengubah role user');
  }
  if (input.role === 'artist' && input.parentLabelId !== input.previousParentLabelId) {
    const { error } = await supabase.functions.invoke('transfer-artist-label', { body: {
      artist_id: input.userId, new_label_id: input.parentLabelId, confirmation_phrase: input.transferConfirmation, royalty_transfer_mode: 'keep_old_label',
    } });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('profiles').update({ parent_label_id: input.role === 'artist' ? input.parentLabelId : null }).eq('id', input.userId);
  if (error) throw error;
  if (input.role === 'artist' && input.parentLabelId) {
    const { data } = await supabase.from('artists').select('id').eq('name', input.fullName).eq('label_id', input.parentLabelId).maybeSingle();
    if (!data) await supabase.from('artists').insert({ name: input.fullName, label_id: input.parentLabelId });
  }
}







