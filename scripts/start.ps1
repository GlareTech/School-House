$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env'; Write-Host 'Created .env. Set passwords and your LAN origin, then run this script again.'; exit 1 }
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Inspect docker compose logs.' }
docker compose ps
Write-Host 'Open the configured server address (default http://localhost:8080).'
