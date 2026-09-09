# Test Webhook Endpoint Accessibility
# Usage: .\scripts\xendit\test-webhook-endpoint.ps1 -WebhookUrl "https://api.yourdomain.com/functions/v1/xendit-webhook"

param(
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "https://api.yourdomain.com/functions/v1/xendit-webhook",
    
    [Parameter(Mandatory=$false)]
    [string]$Token = "O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn"
)

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Webhook Endpoint Test" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Testing: $WebhookUrl" -ForegroundColor White
Write-Host ""

# Test 1: OPTIONS request (CORS preflight)
Write-Host "[1/4] Testing CORS preflight (OPTIONS)..." -ForegroundColor Yellow
try {
    $optionsResponse = Invoke-WebRequest -Uri $WebhookUrl -Method Options -UseBasicParsing
    Write-Host "  ✅ OPTIONS request successful" -ForegroundColor Green
    Write-Host "  Status: $($optionsResponse.StatusCode)" -ForegroundColor Gray
    
    if ($optionsResponse.Headers.'Access-Control-Allow-Origin') {
        Write-Host "  CORS Enabled: $($optionsResponse.Headers.'Access-Control-Allow-Origin')" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  OPTIONS request failed" -ForegroundColor Yellow
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""

# Test 2: POST without token (should fail with 403)
Write-Host "[2/4] Testing POST without token (expect 403)..." -ForegroundColor Yellow
try {
    $body = @{ id = "test-invoice"; status = "PAID" } | ConvertTo-Json
    $headers = @{ "Content-Type" = "application/json" }
    
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method Post -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  ⚠️  Unexpected success (token validation might be disabled)" -ForegroundColor Yellow
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host "  ✅ Correct behavior: 403 Forbidden" -ForegroundColor Green
        Write-Host "  Token validation is working" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  Unexpected error: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

Write-Host ""

# Test 3: POST with valid token but fake invoice (should fail with 404)
Write-Host "[3/4] Testing POST with token + fake invoice (expect 404)..." -ForegroundColor Yellow
try {
    $body = @{ id = "fake-test-invoice-$(Get-Random)"; status = "PAID" } | ConvertTo-Json
    $headers = @{
        "Content-Type" = "application/json"
        "x-callback-token" = $Token
    }
    
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method Post -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  ⚠️  Unexpected success" -ForegroundColor Yellow
    Write-Host "  Response: $($response.Content)" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "  ✅ Correct behavior: 404 Not Found" -ForegroundColor Green
        Write-Host "  Webhook is accessible and processing requests" -ForegroundColor Gray
    } elseif ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "  ✅ Webhook accessible (400 = validation error)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Unexpected error: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "  Response: $responseBody" -ForegroundColor Gray
        }
    }
}

Write-Host ""

# Test 4: DNS and connectivity
Write-Host "[4/4] Testing DNS resolution..." -ForegroundColor Yellow
try {
    $uri = [System.Uri]$WebhookUrl
    $hostname = $uri.Host
    
    $dnsResult = Resolve-DnsName -Name $hostname -ErrorAction Stop
    Write-Host "  ✅ DNS resolved successfully" -ForegroundColor Green
    Write-Host "  Host: $hostname" -ForegroundColor Gray
    $dnsResult | Where-Object { $_.Type -eq 'A' } | ForEach-Object {
        Write-Host "  IP: $($_.IPAddress)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ DNS resolution failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If all tests passed, webhook endpoint is:" -ForegroundColor White
Write-Host "  ✅ Accessible from internet" -ForegroundColor Green
Write-Host "  ✅ Token validation working" -ForegroundColor Green
Write-Host "  ✅ Ready to receive webhooks" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Register this URL in Xendit Dashboard" -ForegroundColor White
Write-Host "  2. Add custom header: x-callback-token" -ForegroundColor White
Write-Host "  3. Enable events: invoice.paid, invoice.expired" -ForegroundColor White
Write-Host ""
