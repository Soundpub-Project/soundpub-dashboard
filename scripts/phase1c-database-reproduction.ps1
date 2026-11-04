$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$image = 'postgres:17.6-bookworm'
$expectedImageId = 'sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3'
$actualImageId = docker image inspect $image --format '{{.Id}}'
if ($LASTEXITCODE -ne 0 -or $actualImageId -cne $expectedImageId) { throw 'Expected verified PostgreSQL image is not installed' }
$image = $expectedImageId
$fingerprints = @()
$prerequisites = @'
CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE authenticator NOINHERIT;
CREATE ROLE supabase_auth_admin;
GRANT CREATE ON DATABASE postgres TO postgres;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
GRANT REFERENCES ON auth.users TO postgres;
'@
function Invoke-IsolatedSql([string]$Container, [string]$Sql, [string[]]$Options = @()) {
    $result = $Sql | docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U phase1c_bootstrap -d postgres @Options 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
    return $result
}
foreach ($run in 1..2) {
    $container = 'soundpub-phase1c-agentd-' + [guid]::NewGuid().ToString('N')
    try {
        docker run -d --name $container --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=phase1c_bootstrap -e POSTGRES_HOST_AUTH_METHOD=trust $image | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated PostgreSQL' }
        $ready = $false
        foreach ($attempt in 1..40) {
            docker exec $container pg_isready -U phase1c_bootstrap -d postgres 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw 'Isolated PostgreSQL readiness timeout' }
        Invoke-IsolatedSql $container $prerequisites | Out-Null
        $baseline = Get-Content -Raw -LiteralPath (Join-Path $repository 'docs/migration/CANONICAL_SCHEMA.sql')
        Invoke-IsolatedSql $container ("SET ROLE postgres;`n" + $baseline) @('--single-transaction') | Out-Null
        $assertions = Get-Content -Raw -LiteralPath (Join-Path $repository 'scripts/phase1b-definer-assertions.sql')
        $result = Invoke-IsolatedSql $container $assertions @('-v', 'enforce_security=false', '-At')
        $fingerprint = @($result | Where-Object { "$_" -match '^phase1b_soundpub_catalog_v1\|' })
        if ($fingerprint.Count -ne 1) { throw 'Expected exactly one catalog fingerprint' }
        $fingerprints += [string]$fingerprint[0]
        Write-Output "fresh_run_$run=$($fingerprint[0])"
        $storageTest = Get-Content -Raw -LiteralPath (Join-Path $repository 'scripts/phase1c-tenant-storage.test.sql')
        Invoke-IsolatedSql $container $storageTest | Out-Null
        $migration = Get-Content -Raw -LiteralPath (Join-Path $repository 'supabase/migrations/20261027013740_phase1c_restrict_maintenance_definers.sql')
        Invoke-IsolatedSql $container $migration | Out-Null
        $maintenanceTest = Get-Content -Raw -LiteralPath (Join-Path $repository 'scripts/phase1c-maintenance-definer.test.sql')
        Invoke-IsolatedSql $container $maintenanceTest | Out-Null
        Write-Output "fresh_run_$run maintenance assertions PASS; baseline private-media exposure reproduced"
        $rollback = @'
BEGIN;
ALTER FUNCTION soundpub.cleanup_expired_tokens() RESET search_path;
ALTER FUNCTION soundpub.cleanup_rate_limits() RESET search_path;
GRANT EXECUTE ON FUNCTION soundpub.cleanup_expired_tokens() TO PUBLIC, anon, authenticated;
COMMIT;
'@
        Invoke-IsolatedSql $container $rollback | Out-Null
        $restored = Invoke-IsolatedSql $container $assertions @('-v', 'enforce_security=false', '-At')
        $restoredFingerprint = @($restored | Where-Object { "$_" -match '^phase1b_soundpub_catalog_v1\|' })
        if ($restoredFingerprint.Count -ne 1 -or [string]$restoredFingerprint[0] -cne [string]$fingerprint[0]) {
            throw 'Maintenance rollback did not restore complete baseline fingerprint'
        }
        Write-Output "fresh_run_$run maintenance rollback catalog parity PASS"
    } finally {
        docker rm -f $container | Out-Null
    }
}
if ($fingerprints[0] -cne $fingerprints[1]) { throw 'Fresh baseline fingerprints differ' }
Write-Output 'Fresh application DDL fingerprints match. Full platform reproduction remains unverified.'
