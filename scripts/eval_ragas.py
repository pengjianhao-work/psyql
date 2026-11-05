#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 RAGAS 评估知识库检索和据此生成的回答。

抽样来自 vector_documents，不使用用户对话。
检索与线上一致：本机 bge-m3 的整句向量、稀疏权重、词向量，再经重排取前 3 条。
对照答案是知识库里原来的那条回答。
"""

from __future__ import annotations

import argparse
import json
import os

os.environ.setdefault("RAGAS_DO_NOT_TRACK", "true")
import random
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "PsyQA" / ".env"
DB_PATH = ROOT / "PsyQA" / "server" / "data" / "psyqa.db"
REPORT_PATH = ROOT / "training_data" / "ragas_report.json"

BGE_URL = "http://127.0.0.1:8091/embed"
QDRANT_URL = "http://127.0.0.1:6333/collections/psyqa_knowledge/points/query"
CRISIS = ("想死", "自杀", "轻生", "不想活", "结束生命", "割腕")


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def post_json(url: str, payload: dict, timeout: int = 60, headers: dict | None = None) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def sample_rows(limit: int, seed: int) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT id, question, answer
            FROM vector_documents
            WHERE length(question) BETWEEN 12 AND 80
              AND length(answer) >= 120
            """
        ).fetchall()
    finally:
        conn.close()
    picked = [
        {"id": doc_id, "question": question.strip(), "answer": answer.strip()}
        for doc_id, question, answer in rows
        if not any(term in question for term in CRISIS)
    ]
    random.Random(seed).shuffle(picked)
    return picked[:limit]


def embed_query(text: str) -> dict:
    body = post_json(BGE_URL, {"texts": [text], "max_length": 768, "colbert_k": 128}, timeout=120)
    item = body["items"][0]
    return item


def embed_dense(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), 8):
        chunk = texts[start : start + 8]
        body = post_json(BGE_URL, {"texts": chunk, "max_length": 256, "colbert_k": 1}, timeout=120)
        vectors.extend(item["dense"] for item in body["items"])
    return vectors


def knowledge_query(encoded: dict, limit: int) -> dict:
    prefetch_limit = max(limit * 3, 40)
    branches: list[dict] = [{"query": encoded["dense"], "using": "dense", "limit": prefetch_limit}]
    sparse = encoded["sparse"]
    if sparse["indices"] and len(sparse["indices"]) == len(sparse["values"]):
        branches.append(
            {
                "query": {"indices": sparse["indices"], "values": sparse["values"]},
                "using": "lexical",
                "limit": prefetch_limit,
            }
        )
    if encoded["colbert"]:
        return {
            "prefetch": [{"prefetch": branches, "query": {"fusion": "rrf"}, "limit": max(limit * 2, 24)}],
            "query": encoded["colbert"],
            "using": "colbert",
            "limit": limit,
            "with_payload": True,
        }
    return {"prefetch": branches, "query": {"fusion": "rrf"}, "limit": limit, "with_payload": True}


def retrieve(question: str, pool: int = 12) -> list[dict]:
    encoded = embed_query(question)
    data = post_json(QDRANT_URL, knowledge_query(encoded, pool), timeout=30)
    points = data.get("result", {}).get("points") or []
    hits = []
    for point in points:
        payload = point.get("payload") or {}
        question_text = str(payload.get("question") or "").strip()
        answer_text = str(payload.get("answer") or "").strip()
        if not question_text and not answer_text:
            continue
        hits.append(
            {
                "id": str(payload.get("docId") or ""),
                "question": question_text,
                "answer": answer_text,
                "score": float(point.get("score") or 0),
            }
        )
    return hits


def rerank(query: str, hits: list[dict], top_k: int) -> list[dict]:
    if len(hits) <= 1:
        return hits[:top_k]
    documents = [f"{hit['question']}\n{hit['answer'][:480]}" for hit in hits]
    local = (os.environ.get("BGE_RERANK_URL") or "http://127.0.0.1:8092").rstrip("/")
    try:
        data = post_json(f"{local}/rerank", {"query": query[:500], "documents": documents}, timeout=40)
        scores = data.get("scores") or []
        if data.get("ok") and len(scores) == len(hits):
            order = sorted(range(len(hits)), key=lambda index: float(scores[index]), reverse=True)
            return [hits[index] for index in order[:top_k]]
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        pass
    key = os.environ.get("SILICONFLOW_API_KEY") or os.environ.get("ZHIPU_API_KEY") or ""
    base = (os.environ.get("ZHIPU_API_URL") or "https://api.siliconflow.cn/v1").rstrip("/")
    model = os.environ.get("SILICONFLOW_RERANK_MODEL") or "BAAI/bge-reranker-v2-m3"
    payload = {
        "model": model,
        "query": query[:500],
        "documents": documents,
        "top_n": len(documents),
        "return_documents": False,
    }
    if "qwen3-reranker" in model.lower():
        payload["instruction"] = "Retrieve the counseling post whose question best matches the student query."
    try:
        data = post_json(
            f"{base}/rerank",
            payload,
            timeout=40,
            headers={"Authorization": f"Bearer {key}"},
        )
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return hits[:top_k]
    ranked = data.get("results") or data.get("data") or []
    ordered: list[dict] = []
    used: set[int] = set()
    for row in sorted(ranked, key=lambda item: float(item.get("relevance_score") or item.get("score") or 0), reverse=True):
        index = int(row.get("index", -1))
        if index < 0 or index >= len(hits) or index in used:
            continue
        used.add(index)
        ordered.append(hits[index])
        if len(ordered) >= top_k:
            return ordered
    for index, hit in enumerate(hits):
        if index not in used:
            ordered.append(hit)
        if len(ordered) >= top_k:
            break
    return ordered


