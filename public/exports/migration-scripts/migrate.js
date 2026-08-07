/**
 * SoundPub Dashboard - Data Migration Script
 * 
 * Script untuk migrasi data dari Lovable Cloud ke Supabase eksternal.
 * 
 * PENTING: Jalankan full-schema.sql terlebih dahulu sebelum menjalankan script ini!
 * 
 * Usage:
 *   1. Copy .env.example ke .env dan isi dengan credentials
 *   2. npm install
 *   3. node migrate.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DB_SCHEMA = process.env.TARGET_DB_SCHEMA || 'soundpub-dashboard';

// =====================================================
// Configuration
// =====================================================

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_SERVICE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;
const TARGET_URL = process.env.TARGET_SUPABASE_URL;
const TARGET_SERVICE_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;

if (!SOURCE_URL || !SOURCE_SERVICE_KEY || !TARGET_URL || !TARGET_SERVICE_KEY) {
  console.error('❌ Missing environment variables. Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const sourceClient = createClient(SOURCE_URL, SOURCE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: process.env.SOURCE_DB_SCHEMA || 'public' }
});

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: DB_SCHEMA }
});

// User ID mapping (old -> new)
const userIdMap = new Map();

// =====================================================
// Helper Functions
// =====================================================

async function fetchAllRows(client, table, orderBy = 'created_at') {
  const { data, error } = await client
    .from(table)
    .select('*')
    .order(orderBy, { ascending: true });
  
  if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
  return data || [];
}

async function insertRows(client, table, rows) {
  if (rows.length === 0) return { inserted: 0, errors: [] };
  
  const batchSize = 100;
  let inserted = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client.from(table).insert(batch);
    
    if (error) {
      errors.push({ batch: i / batchSize + 1, error: error.message });
    } else {
      inserted += batch.length;
    }
  }
  
  return { inserted, errors };
}

function mapUserId(oldId) {
  return userIdMap.get(oldId) || oldId;
}

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type] || ''} ${message}`);
}

// =====================================================
// Migration Steps
// =====================================================

async function migrateUsers() {
  log('Step 1/12: Migrating users...', 'info');
  
  try {
    // Get users from source (using admin API)
    const { data: { users }, error } = await sourceClient.auth.admin.listUsers();
    if (error) throw error;
    
    log(`Found ${users.length} users to migrate`);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const user of users) {
      try {
        // Create user in target
        const { data: newUser, error: createError } = await targetClient.auth.admin.createUser({
          email: user.email,
          email_confirm: true,
          user_metadata: user.user_metadata,
          app_metadata: user.app_metadata,
        });
        
        if (createError) {
          if (createError.message.includes('already been registered')) {
            // User exists, try to find them
            const { data: { users: existingUsers } } = await targetClient.auth.admin.listUsers();
            const existing = existingUsers.find(u => u.email === user.email);
            if (existing) {
              userIdMap.set(user.id, existing.id);
              skipped++;
              continue;
            }
          }
          throw createError;
        }
        
        userIdMap.set(user.id, newUser.user.id);
        migrated++;
      } catch (err) {
        log(`Failed to migrate user ${user.email}: ${err.message}`, 'warning');
      }
    }
    
    log(`Users migrated: ${migrated}, skipped: ${skipped}`, 'success');
  } catch (err) {
    log(`Error migrating users: ${err.message}`, 'error');
  }
}

async function migrateProfiles() {
  log('Step 2/12: Migrating profiles...', 'info');
  
  const profiles = await fetchAllRows(sourceClient, 'profiles', 'id');
  
  const mappedProfiles = profiles.map(profile => ({
    ...profile,
    id: mapUserId(profile.id),
    parent_label_id: profile.parent_label_id ? mapUserId(profile.parent_label_id) : null,
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'profiles', mappedProfiles);
  log(`Profiles migrated: ${inserted}/${profiles.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateUserRoles() {
  log('Step 3/12: Migrating user_roles...', 'info');
  
  const roles = await fetchAllRows(sourceClient, 'user_roles', 'created_at');
  
  const mappedRoles = roles.map(role => ({
    ...role,
    id: undefined, // Let DB generate new ID
    user_id: mapUserId(role.user_id),
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'user_roles', mappedRoles);
  log(`User roles migrated: ${inserted}/${roles.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateArtists() {
  log('Step 4/12: Migrating artists...', 'info');
  
  const artists = await fetchAllRows(sourceClient, 'artists');
  
  const mappedArtists = artists.map(artist => ({
    ...artist,
    label_id: mapUserId(artist.label_id),
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'artists', mappedArtists);
  log(`Artists migrated: ${inserted}/${artists.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateReleases() {
  log('Step 5/12: Migrating releases...', 'info');
  
  const releases = await fetchAllRows(sourceClient, 'releases');
  
  const mappedReleases = releases.map(release => ({
    ...release,
    label_id: mapUserId(release.label_id),
    created_by: release.created_by ? mapUserId(release.created_by) : null,
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'releases', mappedReleases);
  log(`Releases migrated: ${inserted}/${releases.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateTracks() {
  log('Step 6/12: Migrating tracks...', 'info');
  
  const tracks = await fetchAllRows(sourceClient, 'tracks');
  const { inserted, errors } = await insertRows(targetClient, 'tracks', tracks);
  log(`Tracks migrated: ${inserted}/${tracks.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateRoyaltyUploads() {
  log('Step 7/12: Migrating royalty_uploads...', 'info');
  
  const uploads = await fetchAllRows(sourceClient, 'royalty_uploads');
  
  const mappedUploads = uploads.map(upload => ({
    ...upload,
    user_id: mapUserId(upload.user_id),
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'royalty_uploads', mappedUploads);
  log(`Royalty uploads migrated: ${inserted}/${uploads.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateRoyalties() {
  log('Step 8/12: Migrating royalties...', 'info');
  
  const royalties = await fetchAllRows(sourceClient, 'royalties');
  const { inserted, errors } = await insertRows(targetClient, 'royalties', royalties);
  log(`Royalties migrated: ${inserted}/${royalties.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migratePayoutRequests() {
  log('Step 9/12: Migrating payout_requests...', 'info');
  
  const payouts = await fetchAllRows(sourceClient, 'payout_requests');
  
  const mappedPayouts = payouts.map(payout => ({
    ...payout,
    user_id: mapUserId(payout.user_id),
    processed_by: payout.processed_by ? mapUserId(payout.processed_by) : null,
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'payout_requests', mappedPayouts);
  log(`Payout requests migrated: ${inserted}/${payouts.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateAuditLogs() {
  log('Step 10/12: Migrating audit_logs...', 'info');
  
  const logs = await fetchAllRows(sourceClient, 'audit_logs');
  
  const mappedLogs = logs.map(log => ({
    ...log,
    actor_id: mapUserId(log.actor_id),
    target_id: log.target_id ? mapUserId(log.target_id) : null,
  }));
  
  const { inserted, errors } = await insertRows(targetClient, 'audit_logs', mappedLogs);
  log(`Audit logs migrated: ${inserted}/${logs.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateAppSettings() {
  log('Step 11/12: Migrating app_settings...', 'info');
  
  const settings = await fetchAllRows(sourceClient, 'app_settings', 'key');
  const { inserted, errors } = await insertRows(targetClient, 'app_settings', settings);
  log(`App settings migrated: ${inserted}/${settings.length}`, errors.length ? 'warning' : 'success');
  if (errors.length) console.log('Errors:', errors);
}

async function migrateStorage() {
  log('Step 12/12: Migrating storage files...', 'info');
  log('⚠️ Storage migration requires manual download/upload or use the Supabase CLI.', 'warning');
  log('Buckets to migrate: release-covers, track-audio, track-video, audio-clips', 'info');
}

// =====================================================
// Main
// =====================================================

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  SoundPub Dashboard - Data Migration');
  console.log('========================================');
  console.log('');
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Target: ${TARGET_URL}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    await migrateUsers();
    await migrateProfiles();
    await migrateUserRoles();
    await migrateArtists();
    await migrateReleases();
    await migrateTracks();
    await migrateRoyaltyUploads();
    await migrateRoyalties();
    await migratePayoutRequests();
    await migrateAuditLogs();
    await migrateAppSettings();
    await migrateStorage();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('');
    console.log('========================================');
    log(`Migration completed in ${duration}s`, 'success');
    console.log('========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Migrate storage files manually');
    console.log('2. Deploy edge functions');
    console.log('3. Update frontend environment variables');
    console.log('4. Test all functionality');
    console.log('');
  } catch (err) {
    log(`Migration failed: ${err.message}`, 'error');
    console.error(err);
    process.exit(1);
  }
}

main();
