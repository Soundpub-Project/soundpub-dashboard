# Script Helper untuk Debug dan Manual Trigger Webhook Xendit

## 1. Query untuk cek payment yang belum ter-process

```sql
-- Cari payment yang sudah dibayar tapi status masih pending
SELECT 
  rp.id,
  rp.xendit_invoice_id,
  rp.status,
  rp.amount,
  rp.created_at,
  r.title as release_title,
  r.status as release_status,
  p.email as user_email
FROM release_payments rp
JOIN releases r ON r.id = rp.release_id
JOIN profiles p ON p.id = rp.user_id
WHERE rp.status = 'pending'
ORDER BY rp.created_at DESC
LIMIT 10;
```

## 2. PowerShell Script untuk Manual Trigger Webhook

Simpan sebagai `trigger-webhook.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$InvoiceId,
    
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "https://api.yourdomain.com/functions/v1/xendit-webhook",
    
    [Parameter(Mandatory=$false)]
    [string]$Token = "O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn",
    
    [Parameter(Mandatory=$false)]
    [string]$Status = "PAID"
)

$body = @{
    id = $InvoiceId
    status = $Status
    paid_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-callback-token" = $Token
}

Write-Host "Triggering webhook for invoice: $InvoiceId" -ForegroundColor Cyan
Write-Host "URL: $WebhookUrl" -ForegroundColor Gray
Write-Host "Payload: $body" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $WebhookUrl -Method Post -Headers $headers -Body $body
    Write-Host "
Success!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor White
} catch {
    Write-Host "
Error!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Yellow
    }
}
```

**Cara pakai**:
```powershell
# Trigger single invoice
.\trigger-webhook.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc"

# Trigger dengan custom URL (untuk testing local)
.\trigger-webhook.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc" -WebhookUrl "http://localhost:54321/functions/v1/xendit-webhook"

# Trigger dengan status EXPIRED
.\trigger-webhook.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc" -Status "EXPIRED"
```

## 3. Bash Script untuk Manual Trigger (di server)

Simpan sebagai `trigger-webhook.sh`:

```bash
#!/bin/bash

INVOICE_ID="$1"
WEBHOOK_URL="${2:-https://api.yourdomain.com/functions/v1/xendit-webhook}"
TOKEN="${3:-O5BcVNSpFouYSTIjwaKAEr8fd4t9DravtWr2tA9nq50Efnsn}"
STATUS="${4:-PAID}"

if [ -z "$INVOICE_ID" ]; then
  echo "Usage: $0 <invoice_id> [webhook_url] [token] [status]"
  exit 1
fi

PAID_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Triggering webhook for invoice: $INVOICE_ID"
echo "URL: $WEBHOOK_URL"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $TOKEN" \
  -d "{\"id\":\"$INVOICE_ID\",\"status\":\"$STATUS\",\"paid_at\":\"$PAID_AT\"}" \
  -v

echo ""
```

**Cara pakai**:
```bash
chmod +x trigger-webhook.sh
./trigger-webhook.sh "64f2b8d59f2d4c0017123abc"
```

## 4. Test Webhook Endpoint Accessibility

```powershell
# Test apakah endpoint bisa diakses
$webhookUrl = "https://api.yourdomain.com/functions/v1/xendit-webhook"

try {
    $response = Invoke-WebRequest -Uri $webhookUrl -Method Options
    Write-Host "Endpoint accessible!" -ForegroundColor Green
    Write-Host "CORS Headers:" -ForegroundColor Cyan
    $response.Headers | Format-Table
} catch {
    Write-Host "Endpoint NOT accessible!" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
```

## 5. Check Xendit Invoice Status via API

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$InvoiceId,
    
    [Parameter(Mandatory=$true)]
    [string]$XenditSecretKey
)

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$XenditSecretKey:"))

$headers = @{
    "Authorization" = "Basic $auth"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.xendit.co/v2/invoices/$InvoiceId" -Headers $headers
    
    Write-Host "Invoice Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "Amount: $($response.amount)" -ForegroundColor White
    Write-Host "Currency: $($response.currency)" -ForegroundColor White
    Write-Host "Created: $($response.created)" -ForegroundColor White
    
    if ($response.status -eq "PAID") {
        Write-Host "Paid At: $($response.paid_at)" -ForegroundColor Green
    }
    
    Write-Host "
Full Response:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "Error checking invoice!" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
```

**Cara pakai**:
```powershell
.\scripts/xendit/check-invoice.ps1 -InvoiceId "64f2b8d59f2d4c0017123abc" -XenditSecretKey "xnd_..."
```

## 6. Batch Process untuk Multiple Invoices

```powershell
# Get list of pending invoices from database, then trigger webhooks
param(
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "https://api.yourdomain.com/functions/v1/xendit-webhook"
)

# Assume you have CSV with invoice IDs
# Format: xendit_invoice_id
# 64f2b8d59f2d4c0017123abc
# 64f2b8d59f2d4c0017123def

$invoices = Import-Csv -Path "pending_invoices.csv"

foreach ($invoice in $invoices) {
    Write-Host "
Processing: $($invoice.xendit_invoice_id)" -ForegroundColor Yellow
    
    .\trigger-webhook.ps1 -InvoiceId $invoice.xendit_invoice_id -WebhookUrl $WebhookUrl
    
    Start-Sleep -Seconds 2  # Rate limiting
}

Write-Host "

Done processing $($invoices.Count) invoices" -ForegroundColor Green
```

## 7. Export Pending Invoices ke CSV (SQL)

```sql
-- Run this query and export to CSV
COPY (
  SELECT 
    rp.xendit_invoice_id,
    rp.amount,
    rp.created_at,
    r.title as release_title,
    p.email as user_email
  FROM release_payments rp
  JOIN releases r ON r.id = rp.release_id
  JOIN profiles p ON p.id = rp.user_id
  WHERE rp.status = 'pending'
    AND rp.xendit_invoice_id IS NOT NULL
  ORDER BY rp.created_at DESC
) TO '/tmp/pending_invoices.csv' CSV HEADER;
```

Atau via psql:
```bash
psql -h localhost -U postgres -d soundpub -c "\COPY (SELECT xendit_invoice_id FROM release_payments WHERE status='pending' AND xendit_invoice_id IS NOT NULL) TO 'pending_invoices.csv' CSV HEADER"
```
