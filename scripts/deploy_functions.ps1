# ============================================================
# EDGE FUNCTIONS DEPLOYMENT SCRIPT
# ============================================================
# Deploy all auth verification functions to Supabase
# Usage: .\deploy_functions.ps1 [staging|prod]

param(
    [string]$Environment = "staging"
)

Write-Host "`n"
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║           EDGE FUNCTIONS DEPLOYMENT                        ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`n"

Write-Host "Target Environment: $Environment" -ForegroundColor Yellow
Write-Host "`n"

# Check if supabase CLI is available
$supabaseExists = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseExists) {
    Write-Host "❌ ERROR: supabase CLI not found!" -ForegroundColor Red
    Write-Host "   Install: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Supabase CLI found" -ForegroundColor Green
Write-Host "`n"

# Functions to deploy
$functions = @(
    "send-password-reset",
    "verify-password-reset-token",
    "reset-password",
    "send-verification-email",
    "verify-email",
    "send-app-email"
)

Write-Host "Functions to deploy: $($functions.Count)" -ForegroundColor Yellow
foreach ($func in $functions) {
    Write-Host "  • $func" -ForegroundColor White
}
Write-Host "`n"

# Confirm
$confirm = Read-Host "Deploy to $Environment? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit 0
}

Write-Host "`n"
Write-Host "🚀 Starting deployment..." -ForegroundColor Green
Write-Host "`n"

$success = 0
$failed = 0

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Cyan
    
    $cmd = "supabase functions deploy $func --project-ref $Environment"
    
    try {
        Invoke-Expression $cmd
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $func deployed successfully" -ForegroundColor Green
            $success++
        } else {
            Write-Host "❌ $func deployment failed" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "❌ $func deployment error: $_" -ForegroundColor Red
        $failed++
    }
    
    Write-Host "`n"
}

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║              DEPLOYMENT SUMMARY                            ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`n"
Write-Host "  Environment: $Environment" -ForegroundColor White
Write-Host "  Successful: $success" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor Red
Write-Host "`n"

if ($failed -eq 0) {
    Write-Host "✅ All functions deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some functions failed to deploy. Check errors above." -ForegroundColor Yellow
}

Write-Host "`n"
