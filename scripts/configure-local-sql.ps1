$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$tcpPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib\Tcp'
$connection = New-Object System.Data.SqlClient.SqlConnection 'Server=.\SQLEXPRESS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True'
try {
  $connection.Open()
  $cmd = $connection.CreateCommand()
  $cmd.CommandText = 'SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process=1 AND session_id<>@@SPID AND open_transaction_count>0'
  if ([int]$cmd.ExecuteScalar() -gt 0) { throw 'An existing SQL session has an open transaction. Close it before restarting SQL Express.' }
} finally { $connection.Dispose() }
$current = Get-ItemProperty -LiteralPath $tcpPath
if ($current.Enabled -eq 0) {
  $portInUse = Get-NetTCPConnection -LocalPort 14333 -State Listen -ErrorAction SilentlyContinue
  if ($portInUse) { throw 'Port 14333 is already in use; no networking changes made.' }
  New-Item -ItemType Directory -Force -Path (Join-Path $projectPath 'local') | Out-Null
  & reg.exe export 'HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.SQLEXPRESS\MSSQLServer\SuperSocketNetLib\Tcp' (Join-Path $projectPath 'local/sql-tcp-before.reg') /y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not back up SQL network settings' }
  Set-ItemProperty -LiteralPath $tcpPath -Name ListenOnAllIPs -Value 0
  foreach ($entry in Get-ChildItem -LiteralPath $tcpPath) {
    if ($entry.PSChildName -eq 'IPAll') { continue }
    $values = Get-ItemProperty -LiteralPath $entry.PSPath
    $enableLoopback = [int]($values.IPAddress -eq '127.0.0.1')
    Set-ItemProperty -LiteralPath $entry.PSPath -Name Enabled -Value $enableLoopback
    if ($enableLoopback) {
      Set-ItemProperty -LiteralPath $entry.PSPath -Name TcpDynamicPorts -Value ''
      Set-ItemProperty -LiteralPath $entry.PSPath -Name TcpPort -Value '14333'
    }
  }
  Set-ItemProperty -LiteralPath $tcpPath -Name Enabled -Value 1
  Restart-Service -Name 'MSSQL$SQLEXPRESS' -Force
  (Get-Service -Name 'MSSQL$SQLEXPRESS').WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
}
$connection = New-Object System.Data.SqlClient.SqlConnection 'Server=tcp:127.0.0.1,14333;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Connection Timeout=15'
try {
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    try { $connection.Open(); break } catch { if ($attempt -eq 5) { throw }; Start-Sleep -Seconds 2 }
  }
  $cmd=$connection.CreateCommand()
  $cmd.CommandText = "IF DB_ID(N'Schoolhouse') IS NULL CREATE DATABASE [Schoolhouse]"
  $cmd.ExecuteNonQuery() | Out-Null
  Write-Host 'Schoolhouse database ready on localhost:14333. Existing databases were not changed.'
} finally { $connection.Dispose() }
