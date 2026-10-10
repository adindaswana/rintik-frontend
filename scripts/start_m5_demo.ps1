param(
  [int]$BackendPort = 8140,
  [int]$FrontendPort = 4174,
  [string]$DatabasePath,
  [switch]$ResetState,
  [int]$TimeoutSeconds = 120
)

. (Join-Path $PSScriptRoot 'm5_common.ps1')
$paths = Get-RintikPaths
New-Item -ItemType Directory -Path $paths.QaRuntime, $paths.QaEvidence -Force | Out-Null
if (-not $DatabasePath) { $DatabasePath = $paths.Database }
$database = Assert-RintikRuntimePath -Path $DatabasePath -RuntimeRoot $paths.QaRuntime

if ($ResetState) {
  & (Join-Path $PSScriptRoot 'reset_m5_demo.ps1') -DatabasePath $database | Out-Host
}

if (Test-Path -LiteralPath $paths.ProcessFile) {
  $old = Get-Content -LiteralPath $paths.ProcessFile -Raw | ConvertFrom-Json
  if ($old.status -eq 'running') {
    $backendAlive = $old.backend -and (Get-Process -Id ([int]$old.backend.pid) -ErrorAction SilentlyContinue)
    $frontendAlive = $old.frontend -and (Get-Process -Id ([int]$old.frontend.pid) -ErrorAction SilentlyContinue)
    if ($backendAlive -or $frontendAlive) {
      throw "Tracked RINTIK demo processes are still running. Use stop_m5_demo.ps1 first; no process was replaced."
    }
  }
}

foreach ($port in @($BackendPort, $FrontendPort)) {
  if (-not (Test-RintikPortAvailable -Port $port)) {
    throw "Port $port is already in use. The launcher will not stop or replace the owning process."
  }
}

$python = (Get-Command python -ErrorAction Stop).Source
$node = (Get-Command node -ErrorAction Stop).Source
$preflightOutput = Join-Path $paths.QaEvidence 'preflight-before-start.json'
& $python (Join-Path $paths.Backend 'scripts\preflight_demo.py') --output $preflightOutput | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Preflight failed. Evidence: $preflightOutput" }

$backendOut = Join-Path $paths.QaRuntime 'm5-backend.stdout.log'
$backendErr = Join-Path $paths.QaRuntime 'm5-backend.stderr.log'
$frontendOut = Join-Path $paths.QaRuntime 'm5-frontend.stdout.log'
$frontendErr = Join-Path $paths.QaRuntime 'm5-frontend.stderr.log'
$started = @()
$originalDatabase = $env:RINTIK_DATABASE_PATH
$originalCors = $env:RINTIK_CORS_ORIGINS
$launchStarted = [DateTime]::UtcNow

try {
  $env:RINTIK_DATABASE_PATH = $database
  $env:RINTIK_CORS_ORIGINS = "http://127.0.0.1:$FrontendPort,http://localhost:$FrontendPort"
  $backend = Start-Process -FilePath $python `
    -ArgumentList "-m uvicorn app:app --host 127.0.0.1 --port $BackendPort" `
    -WorkingDirectory $paths.Backend -WindowStyle Hidden `
    -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -PassThru
  $started += $backend

  $backendReadyStarted = [DateTime]::UtcNow
  $health = Wait-RintikJson -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSeconds $TimeoutSeconds
  $backendReadySeconds = ([DateTime]::UtcNow - $backendReadyStarted).TotalSeconds
  if (-not $health.ready -or $health.source -ne 'real_original_pth' -or $health.simulation) {
    throw "Backend readiness is not the frozen real model: $($health | ConvertTo-Json -Compress)"
  }

  $frontend = Start-Process -FilePath $python `
    -ArgumentList "-m http.server $FrontendPort --bind 127.0.0.1" `
    -WorkingDirectory $paths.Frontend -WindowStyle Hidden `
    -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -PassThru
  $started += $frontend
  Wait-RintikHttp200 -Uri "http://127.0.0.1:$FrontendPort/dashboard.html" -TimeoutSeconds 30 | Out-Null

  $livePreflightOutput = Join-Path $paths.QaEvidence 'preflight-live.json'
  & $python (Join-Path $paths.Backend 'scripts\preflight_demo.py') `
    --database $database --api-url "http://127.0.0.1:$BackendPort" --output $livePreflightOutput | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Live preflight failed. Evidence: $livePreflightOutput" }

  $metadata = [ordered]@{
    status = 'running'
    started_at_utc = $launchStarted.ToString('o')
    backend_url = "http://127.0.0.1:$BackendPort"
    frontend_url = "http://127.0.0.1:$FrontendPort"
    database = $database
    python = $python
    node = $node
    network_required = $false
    backend_ready_seconds = [Math]::Round($backendReadySeconds, 3)
    total_start_seconds = [Math]::Round(([DateTime]::UtcNow - $launchStarted).TotalSeconds, 3)
    model_sha256 = $health.model_sha256
    state_sha256 = $health.state_sha256
    backend = [ordered]@{
      pid = $backend.Id
      started_at_utc = $backend.StartTime.ToUniversalTime().ToString('o')
      stdout = $backendOut
      stderr = $backendErr
    }
    frontend = [ordered]@{
      pid = $frontend.Id
      started_at_utc = $frontend.StartTime.ToUniversalTime().ToString('o')
      stdout = $frontendOut
      stderr = $frontendErr
    }
    preflight = $preflightOutput
    live_preflight = $livePreflightOutput
  }
  $metadata | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $paths.ProcessFile -Encoding utf8
  Write-Host 'RINTIK M5 demo is ready (real frozen model, local-only endpoints).'
  Write-Host "Dashboard: http://127.0.0.1:$FrontendPort/dashboard.html?api=http://127.0.0.1:$BackendPort"
  Write-Host "Backend readiness: $([Math]::Round($backendReadySeconds, 3)) s"
  Write-Host "Process metadata: $($paths.ProcessFile)"
} catch {
  foreach ($process in ($started | Sort-Object Id -Descending)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    }
  }
  $diagnostic = [ordered]@{
    status = 'failed'
    failed_at_utc = [DateTime]::UtcNow.ToString('o')
    error = $_.Exception.Message
    backend_stderr_tail = if (Test-Path -LiteralPath $backendErr) { @(Get-Content -LiteralPath $backendErr -Tail 40) } else { @() }
    frontend_stderr_tail = if (Test-Path -LiteralPath $frontendErr) { @(Get-Content -LiteralPath $frontendErr -Tail 40) } else { @() }
  }
  $diagnostic | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $paths.ProcessFile -Encoding utf8
  throw
} finally {
  $env:RINTIK_DATABASE_PATH = $originalDatabase
  $env:RINTIK_CORS_ORIGINS = $originalCors
}
