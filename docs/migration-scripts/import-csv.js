/**
 * SoundPub Dashboard - CSV Import Script
 * 
 * Import data dari CSV files (hasil export dari Lovable Cloud) ke Supabase target.
 * TIDAK membutuhkan SOURCE_SUPABASE_SERVICE_KEY.
 * 
 * PENTING: Jalankan full-schema-v2.sql terlebih dahulu sebelum menjalankan script ini!
 * 
 * Usage:
 *   1. Copy .env.example ke .env dan isi TARGET credentials
 *   2. Taruh CSV files di folder ./exported-data/
 *   3. npm install
 *   4. node import-csv.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// =====================================================
// Configuration
// =====================================================

const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_SERVICE_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;
const CSV_DIR = process.env.CSV_IMPORT_DIR || './exported-data';

if (!TARGET_URL || !TARGET_SERVICE_KEY) {
  console.error('❌ Missing TARGET_SUPABASE_URL or TARGET_SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

if (!fs.existsSync(CSV_DIR)) {
  console.error(`❌ CSV directory not found: ${CSV_DIR}`);
  console.error('   Taruh file CSV hasil export di folder tersebut.');
  process.exit(1);
}

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// User ID mapping (old CSV id -> new target id)
const userIdMap = new Map();

// =====================================================
// CSV Parser
// =====================================================

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    const row = {};
    headers.forEach((h, idx) => {
      let val = values[idx];
      if (val === '') val = null;
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'f') val = false;
      else if (val === 't') val = true;
      row[h] = val;
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function readCSV(filename) {
  const filepath = path.join(CSV_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️ File not found: ${filepath}, skipping...`);
    return { headers: [], rows: [] };
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  return parseCSV(content);
}

// =====================================================
// Helper Functions
// =====================================================

async function insertRows(table, rows) {
  if (rows.length === 0) return { inserted: 0, errors: [] };

  const batchSize = 100;
  let inserted = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await targetClient.from(table).insert(batch);

    if (error) {
      errors.push({ batch: Math.floor(i / batchSize) + 1, error: error.message });
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

function mapUserId(oldId) {
  if (!oldId) return null;
  return userIdMap.get(oldId) || oldId;
}

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type] || ''} ${message}`);
}

// =====================================================
// Step 1: Create Users from profiles.csv
// =====================================================

async function createUsersFromCSV() {
  log('Step 1/12: Creating users from profiles.csv...', 'info');

  const { rows: profiles } = readCSV('profiles.csv');
  if (profiles.length === 0) {
    log('No profiles found, skipping', 'warning');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const profile of profiles) {
    try {
      const { data: newUser, error } = await targetClient.auth.admin.createUser({
        email: profile.email,
        email_confirm: true,
        user_metadata: { full_name: profile.full_name, password_set: false },
      });

      if (error) {
        if (error.message.includes('already been registered')) {
          // Find existing user
          const { data: { users } } = await targetClient.auth.admin.listUsers();
          const existing = users.find(u => u.email === profile.email);
          if (existing) {
            userIdMap.set(profile.id, existing.id);
            skipped++;
            continue;
          }
        }
        throw error;
      }

      userIdMap.set(profile.id, newUser.user.id);
      created++;
    } catch (err) {
      log(`Failed to create user ${profile.email}: ${err.message}`, 'warning');
    }
  }

  log(`Users created: ${created}, skipped: ${skipped}`, 'success');
  log(`ID mappings: ${userIdMap.size}`, 'info');
}

// =====================================================
// Step 2-11: Import tables
// =====================================================

async function importProfiles() {
  log('Step 2/12: Importing profiles...', 'info');
  const { rows } = readCSV('profiles.csv');

  const mapped = rows.map(r => ({
    ...r,
    id: mapUserId(r.id),
    parent_label_id: mapUserId(r.parent_label_id),
    balance: parseFloat(r.balance) || 0,
    label_revenue: parseFloat(r.label_revenue) || 0,
    artist_revenue: parseFloat(r.artist_revenue) || 0,
  }));

  // Profiles are created by trigger, so we need to UPDATE them
  let updated = 0;
  for (const profile of mapped) {
    const { error } = await targetClient
      .from('profiles')
      .update({
        full_name: profile.full_name,
        phone: profile.phone,
        address: profile.address,
        parent_label_id: profile.parent_label_id,
        status: profile.status,
        balance: profile.balance,
        label_revenue: profile.label_revenue,
        artist_revenue: profile.artist_revenue,
        logo_url: profile.logo_url,
        logo_url_dark: profile.logo_url_dark,
        logo_url_light: profile.logo_url_light,
        password_set: profile.password_set,
        subscription_status: profile.subscription_status,
        composer_code: profile.composer_code,
      })
      .eq('id', profile.id);

    if (!error) updated++;
    else log(`  Profile update failed for ${profile.email}: ${error.message}`, 'warning');
  }

  log(`Profiles updated: ${updated}/${rows.length}`, 'success');
}

async function importUserRoles() {
  log('Step 3/12: Importing user_roles...', 'info');
  const { rows } = readCSV('user_roles.csv');

  // Delete default 'user' roles first (created by trigger)
  for (const row of rows) {
    const newUserId = mapUserId(row.user_id);
    if (newUserId) {
      await targetClient.from('user_roles').delete().eq('user_id', newUserId);
    }
  }

  const mapped = rows.map(r => ({
    user_id: mapUserId(r.user_id),
    role: r.role,
  })).filter(r => r.user_id);

  const { inserted, errors } = await insertRows('user_roles', mapped);
  log(`User roles imported: ${inserted}/${rows.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function importTable(step, table, filename, mapFn) {
  log(`Step ${step}/12: Importing ${table}...`, 'info');
  const { rows } = readCSV(filename);

  if (rows.length === 0) {
    log(`No data in ${filename}`, 'warning');
    return;
  }

  const mapped = mapFn ? rows.map(mapFn) : rows;
  const { inserted, errors } = await insertRows(table, mapped);
  log(`${table} imported: ${inserted}/${rows.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

// =====================================================
// Main
// =====================================================

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  SoundPub Dashboard - CSV Import');
  console.log('========================================');
  console.log('');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`CSV Dir: ${path.resolve(CSV_DIR)}`);
  console.log('');

  // List available CSV files
  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  log(`Found ${files.length} CSV files: ${files.join(', ')}`, 'info');
  console.log('');

  const startTime = Date.now();

  try {
    // Step 1: Create users
    await createUsersFromCSV();

    // Save ID mapping for reference
    const mappingFile = path.join(CSV_DIR, 'id-mapping.json');
    const mappingObj = {};
    userIdMap.forEach((newId, oldId) => { mappingObj[oldId] = newId; });
    fs.writeFileSync(mappingFile, JSON.stringify(mappingObj, null, 2));
    log(`ID mapping saved to ${mappingFile}`, 'info');

    // Step 2: Update profiles
    await importProfiles();

    // Step 3: User roles
    await importUserRoles();

    // Step 4: Artists
    await importTable(4, 'artists', 'artists.csv', r => ({
      ...r,
      label_id: mapUserId(r.label_id),
    }));

    // Step 5: Releases
    await importTable(5, 'releases', 'releases.csv', r => ({
      ...r,
      label_id: mapUserId(r.label_id),
      created_by: mapUserId(r.created_by),
      artist_user_id: mapUserId(r.artist_user_id),
    }));

    // Step 6: Tracks
    await importTable(6, 'tracks', 'tracks.csv', r => ({
      ...r,
      artist_user_id: mapUserId(r.artist_user_id),
    }));

    // Step 7: Royalty uploads
    await importTable(7, 'royalty_uploads', 'royalty_uploads.csv', r => ({
      ...r,
      user_id: mapUserId(r.user_id),
      total_records: parseInt(r.total_records) || 0,
      inserted_records: parseInt(r.inserted_records) || 0,
    }));

    // Step 8: Royalties
    await importTable(8, 'royalties', 'royalties.csv', r => ({
      ...r,
      artist_user_id: mapUserId(r.artist_user_id),
      net_revenue: parseFloat(r.net_revenue) || 0,
      sales_unit: parseInt(r.sales_unit) || 0,
    }));

    // Step 9: Composer royalties
    await importTable(9, 'composer_royalties', 'composer_royalties.csv', r => ({
      ...r,
      total_net_royalti: parseFloat(r.total_net_royalti) || 0,
    }));

    // Step 10: Payout requests
    await importTable(10, 'payout_requests', 'payout_requests.csv', r => ({
      ...r,
      user_id: mapUserId(r.user_id),
      processed_by: mapUserId(r.processed_by),
      amount: parseFloat(r.amount) || 0,
    }));

    // Step 11: Audit logs
    await importTable(11, 'audit_logs', 'audit_logs.csv', r => ({
      ...r,
      actor_id: mapUserId(r.actor_id),
      target_id: mapUserId(r.target_id),
    }));

    // Step 12: App settings
    await importTable(12, 'app_settings', 'app_settings.csv');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('');
    console.log('========================================');
    log(`Import completed in ${duration}s`, 'success');
    console.log('========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Upload storage files (release-covers, track-audio, etc.)');
    console.log('2. Deploy edge functions: supabase functions deploy');
    console.log('3. Update frontend .env with target Supabase credentials');
    console.log('4. Send password reset emails to all users');
    console.log('5. Test all functionality');
    console.log('');
  } catch (err) {
    log(`Import failed: ${err.message}`, 'error');
    console.error(err);
    process.exit(1);
  }
}

main();
