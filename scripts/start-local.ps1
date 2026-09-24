$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) { throw 'Run the local SQL setup first.' }
New-Item -ItemType Directory -Force -Path local | Out-Null
$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($existing) { Write-Host 'Port 3000 is already listening; inspect the running app before starting another copy.'; exit 0 }
Start-Process -FilePath 'node.exe' -WindowStyle Hidden -ArgumentList 'backend/src/server.js' -WorkingDirectory (Get-Location).Path -RedirectStandardOutput 'local/api.log' -RedirectStandardError 'local/api-error.log'
Start-Process -FilePath 'node.exe' -WindowStyle Hidden -ArgumentList 'backend/src/worker.js' -WorkingDirectory (Get-Location).Path -RedirectStandardOutput 'local/worker.log' -RedirectStandardError 'local/worker-error.log'
Write-Host 'API and worker started. Preview the frontend at http://127.0.0.1:4173 after running npm run preview -w frontend -- --port 4173.'
$preview = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if (-not $preview) {
  Start-Process -FilePath 'npm.cmd' -WindowStyle Hidden -ArgumentList @('run','preview','-w','frontend','--','--port','4173','--host','127.0.0.1') -WorkingDirectory (Get-Location).Path -RedirectStandardOutput 'local/frontend.log' -RedirectStandardError 'local/frontend-error.log'
  Write-Host 'Frontend preview started at http://127.0.0.1:4173.'
}
