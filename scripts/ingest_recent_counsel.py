#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把较新的公开咨询对话补进知识库。

来源：
  PsyDial-D4（ACL 2025，2382 段长对话）
  CPsyCounD（ACL 2024 Findings，3134 段中文咨询）

每段最多留 2 轮有实质内容的问答，跳过道谢和过短回复。
已有问题不重复写入。新行写入 SQLite，再用本机 bge-m3 增量写入当前 Qdrant 集合。
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
STATUS_PATH = ROOT / "training_data" / "fetch_status.json"
PENDING_PATH = ROOT / "training_data" / "recent_counsel_pending.json"
SOURCES = (
    ("pd4", ROOT / "training_data" / "psydial" / "PsyDial-D4.json"),
    ("cps", ROOT / "training_data" / "cpsycoun" / "CPsyCounD.json"),
)
ENCODER_URL = "http://127.0.0.1:8091/embed"
QDRANT = "http://127.0.0.1:6333"
COLLECTION = "psyqa_knowledge"
MAX_NEW = 3200
PAIRS_PER_DIALOG = 2
EMBED_BATCH = 8
UPSERT_BATCH = 16
JUNK = ("http://", "https://", "点击", "关注公众号", "加微信")
THANKS = re.compile(r"^(?:好的|谢谢|谢谢你|嗯+|哦+|我会|知道了|明白了|晚安|再见)")


def clean_text(text: str, max_len: int) -> str:
    text = re.sub(r"\s+", " ", str(text or "").strip())
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text


def normalize_question(question: str) -> str:
    text = re.sub(r"\s+", "", question.strip().lower())
    return re.sub(r"[?!.,，、;；:：\"'()\[\]（）【】]", "", text)


def usable_pair(question: str, answer: str) -> tuple[str, str] | None:
    question = clean_text(question, 200)
    answer = clean_text(answer, 900)
    if len(question) < 12 or len(answer) < 40 or question == answer:
        return None
    if THANKS.match(question):
        return None
    if any(token in answer for token in JUNK):
        return None
    return question, answer


def best_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    ranked = sorted(pairs, key=lambda item: len(item[0]), reverse=True)
    kept: list[tuple[str, str]] = []
    seen: set[str] = set()
    for question, answer in ranked:
        key = normalize_question(question)
        if key in seen:
            continue
        seen.add(key)
        kept.append((question, answer))
        if len(kept) >= PAIRS_PER_DIALOG:
            break
    return kept


def pairs_from_psydial(dialogue: dict) -> list[tuple[str, str]]:
    messages = dialogue.get("messages") or []
    found: list[tuple[str, str]] = []
    index = 0
    while index < len(messages) - 1:
        current = messages[index]
        nxt = messages[index + 1]
        if current.get("role") == "user" and nxt.get("role") == "assistant":
            pair = usable_pair(current.get("content") or "", nxt.get("content") or "")
            if pair:
                found.append(pair)
            index += 2
        else:
            index += 1
    return best_pairs(found)


def pairs_from_cpsycoun(row: dict) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for turn in row.get("history") or []:
        if isinstance(turn, list) and len(turn) >= 2:
            pair = usable_pair(turn[0], turn[1])
            if pair:
                found.append(pair)
    pair = usable_pair(row.get("instruction") or "", row.get("output") or "")
    if pair:
        found.append(pair)
    return best_pairs(found)


def load_dialogues(path: Path) -> list:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def collect_rows(existing: set[str]) -> tuple[list[tuple[str, str, str, str]], dict[str, int]]:
    stats = {"seen": 0, "duplicate": 0, "added": 0}
    rows: list[tuple[str, str, str, str]] = []
    seen = set(existing)
    for prefix, path in SOURCES:
        if not path.exists():
            print(f"缺少 {path.name}", flush=True)
            continue
        dialogues = load_dialogues(path)
        source_added = 0
        for dialogue in dialogues:
            if stats["added"] >= MAX_NEW:
                break
            pairs = pairs_from_psydial(dialogue) if prefix == "pd4" else pairs_from_cpsycoun(dialogue)
            stats["seen"] += len(pairs)
            for question, answer in pairs:
                key = normalize_question(question)
                if key in seen:
                    stats["duplicate"] += 1
                    continue
                seen.add(key)
                digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
                doc_id = f"{prefix}_{digest}"
                rows.append((doc_id, question, answer, f"{question} {answer}"))
                stats["added"] += 1
                source_added += 1
                if stats["added"] >= MAX_NEW:
                    break
        print(f"{path.name} 对话 {len(dialogues)}，新问答 {source_added}", flush=True)
    return rows, stats


def qdrant_point_id(doc_id: str) -> str:
    hex_ = hashlib.sha256(doc_id.encode("utf-8")).hexdigest()[:32]
    return f"{hex_[:8]}-{hex_[8:12]}-4{hex_[13:16]}-a{hex_[17:20]}-{hex_[20:32]}"


def request_json(method: str, url: str, payload: dict | None = None, timeout: int = 180) -> dict:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body else {}


def wait_ready() -> None:
    deadline = time.time() + 180
    last = ""
    while time.time() < deadline:
        try:
            encoder = request_json("GET", "http://127.0.0.1:8091/health", timeout=5)
            qdrant = request_json("GET", "http://127.0.0.1:6333/collections/psyqa_knowledge", timeout=5)
            if encoder.get("ok") and qdrant.get("result", {}).get("points_count") is not None:
                print(f"索引前点数 {qdrant['result']['points_count']}", flush=True)
                return
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
            message = str(exc)
            if message != last:
                print(f"等待编码器和 Qdrant：{message}", flush=True)
                last = message
        time.sleep(3)
    raise RuntimeError("编码器或 Qdrant 未就绪")


