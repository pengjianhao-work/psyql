@echo off
chcp 65001 >nul
title PsyQA
cd /d "%~dp0.."

if not exist "node_modules\" (
    echo [setup] Installing dependencies...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Quiet
)

if not exist ".env" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Quiet
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-llm-mode.ps1" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ollama-if-needed.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0free-dev-ports.ps1"

echo.
echo  PsyQA: http://localhost:3000/login
echo  模式: Ollama 大模型（需 ollama serve + qwen:7b）
echo  demo / demo123
echo  Ctrl+C to stop
echo.

start /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-and-open-login.ps1"
npm run dev
