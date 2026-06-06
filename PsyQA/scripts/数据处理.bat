@echo off
chcp 65001 >nul
title 心理港湾 · 数据处理
cd /d "%~dp0\.."
call "%~dp0\..\数据处理.bat" %*
