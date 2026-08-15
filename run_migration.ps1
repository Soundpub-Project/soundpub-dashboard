# ============================================================
# MIGRATION RUNNER SCRIPT (PowerShell)
# ============================================================
# Quick script to run migration and verification
# Usage: .\run_migration.ps1

param(
    [string]$Host = "supabase.carubra.com",
    [string]$User = "postgres",
    [string]$Database = "soundpub"
)

Write-Host "`n"
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║              DATABASE MIGRATION RUNNER                     ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`n"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Host: $Host" -ForegroundColor White
Write-Host "  User: $User" -ForegroundColor White
Write-Host "  Database: $Database" -ForegroundColor White
Write-Host "`n"

# Check if psql is available
$psqlExists = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlExists) {
    Write-Host "❌ ERROR: psql command not found!" -ForegroundColor Red
    Write-Host "   Please install PostgreSQL client tools" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ psql command found" -ForegroundColor Green
Write-Host "`n"

# Confirm before running
Write-Host "⚠️  WARNING: This will modify the database structure!" -ForegroundColor Red
Write-Host "`n"
$confirm = Read-Host "Have you completed the backup? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "❌ Migration cancelled. Please backup first!" -ForegroundColor Red
    exit 0
}

Write-Host "`n"
Write-Host "🚀 Running migration..." -ForegroundColor Yellow
Write-Host "`n"

# Run migration
$migrationFile = "migrations-complete\002_auth_verification_system.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ ERROR: Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Get-Content $migrationFile | psql -h $Host -U $User -d $Database

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n"
    Write-Host "✅ Migration completed!" -ForegroundColor Green
    Write-Host "`n"
    
    Write-Host "🔍 Running verification..." -ForegroundColor Yellow
    Write-Host "`n"
    
    # Run verification
    $verifyFile = "migrations-complete\verify_migration.sql"
    if (Test-Path $verifyFile) {
        Get-Content $verifyFile | psql -h $Host -U $User -d $Database
    } else {
        Write-Host "⚠️  Verification script not found. Skipping..." -ForegroundColor Yellow
    }
    
    Write-Host "`n"
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                                                            ║" -ForegroundColor Green
    Write-Host "║              MIGRATION SUCCESSFUL! ✅                      ║" -ForegroundColor Green
    Write-Host "║                                                            ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host "`n"
} else {
    Write-Host "`n"
    Write-Host "❌ Migration failed! Check errors above." -ForegroundColor Red
    Write-Host "`n"
    exit 1
}
