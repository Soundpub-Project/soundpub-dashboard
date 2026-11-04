param(
  [string]$Email = 'me@maskhar.id',
  [string]$FullName = 'Soundpub Administrator'
)

$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Parent $PSScriptRoot

function ConvertTo-PlainText([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$password = ConvertTo-PlainText (Read-Host 'Password baru (minimal 12 karakter)' -AsSecureString)
$confirmation = ConvertTo-PlainText (Read-Host 'Ulangi password baru' -AsSecureString)

try {
  if ($password.Length -lt 12) {
    throw 'Password minimal 12 karakter.'
  }
  if ($password -cne $confirmation) {
    throw 'Konfirmasi password tidak sama.'
  }

  $env:LOCAL_AUTH_EMAIL = $Email
  $env:LOCAL_AUTH_PASSWORD = $password
  $env:LOCAL_AUTH_BOOTSTRAP_ADMIN = 'true'
  $env:LOCAL_AUTH_FULL_NAME = $FullName

  Push-Location $backendDirectory
  try {
    docker compose -p dashboard-sounpub-dev run --rm --no-deps `
      -e LOCAL_AUTH_EMAIL `
      -e LOCAL_AUTH_PASSWORD `
      -e LOCAL_AUTH_BOOTSTRAP_ADMIN `
      -e LOCAL_AUTH_FULL_NAME `
      migrate node dist/src/local-auth/provision-cli.js
    if ($LASTEXITCODE -ne 0) {
      throw "Provisioning gagal dengan exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  $password = $null
  $confirmation = $null
  Remove-Item Env:LOCAL_AUTH_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_AUTH_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_AUTH_BOOTSTRAP_ADMIN -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_AUTH_FULL_NAME -ErrorAction SilentlyContinue
}
