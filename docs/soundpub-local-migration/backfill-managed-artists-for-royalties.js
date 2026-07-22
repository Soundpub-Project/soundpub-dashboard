require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_SERVICE_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;
const TARGET_SCHEMA = process.env.TARGET_DB_SCHEMA || 'soundpub';
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123456!';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_GROUPS_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT_GROUPS = LIMIT_GROUPS_ARG ? Number(LIMIT_GROUPS_ARG.split('=')[1]) : null;

if (!TARGET_URL || !TARGET_SERVICE_KEY) {
  console.error('Missing TARGET_SUPABASE_URL or TARGET_SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const authClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const dbClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  db: { schema: TARGET_SCHEMA },
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function slugify(value) {
  const slug = normalizeName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'artist';
}

function managedEmail(artistName, labelId) {
  const labelPart = String(labelId || '').replace(/-/g, '').slice(0, 10) || 'label';
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${slugify(artistName).slice(0, 48)}-${labelPart}-${randomPart}@managed.soundpub.local`;
}

async function fetchAll(table, select, buildQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = dbClient.from(table).select(select).range(from, from + pageSize - 1);
    query = buildQuery ? buildQuery(query) : query;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function getUnmatchedRoyaltyGroups() {
  const rows = await fetchAll(
    'royalties',
    'id,label_user_id,label_name,artist_name,artist,net_revenue',
    (query) => query.is('artist_user_id', null).not('label_user_id', 'is', null)
  );

  const groups = new Map();
  for (const row of rows) {
    const artistName = row.artist_name || row.artist;
    const normalizedArtistName = normalizeName(artistName);
    if (!normalizedArtistName) continue;

    const key = `${row.label_user_id}||${normalizedArtistName}`;
    const existing = groups.get(key) || {
      label_user_id: row.label_user_id,
      label_name: row.label_name,
      artist_name: String(artistName).trim(),
      normalized_artist_name: normalizedArtistName,
      total_rows: 0,
      total_revenue: 0,
    };

    existing.total_rows += 1;
    existing.total_revenue += Number(row.net_revenue || 0);
    groups.set(key, existing);
  }

  const sorted = [...groups.values()].sort((a, b) => b.total_revenue - a.total_revenue || b.total_rows - a.total_rows);
  return Number.isFinite(LIMIT_GROUPS) && LIMIT_GROUPS > 0 ? sorted.slice(0, LIMIT_GROUPS) : sorted;
}

async function findExistingManagedArtist(labelId, artistName) {
  const { data, error } = await dbClient
    .from('profiles')
    .select('id,email,full_name,parent_label_id,is_managed_artist,auth_user_status')
    .eq('parent_label_id', labelId)
    .limit(500);

  if (error) throw error;
  return (data || []).find((profile) => normalizeName(profile.full_name) === normalizeName(artistName)) || null;
}

async function createManagedArtist(group) {
  const existing = await findExistingManagedArtist(group.label_user_id, group.artist_name);
  if (existing) return { userId: existing.id, email: existing.email, created: false };

  const email = managedEmail(group.artist_name, group.label_user_id);
  const { data, error } = await authClient.auth.admin.createUser({
    email,
    password: DEFAULT_USER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: group.artist_name,
      managed_artist: true,
      auth_user_status: 'managed_only',
      password_set: false,
      migrated_from_royalty_backfill: true,
    },
  });

  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error(`Auth user was not created for ${group.artist_name}`);

  await new Promise((resolve) => setTimeout(resolve, 150));

  const { error: profileError } = await dbClient
    .from('profiles')
    .update({
      full_name: group.artist_name,
      parent_label_id: group.label_user_id,
      is_managed_artist: true,
      auth_user_status: 'managed_only',
      password_set: false,
      artist_profile_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (profileError) throw profileError;

  const { error: roleError } = await dbClient
    .from('user_roles')
    .upsert({ user_id: userId, role: 'artist' }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;

  const { error: artistProfileError } = await dbClient
    .from('artist_profiles')
    .upsert({
      user_id: userId,
      artist_name: group.artist_name,
      artist_type: 'managed',
      social_links: {},
    }, { onConflict: 'user_id' });
  if (artistProfileError) throw artistProfileError;

  const { data: existingArtistRow, error: artistLookupError } = await dbClient
    .from('artists')
    .select('id')
    .eq('label_id', group.label_user_id)
    .eq('name', group.artist_name)
    .maybeSingle();
  if (artistLookupError) throw artistLookupError;

  if (!existingArtistRow) {
    const { error: artistError } = await dbClient
      .from('artists')
      .insert({ label_id: group.label_user_id, name: group.artist_name });
    if (artistError) throw artistError;
  }

  return { userId, email, created: true };
}

async function updateRoyalties(group, userId) {
  const updatePayload = { artist_user_id: userId };
  const filters = [
    { column: 'artist_name', value: group.artist_name },
    { column: 'artist', value: group.artist_name },
  ];

  let updated = 0;
  for (const filter of filters) {
    const { data, error } = await dbClient
      .from('royalties')
      .update(updatePayload)
      .eq('label_user_id', group.label_user_id)
      .is('artist_user_id', null)
      .eq(filter.column, filter.value)
      .select('id');

    if (error) throw error;
    updated += data?.length || 0;
  }
  return updated;
}

async function main() {
  console.log('========================================');
  console.log('  Backfill Managed Artists For Royalties');
  console.log('========================================');
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Target schema: ${TARGET_SCHEMA}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);
  console.log('');

  const groups = await getUnmatchedRoyaltyGroups();
  console.log(`Unmatched royalty artist groups: ${groups.length}`);

  let created = 0;
  let reused = 0;
  let royaltyRowsUpdated = 0;

  for (const group of groups) {
    console.log(`${group.label_name || group.label_user_id} | ${group.artist_name} | rows=${group.total_rows} | revenue=${group.total_revenue.toFixed(2)}`);

    if (DRY_RUN) continue;

    const artist = await createManagedArtist(group);
    if (artist.created) created += 1;
    else reused += 1;

    const updated = await updateRoyalties(group, artist.userId);
    royaltyRowsUpdated += updated;
    console.log(`  -> ${artist.created ? 'created' : 'reused'} ${artist.userId} (${artist.email}), royalties updated=${updated}`);
  }

  console.log('');
  console.log(`Done. created=${created}, reused=${reused}, royalty_rows_updated=${royaltyRowsUpdated}`);
  console.log('Next: run 19-backfill-artist-share.sql again to recalculate artist/label/admin shares.');
}

main().catch((error) => {
  console.error('Backfill failed:', error?.message || error);
  if (error && typeof error === 'object') console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  process.exit(1);
});
