@echo off
chcp 65001 >nul
title PsyQA Setup
cd /d "%~dp0.."

echo.
echo  PsyQA - First-time setup
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo  Done. Use start-psyqa.bat or desktop shortcut to launch.
pause
