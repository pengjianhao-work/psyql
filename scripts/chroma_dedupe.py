#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chroma / vector_db 去重：按 question 前缀保留最高相似度条目。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DOCS_JSON = REPO_ROOT / "PsyQA" / "vector_db" / "documents.json"
OUT_JSON = REPO_ROOT / "PsyQA" / "vector_db" / "documents.deduped.json"


def dedupe_documents(docs: list[dict]) -> tuple[list[dict], int]:
    seen: dict[str, dict] = {}
    removed = 0
    for doc in docs:
        q = str(doc.get("question") or doc.get("content", "")[:80])
        key = q.strip()[:80]
        if not key:
            continue
        prev = seen.get(key)
        if prev is None:
            seen[key] = doc
        else:
            removed += 1
            prev_len = len(str(prev.get("answer", "")))
            cur_len = len(str(doc.get("answer", "")))
            if cur_len > prev_len:
                seen[key] = doc
    return list(seen.values()), removed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DOCS_JSON)
    parser.add_argument("--output", type=Path, default=OUT_JSON)
    parser.add_argument("--in-place", action="store_true")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"[ERR] 未找到 {args.input}")
        return 1

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    docs = raw if isinstance(raw, list) else raw.get("documents", [])
    deduped, removed = dedupe_documents(docs)

    out_path = args.input if args.in_place else args.output
    payload = deduped if isinstance(raw, list) else {**raw, "documents": deduped}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] 原始 {len(docs)} 条 → 去重后 {len(deduped)} 条（移除 {removed}）")
    print(f"  写入: {out_path}")
    print("  下一步: npm run vector:resync && npm run sync:chroma:reset")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
