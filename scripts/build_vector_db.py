#!/usr/bin/env python3
"""重建 vector_db/documents.json（路径相对仓库根目录）"""

import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
PSYQA_DIR = REPO_ROOT / "PsyQA"
KNOWLEDGE_PATH = PSYQA_DIR / "server" / "data" / "mental_dataset.json"
QA_PATH = PSYQA_DIR / "PsyQA_full.json"
VECTOR_DIR = REPO_ROOT / "vector_db"
VECTOR_FILE = VECTOR_DIR / "documents.json"


def search_simple(documents, query, top_k=3):
    query_chars = set(query)
    results = []
    for doc in documents:
        doc_chars = set(doc["content"])
        intersection = len(query_chars & doc_chars)
        union = len(query_chars | doc_chars)
        similarity = intersection / union if union > 0 else 0
        if similarity > 0.1:
            results.append({**doc, "similarity": similarity})
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k]


def build_vector_db(max_qa: int = 5000):
    documents = []

    if KNOWLEDGE_PATH.exists():
        with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            items = data.get("knowledge", data)
            for item in items:
                documents.append(
                    {
                        "id": f"kb_{len(documents)}",
                        "question": item.get("question", ""),
                        "answer": item.get("answer", ""),
                        "content": f"{item.get('question', '')} {item.get('answer', '')}",
                    }
                )
        print(f"Loaded {len(items)} knowledge items")

    if QA_PATH.exists():
        with open(QA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            count = 0
            step = max(1, len(data) // max_qa) if max_qa else 1
            for i in range(0, min(len(data), max_qa * step), step):
                item = data[i]
                question = item.get("question", "")
                answers = item.get("answers", [])
                answer = answers[0].get("answer_text", "") if answers else ""
                if question and answer and len(answer) >= 15:
                    documents.append(
                        {
                            "id": f"qa_{len(documents)}",
                            "question": question,
                            "answer": answer,
                            "content": f"{question} {answer}",
                        }
                    )
                    count += 1
                    if count >= max_qa:
                        break
        print(f"Loaded {count} QA items from PsyQA")

    VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    with open(VECTOR_FILE, "w", encoding="utf-8") as f:
        json.dump(documents, f, ensure_ascii=False, indent=2)

    print(f"Vector database: {len(documents)} documents -> {VECTOR_FILE}")
    print("提示: 在 PsyQA 目录执行 npm run build:embeddings 可生成 Ollama 语义向量（需 nomic-embed-text）")

    test_query = "焦虑怎么办"
    print(f"\nTest search: '{test_query}'")
    for i, r in enumerate(search_simple(documents, test_query, 3)):
        print(f"  {i + 1}. sim={r['similarity']:.4f} Q={r['question'][:40]}...")


if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    build_vector_db(limit)
