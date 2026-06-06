#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
心理港湾 · 统一数据处理流水线

模式:
  rag       — 在线咨询 RAG：扩充知识库 → 打标签 → 重载 → 嵌入 → Chroma（可选）
  training  — 离线算法训练：拉取数据集 → 归一化语料 → 训练 psych 权重
  full      — 训练 + RAG（默认国内源、soft-fail）

用法（在仓库根目录 PsyQA1/）:
  python scripts/process_data_pipeline.py
  python scripts/process_data_pipeline.py --mode rag --download
  python scripts/process_data_pipeline.py --mode training --offline
  python scripts/process_data_pipeline.py --mode full --skip-chroma

或在 PsyQA 目录:
  npm run pipeline:data
  npm run pipeline:data:rag
  npm run pipeline:data:training
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
LOG_DIR = REPO_ROOT / "logs" / "data_pipeline"
REPORT_FILE = DATA_DIR / "data_pipeline_report.json"

EXPAND = SCRIPT_DIR / "expand_knowledge_base.py"
FETCH = SCRIPT_DIR / "fetch_training_datasets.py"
BUILD_CORPUS = SCRIPT_DIR / "build_training_corpus.py"
TRAIN_WEIGHTS = SCRIPT_DIR / "train_psych_weights.py"


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def log(msg: str, fp) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    fp.write(line + "\n")
    fp.flush()


def run_cmd(cmd: list, cwd: Path, fp) -> int:
    log(f"$ {' '.join(cmd)}", fp)
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    for line in (proc.stdout or "").splitlines():
        log(f"  | {line}", fp)
    for line in (proc.stderr or "").splitlines():
        log(f"  ! {line}", fp)
    return proc.returncode


def chroma_enabled() -> bool:
    env_path = PSYQA_DIR / ".env"
    if env_path.exists():
        text = env_path.read_text(encoding="utf-8", errors="replace")
        if "PSYQA_CHROMA_ENABLED=1" in text or "PSYQA_CHROMA_ENABLED=true" in text:
            return True
    return os.environ.get("PSYQA_CHROMA_ENABLED", "") in ("1", "true")


