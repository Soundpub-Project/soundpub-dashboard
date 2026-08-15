# ============================================================
# SOUNDPUB DASHBOARD - DOCKER MIGRATION RUNNER (SSH)
# ============================================================
# Purpose: Run database migration on self-hosted Supabase
# Target: Docker container supabase-db on remote server
# Migration: 002_auth_verification_system_v2.sql
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SOUNDPUB - Docker Migration Runner (SSH)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration - SESUAIKAN DENGAN SETUP ANDA
$REMOTE_HOST = "supabase-server"  # IP atau hostname server
$REMOTE_USER = "maskhar"
$DOCKER_CONTAINER = "supabase-db"
$POSTGRES_USER = "postgres"
$DATABASE_NAME = "postgres"
$MIGRATION_FILE = "migrations-complete/002_auth_verification_system_v2.sql"
$REMOTE_PATH = "/tmp/migration_002.sql"

Write-Host "Please provide connection details:" -ForegroundColor Yellow
Write-Host ""

# Tanya IP/hostname jika perlu
$hostInput = Read-Host "Remote server IP/hostname [$REMOTE_HOST]"
if ($hostInput) { $REMOTE_HOST = $hostInput }

# Check if migration file exists
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "[ERROR] Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[INFO] Migration file found: $MIGRATION_FILE" -ForegroundColor Green
Write-Host ""

# Display migration info
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Remote Host     : $REMOTE_USER@$REMOTE_HOST" -ForegroundColor White
Write-Host "  Docker Container: $DOCKER_CONTAINER" -ForegroundColor White
Write-Host "  Database        : $DATABASE_NAME" -ForegroundColor White
Write-Host "  Migration File  : $MIGRATION_FILE" -ForegroundColor White
Write-Host ""

# Ask for confirmation
Write-Host "This will run the migration on your self-hosted Supabase." -ForegroundColor Yellow
$confirm = Read-Host "Continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "[CANCELLED] Migration cancelled by user." -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 1: Upload migration file to remote server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    Write-Host "[INFO] Uploading migration file..." -ForegroundColor Yellow
    
    $scpCommand = "scp `"$MIGRATION_FILE`" ${REMOTE_USER}@${REMOTE_HOST}:$REMOTE_PATH"
    Write-Host "[CMD] $scpCommand" -ForegroundColor Gray
    
    Invoke-Expression $scpCommand
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upload migration file"
    }
    
    Write-Host "[SUCCESS] Migration file uploaded" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Manually copy the file to the server:" -ForegroundColor Yellow
    Write-Host "  scp $MIGRATION_FILE ${REMOTE_USER}@${REMOTE_HOST}:$REMOTE_PATH" -ForegroundColor Cyan
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 2: Execute migration in Docker container" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    Write-Host "[INFO] Executing migration..." -ForegroundColor Yellow
    Write-Host ""
    
    $sshCommand = "ssh ${REMOTE_USER}@${REMOTE_HOST} `"docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME < $REMOTE_PATH`""
    Write-Host "[CMD] Executing via SSH..." -ForegroundColor Gray
    
    Invoke-Expression $sshCommand
    
    if ($LASTEXITCODE -ne 0) {
        throw "Migration execution failed"
    }
    
    Write-Host ""
    Write-Host "[SUCCESS] Migration executed successfully!" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "If SSH failed, try running manually on the server:" -ForegroundColor Yellow
    Write-Host "  docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME < $REMOTE_PATH" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 3: Verify migration results" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    Write-Host "[INFO] Verifying new columns..." -ForegroundColor Yellow
    
    $verifyCmd = @"
ssh ${REMOTE_USER}@${REMOTE_HOST} "docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME -c \"SELECT column_name FROM information_schema.columns WHERE table_schema='soundpub' AND table_name='profiles' AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');\""
"@
    
    Invoke-Expression $verifyCmd
    
    Write-Host ""
    Write-Host "[INFO] Verifying new tables..." -ForegroundColor Yellow
    
    $verifyTables = @"
ssh ${REMOTE_USER}@${REMOTE_HOST} "docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME -c \"SELECT table_name FROM information_schema.tables WHERE table_schema='soundpub' AND table_name IN ('auth_events', 'rate_limits');\""
"@
    
    Invoke-Expression $verifyTables
    
    Write-Host ""
    Write-Host "[SUCCESS] Verification completed!" -ForegroundColor Green
}
catch {
    Write-Host "[WARNING] Verification queries failed" -ForegroundColor Yellow
    Write-Host "[INFO] But migration might have succeeded. Check manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 4: Cleanup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    Write-Host "[INFO] Removing temporary file from server..." -ForegroundColor Yellow
    $cleanupCmd = "ssh ${REMOTE_USER}@${REMOTE_HOST} `"rm -f $REMOTE_PATH`""
    Invoke-Expression $cleanupCmd
    Write-Host "[SUCCESS] Cleanup completed" -ForegroundColor Green
}
catch {
    Write-Host "[WARNING] Failed to cleanup. Remove manually if needed." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Migration Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "What was done:" -ForegroundColor Yellow
Write-Host "  [x] Added email_verified column to profiles" -ForegroundColor Green
Write-Host "  [x] Added verification_token columns" -ForegroundColor Green
Write-Host "  [x] Added password_reset_token columns" -ForegroundColor Green
Write-Host "  [x] Created auth_events table" -ForegroundColor Green
Write-Host "  [x] Created rate_limits table" -ForegroundColor Green
Write-Host "  [x] Added utility functions" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update Edge Function secrets (environment variables)" -ForegroundColor White
Write-Host "  2. Deploy Edge Functions to your Supabase" -ForegroundColor White
Write-Host "  3. Test the auth flows (signup, verify email, reset password)" -ForegroundColor White
Write-Host ""
Write-Host "For secrets configuration, see: docs/BUG_FIXES_AND_SOLUTIONS.md" -ForegroundColor Cyan
Write-Host ""
