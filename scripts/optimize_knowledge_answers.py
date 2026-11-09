#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把知识库里较长回答的检索文本改成具体做法在前。

规则与 PsyQA/server/src/services/knowledge/answerQuality.ts 一致。
只改 Qdrant 里原有回答的 answer 字段，不改向量，也不改新加入的短对话。
SQLite 仍保留全文。
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "PsyQA" / "server" / "data" / "psyqa.db"
QDRANT = "http://127.0.0.1:6333/collections/psyqa_knowledge/points/batch?wait=true"
MAX_LEN = 480
ACTION = re.compile(r"可以先|建议|试试|不妨|试着|步骤|每天|分钟|写下来|呼吸|安排|计划|记录|休息|联系|先把|先做|你可以")
GENERIC_START = re.compile(r"^(?:我理解|听起来|辛苦了|谢谢你的|抱抱|你并不孤单|我能感觉到|看到你|你愿意|你的感受)")


def clip(text: str, max_len: int = MAX_LEN) -> str:
    if len(text) <= max_len:
        return text
    cut = text[:max_len]
    last = max(cut.rfind("。"), cut.rfind("！"), cut.rfind("？"))
    if last > max_len * 0.55:
        return cut[: last + 1]
    return cut.strip()


def polish_knowledge_answer(answer: str, max_len: int = MAX_LEN) -> str:
    text = re.sub(r"\s+", " ", answer or "").strip()
    if not text or len(text) <= 80:
        return text
    parts = [part.strip() for part in re.split(r"(?<=[。！？])", text) if part.strip()]
    if len(parts) <= 1:
        return clip(text, max_len)
    start = 0
    while start < len(parts) - 1 and GENERIC_START.match(parts[start]) and not ACTION.search(parts[start]):
        start += 1
    return clip("".join(parts[start:]), max_len)


def qdrant_point_id(doc_id: str) -> str:
    hex_ = hashlib.sha256(doc_id.encode("utf-8")).hexdigest()[:32]
    return f"{hex_[:8]}-{hex_[8:12]}-4{hex_[13:16]}-a{hex_[17:20]}-{hex_[20:32]}"


def request_json(payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    delay = 2
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(QDRANT, data=data, method="POST", headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            if body.get("status") not in (None, "ok"):
                raise RuntimeError(body.get("status"))
            return
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            print(f"写入重试 {attempt + 1}：{exc}", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 20)
    raise RuntimeError(f"写入失败：{last_error}")


def main() -> int:
    checks = {
        "我理解你的感受。可以先把今天要做的事写成三件，只完成第一件。": "可以先",
        "先睡一觉，明天再看。": "先睡一觉，明天再看。",
    }
    for source, expected in checks.items():
        got = polish_knowledge_answer(source)
        if expected not in got:
            raise SystemExit("规则和线上不一致")

    con = sqlite3.connect(DB_PATH, timeout=60)
    rows = con.execute(
        """
        SELECT id, answer FROM vector_documents
        WHERE id NOT LIKE 'pd4_%' AND id NOT LIKE 'cps_%'
        """
    ).fetchall()
    con.close()

    updates: list[tuple[str, str]] = []
    for doc_id, answer in rows:
        polished = polish_knowledge_answer(answer or "")
        if not polished or polished == (answer or "")[: len(polished)]:
            continue
        updates.append((qdrant_point_id(doc_id), polished))

    print(f"原有回答 {len(rows)}，需要提前具体做法 {len(updates)}", flush=True)
    batch = 32
    for offset in range(0, len(updates), batch):
        chunk = updates[offset : offset + batch]
        request_json(
            {
                "operations": [
                    {"set_payload": {"payload": {"answer": answer}, "points": [point_id]}}
                    for point_id, answer in chunk
                ]
            }
        )
        if offset % 320 == 0:
            print(f"已更新 {min(offset + batch, len(updates))}/{len(updates)}", flush=True)
    print(f"完成 {len(updates)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
