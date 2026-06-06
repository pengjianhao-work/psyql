@echo off
chcp 65001 >nul
title 心理港湾 · 数据处理
cd /d "%~dp0"

echo.
echo  ========================================
echo    心理港湾 · 统一数据处理
echo  ========================================
echo.
echo  模式说明:
echo    rag      - 知识库 + 向量 + 嵌入 + Chroma
echo    training - 训练语料 + 心理权重
echo    full     - 以上全部（默认）
echo.

set MODE=full
if not "%~1"=="" set MODE=%~1

python scripts\process_data_pipeline.py --mode %MODE% %2 %3 %4 %5
set EXIT=%ERRORLEVEL%

echo.
if %EXIT% neq 0 (
  echo  处理失败，详见 logs\data_pipeline\ 与 server\data\data_pipeline_report.json
) else (
  echo  处理完成。请 cd PsyQA ^&^& npm run dev 重启后端。
)
echo.
pause
exit /b %EXIT%
