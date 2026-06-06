@echo off
chcp 65001 >nul
title 心理港湾 · 创建桌面快捷方式
cd /d "%~dp0"

echo.
echo  正在桌面创建「心理港湾」快捷方式…
echo  （含：快捷模式 / 完整启动 / 登录页 / 数据处理）
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-desktop-shortcuts.ps1"
if errorlevel 1 (
    echo.
    echo  创建失败。可尝试: create-shortcuts.bat
    pause
    exit /b 1
)

echo.
pause
