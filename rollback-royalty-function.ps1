# Rollback Process Royalty Upload Function
# Usage: .\rollback-royalty-function.ps1

$SERVER = "maskhar@20.20.20.173"
$REMOTE_PATH = "/home/maskhar/docker/supabase/supabase/docker/volumes/functions/process-royalty-upload"
$DOCKER_DIR = "/home/maskhar/docker/supabase/supabase/docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Rollback Process Royalty Upload Function" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# List available backups
Write-Host "Checking available backups..." -ForegroundColor Yellow
$LIST_CMD = "ls -lh $REMOTE_PATH/*.backup.* 2>/dev/null | tail -5 || echo 'No backups found'"
ssh $SERVER $LIST_CMD

Write-Host ""
$backup = Read-Host "Enter backup filename (e.g., index.ts.backup.20260727_211430) or 'cancel'"

if ($backup -eq "cancel" -or $backup -eq "") {
    Write-Host "Rollback cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host "[1/3] Restoring backup: $backup..." -ForegroundColor Yellow
$RESTORE_CMD = "cd $REMOTE_PATH && cp $backup index.ts"
ssh $SERVER $RESTORE_CMD

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Restore failed" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Restarting Edge Functions..." -ForegroundColor Yellow
$RESTART_CMD = "cd $DOCKER_DIR && docker compose restart functions"
ssh $SERVER $RESTART_CMD

Write-Host "[3/3] Checking function status..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$STATUS_CMD = "docker logs supabase-edge-functions --tail 10"
ssh $SERVER $STATUS_CMD

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Rollback Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
