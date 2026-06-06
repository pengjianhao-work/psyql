#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""训练语料公共工具：标签推断、文本清洗、伪分值映射"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple

PROBLEM_KEYWORDS: Dict[str, List[str]] = {
    "academic_stress": ["学习", "考试", "考研", "高考", "作业", "成绩", "复习", "挂科", "学业", "study", "exam"],
    "interpersonal": ["室友", "同学", "朋友", "社交", "人际", "宿舍", "孤立", "relationship", "friend"],
    "family_relationship": ["父母", "家人", "家庭", "妈妈", "爸爸", "亲子", "family", "parent"],
    "romantic_relationship": ["恋爱", "失恋", "分手", "喜欢", "表白", "感情", "break up", "love"],
    "career_future": ["未来", "就业", "工作", "实习", "迷茫", "方向", "职业", "career", "job"],
    "self_identity": ["自卑", "自信", "自我", "价值", "认同", "self-esteem"],
    "emotion_regulation": ["情绪", "低落", "抑郁", "烦躁", "崩溃", "调节", "depress", "anxiety"],
    "body_image": ["外貌", "身材", "长相", "体重"],
    "addiction": ["失眠", "熬夜", "手机", "游戏", "成瘾", "insomnia"],
    "trauma": ["创伤", "暴力", "虐待", "伤害", "trauma"],
}

EMOTION_KEYWORDS: Dict[str, List[str]] = {
    "anxious": ["焦虑", "紧张", "担心", "害怕", "不安", "anxious", "anxiety", "worry"],
    "sad": ["低落", "难过", "抑郁", "哭", "伤心", "sad", "depress"],
    "lonely": ["孤独", "孤单", "没人", "lonely", "alone"],
    "angry": ["愤怒", "生气", "恨", "angry"],
    "confused": ["迷茫", "困惑", "不知道", "confus"],
    "frustrated": ["挫败", "失败", "压力", "stress", "frustrat"],
    "hopeful": ["希望", "加油", "积极", "hope"],
    "happy": ["开心", "快乐", "高兴", "happy"],
    "neutral": [],
}

RISK_KEYWORDS = {
    "critical": ["自杀", "不想活", "结束生命", "suicide", "kill myself", "self-harm", "自残", "自伤", "想死"],
    "high": ["绝望", "活不下去", "伤害自己", "hopeless", "end my life", "了结"],
    "medium": ["崩溃", "撑不住", "受不了", "overwhelm", "can't cope"],
}

COGNITIVE_DISTORTION_KEYWORDS: Dict[str, List[str]] = {
    "black_white": ["非黑即白", "全或无", "要么", "绝对"],
    "catastrophizing": ["灾难化", "最坏", "完了", "彻底"],
    "overgeneralization": ["总是", "从不", "每次都", "没人"],
    "self_blame": ["自责", "都是我的错", "怪我", "我不配"],
    "mind_reading": ["他一定", "肯定觉得", "都在看我"],
    "should_statements": ["应该", "必须", "不该"],
}

EFA_S1_STRESS = {"1.7", "1.1", "1.2", "1.6"}
EFA_S2_ANXIETY = {"2.2", "2.1", "2.5"}
EFA_S3_CRITICAL = {"3.1", "3.2", "3.3", "3.4", "3.5"}


def clean_text(text: str, max_len: int = 1200) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text


def make_id(source: str, question: str) -> str:
    h = hashlib.md5(f"{source}:{question}".encode("utf-8")).hexdigest()[:12]
    return f"{source}_{h}"


def infer_problems_emotions(blob: str) -> Tuple[List[str], List[str]]:
    problems: List[str] = []
    emotions: List[str] = []
    low = blob.lower()
    for cat, kws in PROBLEM_KEYWORDS.items():
        if any(kw in blob or kw in low for kw in kws):
            problems.append(cat)
    for emo, kws in EMOTION_KEYWORDS.items():
        if emo == "neutral":
            continue
        if any(kw in blob or kw in low for kw in kws):
            emotions.append(emo)
    if not problems:
        problems = ["other"]
    if not emotions:
        emotions = ["neutral"]
    return list(dict.fromkeys(problems))[:3], list(dict.fromkeys(emotions))[:3]


def infer_risk_level(text: str, label_hint: Optional[str] = None) -> str:
    if label_hint in ("critical", "high", "medium", "low"):
        return label_hint
    low = text.lower()
    for level in ("critical", "high", "medium"):
        if any(kw in text or kw in low for kw in RISK_KEYWORDS[level]):
            return level
    return "low"


def efaqa_label_scores(label: Dict[str, Any]) -> Dict[str, float]:
    s1 = str(label.get("s1", ""))
    s2 = str(label.get("s2", ""))
    s3 = str(label.get("s3", ""))
    stress = 72.0 if s1 in EFA_S1_STRESS else 48.0
    anxiety = 70.0 if s2 in EFA_S2_ANXIETY else 42.0
    mood = 35.0 if s2 in {"2.1", "2.3"} else 58.0
    if s3 in EFA_S3_CRITICAL:
        risk = "critical"
        stress = max(stress, 88)
        anxiety = max(anxiety, 85)
        mood = min(mood, 25)
    elif s3.startswith("3."):
        risk = "high"
    else:
        risk = "medium" if stress > 60 or anxiety > 60 else "low"
    return {
        "stressScore": stress,
        "anxietyScore": anxiety,
        "moodScore": mood,
        "riskLevel": risk,
    }


def infer_cognitive_distortions(text: str) -> List[str]:
    found: List[str] = []
    for tag, kws in COGNITIVE_DISTORTION_KEYWORDS.items():
        if any(kw in text for kw in kws):
            found.append(tag)
    return found[:5]


def keyword_pseudo_scores(text: str) -> Dict[str, Any]:
    problems, emotions = infer_problems_emotions(text)
    risk = infer_risk_level(text)
    cognitive = infer_cognitive_distortions(text)
    stress = 45.0
    anxiety = 40.0
    mood = 60.0
    if "academic_stress" in problems:
        stress += 18
    if "anxious" in emotions:
        anxiety += 22
    if "sad" in emotions or "frustrated" in emotions:
        mood -= 15
        stress += 10
    if risk == "critical":
        stress = 92
        anxiety = 90
        mood = 20
    elif risk == "high":
        stress = max(stress, 78)
        anxiety = max(anxiety, 72)
        mood = min(mood, 35)
    if cognitive:
        anxiety = min(100, anxiety + 8)
    return {
        "stressScore": min(100, stress),
        "anxietyScore": min(100, anxiety),
        "moodScore": max(0, min(100, mood)),
        "riskLevel": risk,
        "problemTypes": problems,
        "emotions": emotions,
        "cognitiveDistortions": cognitive,
    }


def build_record(
    source: str,
    question: str,
    answer: str,
    *,
    turns: Optional[List[Dict[str, str]]] = None,
    labels: Optional[Dict[str, Any]] = None,
    algorithm_targets: Optional[List[str]] = None,
    language: str = "zh",
) -> Optional[Dict[str, Any]]:
    q = clean_text(question, 400)
    a = clean_text(answer, 900)
    if len(q) < 4 or len(a) < 10:
        return None
    blob = f"{q} {a}"
    base_labels = keyword_pseudo_scores(blob)
    if labels:
        base_labels.update({k: v for k, v in labels.items() if v is not None})
    return {
        "id": make_id(source, q),
        "source": source,
        "question": q,
        "answer": a,
        "turns": turns or [],
        "labels": base_labels,
        "algorithmTargets": algorithm_targets
        or ["statistical", "ml", "neural"],
        "language": language,
    }