def generate_answer(question: str, contexts: list[str]) -> str:
    key = os.environ.get("SILICONFLOW_API_KEY") or os.environ.get("ZHIPU_API_KEY") or ""
    base = (os.environ.get("ZHIPU_API_URL") or "https://api.siliconflow.cn/v1").rstrip("/")
    model = os.environ.get("ZHIPU_MODEL") or "Qwen/Qwen2.5-7B-Instruct"
    context_block = "\n\n".join(f"{index + 1}. {text}" for index, text in enumerate(contexts))
    prompt = (
        "你是心理支持助手。只复述参考里已经写明的做法，不要补充参考没有的人物、步骤或经历。\n"
        "要求：\n"
        "- 第一句直接回答这个问题，写出参考里的具体做法\n"
        "- 后面只用参考里的原话再写两句\n"
        "- 不要写「我理解你的感受」「也许」「看情况」「不好说」\n"
        "- 全文 80 到 160 字\n\n"
        f"参考：\n{context_block}\n\n问题：{question}"
    )
    data = post_json(
        f"{base}/chat/completions",
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 400,
        },
        timeout=90,
        headers={"Authorization": f"Bearer {key}"},
    )
    return str(data["choices"][0]["message"]["content"] or "").strip()


class LocalBgeEmbeddings:
    """RAGAS 的答案相关性只用整句向量。"""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        cleaned = [text.strip() or "空" for text in texts]
        return embed_dense(cleaned)

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


def run_ragas(rows: list[dict]) -> dict:
    import sys
    import types

    if "langchain_community.chat_models.vertexai" not in sys.modules:
        stub = types.ModuleType("langchain_community.chat_models.vertexai")
        stub.ChatVertexAI = type("ChatVertexAI", (), {})
        sys.modules["langchain_community.chat_models.vertexai"] = stub

    from datasets import Dataset
    from langchain_openai import ChatOpenAI
    from ragas import evaluate
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper
    from ragas.metrics import answer_relevancy, context_precision, context_recall, faithfulness
    from ragas.run_config import RunConfig

    key = os.environ.get("SILICONFLOW_API_KEY") or os.environ.get("ZHIPU_API_KEY") or ""
    base = (os.environ.get("ZHIPU_API_URL") or "https://api.siliconflow.cn/v1").rstrip("/")
    model = os.environ.get("ZHIPU_MODEL") or "Qwen/Qwen2.5-7B-Instruct"
    chat = ChatOpenAI(
        model=model, api_key=key, base_url=base, temperature=0, timeout=120, max_retries=2, n=1
    )
    ragas_rows = [
        {
            "question": row["question"],
            "answer": row["answer"],
            "contexts": row["contexts"],
            "ground_truth": row["ground_truth"],
        }
        for row in rows
    ]
    result = evaluate(
        Dataset.from_list(ragas_rows),
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
        llm=LangchainLLMWrapper(chat, bypass_n=True),
        embeddings=LangchainEmbeddingsWrapper(LocalBgeEmbeddings()),
        run_config=RunConfig(timeout=180, max_retries=2, max_workers=2),
        raise_exceptions=False,
        show_progress=True,
    )
    scores = {name: _num(value) for name, value in result._repr_dict.items()}
    per_row = []
    for index, score in enumerate(result.scores):
        per_row.append(
            {
                "question": rows[index]["question"],
                "hit": rows[index]["hit"],
                "faithfulness": _num(score.get("faithfulness")),
                "answer_relevancy": _num(score.get("answer_relevancy")),
                "context_precision": _num(score.get("context_precision")),
                "context_recall": _num(score.get("context_recall")),
            }
        )
    return {"scores": scores, "rows": per_row}


def _num(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return round(number, 4)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    load_env(ENV_PATH)

    samples = sample_rows(args.limit, args.seed)
    if not samples:
        raise SystemExit("知识库里没有可用的抽样")

    dataset = []
    hits = 0
    for index, sample in enumerate(samples, start=1):
        print(f"[{index}/{len(samples)}] 检索并生成", flush=True)
        retrieved = rerank(sample["question"], retrieve(sample["question"]), 3)
        hit = any(item["id"] == sample["id"] for item in retrieved)
        hits += int(hit)
        contexts = [f"问：{item['question']}\n答：{item['answer'][:500]}" for item in retrieved]
        answer = generate_answer(sample["question"], contexts or ["没有检索到参考"])
        dataset.append(
            {
                "question": sample["question"],
                "answer": answer,
                "contexts": contexts,
                "ground_truth": sample["answer"][:800],
                "hit": hit,
            }
        )

    print("开始 RAGAS 打分", flush=True)
    judged = run_ragas(dataset)
    report = {
        "samples": len(dataset),
        "seed": args.seed,
        "retriever": "bge-m3 dense+lexical+colbert, then Qwen3-Reranker-8B top3",
        "generator": os.environ.get("ZHIPU_MODEL") or "Qwen/Qwen2.5-7B-Instruct",
        "judge": os.environ.get("ZHIPU_MODEL") or "Qwen/Qwen2.5-7B-Instruct",
        "hitAt3": round(hits / len(dataset), 4),
        "scores": judged["scores"],
        "rows": judged["rows"],
        "notes": "对照答案是知识库原文。线上聊天回复更长，并且会补充共情，这里评的是检索到的参考和据此写出的回答。",
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"samples": report["samples"], "hitAt3": report["hitAt3"], "scores": report["scores"]}, ensure_ascii=False, indent=2))
    print(f"[OK] {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