def run_training(python: str, fp, offline: bool, tier: str) -> dict:
    result: dict = {"steps": {}}
    fetch_cmd = [python, str(FETCH), "--soft-fail", "--tier", tier]
    if offline:
        fetch_cmd.append("--offline")
    else:
        fetch_cmd.extend(["--domestic-only"])
    result["steps"]["fetch"] = run_cmd(fetch_cmd, REPO_ROOT, fp)

    result["steps"]["build_corpus"] = run_cmd([python, str(BUILD_CORPUS)], REPO_ROOT, fp)
    result["steps"]["train_weights"] = run_cmd(
        [python, str(TRAIN_WEIGHTS), "--min-samples", "50"], REPO_ROOT, fp
    )
    stats_path = REPO_ROOT / "training_data" / "unified_corpus_stats.json"
    if stats_path.exists():
        try:
            result["corpus"] = json.loads(stats_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    weights = DATA_DIR / "psych_model_weights.json"
    if weights.exists():
        try:
            result["weights"] = json.loads(weights.read_text(encoding="utf-8"))
        except Exception:
            pass
    return result


def run_rag(python: str, npm: str, fp, download: bool, max_k: int, max_v: int,
            embed_limit: int, skip_embed: bool, skip_chroma: bool) -> dict:
    result: dict = {"steps": {}}
    expand_cmd = [
        python,
        str(EXPAND),
        f"--max-knowledge={max_k}",
        f"--max-vector={max_v}",
    ]
    if download:
        expand_cmd.append("--download")
    result["steps"]["expand"] = run_cmd(expand_cmd, REPO_ROOT, fp)
    if result["steps"]["expand"] != 0:
        return result

    result["steps"]["tag"] = run_cmd([npm, "run", "tag:knowledge"], PSYQA_DIR, fp)
    result["steps"]["reload"] = run_cmd([npm, "run", "reload:knowledge"], PSYQA_DIR, fp)

    if not skip_embed:
        result["steps"]["embeddings"] = run_cmd(
            [npm, "run", "build:embeddings", "--", f"--limit={embed_limit}"],
            PSYQA_DIR,
            fp,
        )
    else:
        log("跳过嵌入生成 (--skip-embeddings)", fp)

    use_chroma = chroma_enabled() and not skip_chroma
    if use_chroma:
        result["steps"]["chroma_sync"] = run_cmd([npm, "run", "sync:chroma"], PSYQA_DIR, fp)
    else:
        log("跳过 Chroma（未启用 PSYQA_CHROMA_ENABLED 或 --skip-chroma）", fp)

    expand_report = DATA_DIR / "knowledge_expand_report.json"
    if expand_report.exists():
        try:
            result["expand_report"] = json.loads(expand_report.read_text(encoding="utf-8"))
        except Exception:
            pass
    return result


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser(description="心理港湾统一数据处理")
    parser.add_argument("--mode", choices=("rag", "training", "full"), default="full")
    parser.add_argument("--download", action="store_true", help="缺失时下载 PsyQA 全量")
    parser.add_argument("--offline", action="store_true", help="训练拉取：纯离线扫描")
    parser.add_argument("--tier", default=os.environ.get("KNOWLEDGE_MONTHLY_TIER", "domestic"))
    parser.add_argument("--max-knowledge", type=int, default=int(os.environ.get("KNOWLEDGE_MAX_ITEMS", "800")))
    parser.add_argument("--max-vector", type=int, default=int(os.environ.get("KNOWLEDGE_MAX_VECTOR", "8000")))
    parser.add_argument("--embed-limit", type=int, default=int(os.environ.get("EMBED_BATCH_LIMIT", "500")))
    parser.add_argument("--skip-embeddings", action="store_true")
    parser.add_argument("--skip-chroma", action="store_true")
    parser.add_argument("--skip-training", action="store_true", help="full 模式下跳过训练阶段")
    args = parser.parse_args()

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"pipeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    python = sys.executable
    npm = "npm.cmd" if os.name == "nt" else "npm"
    started = datetime.now().isoformat(timespec="seconds")
    report: dict = {"started": started, "mode": args.mode, "steps": {}}

    with open(log_path, "w", encoding="utf-8") as fp:
        log(f"=== 数据处理开始 mode={args.mode} ===", fp)

        if args.mode in ("training", "full") and not args.skip_training:
            log("--- 阶段 1：训练语料与权重 ---", fp)
            report["training"] = run_training(python, fp, args.offline, args.tier)
            if args.mode == "training":
                report["status"] = "ok"
                report["log"] = str(log_path)
                REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                log("=== 训练数据处理完成 ===", fp)
                return 0

        if args.mode in ("rag", "full"):
            log("--- 阶段 2：RAG 知识库与向量 ---", fp)
            report["rag"] = run_rag(
                python,
                npm,
                fp,
                args.download,
                args.max_knowledge,
                args.max_vector,
                args.embed_limit,
                args.skip_embeddings,
                args.skip_chroma,
            )
            if report["rag"].get("steps", {}).get("expand", 0) != 0:
                report["status"] = "failed"
                report["log"] = str(log_path)
                REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                log("=== RAG 阶段失败 ===", fp)
                return 1

        report["status"] = "ok"
        report["finished"] = datetime.now().isoformat(timespec="seconds")
        report["log"] = str(log_path)
        report["next"] = [
            "重启或热加载后端: cd PsyQA && npm run dev",
            "验证: curl http://localhost:3001/health",
        ]
        if chroma_enabled() and not args.skip_chroma:
            report["next"].insert(1, "Chroma 已同步时 /health 含 chroma.connected=true")

        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"=== 完成 报告 -> {REPORT_FILE} ===", fp)
        log("建议: cd PsyQA && npm run dev 后刷新登录页", fp)

    return 0


if __name__ == "__main__":
    sys.exit(main())
