# ============================================================
# SOUNDPUB DASHBOARD - DOCKER MIGRATION RUNNER
# ============================================================
# Purpose: Run database migration on self-hosted Supabase
# Target: Docker container supabase-db
# Migration: 002_auth_verification_system_v2.sql
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SOUNDPUB - Docker Migration Runner" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$DOCKER_CONTAINER = "supabase-db"
$POSTGRES_USER = "postgres"
$DATABASE_NAME = "postgres"
$MIGRATION_FILE = "migrations-complete/002_auth_verification_system_v2.sql"
$REMOTE_HOST = "maskhar@supabase-server"
$REMOTE_PATH = "/tmp/migration_002.sql"

# Check if migration file exists
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "[ERROR] Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Migration file found: $MIGRATION_FILE" -ForegroundColor Green
Write-Host ""

# Display migration info
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Remote Host    : $REMOTE_HOST" -ForegroundColor White
Write-Host "  Docker Container: $DOCKER_CONTAINER" -ForegroundColor White
Write-Host "  Database       : $DATABASE_NAME" -ForegroundColor White
Write-Host "  Migration File : $MIGRATION_FILE" -ForegroundColor White
Write-Host ""

# Ask for confirmation
Write-Host "This will run the migration on your self-hosted Supabase." -ForegroundColor Yellow
$confirm = Read-Host "Do you want to continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "[CANCELLED] Migration cancelled by user." -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 1: Upload migration file to remote server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    # Copy migration file to remote server using scp
    Write-Host "[INFO] Uploading migration file..." -ForegroundColor Yellow
    scp $MIGRATION_FILE "${REMOTE_HOST}:$REMOTE_PATH"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upload migration file"
    }
    
    Write-Host "[SUCCESS] Migration file uploaded to remote server" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 2: Run migration in Docker container" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    # Execute migration via SSH
    Write-Host "[INFO] Executing migration..." -ForegroundColor Yellow
    Write-Host ""
    
    $sshCommand = "docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME < $REMOTE_PATH"
    
    ssh $REMOTE_HOST $sshCommand
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute migration"
    }
    
    Write-Host ""
    Write-Host "[SUCCESS] Migration executed successfully!" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "[INFO] Cleaning up remote file..." -ForegroundColor Yellow
    ssh $REMOTE_HOST "rm -f $REMOTE_PATH"
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Step 3: Verify migration" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    Write-Host "[INFO] Verifying migration results..." -ForegroundColor Yellow
    Write-Host ""
    
    $verifyQuery = @"
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_schema='soundpub' 
  AND table_name='profiles'
  AND column_name IN ('email_verified', 'verification_token', 'password_reset_token');

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema='soundpub' 
  AND table_name IN ('auth_events', 'rate_limits');
"@
    
    # Execute verification
    $verifyCommand = "echo `"$verifyQuery`" | docker exec -i $DOCKER_CONTAINER psql -U $POSTGRES_USER -d $DATABASE_NAME"
    ssh $REMOTE_HOST $verifyCommand
    
    Write-Host ""
    Write-Host "[SUCCESS] Migration verification completed!" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "[WARNING] Verification failed, but migration might have succeeded" -ForegroundColor Yellow
    Write-Host "[ERROR] $_" -ForegroundColor Red
    Write-Host ""
}
finally {
    # Cleanup remote files
    Write-Host "[INFO] Cleaning up remote files..." -ForegroundColor Yellow
    ssh $REMOTE_HOST "rm -f $REMOTE_PATH"
    Write-Host "[SUCCESS] Cleanup completed" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Migration Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Set Edge Function secrets (if not done yet)" -ForegroundColor White
Write-Host "  2. Deploy/redeploy Edge Functions" -ForegroundColor White
Write-Host "  3. Test signup and password reset flows" -ForegroundColor White
Write-Host ""
Write-Host "For Edge Functions deployment, run:" -ForegroundColor Yellow
Write-Host "  .\deploy_functions.ps1" -ForegroundColor Cyan
Write-Host ""
