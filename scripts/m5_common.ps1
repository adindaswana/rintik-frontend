Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RintikPaths {
  $frontend = Split-Path -Parent $PSScriptRoot
  $prototype = Split-Path -Parent $frontend
  $backend = Join-Path $prototype 'rintik-backend'
  $workspace = Split-Path -Parent $prototype
  $qaRuntime = Join-Path $prototype 'qa\runtime'
  $qaEvidence = Join-Path $prototype 'qa\evidence\m5-final-readiness'
  [PSCustomObject]@{
    Frontend = $frontend
    Backend = $backend
    Prototype = $prototype
    Workspace = $workspace
    QaRuntime = $qaRuntime
    QaEvidence = $qaEvidence
    ProcessFile = (Join-Path $qaRuntime 'm5-demo-processes.json')
    Database = (Join-Path $qaRuntime 'm5-demo.sqlite3')
  }
}

function Test-RintikPortAvailable {
  param([Parameter(Mandatory=$true)][int]$Port)
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
  try {
    $listener.Start()
    return $true
  } catch [System.Net.Sockets.SocketException] {
    return $false
  } finally {
    try { $listener.Stop() } catch {}
  }
}

function Wait-RintikJson {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][int]$TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 3
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 300
    }
  }
  throw "Timed out waiting for $Uri. Last error: $lastError"
}

function Wait-RintikHttp200 {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][int]$TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3
      if ($response.StatusCode -eq 200) { return $response }
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 250
    }
  }
  throw "Timed out waiting for $Uri. Last error: $lastError"
}

function Stop-RintikTrackedProcess {
  param(
    [Parameter(Mandatory=$true)]$Entry,
    [Parameter(Mandatory=$true)][string]$Label
  )
  $pidValue = [int]$Entry.pid
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if (-not $process) {
    return [PSCustomObject]@{ name=$Label; pid=$pidValue; status='already_stopped' }
  }
  $actualStart = $process.StartTime.ToUniversalTime().ToString('o')
  $expectedStart = [DateTime]::Parse([string]$Entry.started_at_utc).ToUniversalTime()
  if ([Math]::Abs(($process.StartTime.ToUniversalTime() - $expectedStart).TotalSeconds) -gt 2) {
    throw "Refusing to stop PID $pidValue for $Label because its start time no longer matches the RINTIK metadata."
  }
  Stop-Process -Id $pidValue
  $process.WaitForExit(10000) | Out-Null
  return [PSCustomObject]@{ name=$Label; pid=$pidValue; status='stopped'; observed_start_utc=$actualStart }
}

function Assert-RintikRuntimePath {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$RuntimeRoot
  )
  $fullPath = [IO.Path]::GetFullPath($Path)
  $fullRoot = [IO.Path]::GetFullPath($RuntimeRoot).TrimEnd('\') + '\'
  if (-not $fullPath.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing runtime mutation outside $fullRoot (received $fullPath)."
  }
  return $fullPath
}
