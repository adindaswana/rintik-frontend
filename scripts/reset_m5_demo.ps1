param(
  [string]$DatabasePath
)

. (Join-Path $PSScriptRoot 'm5_common.ps1')
$paths = Get-RintikPaths
New-Item -ItemType Directory -Path $paths.QaRuntime -Force | Out-Null

if (-not $DatabasePath) { $DatabasePath = $paths.Database }
$database = Assert-RintikRuntimePath -Path $DatabasePath -RuntimeRoot $paths.QaRuntime

if (Test-Path -LiteralPath $paths.ProcessFile) {
  $metadata = Get-Content -LiteralPath $paths.ProcessFile -Raw | ConvertFrom-Json
  if ($metadata.status -eq 'running') {
    foreach ($entry in @($metadata.backend, $metadata.frontend)) {
      if ($entry -and (Get-Process -Id ([int]$entry.pid) -ErrorAction SilentlyContinue)) {
        throw 'RINTIK demo services are still running. Stop them before resetting the isolated M5 database.'
      }
    }
  }
}

$removed = @()
foreach ($candidate in @($database, "$database-wal", "$database-shm")) {
  $safeCandidate = Assert-RintikRuntimePath -Path $candidate -RuntimeRoot $paths.QaRuntime
  if (Test-Path -LiteralPath $safeCandidate) {
    Remove-Item -LiteralPath $safeCandidate -Force
    $removed += $safeCandidate
  }
}

[PSCustomObject]@{
  status = 'PASS'
  database = $database
  removed = $removed
  recoverable = $false
  note = 'Only the isolated M5 demo database and its SQLite sidecars are reset; official inputs and model artifacts are untouched.'
} | ConvertTo-Json -Depth 4
