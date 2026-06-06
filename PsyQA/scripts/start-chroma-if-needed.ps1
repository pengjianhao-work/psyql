# Start Chroma server when PSYQA_CHROMA_ENABLED=1 and port 8000 is free
$ErrorActionPreference = 'SilentlyContinue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ChromaPath = Join-Path $ProjectRoot 'chroma_data'
$LogDir = Join-Path $ProjectRoot 'logs\chroma'
$LogFile = Join-Path $LogDir 'chroma-server.log'

if ($env:PSYQA_CHROMA_ENABLED -ne '1' -and $env:PSYQA_CHROMA_ENABLED -ne 'true') {
  $envFile = Join-Path $ProjectRoot '.env'
  if (Test-Path $envFile) {
    $envText = Get-Content $envFile -Raw -Encoding UTF8
    if ($envText -notmatch 'PSYQA_CHROMA_ENABLED\s*=\s*1') { exit 0 }
  } else { exit 0 }
}

$listening = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host '    Chroma already listening on :8000' -ForegroundColor DarkGray
  exit 0
}

$chroma = Get-Command chroma -ErrorAction SilentlyContinue
if (-not $chroma) {
  Write-Host '    Chroma CLI not found. Run: pip install chromadb' -ForegroundColor Yellow
  exit 0
}

New-Item -ItemType Directory -Force -Path $ChromaPath, $LogDir | Out-Null
Write-Host '    Starting Chroma (chroma run) on :8000...' -ForegroundColor DarkGray
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'chroma'
$psi.Arguments = "run --path `"$ChromaPath`" --host localhost --port 8000"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$p = [System.Diagnostics.Process]::Start($psi)
Start-Job -ScriptBlock {
  param($proc, $log)
  $out = $proc.StandardOutput.ReadToEnd()
  $err = $proc.StandardError.ReadToEnd()
  ($out + $err) | Out-File -FilePath $log -Encoding utf8
} -ArgumentList $p, $LogFile | Out-Null
Start-Sleep -Seconds 5
