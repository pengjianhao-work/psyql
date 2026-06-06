# Start ollama serve in background when installed but not listening on 11434
$ErrorActionPreference = 'SilentlyContinue'
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) { exit 0 }

$listening = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
if ($listening) { exit 0 }

Write-Host '    Starting Ollama (ollama serve) in background...' -ForegroundColor DarkGray
Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden
Start-Sleep -Seconds 3
