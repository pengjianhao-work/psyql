@echo off
chcp 65001 >nul
title 心理港湾 · 快捷模式（无需 Ollama）
cd /d "%~dp0.."

if not exist "node_modules\" (
    echo [提示] 尚未安装依赖，正在快速配置...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Fast -Quiet
) else (
    if not exist ".env" (
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Fast -Quiet
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-fast-mode.ps1" >nul 2>&1
    )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0free-dev-ports.ps1"

echo.
echo  ========================================
echo    心理港湾 · 快捷模式
echo  ========================================
echo   规则 + 知识库回复，不调用大模型
echo   适合答辩演示 / 弱网 / 无 Ollama 环境
echo.
echo   浏览器: http://localhost:3000/login
echo   账号 demo / demo123
echo   就绪后将自动打开登录页
echo   按 Ctrl+C 可停止服务
echo.

set PSYQA_FAST_ANSWER=1
set PSYQA_SKIP_OLLAMA=1
start /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-and-open-login.ps1"
npm run dev
