@echo off
chcp 65001 >nul
title 心理港湾 · 一键安装（快速模式，无需 Ollama）
cd /d "%~dp0.."

echo.
echo  快速模式：不下载/不依赖大模型，适合无 Ollama 或网速较慢时演示
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Fast
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo 可双击「一键启动.bat」启动。
pause
