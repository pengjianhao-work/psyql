#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清洗豆包蒸馏原文：去诊断/开药/编造电话，危机题不入库。"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DISTILL = ROOT / "training_data" / "distill_doubao"
SEEDS = DISTILL / "seeds.jsonl"
RAW = DISTILL / "raw_answers.jsonl"
OUT = DISTILL / "scrubbed.jsonl"
PACK = ROOT / "PsyQA" / "server" / "data" / "scenario_skill_pack.json"

MED_RE = re.compile(
    r"(自行)?(吃|服用|开|停|换)?(安眠|抗抑|焦|镇定)?药|处方|剂量|SSRIs?",
    re.I,
)
PHONE_RE = re.compile(r"(电话|热线|呼叫)[:：\s]*\d[\d\- ]{5,}|1[3-9]\d{9}")
DIAG_RE = re.compile(r"(你得了|确诊为|属于)(抑郁|焦虑|双相|精分)\w*|抑郁症诊断")
FAKE_ORG_RE = re.compile(r"心理中心电话[是为]?\s*\d+")


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def scrub_text(text: str) -> str:
    t = text.strip()
    t = MED_RE.sub("（已去除用药建议）", t)
    t = PHONE_RE.sub("心理援助热线（以官方公布为准）", t)
    t = FAKE_ORG_RE.sub("校内心理中心联系方式请以学校官方渠道为准", t)
    t = DIAG_RE.sub("情绪困扰", t)
    t = t.replace("这不是抑郁症诊断，只是支持建议。", "")
    t = t.replace("不要自行吃安眠药或随便停药。", "用药相关请咨询专业医护，我这里不能建议用药。")
    t = re.sub(r"（已去除用药建议）+", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    if "心理援助" not in t and "校内" not in t:
        t += " 若持续难受，可联系身边信任的人或校内心理中心。"
    return t


def main() -> int:
    seeds = {r["id"]: r for r in load_jsonl(SEEDS)}
    raws = {r["id"]: r for r in load_jsonl(RAW)}
    scrubbed: list[dict] = []
    pack_items: list[dict] = []

    for sid, seed in seeds.items():
        raw = raws.get(sid)
        if not raw:
            continue
        if seed.get("crisis"):
            continue
        answer = scrub_text(str(raw.get("answer") or ""))
        if len(answer) < 40:
            continue
        row = {
            "id": sid,
            "question": seed["question"],
            "answer": answer,
            "problems": seed.get("problems") or [],
            "emotions": seed.get("emotions") or [],
            "source": "doubao_distill_scrubbed",
        }
        scrubbed.append(row)
        pack_items.append(
            {
                "question": row["question"],
                "answer": row["answer"],
                "tags": {
                    "problems": row["problems"],
                    "emotions": row["emotions"],
                    "interventionTypes": ["supportive"],
                },
            }
        )

    DISTILL.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for row in scrubbed:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    PACK.write_text(
        json.dumps(
            {
                "instruction": "场景技能包：蒸馏清洗后的支持性问答，不能替代专业咨询。",
                "knowledge": pack_items,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[OK] scrubbed={len(scrubbed)} -> {OUT}")
    print(f"[OK] scenario_skill_pack={len(pack_items)} -> {PACK}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
