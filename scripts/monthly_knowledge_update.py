#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每月知识库 + 训练语料自动更新

流程:
  1. 拉取训练数据（PsyQA + SoulChat 子集 + EFAQA 若有证书）
  2. 归一化语料 → 训练 psych_model_weights.json
  3. 合并知识库 + 向量库 → 打标签

用法:
  python scripts/monthly_knowledge_update.py
  python scripts/monthly_knowledge_update.py --force
  python scripts/monthly_knowledge_update.py --skip-training

环境变量:
  KNOWLEDGE_TRAINING_UPDATE=1   启用训练流水线（默认 1）
  EFAQA_DL_LICENSE=...          有则自动拉取 EFAQA
  SOULCHAT_MAX_FILES=2          SoulChat 子集文件数
  SOULCHAT_MAX_MB=120           SoulChat 子集体积上限
  TRAINING_MAX_RECORDS=15000    归一化语料上限
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
PSYQA_DIR = REPO_ROOT / "PsyQA"
DATA_DIR = PSYQA_DIR / "server" / "data"
LOG_DIR = REPO_ROOT / "logs" / "knowledge_update"
STATE_FILE = DATA_DIR / "knowledge_scheduler_state.json"
LOCK_FILE = DATA_DIR / ".knowledge_update.lock"
EXPAND_SCRIPT = SCRIPT_DIR / "expand_knowledge_base.py"
FETCH_SCRIPT = SCRIPT_DIR / "fetch_training_datasets.py"
BUILD_SCRIPT = SCRIPT_DIR / "build_training_corpus.py"
TRAIN_SCRIPT = SCRIPT_DIR / "train_psych_weights.py"
REPORT_FILE = DATA_DIR / "knowledge_expand_report.json"
CORPUS_STATS = REPO_ROOT / "training_data" / "unified_corpus_stats.json"
WEIGHTS_FILE = DATA_DIR / "psych_model_weights.json"

DEFAULT_MAX_KNOWLEDGE = int(os.environ.get("KNOWLEDGE_MAX_ITEMS", "600"))
DEFAULT_MAX_VECTOR = int(os.environ.get("KNOWLEDGE_MAX_VECTOR", "6000"))
DEFAULT_TRAINING_MAX = int(os.environ.get("TRAINING_MAX_RECORDS", "15000"))
TRAINING_ENABLED = os.environ.get("KNOWLEDGE_TRAINING_UPDATE", "1") != "0"


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def log(msg: str, log_fp) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(line.encode(enc, errors="replace").decode(enc, errors="replace"), flush=True)
    log_fp.write(line + "\n")
    log_fp.flush()


def month_key() -> str:
    return datetime.now().strftime("%Y-%m")


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def acquire_lock() -> bool:
    if LOCK_FILE.exists():
        try:
            age = time.time() - LOCK_FILE.stat().st_mtime
            if age < 3600:
                return False
        except OSError:
            pass
    LOCK_FILE.write_text(str(os.getpid()), encoding="utf-8")
    return True


def release_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def run_cmd(cmd: list, cwd: Path, log_fp) -> int:
    log(f"执行: {' '.join(cmd)}", log_fp)
    proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.stdout:
        for line in proc.stdout.strip().splitlines():
            log(f"  | {line}", log_fp)
    if proc.stderr:
        for line in proc.stderr.strip().splitlines():
            log(f"  ! {line}", log_fp)
    return proc.returncode


