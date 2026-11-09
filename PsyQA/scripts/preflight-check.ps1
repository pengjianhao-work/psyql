# 心理港湾 · 启动前环境自检
param([switch]$Quiet)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$issues = @()
$warnings = @()

function Add-Issue($msg) { $script:issues += $msg }
function Add-Warn($msg) { $script:warnings += $msg }

if (-not $Quiet) {
    Write-Host "`n  心理港湾 · 环境自检" -ForegroundColor Cyan
}

# Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Add-Issue "未安装 Node.js（需 18+）"
} else {
    $ver = (node -v) -replace 'v', ''
    if ([version]$ver -lt [version]"18.0.0") { Add-Warn "Node 版本偏低: $ver" }
}

# 端口
foreach ($port in @(3000, 3001)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { Add-Warn "端口 $port 已被占用 (PID $($conn.OwningProcess))" }
}

# .env
$envFile = Join-Path $Root ".env"
if (-not (Test-Path $envFile)) {
    Add-Warn ".env 不存在，请先运行 scripts\setup.ps1"
} else {
    $envText = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
    if ($envText -notmatch 'ZHIPU_API_KEY=\S+' -and $envText -notmatch 'PSYQA_FAST_ANSWER=1') {
        Add-Warn "未配置 ZHIPU_API_KEY 且非快捷模式，大模型可能不可用"
    }
    if ($envText -match 'AUTH_SECRET=(psyqa-dev|change-me)') {
        Add-Warn "AUTH_SECRET 仍为默认值，生产环境请更换"
    }
}

# Ollama
$ollamaUrl = if ($env:OLLAMA_API_URL) { $env:OLLAMA_API_URL } else { "http://localhost:11434" }
try {
    $null = Invoke-RestMethod -Uri "$($ollamaUrl -replace '/api/generate.*','')/api/tags" -TimeoutSec 3
} catch {
    if ($envText -match 'PSYQA_SKIP_OLLAMA=0' -or -not ($envText -match 'PSYQA_SKIP_OLLAMA=1')) {
        Add-Warn "Ollama 未响应 ($ollamaUrl)，智谱可用时可忽略"
    }
}

# 回答用到的三个本机服务。缺了会变慢或退回旧检索。
foreach ($name in @('Qdrant', 'bge-m3', 'bge-reranker')) {
    if ($name -eq 'Qdrant') {
        $url = 'http://127.0.0.1:6333/healthz'
        $start = 'npm run start:qdrant'
    } elseif ($name -eq 'bge-m3') {
        $url = 'http://127.0.0.1:8091/health'
        $start = 'npm run start:bge-m3'
    } else {
        $url = 'http://127.0.0.1:8092/health'
        $start = 'npm run start:bge-rerank'
    }
    try {
        $null = Invoke-RestMethod -Uri $url -TimeoutSec 2
    } catch {
        Add-Warn "$name 未响应。启动：$start"
    }
}

# 依赖
if (-not (Test-Path (Join-Path $Root "node_modules"))) { Add-Issue "缺少 node_modules，请 npm run install:all" }
if (-not (Test-Path (Join-Path $Root "client\node_modules"))) { Add-Issue "缺少 client/node_modules" }

if (-not $Quiet) {
    foreach ($w in $warnings) { Write-Host "  [!] $w" -ForegroundColor Yellow }
    foreach ($i in $issues) { Write-Host "  [X] $i" -ForegroundColor Red }
    if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
        Write-Host "  [OK] 环境检查通过" -ForegroundColor Green
    } elseif ($issues.Count -eq 0) {
        Write-Host "  [OK] 可启动（有 $($warnings.Count) 条警告）" -ForegroundColor Green
    }
}

if ($issues.Count -gt 0) { exit 1 }
exit 0
