# Deploy Process Royalty Upload Function to Server
# Usage: .\deploy-royalty-function.ps1

$SERVER = "maskhar@20.20.20.173"
$REMOTE_PATH = "/home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload"
$LOCAL_FILE = "supabase/functions/process-royalty-upload/index.ts"
$DOCKER_DIR = "/home/maskhar/docker/supabase/supabase/docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy Process Royalty Upload Function" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if local file exists
if (-not (Test-Path $LOCAL_FILE)) {
    Write-Host "ERROR: File not found: $LOCAL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Backing up current function..." -ForegroundColor Yellow
$BACKUP_CMD = "cd $REMOTE_PATH && [ -f index.ts ] && cp index.ts index.ts.backup.`$(date +%Y%m%d_%H%M%S) || echo 'No existing file to backup'"
ssh $SERVER $BACKUP_CMD

Write-Host "[2/5] Uploading new function..." -ForegroundColor Yellow
scp $LOCAL_FILE "${SERVER}:${REMOTE_PATH}/index.ts"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Upload failed" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Verifying upload..." -ForegroundColor Yellow
$VERIFY_CMD = "ls -lh $REMOTE_PATH/index.ts"
ssh $SERVER $VERIFY_CMD

Write-Host "[4/5] Restarting Edge Functions..." -ForegroundColor Yellow
$RESTART_CMD = "cd $DOCKER_DIR && docker compose restart functions"
ssh $SERVER $RESTART_CMD

Write-Host "[5/5] Checking function status..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$STATUS_CMD = "docker logs supabase-edge-functions --tail 10"
ssh $SERVER $STATUS_CMD

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Test upload royalty from dashboard" -ForegroundColor White
Write-Host "2. Monitor logs: ssh $SERVER 'docker logs supabase-edge-functions -f'" -ForegroundColor White
Write-Host "3. Check if error 500 is fixed" -ForegroundColor White
Write-Host ""

# Ask if user wants to monitor logs
$monitor = Read-Host "Do you want to monitor logs now? (y/n)"
if ($monitor -eq "y") {
    Write-Host "Monitoring logs... (Press Ctrl+C to stop)" -ForegroundColor Yellow
    ssh $SERVER "docker logs supabase-edge-functions -f"
}
