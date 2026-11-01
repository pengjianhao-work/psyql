# 启动本机 bge-m3 编码服务。模型约 2GB，只监听本机 8091。
$ErrorActionPreference = 'Stop'
$RepoScripts = Join-Path (Split-Path -Parent $PSScriptRoot) '..\scripts'
$Server = Join-Path $RepoScripts 'bge_m3_server.py'
$Python = 'D:\Anaconda\python.exe'
if (-not (Test-Path $Python)) { $Python = 'python' }

$listening = Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host 'bge-m3 already listening on 127.0.0.1:8091'
  exit 0
}

$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:BGE_M3_MODEL = 'D:\huggingface\bge-m3'
Write-Host 'Starting local bge-m3 encoder on 127.0.0.1:8091'
& $Python $Server
