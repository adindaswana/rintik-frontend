param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9223,

  [ValidateSet('Auto', 'Chrome', 'Edge')]
  [string]$BrowserPreference = 'Auto',

  [ValidateRange(5, 60)]
  [int]$TimeoutSeconds = 20,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$qaRoot = Join-Path $workspace 'qa'
$profileRoot = Join-Path $qaRoot 'browser-profiles'
$logRoot = Join-Path $qaRoot 'browser-launch'
$pidFile = Join-Path $qaRoot 'chrome-cdp.pid'
$endpointFile = Join-Path $qaRoot 'chrome-cdp-endpoint.txt'
$metadataFile = Join-Path $qaRoot $(if ($DryRun) { 'browser-launch-dry-run.json' } else { 'browser-launch.json' })

$candidates = @(
  [PSCustomObject]@{ Name = 'Chrome'; Path = 'C:\Program Files\Google\Chrome\Application\chrome.exe' },
  [PSCustomObject]@{ Name = 'Chrome'; Path = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' },
  [PSCustomObject]@{ Name = 'Edge'; Path = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' },
  [PSCustomObject]@{ Name = 'Edge'; Path = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
) | Where-Object {
  (Test-Path -LiteralPath $_.Path) -and
  ($BrowserPreference -eq 'Auto' -or $_.Name -eq $BrowserPreference)
}

if (-not $candidates) {
  throw "No installed browser matched BrowserPreference=$BrowserPreference."
}

function Get-CdpVersion {
  param([int]$CdpPort)
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/version" -TimeoutSec 1
    if ($version.Browser -and $version.webSocketDebuggerUrl) {
      return $version
    }
  } catch {
    return $null
  }
  return $null
}

function Quote-NativeArgument {
  param([string]$Value)
  if ($Value -notmatch '[\s"]') {
    return $Value
  }
  # Windows PowerShell 5.1 joins Start-Process ArgumentList values into one
  # command line and does not preserve quotes around values containing spaces.
  # Quote the complete switch token explicitly for CommandLineToArgvW.
  return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

New-Item -ItemType Directory -Path $profileRoot, $logRoot -Force | Out-Null

$existingCdp = Get-CdpVersion -CdpPort $Port
if ($existingCdp) {
  "http://127.0.0.1:$Port" | Set-Content -LiteralPath $endpointFile -Encoding ascii
  Write-Host "RINTIK QA browser already ready: $($existingCdp.Browser)"
  Write-Host "CDP endpoint: http://127.0.0.1:$Port"
  exit 0
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  throw "Port $Port is owned by PID $($listener.OwningProcess), but it is not a valid Chrome/Edge CDP endpoint. The launcher will not stop or replace that process."
}

$launchId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$attempts = @()

foreach ($candidate in $candidates) {
  $slug = $candidate.Name.ToLowerInvariant()
  $attemptId = "$launchId-$slug"
  $profile = Join-Path $profileRoot $attemptId
  $stdoutLog = Join-Path $logRoot "$attemptId.stdout.log"
  $stderrLog = Join-Path $logRoot "$attemptId.stderr.log"
  New-Item -ItemType Directory -Path $profile -Force | Out-Null

  $argumentTokens = @(
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profile",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--enable-logging=stderr',
    '--v=1',
    'about:blank'
  )
  $argumentString = ($argumentTokens | ForEach-Object { Quote-NativeArgument -Value $_ }) -join ' '
  $attempt = [ordered]@{
    browser = $candidate.Name
    executable = $candidate.Path
    profile = $profile
    port = $Port
    started_at = (Get-Date).ToString('o')
    argument_string = $argumentString
    process_id = $null
    process_exited = $null
    exit_code = $null
    stdout_log = $stdoutLog
    stderr_log = $stderrLog
    status = if ($DryRun) { 'dry_run' } else { 'starting' }
    error = $null
    browser_version = $null
    websocket = $null
    stderr_tail = @()
    stdout_tail = @()
    profile_entry_count = 0
  }

  if ($DryRun) {
    $attempts += [PSCustomObject]$attempt
    continue
  }

  try {
    # Browser sandbox remains enabled: --no-sandbox is intentionally absent.
    $process = Start-Process -FilePath $candidate.Path -ArgumentList $argumentString `
      -WindowStyle Hidden -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog -PassThru
    $attempt.process_id = $process.Id

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $version = $null
    while ((Get-Date) -lt $deadline) {
      $process.Refresh()
      if ($process.HasExited) {
        $attempt.process_exited = $true
        $attempt.exit_code = $process.ExitCode
        break
      }
      $version = Get-CdpVersion -CdpPort $Port
      if ($version) {
        break
      }
      Start-Sleep -Milliseconds 250
    }

    if ($version) {
      $attempt.status = 'ready'
      $attempt.process_exited = $false
      $attempt.browser_version = $version.Browser
      $attempt.websocket = $version.webSocketDebuggerUrl
      $attempts += [PSCustomObject]$attempt
      $attempts | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataFile -Encoding utf8
      $process.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
      "http://127.0.0.1:$Port" | Set-Content -LiteralPath $endpointFile -Encoding ascii
      Write-Host "RINTIK QA browser ready: $($version.Browser)"
      Write-Host "Executable: $($candidate.Path)"
      Write-Host "Profile: $profile"
      Write-Host "CDP endpoint: http://127.0.0.1:$Port"
      Write-Host "PID: $($process.Id)"
      Write-Host "Diagnostics: $metadataFile"
      exit 0
    }

    $attempt.status = 'failed'
    if ($null -eq $attempt.process_exited) {
      $process.Refresh()
      $attempt.process_exited = $process.HasExited
      if ($process.HasExited) {
        $attempt.exit_code = $process.ExitCode
      } else {
        # Stop only the exact headless process created by this attempt. Never
        # enumerate or terminate unrelated Chrome/Edge processes.
        Stop-Process -Id $process.Id
        $attempt.process_exited = $true
        $attempt.error = "CDP was not ready within $TimeoutSeconds seconds; the launcher-owned PID was stopped."
      }
    }
  } catch {
    $attempt.status = 'failed'
    $attempt.error = $_.Exception.Message
  }

  if (Test-Path -LiteralPath $stderrLog) {
    $attempt.stderr_tail = @((Get-Content -LiteralPath $stderrLog -Tail 30 -ErrorAction SilentlyContinue))
  }
  if (Test-Path -LiteralPath $stdoutLog) {
    $attempt.stdout_tail = @((Get-Content -LiteralPath $stdoutLog -Tail 20 -ErrorAction SilentlyContinue))
  }
  $attempt.profile_entry_count = @(Get-ChildItem -LiteralPath $profile -Force -ErrorAction SilentlyContinue).Count
  $attempts += [PSCustomObject]$attempt

  # Do not try another browser if this attempt unexpectedly opened a CDP
  # listener between the final poll and diagnostics.
  $lateVersion = Get-CdpVersion -CdpPort $Port
  if ($lateVersion) {
    $owner = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    $attempts[-1].status = 'ready_late'
    $attempts[-1].browser_version = $lateVersion.Browser
    $attempts[-1].websocket = $lateVersion.webSocketDebuggerUrl
    $attempts | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataFile -Encoding utf8
    if ($owner) {
      $owner.OwningProcess | Set-Content -LiteralPath $pidFile -Encoding ascii
    }
    "http://127.0.0.1:$Port" | Set-Content -LiteralPath $endpointFile -Encoding ascii
    Write-Host "RINTIK QA browser became ready after the final poll: $($lateVersion.Browser)"
    Write-Host "CDP endpoint: http://127.0.0.1:$Port"
    Write-Host "Diagnostics: $metadataFile"
    exit 0
  }
}

$attempts | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataFile -Encoding utf8
if ($DryRun) {
  $attempts | Format-List
  Write-Host "Dry run complete. Diagnostics: $metadataFile"
  exit 0
}

$summary = $attempts | ForEach-Object {
  "$($_.browser): status=$($_.status), pid=$($_.process_id), exited=$($_.process_exited), exit_code=$($_.exit_code), profile_entries=$($_.profile_entry_count), error=$($_.error), stderr=$($_.stderr_log)"
}
throw ("No browser produced a valid CDP endpoint on port $Port.`n" + ($summary -join "`n") + "`nFull diagnostics: $metadataFile")
