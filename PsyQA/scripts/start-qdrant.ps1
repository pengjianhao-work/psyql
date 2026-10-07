# Start local Qdrant when port 6333 is free. Downloads the Windows binary on first run.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BinDir = Join-Path $ProjectRoot 'tools\qdrant'
$DataDir = Join-Path $ProjectRoot 'qdrant_data'
$Exe = Get-ChildItem -Path $BinDir -Filter qdrant.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1

$listening = Get-NetTCPConnection -LocalPort 6333 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host 'Qdrant already listening on :6333'
  exit 0
}

if (-not $Exe) {
  Write-Host 'Downloading Qdrant v1.19.2...'
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $zip = Join-Path $env:TEMP 'qdrant-x86_64-pc-windows-msvc.zip'
  curl.exe -L --fail -o $zip 'https://github.com/qdrant/qdrant/releases/download/v1.19.2/qdrant-x86_64-pc-windows-msvc.zip'
  Expand-Archive -Path $zip -DestinationPath $BinDir -Force
  $Exe = Get-ChildItem -Path $BinDir -Filter qdrant.exe -Recurse | Select-Object -First 1
}

if (-not $Exe) {
  Write-Error 'qdrant.exe not found after download'
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:QDRANT__STORAGE__STORAGE_PATH = $DataDir
$env:QDRANT__SERVICE__HTTP_PORT = '6333'
$env:QDRANT__SERVICE__GRPC_PORT = '6334'
Write-Host "Starting Qdrant on :6333 (data: $DataDir)"
Start-Process -FilePath $Exe.FullName -WorkingDirectory $BinDir -WindowStyle Hidden
Start-Sleep -Seconds 2
Write-Host 'Qdrant start requested. Health: http://localhost:6333/healthz'
