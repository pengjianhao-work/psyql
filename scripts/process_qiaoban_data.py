#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
巧板（QiaoBan）儿童心理对话数据集 · 归一化处理

输入（仓库根目录 data/）:
  child_chat_data.json   — 5000 条，topic + 多轮 input（</s> 分隔）
  child_chat_100.json    — 100 条结构化多轮 dialog
  train.json / val.json / test.json — Alpaca 指令微调格式（PsyQA 衍生）

输出:
  training_data/qiaoban/samples.jsonl
  training_data/qiaoban/knowledge_pairs.json
  training_data/qiaoban/stats.json

用法:
  python scripts/process_qiaoban_data.py
  python scripts/process_qiaoban_data.py --skip-instruct   # 仅儿童对话，跳过 train/val/test
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from psych_corpus_utils import build_record, clean_text

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
RAW_DIR = REPO_ROOT / "data"
OUT_DIR = REPO_ROOT / "training_data" / "qiaoban"
OUT_JSONL = OUT_DIR / "samples.jsonl"
OUT_KNOWLEDGE = OUT_DIR / "knowledge_pairs.json"
OUT_STATS = OUT_DIR / "stats.json"

CHILD_SPEAKERS = frozenset({"孩子", "儿童", "小朋友", "学生"})
ASSISTANT_SPEAKERS = frozenset({"智能助手", "助手", "心理咨询", "心理咨询师", "心理助手"})
SPEAKER_RE = re.compile(r"^([^：:\n]{1,12})[：:]\s*(.+)$", re.DOTALL)
INSTRUCT_Q_RE = re.compile(r"问题[：:]\s*(.+?)(?:\n描述[：:]|$)", re.DOTALL)
INSTRUCT_DESC_RE = re.compile(r"描述[：:]\s*(.+)$", re.DOTALL)

QIAOBAN_EMOTION_MAP: Dict[str, str] = {
    "angry": "frustrated",
    "sad": "sad",
    "happy": "happy",
    "fear": "anxious",
    "surprise": "surprised",
    "disgust": "frustrated",
    "neutral": "neutral",
}


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def is_child_speaker(name: str) -> bool:
    s = name.strip()
    if s in CHILD_SPEAKERS:
        return True
    return s.endswith("孩子") or "小朋友" in s


def is_assistant_speaker(name: str) -> bool:
    s = name.strip()
    if s in ASSISTANT_SPEAKERS:
        return True
    return "助手" in s or "咨询" in s


def parse_turns_from_text(raw: str) -> List[Tuple[str, str]]:
    """将 </s> 分隔或单行文本解析为 (speaker, text) 列表。"""
    turns: List[Tuple[str, str]] = []
    for chunk in re.split(r"</s>\s*", raw):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = SPEAKER_RE.match(chunk)
        if m:
            turns.append((m.group(1).strip(), m.group(2).strip()))
        elif turns:
            prev_speaker, prev_text = turns[-1]
            turns[-1] = (prev_speaker, f"{prev_text} {chunk}".strip())
        else:
            turns.append(("孩子", chunk))
    return turns


