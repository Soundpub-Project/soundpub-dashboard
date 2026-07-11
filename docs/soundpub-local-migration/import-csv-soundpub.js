require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_SERVICE_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;
const TARGET_SCHEMA = process.env.TARGET_DB_SCHEMA || 'soundpub';
const CSV_DIR = process.env.CSV_IMPORT_DIR || './exported-data';
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123456!';
const CHECK_ONLY = process.argv.includes('--check-only');

const REQUIRED_CSV = [
  'profiles.csv',
  'user_roles.csv',
  'artists.csv',
  'releases.csv',
  'tracks.csv',
  'royalty_uploads.csv',
  'royalties.csv',
  'audit_logs.csv',
  'app_settings.csv',
];

const OPTIONAL_CSV = [
  'composer_royalties.csv',
  'artist_profiles.csv',
  'notifications.csv',
  'email_send_log.csv',
  'release_payments.csv',
  'storage_backup_log.csv',
  'storage_backup_runs.csv',
  'payout_requests.csv',
];

if (!TARGET_URL || !TARGET_SERVICE_KEY) {
  console.error('Missing TARGET_SUPABASE_URL or TARGET_SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const csvRoot = path.resolve(CSV_DIR);
if (!fs.existsSync(csvRoot)) {
  console.error(`CSV_IMPORT_DIR not found: ${csvRoot}`);
  process.exit(1);
}

const authClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const dbClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  db: { schema: TARGET_SCHEMA },
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIdMap = new Map();

function log(message) {
  console.log(message);
}

function parseCSV(content) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const firstLine = normalized.split('\n', 1)[0] || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows.shift().map((header) => header.trim());
  const dataRows = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const values = rows[rowIndex];
    while (values.length < headers.length) values.push('');
    if (values.length !== headers.length) {
      log(`Skipping malformed CSV row ${rowIndex + 2}: expected ${headers.length}, got ${values.length}`);
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = normalizeValue(values[index]);
    });
    dataRows.push(row);
  }

  return { headers, rows: dataRows };
}

