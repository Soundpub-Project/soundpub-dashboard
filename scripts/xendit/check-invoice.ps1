# Check Xendit Invoice Status
# Usage: .\scripts\xendit\check-invoice.ps1 -InvoiceId "your-invoice-id" -SecretKey "xnd_..."

param(
    [Parameter(Mandatory=$true)]
    [string]$InvoiceId,
    
    [Parameter(Mandatory=$true)]
    [string]$SecretKey
)

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$SecretKey:"))

$headers = @{
    "Authorization" = "Basic $auth"
}

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Xendit Invoice Status Check" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Invoice ID: $InvoiceId" -ForegroundColor White
Write-Host "Fetching from Xendit API..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://api.xendit.co/v2/invoices/$InvoiceId" -Headers $headers -Method Get
    
    Write-Host "✅ Invoice Found!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status     : " -NoNewline -ForegroundColor Cyan
    
    switch ($response.status) {
        "PENDING" { Write-Host "PENDING ⏳" -ForegroundColor Yellow }
        "PAID"    { Write-Host "PAID ✅" -ForegroundColor Green }
        "EXPIRED" { Write-Host "EXPIRED ⌛" -ForegroundColor Red }
        "FAILED"  { Write-Host "FAILED ❌" -ForegroundColor Red }
        default   { Write-Host $response.status -ForegroundColor White }
    }
    
    Write-Host "Amount     : " -NoNewline -ForegroundColor Cyan
    Write-Host "$($response.currency) $($response.amount)" -ForegroundColor White
    
    Write-Host "Description: " -NoNewline -ForegroundColor Cyan
    Write-Host $response.description -ForegroundColor White
    
    Write-Host "Created    : " -NoNewline -ForegroundColor Cyan
    Write-Host $response.created -ForegroundColor White
    
    if ($response.paid_at) {
        Write-Host "Paid At    : " -NoNewline -ForegroundColor Cyan
        Write-Host $response.paid_at -ForegroundColor Green
    }
    
    if ($response.invoice_url) {
        Write-Host "Invoice URL: " -NoNewline -ForegroundColor Cyan
        Write-Host $response.invoice_url -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Payer Email: " -NoNewline -ForegroundColor Cyan
    Write-Host $response.payer_email -ForegroundColor White
    
    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "Full JSON Response:" -ForegroundColor Gray
    Write-Host "===========================================" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error: $responseBody" -ForegroundColor Yellow
        
        Write-Host ""
        Write-Host "Possible issues:" -ForegroundColor Cyan
        switch ($statusCode) {
            401 { Write-Host "- Invalid Xendit Secret Key" -ForegroundColor Yellow }
            404 { Write-Host "- Invoice ID not found in Xendit" -ForegroundColor Yellow }
            default { Write-Host "- Check Xendit API documentation" -ForegroundColor Yellow }
        }
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
