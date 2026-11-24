# PsyQA one-shot dev launcher: start Qdrant / bge-m3 / bge-reranker, then npm run dev.
# Logs go to $env:TEMP\psyqa-dev. Vector services keep running after Ctrl+C on dev.
param([switch]$NoDev)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $env:TEMP 'psyqa-dev'
$null = New-Item -ItemType Directory -Force -Path $LogDir

$services = @(
  @{ Name = 'qdrant';       Health = 'http://127.0.0.1:6333/healthz'; Script = 'start-qdrant.ps1';    Required = $true;  Timeout = 60  },
  @{ Name = 'bge-m3';       Health = 'http://127.0.0.1:8091/health';  Script = 'start-bge-m3.ps1';    Required = $true;  Timeout = 180 },
  @{ Name = 'bge-reranker'; Health = 'http://127.0.0.1:8092/health';  Script = 'start-bge-rerank.ps1'; Required = $false; Timeout = 120 }
)

function Test-Health([string]$url) {
  try {
    $null = Invoke-RestMethod -Uri $url -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

$started = @{}
foreach ($s in $services) {
  if (Test-Health $s.Health) {
    Write-Host "[$($s.Name)] already running ($($s.Health))" -ForegroundColor Green
    continue
  }
  $scriptPath = Join-Path $Root "scripts\$($s.Script)"
  $outLog = Join-Path $LogDir "$($s.Name).log"
  $errLog = Join-Path $LogDir "$($s.Name).err.log"
  $p = Start-Process powershell `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  $started[$s.Name] = $p.Id
  Write-Host "[$($s.Name)] starting (PID $($p.Id), log: $outLog), waiting up to $($s.Timeout)s ..."
}

$failed = @()
foreach ($s in $services) {
  if (-not $started.ContainsKey($s.Name)) { continue }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Health $s.Health) -and $sw.Elapsed.TotalSeconds -lt $s.Timeout) {
    Start-Sleep -Seconds 2
  }
  if (Test-Health $s.Health) {
    Write-Host "[$($s.Name)] healthy after $([int]$sw.Elapsed.TotalSeconds)s" -ForegroundColor Green
  } elseif ($s.Required) {
    Write-Host "[$($s.Name)] FAILED to become healthy in $($s.Timeout)s" -ForegroundColor Red
    $failed += $s.Name
  } else {
    Write-Host "[$($s.Name)] optional service not healthy, continuing anyway" -ForegroundColor Yellow
  }
}

if ($failed.Count -gt 0) {
  Write-Host "Required services not healthy: $($failed -join ', '). Check logs in $LogDir" -ForegroundColor Red
  exit 1
}

if ($NoDev) {
  Write-Host "All services OK (NoDev). Logs: $LogDir" -ForegroundColor Green
  exit 0
}

foreach ($port in @(3000, 3001)) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Write-Host "Port $port already listening (PID $($conn.OwningProcess)). Run 'npm run free:ports' first." -ForegroundColor Red
    exit 1
  }
}

if ($started.Count -gt 0) {
  $pidList = ($started.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
  Write-Host "Started service PIDs: $pidList"
}
Write-Host "Logs: $LogDir (vector services keep running after Ctrl+C on dev)"
Set-Location $Root
npm run dev