def encode(texts: list[str]) -> list[dict]:
    result = request_json(
        "POST",
        ENCODER_URL,
        {"texts": texts, "max_length": 768, "colbert_k": 64},
        timeout=180,
    )
    items = result.get("items") or []
    if not result.get("ok") or len(items) != len(texts):
        raise RuntimeError("编码返回条数不对")
    return items


def point_from(row: tuple[str, str, str, str], encoded: dict) -> dict | None:
    doc_id, question, answer, _content = row
    sparse = encoded.get("sparse") or {}
    dense = encoded.get("dense") or []
    colbert = encoded.get("colbert") or []
    if len(dense) != 1024 or not colbert or not sparse.get("indices"):
        return None
    return {
        "id": qdrant_point_id(doc_id),
        "vector": {
            "dense": dense,
            "colbert": colbert,
            "lexical": {"indices": sparse["indices"], "values": sparse["values"]},
        },
        "payload": {"docId": doc_id, "question": question[:200], "answer": answer[:500]},
    }


def upsert(points: list[dict]) -> None:
    delay = 2
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            request_json(
                "PUT",
                f"{QDRANT}/collections/{COLLECTION}/points?wait=true",
                {"points": points},
                timeout=180,
            )
            return
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            print(f"写入重试 {attempt + 1}：{exc}", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 20)
    raise RuntimeError(f"写入失败：{last_error}")


def index_rows(rows: list[tuple[str, str, str, str]]) -> int:
    wait_ready()
    indexed = 0
    pending: list[dict] = []
    started = time.time()
    for offset in range(0, len(rows), EMBED_BATCH):
        chunk = rows[offset : offset + EMBED_BATCH]
        encoded = encode([row[3] for row in chunk])
        for row, item in zip(chunk, encoded):
            point = point_from(row, item)
            if point:
                pending.append(point)
        if len(pending) >= UPSERT_BATCH or offset + EMBED_BATCH >= len(rows):
            if pending:
                upsert(pending)
                indexed += len(pending)
                pending = []
                elapsed = max(time.time() - started, 0.1)
                print(f"已写入向量 {indexed}/{len(rows)}，{indexed / elapsed:.1f} 条/秒", flush=True)
    return indexed


def mark_status() -> None:
    status = {}
    if STATUS_PATH.exists():
        status = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    inventory = status.setdefault("localInventory", {})
    ready = inventory.setdefault("ready", [])
    missing = inventory.setdefault("missing", [])
    for name in ("psydial", "cpsycoun"):
        if name not in ready:
            ready.append(name)
        if name in missing:
            missing.remove(name)
    paths = inventory.setdefault("paths", {})
    paths["psydial"] = str(SOURCES[0][1])
    paths["cpsycoun"] = str(SOURCES[1][1])
    status["time"] = time.strftime("%Y-%m-%d %H:%M:%S")
    status.setdefault("results", {})["psydial_d4"] = "ok"
    status["results"]["cpsycoun"] = "ok"
    STATUS_PATH.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")


def index_pending_file() -> int:
    pending = load_pending(DB_PATH)
    if not pending:
        return 0
    indexed = index_rows(pending)
    info = request_json("GET", f"{QDRANT}/collections/{COLLECTION}")
    print(f"补写向量 {indexed}，当前点数 {info.get('result', {}).get('points_count')}", flush=True)
    if PENDING_PATH.exists():
        PENDING_PATH.unlink()
    return indexed


def main() -> int:
    if not DB_PATH.exists():
        print(f"缺少 {DB_PATH}")
        return 1
    index_pending_file()
    con = sqlite3.connect(DB_PATH, timeout=60)
    con.execute("PRAGMA busy_timeout = 60000")
    before = con.execute("SELECT COUNT(*) FROM vector_documents").fetchone()[0]
    existing = {normalize_question(question or "") for (question,) in con.execute("SELECT question FROM vector_documents")}
    rows, stats = collect_rows(existing)
    con.executemany(
        "INSERT OR IGNORE INTO vector_documents(id, question, answer, content, embedding_json) VALUES(?, ?, ?, ?, NULL)",
        rows,
    )
    con.commit()
    after = con.execute("SELECT COUNT(*) FROM vector_documents").fetchone()[0]
    con.close()
    print(
        f"候选 {stats['seen']} | 重复 {stats['duplicate']} | 新增 {after - before} | 库内 {after}",
        flush=True,
    )
    if not rows:
        mark_status()
        return 0
    PENDING_PATH.write_text(json.dumps([row[0] for row in rows], ensure_ascii=False), encoding="utf-8")
    indexed = index_rows(rows)
    info = request_json("GET", f"{QDRANT}/collections/{COLLECTION}")
    print(f"向量写入 {indexed}，当前点数 {info.get('result', {}).get('points_count')}", flush=True)
    mark_status()
    if PENDING_PATH.exists():
        PENDING_PATH.unlink()
    return 0


def load_pending(con_path: Path) -> list[tuple[str, str, str, str]]:
    if not PENDING_PATH.exists():
        return []
    ids = json.loads(PENDING_PATH.read_text(encoding="utf-8"))
    if not ids:
        return []
    con = sqlite3.connect(con_path, timeout=60)
    placeholders = ",".join("?" for _ in ids)
    found = con.execute(
        f"SELECT id, question, answer, content FROM vector_documents WHERE id IN ({placeholders})",
        ids,
    ).fetchall()
    con.close()
    print(f"继续上次未写完的 {len(found)} 条", flush=True)
    return [(str(row[0]), str(row[1]), str(row[2]), str(row[3])) for row in found]


if __name__ == "__main__":
    raise SystemExit(main())
