@echo off
chcp 65001 >nul
title PsyQA Fast Setup
cd /d "%~dp0.."

echo.
echo  PsyQA - Fast setup (no Ollama required)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Fast
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
pause
