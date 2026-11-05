# 启动本机 bge-reranker-v2-m3。只监听 8092，不占用回答模型。
$ErrorActionPreference = 'Stop'
$RepoScripts = Join-Path (Split-Path -Parent $PSScriptRoot) '..\scripts'
$Server = Join-Path $RepoScripts 'bge_rerank_server.py'
$Python = 'D:\Anaconda\python.exe'
if (-not (Test-Path $Python)) { $Python = 'python' }

$listening = Get-NetTCPConnection -LocalPort 8092 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host 'bge-reranker already listening on 127.0.0.1:8092'
  exit 0
}

$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:BGE_RERANK_MODEL = 'D:\huggingface\bge-reranker-v2-m3'
Write-Host 'Starting local bge-reranker on 127.0.0.1:8092'
& $Python $Server
