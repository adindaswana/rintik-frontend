. (Join-Path $PSScriptRoot 'm5_common.ps1')
$paths = Get-RintikPaths

if (-not (Test-Path -LiteralPath $paths.ProcessFile)) {
  Write-Host 'RINTIK M5 demo services are already stopped (no process metadata).'
  exit 0
}

$metadata = Get-Content -LiteralPath $paths.ProcessFile -Raw | ConvertFrom-Json
$results = @()
foreach ($item in @(
  [PSCustomObject]@{ entry=$metadata.frontend; label='frontend' },
  [PSCustomObject]@{ entry=$metadata.backend; label='backend' }
)) {
  if ($item.entry) {
    $results += Stop-RintikTrackedProcess -Entry $item.entry -Label $item.label
  }
}

$metadata | Add-Member -NotePropertyName status -NotePropertyValue 'stopped' -Force
$metadata | Add-Member -NotePropertyName stopped_at_utc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$metadata | Add-Member -NotePropertyName stop_results -NotePropertyValue $results -Force
$metadata | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $paths.ProcessFile -Encoding utf8

Write-Host 'RINTIK M5 demo services stopped. Only launcher-owned PIDs were targeted.'
$results | Format-Table -AutoSize
