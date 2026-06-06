#Requires -Version 5.1
<#
.SYNOPSIS
  将 LoRA merge 后的模型导入 Ollama 为 psyqa-counsel

.EXAMPLE
  .\scripts\import_lora_to_ollama.ps1
  .\scripts\import_lora_to_ollama.ps1 -MergedDir "training_data\lora\merged" -ModelName "psyqa-counsel"
#>
param(
    [string]$MergedDir = "",
    [string]$ModelName = "psyqa-counsel"
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot

if (-not $MergedDir) {
    $MergedDir = Join-Path $RepoRoot "training_data\lora\merged"
}

$MergedPath = Resolve-Path $MergedDir -ErrorAction SilentlyContinue
if (-not $MergedPath) {
    Write-Host "[ERR] 未找到合并模型目录: $MergedDir" -ForegroundColor Red
    Write-Host "  请先运行: cd PsyQA; npm run train:lora"
    exit 1
}

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Host "[ERR] 未找到 ollama 命令，请先安装 Ollama: https://ollama.com" -ForegroundColor Red
    exit 1
}

$template = Join-Path $ScriptRoot "ollama\Modelfile.psyqa-counsel"
if (-not (Test-Path $template)) {
    Write-Host "[ERR] 缺少 Modelfile 模板: $template" -ForegroundColor Red
    exit 1
}

$modelfileContent = Get-Content $template -Raw -Encoding UTF8
$modelfileContent = $modelfileContent -replace '\{\{MERGED_MODEL_PATH\}\}', ($MergedPath.Path -replace '\\', '/')

$outModelfile = Join-Path $MergedPath.Path "Modelfile"
Set-Content -Path $outModelfile -Value $modelfileContent -Encoding UTF8

Write-Host "[INFO] 导入 Ollama 模型: $ModelName" -ForegroundColor Cyan
Write-Host "  FROM: $($MergedPath.Path)"

Push-Location $MergedPath.Path
try {
    & ollama create $ModelName -f Modelfile
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "[OK] 模型已创建: ollama run $ModelName" -ForegroundColor Green
Write-Host ""
Write-Host "在 PsyQA/.env 中配置:" -ForegroundColor Yellow
Write-Host "  PSYQA_LLM_PROVIDER=ollama"
Write-Host "  PSYQA_SKIP_OLLAMA=0"
Write-Host "  PSYQA_PREFER_LORA=1"
Write-Host "  PSYQA_LORA_MODEL=$ModelName"
Write-Host "  OLLAMA_MODEL=$ModelName"