def run_training_pipeline(python_exe: str, log_fp) -> dict:
    """拉取 SoulChat 子集 / EFAQA → 归一化 → 训练权重。部分失败不阻断主流程。"""
    training: dict = {"enabled": True, "fetch": {}, "corpusTotal": None, "weightsVersion": None}

    only_parts = []
    tier = os.environ.get("KNOWLEDGE_MONTHLY_TIER", "domestic")
    registry = json.loads((SCRIPT_DIR / "dataset_registry.json").read_text(encoding="utf-8"))
    combos = registry.get("recommendedCombos", {})
    if tier in combos:
        only_parts = list(combos[tier])
    else:
        only_parts = ["psyqa", "soulchat", "mental_9k", "mental_r1_10k", "sos_hl_1k"]
    if "soulchat" not in only_parts:
        only_parts.insert(1, "soulchat")
    if os.environ.get("EFAQA_DL_LICENSE", "").strip() and "efaqa" not in only_parts:
        only_parts.append("efaqa")
    only_arg = ",".join(dict.fromkeys(only_parts))

    code = run_cmd(
        [python_exe, str(FETCH_SCRIPT), "--monthly", "--soft-fail", "--domestic-only", "--tier", tier, f"--only={only_arg}"],
        REPO_ROOT,
        log_fp,
    )
    training["fetchExitCode"] = code
    status_path = REPO_ROOT / "training_data" / "fetch_status.json"
    if status_path.exists():
        try:
            training["fetch"] = json.loads(status_path.read_text(encoding="utf-8")).get("results", {})
        except Exception:
            pass

    code = run_cmd(
        [python_exe, str(BUILD_SCRIPT), f"--max-records={DEFAULT_TRAINING_MAX}"],
        REPO_ROOT,
        log_fp,
    )
    training["buildExitCode"] = code
    if CORPUS_STATS.exists():
        try:
            stats = json.loads(CORPUS_STATS.read_text(encoding="utf-8"))
            training["corpusTotal"] = stats.get("total")
            training["corpusBySource"] = stats.get("bySource")
        except Exception:
            pass

    if training.get("corpusTotal", 0) and training["corpusTotal"] >= 50:
        code = run_cmd([python_exe, str(TRAIN_SCRIPT), "--min-samples", "50"], REPO_ROOT, log_fp)
        training["trainExitCode"] = code
        if WEIGHTS_FILE.exists():
            try:
                w = json.loads(WEIGHTS_FILE.read_text(encoding="utf-8"))
                training["weightsVersion"] = w.get("version")
                training["trainingSamples"] = w.get("trainingSamples")
            except Exception:
                pass
    else:
        log("语料不足，跳过权重训练", log_fp)
        training["trainSkipped"] = True

    training["lastTrainingMonth"] = month_key()
    return training


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="强制更新（忽略本月已执行）")
    parser.add_argument("--skip-training", action="store_true", help="跳过 SoulChat/EFAQA 训练流水线")
    parser.add_argument("--max-knowledge", type=int, default=DEFAULT_MAX_KNOWLEDGE)
    parser.add_argument("--max-vector", type=int, default=DEFAULT_MAX_VECTOR)
    args = parser.parse_args()

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    if not acquire_lock():
        print("已有更新任务在运行，跳过")
        return 0

    state = load_state()
    current_month = month_key()
    if not args.force and state.get("lastSuccessMonth") == current_month:
        print(f"本月 ({current_month}) 已成功更新，跳过。使用 --force 强制重跑。")
        release_lock()
        return 0

    python_exe = sys.executable
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    training_result: dict = {"enabled": False}

    with open(log_path, "w", encoding="utf-8") as log_fp:
        log("=== 每月知识库 + 训练语料自动更新开始 ===", log_fp)
        started = datetime.now().isoformat(timespec="seconds")

        if TRAINING_ENABLED and not args.skip_training:
            log("--- 阶段 A: 训练语料（PsyQA + SoulChat 子集 + EFAQA）---", log_fp)
            training_result = run_training_pipeline(python_exe, log_fp)
        else:
            log("跳过训练流水线（KNOWLEDGE_TRAINING_UPDATE=0 或 --skip-training）", log_fp)

        log("--- 阶段 B: 合并知识库与向量库 ---", log_fp)
        code = run_cmd(
            [
                python_exe,
                str(EXPAND_SCRIPT),
                "--download",
                f"--max-knowledge={args.max_knowledge}",
                f"--max-vector={args.max_vector}",
            ],
            REPO_ROOT,
            log_fp,
        )
        if code != 0:
            log(f"扩充失败 exit={code}", log_fp)
            save_state(
                {
                    **state,
                    "lastRun": started,
                    "lastStatus": "failed",
                    "lastLog": str(log_path),
                    "training": training_result,
                }
            )
            release_lock()
            return code

        log("--- 阶段 C: 打标签 ---", log_fp)
        code = run_cmd([npm_cmd, "run", "tag:knowledge"], PSYQA_DIR, log_fp)
        if code != 0:
            log(f"打标签失败 exit={code}", log_fp)
            save_state(
                {
                    **state,
                    "lastRun": started,
                    "lastStatus": "tag_failed",
                    "lastLog": str(log_path),
                    "training": training_result,
                }
            )
            release_lock()
            return code

        report = {}
        if REPORT_FILE.exists():
            try:
                report = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass

        new_state = {
            "lastRun": started,
            "lastSuccessMonth": current_month,
            "lastStatus": "success",
            "lastLog": str(log_path),
            "knowledgeTotal": report.get("knowledge_total"),
            "vectorTotal": report.get("vector_total"),
            "training": training_result,
            "nextScheduledHint": "每月 1 日 03:00（含 SoulChat 子集 + EFAQA 若有证书）",
        }
        save_state(new_state)
        log(
            f"=== 完成 knowledge={new_state.get('knowledgeTotal')} "
            f"vector={new_state.get('vectorTotal')} "
            f"corpus={training_result.get('corpusTotal')} ===",
            log_fp,
        )

    release_lock()
    return 0


if __name__ == "__main__":
    sys.exit(main())