def turns_to_roles(turns: List[Tuple[str, str]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for speaker, text in turns:
        role = "user" if is_child_speaker(speaker) else "counselor"
        out.append({"role": role, "text": clean_text(text, 500)})
    return out


def dialog_record(
    source: str,
    turns: List[Dict[str, str]],
    *,
    topic: str = "",
    emotion: Optional[str] = None,
    algorithm_targets: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    user_msgs = [t["text"] for t in turns if t["role"] == "user" and t["text"]]
    bot_msgs = [t["text"] for t in turns if t["role"] == "counselor" and t["text"]]
    if not user_msgs:
        return None
    q = user_msgs[0]
    if topic and topic not in q:
        q = f"[{topic}] {q}" if len(q) < 180 else q
    a = bot_msgs[-1] if bot_msgs else " ".join(bot_msgs)
    if not a and len(bot_msgs) > 1:
        a = bot_msgs[-1]
    labels: Dict[str, Any] = {}
    if emotion:
        mapped = QIAOBAN_EMOTION_MAP.get(emotion.lower(), emotion)
        labels["emotions"] = [mapped]
        labels["problemTypes"] = ["child_emotion"]
    return build_record(
        source,
        q,
        a,
        turns=turns,
        labels=labels or None,
        algorithm_targets=algorithm_targets or ["neural", "ml", "statistical"],
    )


def iter_child_chat_data(path: Path) -> Iterable[Dict[str, Any]]:
    for item in load_json(path):
        topic = str(item.get("topic") or "").strip()
        raw = str(item.get("input") or "")
        if not raw:
            continue
        turns = turns_to_roles(parse_turns_from_text(raw))
        rec = dialog_record("qiaoban_child_5k", turns, topic=topic)
        if rec:
            yield rec


def iter_child_chat_100(path: Path) -> Iterable[Dict[str, Any]]:
    for item in load_json(path):
        topic = str(item.get("topic") or "").strip()
        emotion = str(item.get("emotion") or "").strip()
        dialog = item.get("dialog") or []
        turns_raw: List[Tuple[str, str]] = []
        for t in dialog:
            if isinstance(t, dict):
                speaker = str(t.get("speaker") or "孩子")
                text = str(t.get("text") or "")
            else:
                speaker, text = "孩子", str(t)
            if text.strip():
                turns_raw.append((speaker, text.strip()))
        turns = turns_to_roles(turns_raw)
        rec = dialog_record(
            "qiaoban_child_dialog",
            turns,
            topic=topic,
            emotion=emotion or None,
        )
        if rec:
            yield rec


def extract_instruct_qa(inp: str, out: str) -> Tuple[str, str]:
    q_match = INSTRUCT_Q_RE.search(inp)
    title = q_match.group(1).strip() if q_match else ""
    desc_match = INSTRUCT_DESC_RE.search(inp)
    desc = desc_match.group(1).strip() if desc_match else ""
    if title and desc:
        question = f"{title}（{desc[:200]}）" if len(desc) > 30 else f"{title} {desc}"
    else:
        question = title or desc or inp.strip()[:300]
    return clean_text(question, 400), clean_text(out, 900)


def iter_instruct_split(path: Path, split: str) -> Iterable[Dict[str, Any]]:
    source = f"qiaoban_instruct_{split}"
    for item in load_json(path):
        inp = str(item.get("input") or "")
        out = str(item.get("output") or "")
        if not inp or not out:
            continue
        q, a = extract_instruct_qa(inp, out)
        rec = build_record(
            source,
            q,
            a,
            algorithm_targets=["statistical", "ml", "neural"],
        )
        if rec:
            yield rec


def dedupe_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for r in records:
        key = re.sub(r"\s+", "", r["question"].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def collect_records(raw_dir: Path, skip_instruct: bool) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    all_records: List[Dict[str, Any]] = []
    stats: Dict[str, int] = {}

    child_5k = raw_dir / "child_chat_data.json"
    if child_5k.exists():
        batch = list(iter_child_chat_data(child_5k))
        stats["qiaoban_child_5k"] = len(batch)
        all_records.extend(batch)
        print(f"[OK] child_chat_data.json -> {len(batch)} 条")
    else:
        print(f"[SKIP] 未找到 {child_5k}")

    child_100 = raw_dir / "child_chat_100.json"
    if child_100.exists():
        batch = list(iter_child_chat_100(child_100))
        stats["qiaoban_child_dialog"] = len(batch)
        all_records.extend(batch)
        print(f"[OK] child_chat_100.json -> {len(batch)} 条")
    else:
        print(f"[SKIP] 未找到 {child_100}")

    if not skip_instruct:
        for split in ("train", "val", "test"):
            fp = raw_dir / f"{split}.json"
            if not fp.exists():
                continue
            batch = list(iter_instruct_split(fp, split))
            key = f"qiaoban_instruct_{split}"
            stats[key] = len(batch)
            all_records.extend(batch)
            print(f"[OK] {split}.json -> {len(batch)} 条")

    before = len(all_records)
    all_records = dedupe_records(all_records)
    stats["deduped_removed"] = before - len(all_records)
    stats["total"] = len(all_records)
    return all_records, stats


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser(description="巧板数据集归一化")
    parser.add_argument(
        "--skip-instruct",
        action="store_true",
        help="跳过 train/val/test（与 PsyQA 高度重叠时可只保留儿童对话）",
    )
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=RAW_DIR,
        help="原始 JSON 目录（默认 data/）",
    )
    args = parser.parse_args()

    raw_dir = args.raw_dir.resolve()

    print("=" * 50)
    print("巧板（QiaoBan）数据集处理")
    print(f"输入: {raw_dir}")
    print("=" * 50)

    records, stats = collect_records(raw_dir, args.skip_instruct)
    if not records:
        print("[FAIL] 未解析到任何记录，请确认 data/ 下 JSON 文件存在")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSONL, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    knowledge = [
        {"question": r["question"], "answer": r["answer"], "source": r["source"]}
        for r in records
        if r.get("language", "zh") == "zh"
    ]
    OUT_KNOWLEDGE.write_text(
        json.dumps({"knowledge": knowledge}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    risk_dist: Dict[str, int] = {}
    for r in records:
        lvl = r.get("labels", {}).get("riskLevel", "low")
        risk_dist[lvl] = risk_dist.get(lvl, 0) + 1

    report = {
        "bySource": {k: v for k, v in stats.items() if k not in ("total", "deduped_removed")},
        "dedupedRemoved": stats.get("deduped_removed", 0),
        "total": stats["total"],
        "riskDistribution": risk_dist,
        "outputs": {
            "samples": str(OUT_JSONL),
            "knowledgePairs": str(OUT_KNOWLEDGE),
        },
    }
    OUT_STATS.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n合计: {stats['total']} 条（去重移除 {stats.get('deduped_removed', 0)}）")
    print(f"  来源: {report['bySource']}")
    print(f"  风险分布: {risk_dist}")
    print(f"  -> {OUT_JSONL}")
    print(f"  -> {OUT_KNOWLEDGE}")
    print("\n下一步:")
    print("  python scripts/build_training_corpus.py")
    print("  python scripts/expand_knowledge_base.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
