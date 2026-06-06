#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知识库扩充工具 — 从合法公开数据源导入并合并到 mental_dataset.json + vector_db

数据源（均需在许可范围内使用）：
  1. 清华大学 PsyQA 公开数据集 (CC BY-NC-SA 4.0)
  2. 本地 mental_data.jsonl
  3. training_data/knowledge_candidates.json（多源公开语料归一化后导出）
  4. 可选：server/data/crawled_import.json（自行整理的 JSON，见 crawled_import.example.json）

用法:
  python scripts/expand_knowledge_base.py
  python scripts/expand_knowledge_base.py --max-knowledge 800 --max-vector 8000
  python scripts/expand_knowledge_base.py --download   # 缺失时自动下载 PsyQA

完成后在 PsyQA 目录执行:
  npm run tag:knowledge
  重启后端服务
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

try:
    import requests
except ImportError:
    requests = None  # type: ignore

# ---------- 路径 ----------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
PSYQA_DIR = REPO_ROOT / "PsyQA"
DATA_DIR = PSYQA_DIR / "server" / "data"
MENTAL_DATASET = DATA_DIR / "mental_dataset.json"
MENTAL_JSONL = DATA_DIR / "mental_data.jsonl"
CRAWLED_IMPORT = DATA_DIR / "crawled_import.json"
TRAINING_KNOWLEDGE = REPO_ROOT / "training_data" / "knowledge_candidates.json"
QIAOBAN_KNOWLEDGE = REPO_ROOT / "training_data" / "qiaoban" / "knowledge_pairs.json"
PSYQA_FULL = PSYQA_DIR / "PsyQA_full.json"
VECTOR_DB_DIR = PSYQA_DIR / "vector_db"
VECTOR_DB_FILE = VECTOR_DB_DIR / "documents.json"
REPORT_FILE = DATA_DIR / "knowledge_expand_report.json"

PSYQA_RAW_URL = "https://raw.githubusercontent.com/thu-coai/PsyQA/main/data/PsyQA_full.json"

# ---------- 标签关键词（与 emotionService 问题类别对齐） ----------
PROBLEM_KEYWORDS: Dict[str, List[str]] = {
    "academic_stress": ["学习", "考试", "考研", "高考", "作业", "成绩", "复习", "挂科", "学业"],
    "interpersonal": ["室友", "同学", "朋友", "社交", "人际", "宿舍", "孤立", "被排挤"],
    "family_relationship": ["父母", "家人", "家庭", "妈妈", "爸爸", "亲子"],
    "romantic_relationship": ["恋爱", "失恋", "分手", "喜欢", "表白", "感情"],
    "career_future": ["未来", "就业", "工作", "实习", "迷茫", "方向", "职业"],
    "self_identity": ["自卑", "自信", "自我", "价值", "认同"],
    "emotion_regulation": ["情绪", "低落", "抑郁", "烦躁", "崩溃", "调节"],
    "body_image": ["外貌", "身材", "长相", "体重"],
    "addiction": ["失眠", "熬夜", "手机", "游戏", "成瘾"],
    "trauma": ["创伤", "暴力", "虐待", "伤害"],
}

EMOTION_KEYWORDS: Dict[str, List[str]] = {
    "anxious": ["焦虑", "紧张", "担心", "害怕", "不安"],
    "sad": ["低落", "难过", "抑郁", "哭", "伤心"],
    "lonely": ["孤独", "孤单", "没人"],
    "angry": ["愤怒", "生气", "恨"],
    "confused": ["迷茫", "困惑", "不知道"],
    "frustrated": ["挫败", "失败", "压力"],
    "hopeful": ["希望", "加油", "积极"],
    "happy": ["开心", "快乐", "高兴"],
    "neutral": [],
}

INTERVENTION_BY_PROBLEM = {
    "academic_stress": "cbt",
    "interpersonal": "interpersonal",
    "family_relationship": "boundary",
    "romantic_relationship": "grief_support",
    "career_future": "motivational_interview",
    "self_identity": "supportive",
    "emotion_regulation": "mindfulness",
    "body_image": "supportive",
    "addiction": "behavioral",
    "trauma": "trauma_informed",
    "other": "supportive",
}


def normalize_question(q: str) -> str:
    q = re.sub(r"\s+", "", q.strip().lower())
    q = re.sub(r"[\?\!\.,，、;；:：\"'()\[\]（）【】]", "", q)
    return q


def clean_text(text: str, max_len: int = 1200) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text


def infer_tags(question: str, answer: str) -> Dict[str, Any]:
    blob = f"{question} {answer}"
    problems: List[str] = []
    emotions: List[str] = []

    for cat, kws in PROBLEM_KEYWORDS.items():
        if any(kw in blob for kw in kws):
            problems.append(cat)

    for emo, kws in EMOTION_KEYWORDS.items():
        if emo == "neutral":
            continue
        if any(kw in blob for kw in kws):
            emotions.append(emo)

    if not problems:
        problems = ["other"]
    if not emotions:
        emotions = ["neutral"]

    primary_problem = problems[0]
    intervention = INTERVENTION_BY_PROBLEM.get(primary_problem, "supportive")

    return {
        "problems": list(dict.fromkeys(problems))[:3],
        "emotions": list(dict.fromkeys(emotions))[:3],
        "interventionTypes": [intervention],
    }


