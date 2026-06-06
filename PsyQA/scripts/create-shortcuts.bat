@echo off
chcp 65001 >nul
title Create PsyQA Desktop Shortcuts
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-desktop-shortcuts.ps1"
pause
