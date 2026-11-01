"""用本机 bge-m3 重建知识库。

dense: 全文一个 1024 维向量
lexical: 全文的稀疏词权重
colbert: 每条只留 64 个权重最高的词，Qdrant 以 float16 存储

先写入 psyqa_knowledge_m3，完成后再替换线上集合名。
咨询回答用的大模型不经过这里。
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from bge_m3_encoder import DEFAULT_MODEL, BgeM3Encoder

DEFAULT_DB = Path(r"C:\Users\lenovo\Desktop\PsyQA1\PsyQA\server\data\psyqa.db")
LIVE_NAME = "psyqa_knowledge"
STAGING_NAME = "psyqa_knowledge_m3"
DIM = 1024
COLBERT_KEEP = 64

CHECKPOINT = Path(r"D:\huggingface\bge-m3\reindex_offset.txt")
COLLECTION_BODY = {
    "vectors": {
        "dense": {"size": DIM, "distance": "Cosine", "on_disk": True},
        "colbert": {
            "size": DIM,
            "distance": "Cosine",
            "datatype": "float16",
            # m=0：不为每个词建全库图。查询时只对整句向量和词权重召回的候选做 MaxSim。
            "on_disk": True,
            "hnsw_config": {"m": 0},
            "multivector_config": {"comparator": "max_sim"},
        },
    },
    "sparse_vectors": {"lexical": {}},
    "hnsw_config": {"on_disk": True},
    "optimizers_config": {
        "default_segment_number": 2,
        "max_segment_size": 500000,
        "indexing_threshold": 200000,
        "memmap_threshold": 1000,
        "flush_interval_sec": 5,
    },
}


def qdrant_point_id(doc_id: str) -> str:
    import hashlib

    hex_ = hashlib.sha256(doc_id.encode("utf-8")).hexdigest()[:32]
    return f"{hex_[:8]}-{hex_[8:12]}-4{hex_[13:16]}-a{hex_[17:20]}-{hex_[20:32]}"


def request_json(method: str, url: str, payload: dict | None = None, timeout: int = 120) -> dict:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} -> {exc.code} {detail}") from exc


def delete_collection(base: str, name: str) -> None:
    try:
        request_json("DELETE", f"{base}/collections/{name}")
    except RuntimeError as exc:
        if " 404 " not in str(exc):
            raise


def collection_exists(base: str) -> bool:
    try:
        request_json("GET", f"{base}/collections/{STAGING_NAME}", timeout=10)
        return True
    except RuntimeError as exc:
        if " 404 " in str(exc):
            return False
        raise


def create_staging(base: str, resume: bool) -> int:
    if resume and collection_exists(base) and CHECKPOINT.exists():
        offset = int(CHECKPOINT.read_text(encoding="utf-8").strip() or "0")
        print(f"resume from {offset}", flush=True)
        return offset
    delete_collection(base, STAGING_NAME)
    request_json("PUT", f"{base}/collections/{STAGING_NAME}", COLLECTION_BODY, timeout=30)
    CHECKPOINT.write_text("0", encoding="utf-8")
    return 0


def ensure_qdrant(base: str) -> None:
    try:
        with urllib.request.urlopen(f"{base}/healthz", timeout=5) as resp:
            if resp.status == 200:
                return
    except Exception:
        pass
    script = Path(r"C:\Users\lenovo\Desktop\PsyQA1\PsyQA\scripts\start-qdrant.ps1")
    print("qdrant down, starting", flush=True)
    import subprocess

    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        check=False,
    )
    time.sleep(4)


def load_rows(db_path: Path, limit: int) -> list[tuple[str, str, str, str]]:
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA query_only = ON")
    try:
        sql = "SELECT id, question, answer, content FROM vector_documents ORDER BY length(content), id"
        if limit > 0:
            sql += f" LIMIT {int(limit)}"
        return list(conn.execute(sql))
    finally:
        conn.close()


def upsert(base: str, points: list[dict]) -> None:
    delay = 2
    last_error: Exception | None = None
    for attempt in range(8):
        try:
            request_json(
                "PUT",
                f"{base}/collections/{STAGING_NAME}/points?wait=true",
                {"points": points},
                timeout=180,
            )
            return
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            print(f"upsert retry {attempt + 1}: {exc}", flush=True)
            ensure_qdrant(base)
            time.sleep(delay)
            delay = min(delay * 2, 30)
    raise RuntimeError(f"upsert failed after retries: {last_error}")


def wait_for_count(base: str, expected: int) -> int | None:
    deadline = time.time() + 900
    last = None
    while time.time() < deadline:
        info = request_json("GET", f"{base}/collections/{STAGING_NAME}")
        count = info.get("result", {}).get("points_count")
        if count == expected:
            return count
        if count != last:
            print(f"waiting count {count}/{expected}", flush=True)
            last = count
        time.sleep(2)
    return last


def swap_in(base: str, live: str) -> None:
    aliases = request_json("GET", f"{base}/aliases").get("result", {}).get("aliases", [])
    live_alias = next((item for item in aliases if item.get("alias_name") == live), None)
    if live_alias:
        request_json(
            "POST",
            f"{base}/collections/aliases",
            {"actions": [{"delete_alias": {"alias_name": live}}]},
        )
        old_target = live_alias.get("collection_name")
        if old_target and old_target != STAGING_NAME:
            delete_collection(base, old_target)
    else:
        delete_collection(base, live)
    request_json(
        "POST",
        f"{base}/collections/aliases",
        {"actions": [{"create_alias": {"collection_name": STAGING_NAME, "alias_name": live}}]},
    )


def point_from(row: tuple[str, str, str, str], encoded: dict) -> dict | None:
    """一条文档写成 Qdrant 的一个点。字段名 dense / colbert / lexical 要和 qdrantHybrid.ts 一致。"""
    doc_id, question, answer, _content = row
    colbert = encoded["colbert"]
    sparse = encoded["sparse"]
    if len(encoded["dense"]) != DIM or not colbert or not sparse["indices"]:
        return None
    return {
        "id": qdrant_point_id(doc_id),
        "vector": {
            "dense": encoded["dense"],
            "colbert": colbert,
            "lexical": {"indices": sparse["indices"], "values": sparse["values"]},
        },
        "payload": {
            "docId": doc_id,
            "question": (question or "")[:200],
            "answer": (answer or "")[:500],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="重建 bge-m3 混合向量库")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--qdrant", default="http://localhost:6333")
    parser.add_argument("--live", default=LIVE_NAME)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--max-length", type=int, default=768)
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 条，0 表示全部")
    parser.add_argument("--no-swap", action="store_true", help="写完暂存集合后不替换线上集合")
    args = parser.parse_args()

    base = args.qdrant.rstrip("/")
    rows = load_rows(args.db, args.limit)
    if not rows:
        print("没有可读的 vector_documents", flush=True)
        return 2
    print(f"documents {len(rows)} colbert_keep {COLBERT_KEEP} max_length {args.max_length}", flush=True)
    offset = create_staging(base, args.resume)
    encoder = BgeM3Encoder(args.model)
    print(f"encoder device {encoder.device}", flush=True)

    started = time.time()
    done = offset
    skipped = 0
    batch_size = max(1, args.batch)
    index = offset
    inflight: dict | None = None

    def join_upsert() -> None:
        nonlocal inflight
        if inflight is None:
            return
        inflight["thread"].join()
        errors = inflight["error"]
        inflight = None
        if errors:
            raise errors[0]

    while index < len(rows):
        chunk = rows[index : index + batch_size]
        texts = [(row[3] or f"{row[1]} {row[2]}").strip() for row in chunk]
        t0 = time.time()
        try:
            encoded = encoder.encode(texts, max_length=args.max_length, colbert_k=COLBERT_KEEP)
        except RuntimeError as exc:
            if "out of memory" not in str(exc).lower() or len(chunk) == 1:
                raise
            join_upsert()
            torch_empty()
            batch_size = max(1, len(chunk) // 2)
            print(f"显存不足，批量改为 {batch_size}", flush=True)
            continue
        points = []
        chunk_skipped = 0
        for row, item in zip(chunk, encoded):
            point = point_from(row, item)
            if point is None:
                chunk_skipped += 1
            else:
                points.append(point)
        t1 = time.time()
        join_upsert()
        next_index = index + len(chunk)
        error_box: list[BaseException] = []

        def write_batch(batch_points: list[dict], checkpoint: int, box: list[BaseException]) -> None:
            try:
                if batch_points:
                    upsert(base, batch_points)
                CHECKPOINT.write_text(str(checkpoint), encoding="utf-8")
            except BaseException as exc:  # noqa: BLE001
                box.append(exc)

        thread = threading.Thread(target=write_batch, args=(points, next_index, error_box))
        thread.start()
        inflight = {"thread": thread, "error": error_box}
        skipped += chunk_skipped
        done = next_index
        index = next_index
        elapsed = time.time() - started
        rate = (done - offset) / elapsed if elapsed else 0
        left = (len(rows) - done) / rate if rate else 0
        print(
            f"progress {done}/{len(rows)} skipped {skipped} {rate:.1f}/s encode {t1 - t0:.2f}s left {left / 60:.1f} min",
            flush=True,
        )

    join_upsert()

    count = wait_for_count(base, len(rows) - skipped)
    print(f"staging {STAGING_NAME} count {count}", flush=True)
    if not args.no_swap and args.limit == 0:
        if count != len(rows) - skipped:
            print("点数和文档数不一致，没有替换线上集合", flush=True)
            return 1
        swap_in(base, args.live)
        print(f"alias {args.live} -> {STAGING_NAME}", flush=True)
    return 0


def torch_empty() -> None:
    import torch

    if torch.cuda.is_available():
        torch.cuda.empty_cache()


if __name__ == "__main__":
    raise SystemExit(main())
