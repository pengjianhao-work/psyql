#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""咨询 Agent / RAG 离线评估（延迟与检索命中率基线）。"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CORPUS = REPO_ROOT / "training_data" / "unified_corpus.jsonl"
REPORT = REPO_ROOT / "training_data" / "eval_counsel_report.json"

SAMPLE_QUERIES = [
    "最近考试压力好大，睡不着怎么办？",
    "和室友关系很僵，每天回宿舍都很压抑",
    "觉得自己一无是处，什么都不想做",
]


def load_corpus(path: Path, limit: int = 200) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
            if len(rows) >= limit:
                break
    return rows


def keyword_hit(query: str, text: str) -> bool:
    keys = [w for w in query.replace("？", "").replace("?", "") if len(w.strip()) >= 2]
    if not keys:
        return False
    return any(k in text for k in ["压力", "焦虑", "室友", "考试", "睡眠", "抑郁", "孤独"] if k in query or k in text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-limit", type=int, default=200)
    args = parser.parse_args()

    corpus = load_corpus(CORPUS, args.corpus_limit)
    hits = 0
    total = 0
    t0 = time.time()

    for q in SAMPLE_QUERIES:
        for row in corpus:
            turns = row.get("turns") or []
            blob = json.dumps(turns, ensure_ascii=False)
            if keyword_hit(q, blob):
                hits += 1
                break
        total += 1

    elapsed = round(time.time() - t0, 3)
    report = {
        "queries": SAMPLE_QUERIES,
        "corpusSamples": len(corpus),
        "ragHitRate": round(hits / max(1, total), 3),
        "evalDurationSec": elapsed,
        "notes": "离线关键词命中率基线；在线 ReAct 评估需启动后端后调用 /api/v1/questions/ask",
    }

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[OK] 报告: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
