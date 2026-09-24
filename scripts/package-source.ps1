$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$projectRoot = (Resolve-Path '.').Path
$excludedDirectories = @('node_modules', 'outputs', 'data', 'backups', '.git', 'dist', 'coverage', '.vite', 'local')

function Get-SourceFiles {
  Get-ChildItem -LiteralPath $projectRoot -Recurse -File |
    Where-Object {
      $relative = $_.FullName.Substring($projectRoot.Length + 1)
      $parts = $relative -split '[\\/]'
      $_.Name -ne '.env' -and -not ($parts | Where-Object { $excludedDirectories -contains $_ })
    } |
    Sort-Object { $_.FullName.Substring($projectRoot.Length + 1) }
}

$utf8 = New-Object Text.UTF8Encoding($false)
$treePath = Join-Path $projectRoot 'docs\FILE-TREE.txt'
$tree = Get-SourceFiles | ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1) }
[IO.File]::WriteAllLines($treePath, $tree, $utf8)

$manifestPath = Join-Path $projectRoot 'docs\SOURCE-SHA256.txt'
$manifest = Get-SourceFiles |
  Where-Object { $_.FullName -ne $manifestPath } |
  ForEach-Object {
    $relative = $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
[IO.File]::WriteAllLines($manifestPath, $manifest, $utf8)

$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$outputRoot = Join-Path $projectRoot 'outputs'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$archivePath = Join-Path $outputRoot "hybrid-school-source-v$version.zip"
$resolvedOutput = (Resolve-Path -LiteralPath $outputRoot).Path
if (-not $archivePath.StartsWith($resolvedOutput + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Archive target must remain inside the project outputs directory.'
}
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in Get-SourceFiles) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $expected = @(Get-SourceFiles)
  if ($zip.Entries.Count -ne $expected.Count) { throw "Archive entry count does not match source file count." }
  foreach ($entry in $zip.Entries) {
    $sourcePath = Join-Path $projectRoot $entry.FullName.Replace('/', '\')
    $entryStream = $entry.Open()
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
      $archivedHash = ([BitConverter]::ToString($sha256.ComputeHash($entryStream))).Replace('-', '').ToLowerInvariant()
    } finally {
      $entryStream.Dispose()
      $sha256.Dispose()
    }
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash.ToLowerInvariant()
    if ($archivedHash -ne $sourceHash) {
      throw "Archive verification failed for $($entry.FullName)."
    }
  }
} finally {
  $zip.Dispose()
}

$archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$archivePath.sha256", "$archiveHash  $([IO.Path]::GetFileName($archivePath))`n", $utf8)
$archive = Get-Item -LiteralPath $archivePath
Write-Output "Archive: $($archive.FullName)"
Write-Output "Bytes: $($archive.Length)"
Write-Output "SHA-256: $archiveHash"
Write-Output "Files: $((Get-SourceFiles).Count)"
