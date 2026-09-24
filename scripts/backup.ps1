$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force -Path backups | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupName = "school-$stamp.dump"
$uploadName = "school-$stamp-uploads.zip"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/school-backup.dump'
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed' }
docker compose cp db:/tmp/school-backup.dump "backups/$backupName"
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed' }
$uploadRoot = Join-Path (Get-Location) 'data\uploads'
New-Item -ItemType Directory -Force -Path $uploadRoot | Out-Null
Compress-Archive -LiteralPath $uploadRoot -DestinationPath "backups/$uploadName" -CompressionLevel Optimal -Force
Write-Host "Backup saved: backups/$backupName and backups/$uploadName. Keep both together in protected off-server storage."
