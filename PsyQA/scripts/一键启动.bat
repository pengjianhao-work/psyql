@echo off
chcp 65001 >nul
title 心理港湾 · 运行中
cd /d "%~dp0.."

if not exist "node_modules\" (
    echo [提示] 尚未安装依赖，正在自动配置...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Quiet
)

if not exist ".env" (
    echo [提示] 正在创建 .env ...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Quiet
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-llm-mode.ps1" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ollama-if-needed.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-chroma-if-needed.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0free-dev-ports.ps1"

echo.
echo  启动中（Ollama 大模型）...
echo  就绪后将自动打开 http://localhost:3000/login
echo  账号 demo / demo123
echo  按 Ctrl+C 可停止服务
echo.

start /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-and-open-login.ps1"
npm run dev
