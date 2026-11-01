# 用本机 bge-m3 重建 Qdrant 混合集合。完成后才替换线上集合名。
$ErrorActionPreference = 'Stop'
$RepoScripts = Join-Path (Split-Path -Parent $PSScriptRoot) '..\scripts'
$Script = Join-Path $RepoScripts 'reindex_bge_m3_qdrant.py'
$Python = 'D:\Anaconda\python.exe'
if (-not (Test-Path $Python)) { $Python = 'python' }

$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'
& $Python $Script @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