def quality_ok(question: str, answer: str, min_q: int = 4, min_a: int = 15, max_a: int = 900) -> bool:
    if len(question) < min_q or len(answer) < min_a or len(answer) > max_a:
        return False
    if question.strip() == answer.strip():
        return False
    junk = ["http://", "https://", "点击", "关注公众号", "加微信"]
    if any(j in answer for j in junk):
        return False
    return True


def make_item(question: str, answer: str, source: str) -> Dict[str, Any]:
    q = clean_text(question, 200)
    a = clean_text(answer, 900)
    return {
        "question": q,
        "answer": a,
        "source": source,
        "tags": infer_tags(q, a),
    }


def download_psyqa_full() -> bool:
    if requests is None:
        print("[FAIL] 需要 requests: pip install requests")
        return False
    print(f"正在下载 PsyQA_full.json ...")
    try:
        resp = requests.get(PSYQA_RAW_URL, timeout=120)
        resp.raise_for_status()
        PSYQA_DIR.mkdir(parents=True, exist_ok=True)
        PSYQA_FULL.write_bytes(resp.content)
        print(f"[OK] 已保存 {PSYQA_FULL}")
        return True
    except Exception as e:
        print(f"[FAIL] 下载失败: {e}")
        return False


def load_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def iter_psyqa(path: Path) -> Iterable[Tuple[str, str]]:
    data = load_json(path)
    for item in data:
        q = item.get("question", "")
        answers = item.get("answers") or []
        if not q or not answers:
            continue
        a = answers[0].get("answer_text", "") if isinstance(answers[0], dict) else str(answers[0])
        if q and a:
            yield q, a


def iter_jsonl_mental(path: Path) -> Iterable[Tuple[str, str]]:
    for row in load_jsonl(path):
        inp = row.get("input") or row.get("question", "")
        out = row.get("output") or row.get("answer", "")
        if inp and out:
            yield inp, out


def iter_crawled_import(path: Path) -> Iterable[Tuple[str, str]]:
    if not path.exists():
        return
    data = load_json(path)
    items = data if isinstance(data, list) else data.get("knowledge", [])
    for item in items:
        q = item.get("question", "")
        a = item.get("answer", "")
        if q and a:
            yield q, a


