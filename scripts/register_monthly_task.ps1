# 注册 Windows 每月自动更新任务（需管理员权限）
# 用法: 右键「以管理员身份运行 PowerShell」后执行:
#   Set-ExecutionPolicy -Scope Process Bypass; .\scripts\register_monthly_task.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $RepoRoot "scripts\run_monthly_update.ps1"
$TaskName = "PsyQA-KnowledgeMonthlyUpdate"

if (-not (Test-Path $Runner)) {
    Write-Error "找不到 $Runner"
    exit 1
}

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已移除旧任务 $TaskName"
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`"" `
    -WorkingDirectory $RepoRoot

# 每月 1 日 03:00
$Trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At "03:00"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "心理港湾：每月更新知识库/向量库，并拉取 SoulChat 子集与 EFAQA（若有证书）训练权重" `
    -RunLevel Highest | Out-Null

Write-Host ""
Write-Host "已注册计划任务: $TaskName"
Write-Host "  时间: 每月 1 日 03:00"
Write-Host "  脚本: $Runner"
Write-Host ""
Write-Host "可选环境变量（写入 PsyQA/.env）："
Write-Host "  EFAQA_DL_LICENSE=你的证书标识"
Write-Host "  SOULCHAT_MAX_FILES=2"
Write-Host "  SOULCHAT_MAX_MB=120"
Write-Host "  TRAINING_MAX_RECORDS=15000"
Write-Host ""
Write-Host "立即测试运行:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$Runner`" --force"
Write-Host ""
Write-Host "查看任务:"
Write-Host "  Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo"
