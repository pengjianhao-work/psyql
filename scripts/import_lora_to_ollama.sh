#!/usr/bin/env bash
# 将 LoRA merge 后的模型导入 Ollama
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MERGED_DIR="${1:-$REPO_ROOT/training_data/lora/merged}"
MODEL_NAME="${2:-psyqa-counsel}"

if [[ ! -d "$MERGED_DIR" ]]; then
  echo "[ERR] 未找到合并模型: $MERGED_DIR"
  echo "  请先运行: cd PsyQA && npm run train:lora"
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "[ERR] 未安装 ollama"
  exit 1
fi

MERGED_PATH="$(cd "$MERGED_DIR" && pwd)"
sed "s|{{MERGED_MODEL_PATH}}|$MERGED_PATH|g" "$SCRIPT_DIR/ollama/Modelfile.psyqa-counsel" > "$MERGED_PATH/Modelfile"

echo "[INFO] ollama create $MODEL_NAME"
cd "$MERGED_PATH"
ollama create "$MODEL_NAME" -f Modelfile

echo "[OK] 完成。请在 .env 设置 PSYQA_LLM_PROVIDER=ollama PSYQA_PREFER_LORA=1 OLLAMA_MODEL=$MODEL_NAME"