def merge_knowledge(
    existing: List[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
    max_total: int,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    seen: Set[str] = {normalize_question(x["question"]) for x in existing}
    merged = list(existing)
    stats = {"kept_existing": len(existing), "added": 0, "skipped_dup": 0, "skipped_quality": 0}

    for item in candidates:
        if len(merged) >= max_total:
            break
        key = normalize_question(item["question"])
        if key in seen:
            stats["skipped_dup"] += 1
            continue
        if not quality_ok(item["question"], item["answer"]):
            stats["skipped_quality"] += 1
            continue
        seen.add(key)
        merged.append(item)
        stats["added"] += 1

    return merged, stats


def build_vector_documents(
    knowledge: List[Dict[str, Any]],
    psyqa_path: Optional[Path],
    max_vector: int,
) -> List[Dict[str, str]]:
    docs: List[Dict[str, str]] = []
    seen: Set[str] = set()

    def push(q: str, a: str, doc_id: str) -> None:
        if len(docs) >= max_vector:
            return
        key = normalize_question(q)
        if key in seen:
            return
        seen.add(key)
        docs.append(
            {
                "id": doc_id,
                "question": q,
                "answer": a,
                "content": f"{q} {a}",
            }
        )

    for i, item in enumerate(knowledge):
        push(item["question"], item["answer"], f"kb_{i}")

    if psyqa_path and psyqa_path.exists() and len(docs) < max_vector:
        data = load_json(psyqa_path)
        step = max(1, len(data) // max(1, max_vector - len(docs)))
        idx = 0
        for i in range(0, len(data), step):
            if len(docs) >= max_vector:
                break
            item = data[i]
            q = item.get("question", "")
            answers = item.get("answers") or []
            if not q or not answers:
                continue
            a = answers[0].get("answer_text", "") if isinstance(answers[0], dict) else ""
            if quality_ok(q, a, min_a=20):
                push(q, a, f"psyqa_{idx}")
                idx += 1

    return docs


def main() -> int:
    parser = argparse.ArgumentParser(description="扩充心理知识库")
    parser.add_argument("--max-knowledge", type=int, default=600, help="mental_dataset 最大条目数")
    parser.add_argument("--max-vector", type=int, default=6000, help="向量库最大文档数")
    parser.add_argument("--download", action="store_true", help="缺失时下载 PsyQA")
    parser.add_argument("--psyqa-limit", type=int, default=15000, help="从 PsyQA 读取的上限条数")
    args = parser.parse_args()

    print("=" * 50)
    print("心理港湾 · 知识库扩充")
    print("=" * 50)
    print(f"仓库根目录: {REPO_ROOT}")

    if args.download or not PSYQA_FULL.exists():
        if not PSYQA_FULL.exists():
            print("未找到 PsyQA_full.json，尝试下载...")
            if not download_psyqa_full():
                print("可手动运行: python scripts/download_mental_data.py")

    # 读取现有知识库
    if MENTAL_DATASET.exists():
        dataset = load_json(MENTAL_DATASET)
        existing = dataset.get("knowledge", [])
        instruction = dataset.get(
            "instruction",
            "你是专业大学生心理陪伴AI，温柔、不评判、不做诊断，只疏导和安慰。",
        )
    else:
        dataset = {}
        existing = []
        instruction = "你是专业大学生心理陪伴AI，温柔、不评判、不做诊断，只疏导和安慰。"

    print(f"现有知识条目: {len(existing)}")

    candidates: List[Dict[str, Any]] = []

    # PsyQA
    if PSYQA_FULL.exists():
        count = 0
        for q, a in iter_psyqa(PSYQA_FULL):
            candidates.append(make_item(q, a, "psyqa"))
            count += 1
            if count >= args.psyqa_limit:
                break
        print(f"[OK] PsyQA 候选: {count} 条")
    else:
        print(f"[SKIP] 无 {PSYQA_FULL}")

    # mental_data.jsonl
    if MENTAL_JSONL.exists():
        n = 0
        for q, a in iter_jsonl_mental(MENTAL_JSONL):
            candidates.append(make_item(q, a, "mental_jsonl"))
            n += 1
        print(f"[OK] mental_data.jsonl: {n} 条")

    # 自定义导入
    if CRAWLED_IMPORT.exists():
        n = 0
        for q, a in iter_crawled_import(CRAWLED_IMPORT):
            candidates.append(make_item(q, a, "crawled_import"))
            n += 1
        print(f"[OK] crawled_import.json: {n} 条")

    # 多源训练语料候选（EFAQA / SoulChat / PsyDial 等归一化导出）
    if TRAINING_KNOWLEDGE.exists():
        n = 0
        for q, a in iter_crawled_import(TRAINING_KNOWLEDGE):
            candidates.append(make_item(q, a, "training_corpus"))
            n += 1
        print(f"[OK] training_data/knowledge_candidates.json: {n} 条")

    if QIAOBAN_KNOWLEDGE.exists():
        n = 0
        for q, a in iter_crawled_import(QIAOBAN_KNOWLEDGE):
            candidates.append(make_item(q, a, "qiaoban"))
            n += 1
        print(f"[OK] training_data/qiaoban/knowledge_pairs.json: {n} 条")

    if not CRAWLED_IMPORT.exists():
        example = DATA_DIR / "crawled_import.example.json"
        if not example.exists():
            example.write_text(
                json.dumps(
                    {
                        "knowledge": [
                            {
                                "question": "示例：如何缓解考前焦虑？",
                                "answer": "制定可行复习计划，保证睡眠，用深呼吸放松，必要时联系学校心理中心。",
                            }
                        ]
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )

    # 合并
    merged, stats = merge_knowledge(existing, candidates, args.max_knowledge)
    print(f"\n合并结果: 原有 {stats['kept_existing']} + 新增 {stats['added']} = {len(merged)} 条")
    print(f"  跳过重复: {stats['skipped_dup']} | 跳过低质量: {stats['skipped_quality']}")

    # 去掉 source 字段写入（可选保留）
    out_knowledge = []
    for item in merged:
        row = {"question": item["question"], "answer": item["answer"]}
        if item.get("tags"):
            row["tags"] = item["tags"]
        if item.get("source") and item.get("source") != "manual":
            row["source"] = item["source"]
        out_knowledge.append(row)

    dataset_out = {"instruction": instruction, "knowledge": out_knowledge}
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MENTAL_DATASET.write_text(json.dumps(dataset_out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] 已写入 {MENTAL_DATASET}")

    # 向量库
    vector_docs = build_vector_documents(out_knowledge, PSYQA_FULL if PSYQA_FULL.exists() else None, args.max_vector)
    VECTOR_DB_DIR.mkdir(parents=True, exist_ok=True)
    VECTOR_DB_FILE.write_text(json.dumps(vector_docs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] 向量库 {len(vector_docs)} 条 -> {VECTOR_DB_FILE}")

    report = {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "knowledge_total": len(out_knowledge),
        "vector_total": len(vector_docs),
        "merge_stats": stats,
        "next_steps": [
            "cd PsyQA && npm run tag:knowledge",
            "cd PsyQA && npm run reload:knowledge",
            "cd PsyQA && npm run build:embeddings",
            "可选: npm run sync:chroma（需 PSYQA_CHROMA_ENABLED=1）",
            "或一键: python scripts/process_data_pipeline.py --mode rag",
        ],
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] 报告 {REPORT_FILE}")
    print("\n下一步:")
    for step in report["next_steps"]:
        print(f"  · {step}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
