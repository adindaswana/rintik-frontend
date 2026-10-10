param(
  [int]$BackendPort = 8140,
  [int]$FrontendPort = 4174,
  [int]$CdpPort = 9223
)

. (Join-Path $PSScriptRoot 'm5_common.ps1')
$paths = Get-RintikPaths
New-Item -ItemType Directory -Path $paths.QaEvidence, $paths.QaRuntime -Force | Out-Null
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = Join-Path $paths.QaEvidence $runId
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$transcript = Join-Path $evidence 'rehearsal-console.log'
$startedServices = $false

Start-Transcript -LiteralPath $transcript -Force | Out-Null
try {
  if (Test-Path -LiteralPath $paths.ProcessFile) {
    $old = Get-Content -LiteralPath $paths.ProcessFile -Raw | ConvertFrom-Json
    if ($old.status -eq 'running') {
      & (Join-Path $PSScriptRoot 'stop_m5_demo.ps1')
    }
  }
  & (Join-Path $PSScriptRoot 'reset_m5_demo.ps1') -DatabasePath $paths.Database | Out-Host

  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/version" -TimeoutSec 3 | Out-Null
  } catch {
    & (Join-Path $PSScriptRoot 'start_m4_qa_browser.ps1') -Port $CdpPort
  }

  & (Join-Path $PSScriptRoot 'start_m5_demo.ps1') `
    -BackendPort $BackendPort -FrontendPort $FrontendPort -DatabasePath $paths.Database
  $startedServices = $true

  $env:RINTIK_FRONTEND_URL = "http://127.0.0.1:$FrontendPort"
  $env:RINTIK_API_URL = "http://127.0.0.1:$BackendPort"
  $env:RINTIK_CDP_URL = "http://127.0.0.1:$CdpPort"
  $env:RINTIK_M5_EVIDENCE_DIR = $evidence
  & node (Join-Path $PSScriptRoot 'm5_demo_rehearsal.js')
  if ($LASTEXITCODE -ne 0) { throw "M5 browser rehearsal failed. Evidence: $evidence" }

  $evidence | Set-Content -LiteralPath (Join-Path $paths.QaEvidence 'LATEST.txt') -Encoding utf8
  Write-Host "M5 rehearsal PASS. Evidence: $evidence"
} finally {
  $env:RINTIK_FRONTEND_URL = $null
  $env:RINTIK_API_URL = $null
  $env:RINTIK_CDP_URL = $null
  $env:RINTIK_M5_EVIDENCE_DIR = $null
  if ($startedServices) {
    & (Join-Path $PSScriptRoot 'stop_m5_demo.ps1')
  }
  Stop-Transcript | Out-Null
  $finalManifestPath = Join-Path $evidence 'm5-evidence-manifest.json'
  $artifacts = Get-ChildItem -LiteralPath $evidence -File |
    Where-Object { $_.FullName -ne $finalManifestPath } |
    Sort-Object Name |
    ForEach-Object {
      [PSCustomObject]@{
        file = $_.Name
        bytes = $_.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
      }
    }
  [ordered]@{
    generated_at_utc = [DateTime]::UtcNow.ToString('o')
    label = 'RECORDED DEMO EVIDENCE - synthetic faults are illustrative, not field validation'
    artifacts = @($artifacts)
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $finalManifestPath -Encoding utf8
}
