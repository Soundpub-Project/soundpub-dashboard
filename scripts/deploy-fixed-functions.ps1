# Deploy Fixed Edge Functions
# Run this script after fixing timeout issues

Write-Host "=== Deploying Fixed Edge Functions ===" -ForegroundColor Green
Write-Host ""

$functions = @(
    "send-password-reset",
    "reset-password", 
    "send-verification-email",
    "xendit-webhook"
)

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Yellow
    supabase functions deploy $func
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $func deployed successfully" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $func deployment failed" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Monitor the functions at:" -ForegroundColor Yellow
Write-Host "https://supabase.com/dashboard/project/opkvvdgnhhopkkeaokzo/functions" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs with:" -ForegroundColor Yellow
Write-Host "supabase functions logs <function-name>" -ForegroundColor Gray
