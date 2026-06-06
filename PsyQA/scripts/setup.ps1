# 心理港湾 · 一键配置环境并安装依赖
# 用法:
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -Fast
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -Start
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -PullModel

param(
    [switch]$Fast,
    [switch]$Start,
    [switch]$PullModel,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}
function Write-Ok($msg) {
    Write-Host "    [OK] $msg" -ForegroundColor Green
}
function Write-Warn($msg) {
    Write-Host "    [!] $msg" -ForegroundColor Yellow
}
function Write-Err($msg) {
    Write-Host "    [X] $msg" -ForegroundColor Red
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "  心理港湾 PsyQA · 一键环境配置" -ForegroundColor Magenta
    Write-Host "  目录: $Root" -ForegroundColor DarkGray
}

& "$PSScriptRoot\preflight-check.ps1" -Quiet:$Quiet

# ---------- 1. Node.js ----------
Write-Step "检查 Node.js"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Warn "未检测到 Node.js"
  $tryWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($tryWinget -and -not $Quiet) {
        $ans = Read-Host "是否使用 winget 自动安装 Node.js LTS? (Y/n)"
        if ($ans -eq "" -or $ans -match "^[Yy]") {
            Write-Host "    正在安装 Node.js LTS，请稍候…"
            winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
            $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        }
    }
    if (-not $nodeCmd) {
        Write-Err "请先安装 Node.js 18+： https://nodejs.org"
        Write-Host "    安装后重新运行本脚本或双击「一键安装.bat」"
        exit 1
    }
}
$nodeVer = node -v
Write-Ok "Node.js $nodeVer"
$major = [int]($nodeVer -replace "^v(\d+).*", '$1')
if ($major -lt 18) {
    Write-Err "需要 Node.js >= 18，当前 $nodeVer"
    exit 1
}

# ---------- 2. .env ----------
Write-Step "配置环境变量文件 .env"
$envFile = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Ok "已从 .env.example 创建 .env"
    } else {
        @"
PORT=3001
NODE_ENV=development
AUTH_SECRET=psyqa-dev-secret-change-me-local-only
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen:7b
FRONTEND_URL=http://localhost:3000
"@ | Set-Content -Path $envFile -Encoding UTF8
        Write-Ok "已创建默认 .env"
    }
} else {
    Write-Ok ".env 已存在，跳过"
}

if ($Fast) {
    $content = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
    if ($content -notmatch "PSYQA_FAST_ANSWER=1") {
        Add-Content $envFile "`nPSYQA_FAST_ANSWER=1"
        Write-Ok "已启用快速模式 PSYQA_FAST_ANSWER=1（不依赖 Ollama）"
    }
} else {
    & (Join-Path $PSScriptRoot "ensure-llm-mode.ps1")
    Write-Ok "已配置为默认使用 Ollama 大模型（未设置 PSYQA_FAST_ANSWER）"
}

# ---------- 3. npm install ----------
Write-Step "安装项目依赖（npm run install:all）"
Write-Host "    首次安装可能需要几分钟…" -ForegroundColor DarkGray
npm run install:all
if ($LASTEXITCODE -ne 0) {
    Write-Err "依赖安装失败"
    exit 1
}
Write-Ok "依赖安装完成"

# ---------- 4. Ollama（可选）----------
Write-Step "检查 Ollama（大模型，可选）"
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Warn "未安装 Ollama → 咨询将使用规则+知识库；或安装后重启: https://ollama.com"
    if ($Fast) {
        Write-Ok "已选快速模式，无需 Ollama"
    }
} else {
    Write-Ok "已安装 Ollama"
    $ollamaList = ollama list 2>$null | Out-String
    $hasModel = $ollamaList -match "qwen:7b" -or $ollamaList -match "qwen"
    if (-not $hasModel) {
        if ($PullModel -or (-not $Quiet -and -not $Fast)) {
            if ($PullModel) {
                $doPull = $true
            } else {
                $ans = Read-Host "    是否下载对话模型 qwen:7b?（约 4GB，需联网）(Y/n)"
                $doPull = ($ans -eq "" -or $ans -match "^[Yy]")
            }
            if ($doPull) {
                Write-Host "    正在拉取 qwen:7b …" -ForegroundColor DarkGray
                ollama pull qwen:7b
                Write-Ok "模型 qwen:7b 就绪"
            }
        } else {
            Write-Warn "未检测到 qwen:7b，可稍后执行: ollama pull qwen:7b"
        }
    } else {
        Write-Ok "模型 qwen:7b 已存在"
    }
    if (-not $Fast) {
        & (Join-Path $PSScriptRoot "start-ollama-if-needed.ps1")
        $serve = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
        if (-not $serve) {
            Write-Warn "Ollama 服务未运行，请执行: ollama serve"
        } else {
            Write-Ok "Ollama 服务已在运行 (11434)"
        }
    }
}

# ---------- 完成 ----------
Write-Step "安装完成"
Write-Host ""
Write-Host "  演示账号:" -ForegroundColor White
Write-Host "    学生   demo / demo123"
Write-Host "    辅导员 counselor / counselor123"
Write-Host "    管理员 admin / admin123"
Write-Host ""
Write-Host "  启动方式:" -ForegroundColor White
Write-Host "    双击「一键启动.bat」（默认 Ollama 大模型）"
Write-Host "    或在本目录执行: npm run dev"
if (-not $Fast) {
    Write-Host "    需已安装 Ollama 并拉取模型: ollama pull qwen:7b" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  浏览器: http://localhost:3000/login" -ForegroundColor Green
Write-Host ""

if (-not $Quiet) {
    $mkSc = Read-Host "是否在桌面创建快捷方式? (Y/n)"
    if ($mkSc -eq "" -or $mkSc -match "^[Yy]") {
        & (Join-Path $Root "scripts\create-desktop-shortcuts.ps1") @($(if ($Quiet) { '-Quiet' }))
    }
}

if ($Start) {
    Write-Step "正在启动开发服务…"
    npm run dev
}
