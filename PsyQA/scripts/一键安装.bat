@echo off
chcp 65001 >nul
title 心理港湾 · 一键安装
cd /d "%~dp0.."

echo.
echo  ========================================
echo    心理港湾 PsyQA · 一键配置环境安装
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [提示] 未检测到 Node.js，脚本将尝试通过 winget 安装...
    echo.
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
    echo.
    echo [失败] 安装未完成，请查看上方错误信息。
    pause
    exit /b 1
)

echo.
echo 安装成功！可双击「一键启动.bat」运行系统。
echo.
pause
