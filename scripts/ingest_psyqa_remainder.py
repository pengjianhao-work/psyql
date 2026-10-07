#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 PsyQA 全文里尚未入库、且通过去重和质量过滤的问答写入 SQLite。

不改已有向量。新行的 embedding_json 为空，随后用 npm run build:embeddings:all
和 npm run sync:qdrant 补向量。过长回答截到 900 字，与知识合并时的清洗一致。
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "PsyQA" / "server" / "data" / "psyqa.db"
PSYQA_PATH = ROOT / "PsyQA" / "PsyQA_full.json"
DOCS_PATH = ROOT / "PsyQA" / "vector_db" / "documents.json"
JUNK = ("http://", "https://", "点击", "关注公众号", "加微信")


def normalize_question(question: str) -> str:
    text = re.sub(r"\s+", "", question.strip().lower())
    return re.sub(r"[?!.,，、;；:：\"'()\[\]（）【】]", "", text)


def clean_text(text: str, max_len: int) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text


def first_usable_answer(answers: list) -> str:
    for ans in answers:
        raw = ans.get("answer_text", "") if isinstance(ans, dict) else str(ans or "")
        answer = clean_text(raw, 900)
        if len(answer) < 15:
            continue
        if any(token in answer for token in JUNK):
            continue
        return answer
    return ""


def load_existing_keys(con: sqlite3.Connection) -> set[str]:
    keys: set[str] = set()
    for (question,) in con.execute("SELECT question FROM vector_documents"):
        keys.add(normalize_question(question or ""))
    return keys


def collect_new_rows(existing: set[str]) -> tuple[list[tuple[str, str, str, str]], dict[str, int]]:
    data = json.loads(PSYQA_PATH.read_text(encoding="utf-8"))
    stats = {
        "source": len(data) if isinstance(data, list) else 0,
        "unusable": 0,
        "duplicate": 0,
        "added": 0,
        "truncated": 0,
    }
    rows: list[tuple[str, str, str, str]] = []
    seen = set(existing)
    for index, item in enumerate(data):
        question = clean_text(str(item.get("question") or ""), 200)
        raw_answers = item.get("answers") or []
        raw_first = ""
        if raw_answers:
            first = raw_answers[0]
            raw_first = first.get("answer_text", "") if isinstance(first, dict) else str(first or "")
        if len(re.sub(r"\s+", " ", raw_first.strip())) > 900:
            stats["truncated"] += 1
        answer = first_usable_answer(raw_answers)
        if len(question) < 4 or not answer or question == answer:
            stats["unusable"] += 1
            continue
        key = normalize_question(question)
        if key in seen:
            stats["duplicate"] += 1
            continue
        seen.add(key)
        doc_id = f"psyqa_src_{index}"
        content = f"{question} {answer}"
        rows.append((doc_id, question, answer, content))
        stats["added"] += 1
    return rows, stats


def export_documents(con: sqlite3.Connection) -> int:
    docs = [
        {"id": doc_id, "question": question, "answer": answer, "content": content}
        for doc_id, question, answer, content in con.execute(
            "SELECT id, question, answer, content FROM vector_documents ORDER BY id"
        )
    ]
    DOCS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCS_PATH.write_text(json.dumps(docs, ensure_ascii=False), encoding="utf-8")
    return len(docs)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    if not PSYQA_PATH.exists():
        print(f"缺少 {PSYQA_PATH}")
        return 1
    if not DB_PATH.exists():
        print(f"缺少 {DB_PATH}")
        return 1

    con = sqlite3.connect(DB_PATH, timeout=60)
    con.execute("PRAGMA busy_timeout = 60000")
    before = con.execute("SELECT COUNT(*) FROM vector_documents").fetchone()[0]
    existing = load_existing_keys(con)
    rows, stats = collect_new_rows(existing)
    print(
        f"PsyQA {stats['source']} 条 | 已有问题 {len(existing)} | "
        f"可新增 {stats['added']} | 重复 {stats['duplicate']} | "
        f"不合格 {stats['unusable']} | 回答被截断 {stats['truncated']}"
    )
    if dry_run:
        con.close()
        return 0

    inserted = 0
    con.execute("BEGIN")
    try:
        for doc_id, question, answer, content in rows:
            cur = con.execute(
                """
                INSERT OR IGNORE INTO vector_documents(id, question, answer, content, embedding_json)
                VALUES (?, ?, ?, ?, NULL)
                """,
                (doc_id, question, answer, content),
            )
            inserted += cur.rowcount
        con.commit()
    except Exception:
        con.rollback()
        raise
    after = con.execute("SELECT COUNT(*) FROM vector_documents").fetchone()[0]
    pending = con.execute(
        "SELECT COUNT(*) FROM vector_documents WHERE embedding_json IS NULL"
    ).fetchone()[0]
    exported = export_documents(con)
    con.close()
    print(f"写入 {inserted} 条 | 库内 {before} -> {after} | 待嵌入 {pending} | documents.json {exported}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