function normalizeValue(value) {
  if (value === '') return null;
  if (value === 'true' || value === 't') return true;
  if (value === 'false' || value === 'f') return false;
  if (value && /^[\[{]/.test(String(value).trim())) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function resolveCsvPath(filename) {
  const exact = path.join(csvRoot, filename);
  if (fs.existsSync(exact)) return exact;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const candidates = fs.readdirSync(csvRoot)
    .filter((name) => name === filename || ((name.startsWith(`${base}_`) || name.startsWith(`${base}-`)) && name.endsWith(ext)))
    .sort()
    .reverse();

  return candidates.length ? path.join(csvRoot, candidates[0]) : exact;
}

function readCSV(filename) {
  const file = resolveCsvPath(filename);
  if (!fs.existsSync(file)) return { headers: [], rows: [] };
  return parseCSV(fs.readFileSync(file, 'utf8'));
}

function normalizeRole(role) {
  const allowed = new Set(['superadmin', 'admin', 'label', 'artist', 'user', 'copyright', 'whitelabel']);
  return allowed.has(role) ? role : 'user';
}

function mapUserId(id) {
  if (!id) return null;
  return userIdMap.get(id) || id;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asInteger(value, fallback = 0) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function stripEmptyKeys(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

async function insertRows(table, rows, options = {}) {
  if (rows.length === 0) return { inserted: 0, errors: [] };

  const batchSize = options.batchSize || 100;
  let inserted = 0;
  const errors = [];

  async function writeBatch(batch) {
    const cleanBatch = batch.map(stripEmptyKeys);
    const query = options.upsert
      ? dbClient.from(table).upsert(cleanBatch, { onConflict: options.onConflict })
      : dbClient.from(table).insert(cleanBatch);
    return query;
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await writeBatch(batch);
    if (!error) {
      inserted += batch.length;
      continue;
    }

    if (options.fallbackToRows) {
      for (let rowIndex = 0; rowIndex < batch.length; rowIndex++) {
        const row = batch[rowIndex];
        const { error: rowError } = await writeBatch([row]);
        if (rowError) {
          errors.push({
            batch: Math.floor(i / batchSize) + 1,
            row: i + rowIndex + 1,
            error: rowError.message,
          });
        } else {
          inserted += 1;
        }
      }
    } else {
      errors.push({ batch: Math.floor(i / batchSize) + 1, error: error.message });
    }
  }

  return { inserted, errors };
}

function logResult(table, expected, result) {
  const status = result.errors.length ? 'WARN' : 'OK';
  log(`${status} ${table}: inserted/upserted ${result.inserted}/${expected}`);
  for (const error of result.errors) {
    log(`  batch ${error.batch}: ${error.error}`);
  }
}

async function checkCsvFiles() {
  log('Checking CSV files...');
  for (const filename of REQUIRED_CSV) {
    const { rows } = readCSV(filename);
    if (rows.length === 0) throw new Error(`Required CSV missing or empty: ${filename}`);
    log(`OK ${filename}: ${rows.length} rows`);
  }
  for (const filename of OPTIONAL_CSV) {
    const { rows } = readCSV(filename);
    log(`${rows.length ? 'OK' : 'SKIP'} ${filename}: ${rows.length} rows`);
  }
}

async function findAuthUserByEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await authClient.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((user) => String(user.email || '').toLowerCase() === normalizedEmail);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function createUsersFromProfiles() {
  const { rows: profiles } = readCSV('profiles.csv');
  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const profile of profiles) {
    if (!profile.email) {
      failed++;
      continue;
    }

    const { data, error } = await authClient.auth.admin.createUser({
      email: profile.email,
      password: DEFAULT_USER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: profile.full_name,
        password_set: profile.password_set ?? true,
        migrated_from_lovable: true,
      },
    });

    if (!error && data?.user) {
      userIdMap.set(profile.id, data.user.id);
      created++;
      continue;
    }

    if (error && error.message.includes('already been registered')) {
      const found = await findAuthUserByEmail(profile.email);
      if (found) {
        userIdMap.set(profile.id, found.id);
        existing++;
        continue;
      }
    }

    failed++;
    log(`Failed to create/find user ${profile.email}: ${error ? error.message : 'unknown error'}`);
  }

  const mappingPath = path.join(csvRoot, 'id-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(Object.fromEntries(userIdMap), null, 2));
  log(`Users created=${created}, existing=${existing}, failed=${failed}`);
  log(`ID mapping saved: ${mappingPath}`);
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  SoundPub CSV import');
  console.log('========================================');
  console.log('');
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Target schema: ${TARGET_SCHEMA}`);
  console.log(`CSV dir: ${csvRoot}`);
  console.log('');

  await checkCsvFiles();
  if (CHECK_ONLY) {
    log('Check-only completed. No data imported.');
    return;
  }

  await createUsersFromProfiles();

  await insertRows('profiles', readCSV('profiles.csv').rows.map((row) => ({
    id: mapUserId(row.id),
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    address: row.address,
    parent_label_id: mapUserId(row.parent_label_id),
    status: row.status,
    balance: asNumber(row.balance),
    logo_url: row.logo_url,
    logo_url_light: row.logo_url_light,
    logo_url_dark: row.logo_url_dark,
    label_revenue: asNumber(row.label_revenue),
    artist_revenue: asNumber(row.artist_revenue),
    password_set: row.password_set,
    subscription_status: row.subscription_status,
    subscription_upgraded_at: row.subscription_upgraded_at,
    composer_code: row.composer_code,
    avatar_url: row.avatar_url,
    sso_provider: row.sso_provider,
    artist_profile_completed: row.artist_profile_completed,
    city: row.city,
    province: row.province,
    sso_user_id: row.sso_user_id,
    sso_user_type: row.sso_user_type,
    email_notif_payout: row.email_notif_payout,
    email_notif_release: row.email_notif_release,
    email_notif_payment: row.email_notif_payment,
    email_notif_announcement: row.email_notif_announcement,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })), { upsert: true, onConflict: 'id' }).then((result) => logResult('profiles', readCSV('profiles.csv').rows.length, result));

  await insertRows('user_roles', readCSV('user_roles.csv').rows.map((row) => ({
    user_id: mapUserId(row.user_id),
    role: normalizeRole(row.role),
    created_at: row.created_at,
  })).filter((row) => row.user_id), { upsert: true, onConflict: 'user_id,role' }).then((result) => logResult('user_roles', readCSV('user_roles.csv').rows.length, result));

    await insertRows('artists', readCSV('artists.csv').rows.map((row) => ({
    id: row.id,
    label_id: mapUserId(row.label_id),
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })).filter((row) => row.label_id || row.status === 'draft' || row.status === 'pending'), { upsert: true, onConflict: 'id' }).then((result) => logResult('artists', readCSV('artists.csv').rows.length, result));

    await insertRows('releases', readCSV('releases.csv').rows.map((row) => ({
    id: row.id,
    upc: row.upc,
    title: row.title,
    artist_name: row.artist_name,
    label_id: mapUserId(row.label_id),
    release_date: row.release_date,
    cover_url: row.cover_url,
    genre: row.genre,
    release_type: row.release_type,
    status: row.status,
    created_by: mapUserId(row.created_by),
    archived_at: row.archived_at,
    artist_user_id: mapUserId(row.artist_user_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })).filter((row) => row.label_id), { upsert: true, onConflict: 'id', fallbackToRows: true }).then((result) => logResult('releases', readCSV('releases.csv').rows.length, result));

    await insertRows('tracks', readCSV('tracks.csv').rows.map((row) => ({
    id: row.id,
    release_id: row.release_id,
    isrc: row.isrc,
    title: row.title,
    artist_name: row.artist_name,
    audio_url: row.audio_url,
    composer: row.composer,
    lyricist: row.lyricist,
    lyrics: row.lyrics,
    genre: row.genre,
    artists: row.artists,
    explicit_lyrics: row.explicit_lyrics,
    contributors: row.contributors,
    video_url: row.video_url,
    clip_url: row.clip_url,
    duration: row.duration == null ? null : asInteger(row.duration),
    artist_user_id: mapUserId(row.artist_user_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })).filter((row) => row.release_id), { upsert: true, onConflict: 'id', fallbackToRows: true }).then((result) => logResult('tracks', readCSV('tracks.csv').rows.length, result));

  await insertRows('royalty_uploads', readCSV('royalty_uploads.csv').rows.map((row) => ({
    id: row.id,
    user_id: mapUserId(row.user_id),
    filename: row.filename,
    original_filename: row.original_filename,
    total_records: asInteger(row.total_records),
    inserted_records: asInteger(row.inserted_records),
    status: row.status,
    error_message: row.error_message,
    summary: row.summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })).filter((row) => row.user_id), { upsert: true, onConflict: 'id' }).then((result) => logResult('royalty_uploads', readCSV('royalty_uploads.csv').rows.length, result));

  const uploadIds = new Set(readCSV('royalty_uploads.csv').rows.map((row) => row.id));
  const royalties = readCSV('royalties.csv').rows.filter((row) => row.upload_id && uploadIds.has(row.upload_id));
  log(`Royalties: ${royalties.length} valid rows (filtered ${readCSV('royalties.csv').rows.length - royalties.length} orphaned upload_ids)`);

  await insertRows('royalties', royalties.map((row) => ({
    id: row.id,
    upload_id: row.upload_id,
    period: row.period,
    isrc: row.isrc,
    upc: row.upc,
    artist_name: row.artist_name || row.artist || 'Unknown Artist',
    label_name: row.label_name || 'Unknown Label',
    platform: row.platform || 'Unknown Platform',
    country: row.country || 'Unknown',
    sales_type: row.sales_type || 'unknown',
    unit_penjualan: asInteger(row.unit_penjualan ?? row.sales_unit),
    pendapatan_kotor_dsp: asNumber(row.pendapatan_kotor_dsp),
    pendapatan_label_artis: asNumber(row.pendapatan_label_artis),
    pendapatan_bersih_soundpub: asNumber(row.pendapatan_bersih_soundpub),
    artist_revenue: asNumber(row.artist_revenue ?? row.net_revenue),
    soundpub_revenue: asNumber(row.soundpub_revenue),
    title: row.title,
    artist: row.artist,
    created_at: row.created_at,
  })).filter((row) => row.upload_id), { upsert: true, onConflict: 'id' }).then((result) => logResult('royalties', royalties.length, result));

  await insertRows('composer_royalties', readCSV('composer_royalties.csv').rows.map((row) => ({
    id: row.id,
    composer_id: row.composer_id,
    composer_name: row.composer_name,
    total_net_royalti: asNumber(row.total_net_royalti),
    period: row.period,
    upload_id: row.upload_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })), { upsert: true, onConflict: 'id' }).then((result) => logResult('composer_royalties', readCSV('composer_royalties.csv').rows.length, result));

  await insertRows('audit_logs', readCSV('audit_logs.csv').rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor_id: mapUserId(row.actor_id),
    target_id: mapUserId(row.target_id),
    target_type: row.target_type,
    details: row.details,
    ip_address: row.ip_address,
    created_at: row.created_at,
  })), { upsert: true, onConflict: 'id' }).then((result) => logResult('audit_logs', readCSV('audit_logs.csv').rows.length, result));

  await insertRows('app_settings', readCSV('app_settings.csv').rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })), { upsert: true, onConflict: 'key' }).then((result) => logResult('app_settings', readCSV('app_settings.csv').rows.length, result));

  for (const optionalTable of OPTIONAL_CSV) {
    const { rows } = readCSV(optionalTable);
    if (rows.length === 0) {
      log(`Skipping ${optionalTable}: 0 rows`);
    }
  }

  log('Import complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
