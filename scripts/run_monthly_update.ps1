# 每月自动更新：知识库 + SoulChat 子集 + EFAQA（若有证书）+ 算法权重
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PsyqaEnv = Join-Path $RepoRoot "PsyQA\.env"
Set-Location $RepoRoot

# 加载 .env（EFAQA_DL_LICENSE、KNOWLEDGE_* 等）
if (Test-Path $PsyqaEnv) {
    Get-Content $PsyqaEnv | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^\s*([^#=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($name, $val, "Process")
        }
    }
    Write-Host "已加载环境变量: $PsyqaEnv"
}

$Python = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $Python = $cmd
        break
    }
}
if (-not $Python) {
    Write-Error "未找到 Python，请先安装 Python 3.8+"
    exit 1
}

Write-Host "PsyQA 每月更新（含训练语料）- $RepoRoot"
& $Python "$RepoRoot\scripts\monthly_knowledge_update.py" @args
exit $LASTEXITCODE
