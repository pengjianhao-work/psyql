# Sync local changes to GitHub via fresh clone + new branch (safe when local .git is corrupted)
#
# Usage:
#   cd PsyQA
#   .\scripts\push-to-github.ps1
#   .\scripts\push-to-github.ps1 -NewBranch "sync/react-rollback"
#
# Flow: clone develop -> create branch -> copy local src -> commit -> push branch -> open PR

param(
    [string]$Message = "Restore full ReAct path and fix LLM client imports after rollback.",
    [string]$BaseBranch = "develop",
    [string]$NewBranch = "",
    [string]$RepoUrl = "https://github.com/pengjianhao-work/psyql.git"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $Root
$TempClone = Join-Path $env:TEMP "psyql-sync-$(Get-Date -Format 'yyyyMMddHHmmss')"

if (-not $NewBranch) {
    $NewBranch = "sync/local-$(Get-Date -Format 'yyyyMMdd-HHmm')"
}

Write-Host "[1/6] Clone origin/$BaseBranch ..."
git clone --branch $BaseBranch $RepoUrl $TempClone
if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed. Check network/VPN and GitHub access, then retry."
}
if (-not (Test-Path (Join-Path $TempClone ".git"))) {
    Write-Error "Clone directory is not a git repo: $TempClone"
}

Push-Location $TempClone
try {
    Write-Host "[2/6] Create branch $NewBranch ..."
    git checkout -b $NewBranch

    Pop-Location

    $CopyPairs = @(
        @{ Src = "PsyQA\server\src"; Dst = "PsyQA\server\src" },
        @{ Src = "PsyQA\client\src"; Dst = "PsyQA\client\src" },
        @{ Src = "PsyQA\docs"; Dst = "PsyQA\docs" },
        @{ Src = "PsyQA\server\scripts"; Dst = "PsyQA\server\scripts" },
        @{ Src = "PsyQA\.env.example"; Dst = "PsyQA\.env.example"; File = $true },
        @{ Src = "PsyQA\.env.development.example"; Dst = "PsyQA\.env.development.example"; File = $true }
    )

    Write-Host "[3/6] Copy local changes ..."
    foreach ($pair in $CopyPairs) {
        $srcPath = Join-Path $RepoRoot $pair.Src
        $dstPath = Join-Path $TempClone $pair.Dst
        if (-not (Test-Path $srcPath)) {
            Write-Warning "Skip missing: $($pair.Src)"
            continue
        }
        if ($pair.File) {
            $dstDir = Split-Path $dstPath -Parent
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
            Copy-Item $srcPath $dstPath -Force
            Write-Host "  file: $($pair.Src)"
        } else {
            if (-not (Test-Path $dstPath)) { New-Item -ItemType Directory -Path $dstPath -Force | Out-Null }
            robocopy $srcPath $dstPath /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
            Write-Host "  dir:  $($pair.Src)"
        }
    }

    $LegacyFiles = @(
        "PsyQA\server\src\services\zhipuClient.ts",
        "PsyQA\server\src\services\interventionService.ts"
    )
    foreach ($rel in $LegacyFiles) {
        $target = Join-Path $TempClone $rel
        if (Test-Path $target) {
            Remove-Item $target -Force
            Write-Host "  removed legacy $rel"
        }
    }

    Push-Location $TempClone

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git add PsyQA/server/src PsyQA/client/src PsyQA/docs PsyQA/server/scripts PsyQA/.env.example PsyQA/.env.development.example 2>$null
    git add -u PsyQA/server/src/services/zhipuClient.ts PsyQA/server/src/services/interventionService.ts 2>$null
    $ErrorActionPreference = $prevEap

    $status = git status --porcelain
    if (-not $status) {
        Write-Host "No changes to push."
        exit 0
    }

    Write-Host "[4/6] Staged changes:"
    git status --short

    Write-Host "[5/6] Commit ..."
    $ErrorActionPreference = "Continue"
    git commit -m $Message -m "Revert prefetch acceleration for react mode; restore psych LLM and 90s timeouts; consolidate zhipuClient under services/llm."
    if ($LASTEXITCODE -ne 0) { Write-Error "git commit failed." }

    Write-Host "[6/6] Push origin/$NewBranch ..."
    git push -u origin $NewBranch
    if ($LASTEXITCODE -ne 0) { Write-Error "git push failed. Check GitHub auth (HTTPS token or SSH)." }
    $ErrorActionPreference = $prevEap

    $PrUrl = "$RepoUrl/compare/$BaseBranch...$NewBranch?expand=1"
    Write-Host ""
    Write-Host "Done." -ForegroundColor Green
    Write-Host "  Branch: $NewBranch (from $BaseBranch)"
    Write-Host "  Open PR: $PrUrl"
} finally {
    if ((Get-Location).Path -eq $TempClone) { Pop-Location }
}
