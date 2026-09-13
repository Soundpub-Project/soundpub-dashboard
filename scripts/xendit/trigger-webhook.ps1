# Xendit Webhook Manual Trigger Script
# Usage: .\scripts\xendit\trigger-webhook.ps1 -InvoiceId "your-invoice-id"

param(
    [Parameter(Mandatory=$true, HelpMessage="Xendit Invoice ID")]
    [string]$InvoiceId,
    
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "https://api.yourdomain.com/functions/v1/xendit-webhook",
    
    [Parameter(Mandatory=$false)]
    [string]$Token = "O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("PAID", "EXPIRED", "FAILED")]
    [string]$Status = "PAID"
)

$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"

$body = @{
    id = $InvoiceId
    status = $Status
    paid_at = $timestamp
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-callback-token" = $Token
}

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Xendit Webhook Manual Trigger" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Invoice ID : $InvoiceId" -ForegroundColor White
Write-Host "Status     : $Status" -ForegroundColor White
Write-Host "Timestamp  : $timestamp" -ForegroundColor White
Write-Host "Webhook URL: $WebhookUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "Sending request..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method Post -Headers $headers -Body $body -UseBasicParsing
    
    Write-Host ""
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR!" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        
        Write-Host ""
        Write-Host "Response Body:" -ForegroundColor Yellow
        try {
            $responseBody | ConvertFrom-Json | ConvertTo-Json -Depth 5
        } catch {
            Write-Host $responseBody
        }
        
        Write-Host ""
        Write-Host "Possible issues:" -ForegroundColor Cyan
        switch ($statusCode) {
            403 { Write-Host "- Invalid x-callback-token header" -ForegroundColor Yellow }
            404 { Write-Host "- Payment record not found in database" -ForegroundColor Yellow }
            500 { Write-Host "- Server error, check Edge Function logs" -ForegroundColor Yellow }
            default { Write-Host "- Check webhook configuration" -ForegroundColor Yellow }
        }
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible issues:" -ForegroundColor Cyan
        Write-Host "- Webhook URL not accessible" -ForegroundColor Yellow
        Write-Host "- Network/firewall blocking request" -ForegroundColor Yellow
        Write-Host "- DNS not resolving" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
