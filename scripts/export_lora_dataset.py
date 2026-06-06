#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 unified_corpus.jsonl 导出 Alpaca 格式 train/val.json，供 LoRA/PEFT 微调。

用法:
  python scripts/export_lora_dataset.py
  python scripts/export_lora_dataset.py --max-records 20000 --val-ratio 0.05
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CORPUS = REPO_ROOT / "training_data" / "unified_corpus.jsonl"
OUT_DIR = REPO_ROOT / "training_data" / "lora"
DEFAULT_INSTRUCTION = (
    "你是专业的大学生心理陪伴 AI。请根据用户问题给出温暖、共情、可操作的建议，"
    "不做医疗诊断，不替代线下咨询。"
)


def load_corpus(path: Path, max_records: int | None) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
            if max_records and len(rows) >= max_records:
                break
    return rows


def turns_to_alpaca(record: dict) -> dict | None:
    turns = record.get("turns") or []
    if len(turns) < 2:
        q = record.get("question") or record.get("input") or ""
        a = record.get("answer") or record.get("output") or ""
        if q and a:
            return {
                "instruction": DEFAULT_INSTRUCTION,
                "input": str(q).strip(),
                "output": str(a).strip(),
            }
        return None

    user_parts: list[str] = []
    bot_parts: list[str] = []
    for t in turns:
        role = str(t.get("role", "")).lower()
        text = str(t.get("content") or t.get("text") or "").strip()
        if not text:
            continue
        if role in ("user", "human", "patient"):
            user_parts.append(text)
        elif role in ("assistant", "bot", "counselor"):
            bot_parts.append(text)

    if not user_parts or not bot_parts:
        return None

    return {
        "instruction": DEFAULT_INSTRUCTION,
        "input": user_parts[-1],
        "output": bot_parts[-1],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--max-records", type=int, default=None)
    parser.add_argument("--val-ratio", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fallback-data", type=Path, default=REPO_ROOT / "data" / "train.json")
    args = parser.parse_args()

    records = load_corpus(args.corpus, args.max_records)
    samples: list[dict] = []

    if records:
        for r in records:
            item = turns_to_alpaca(r)
            if item and len(item["output"]) >= 40:
                samples.append(item)
    elif args.fallback_data.exists():
        print(f"[WARN] 未找到 {args.corpus}，回退 {args.fallback_data}")
        raw = json.loads(args.fallback_data.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            samples = [x for x in raw if x.get("input") and x.get("output")]

    if not samples:
        print("[ERR] 无可用训练样本，请先运行 npm run build:training-corpus")
        return 1

    random.seed(args.seed)
    random.shuffle(samples)
    val_n = max(1, int(len(samples) * args.val_ratio))
    val = samples[:val_n]
    train = samples[val_n:]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    train_path = args.out_dir / "train.json"
    val_path = args.out_dir / "val.json"
    train_path.write_text(json.dumps(train, ensure_ascii=False, indent=2), encoding="utf-8")
    val_path.write_text(json.dumps(val, ensure_ascii=False, indent=2), encoding="utf-8")

    meta = {
        "train": len(train),
        "val": len(val),
        "corpus": str(args.corpus),
        "instruction": DEFAULT_INSTRUCTION,
    }
    (args.out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] LoRA 数据集: train={len(train)} val={len(val)}")
    print(f"  -> {train_path}")
    print(f"  -> {val_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
