#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 scenario_skill_pack.json 去重合并进 mental_dataset.json。"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "PsyQA" / "server" / "data"
PACK = DATA / "scenario_skill_pack.json"
DATASET = DATA / "mental_dataset.json"


def norm_q(q: str) -> str:
    return "".join((q or "").split()).lower()


def main() -> int:
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    knowledge = list(dataset.get("knowledge") or [])
    existing = {norm_q(str(item.get("question") or "")) for item in knowledge}

    added = 0
    updated = 0
    by_q = {norm_q(str(item.get("question") or "")): i for i, item in enumerate(knowledge)}
    for item in pack.get("knowledge") or []:
        q = str(item.get("question") or "").strip()
        a = str(item.get("answer") or "").strip()
        if not q or not a:
            continue
        key = norm_q(q)
        tags = item.get("tags") or {
            "problems": [],
            "emotions": [],
            "interventionTypes": ["supportive"],
        }
        if key in by_q:
            idx = by_q[key]
            if knowledge[idx].get("answer") != a:
                knowledge[idx]["answer"] = a
                knowledge[idx]["tags"] = tags
                updated += 1
            continue
        knowledge.append({"question": q, "answer": a, "tags": tags})
        by_q[key] = len(knowledge) - 1
        added += 1

    dataset["knowledge"] = knowledge
    DATASET.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] added={added} updated={updated} total={len(knowledge)} -> {DATASET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
