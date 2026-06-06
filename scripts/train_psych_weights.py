#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 unified_corpus.jsonl 拟合三层算法权重，写入 psych_model_weights.json

用法:
  python scripts/train_psych_weights.py
  python scripts/train_psych_weights.py --min-samples 200
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
CORPUS = REPO_ROOT / "training_data" / "unified_corpus.jsonl"
WEIGHTS_OUT = REPO_ROOT / "PsyQA" / "server" / "data" / "psych_model_weights.json"
REPORT_OUT = REPO_ROOT / "training_data" / "train_weights_report.json"


def load_corpus(path: Path) -> List[Dict[str, Any]]:
    rows = []
    if not path.exists():
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def extract_xy(records: List[Dict[str, Any]]) -> Tuple[List[List[float]], List[float]]:
    X: List[List[float]] = []
    y: List[float] = []
    for r in records:
        labels = r.get("labels") or {}
        stress = float(labels.get("stressScore", 50))
        anxiety = float(labels.get("anxietyScore", 45))
        mood = float(labels.get("moodScore", 55))
        risk_map = {"low": 0.1, "medium": 0.35, "high": 0.65, "critical": 0.9}
        risk = risk_map.get(str(labels.get("riskLevel", "low")), 0.2)
        turn_count = len(r.get("turns") or [])
        X.append([stress / 100, anxiety / 100, mood / 100, risk, min(1.0, turn_count / 30)])
        distress = 0.36 * stress + 0.38 * anxiety + 0.26 * (100 - mood)
        y.append(distress / 100)
    return X, y


def fit_linear_weights(X: List[List[float]], y: List[float]) -> List[float]:
    try:
        import numpy as np  # type: ignore

        Xn = np.array(X, dtype=float)
        yn = np.array(y, dtype=float)
        # ridge: (X'X + λI)^-1 X'y
        lam = 0.5
        XtX = Xn.T @ Xn + lam * np.eye(Xn.shape[1])
        w = np.linalg.solve(XtX, Xn.T @ yn)
        s = float(np.sum(np.abs(w)))
        if s > 0:
            w = w / s
        return [float(x) for x in w[:3]]
    except ImportError:
        pass
    # 无 numpy：按特征与 y 的相关粗略权重
    n = len(y)
    if n == 0:
        return [0.36, 0.38, 0.26]
    means = [sum(row[i] for row in X) / n for i in range(3)]
    ym = sum(y) / n
    corrs = []
    for i in range(3):
        num = sum((X[j][i] - means[i]) * (y[j] - ym) for j in range(n))
        den_x = math.sqrt(sum((X[j][i] - means[i]) ** 2 for j in range(n)) or 1e-9)
        den_y = math.sqrt(sum((y[j] - ym) ** 2 for j in range(n)) or 1e-9)
        corrs.append(max(0.05, abs(num / (den_x * den_y))))
    s = sum(corrs)
    return [c / s for c in corrs]


def population_priors(records: List[Dict[str, Any]]) -> Dict[str, float]:
    if not records:
        return {"stress": 48, "anxiety": 44, "mood": 58}
    n = len(records)
    stress = sum(float((r.get("labels") or {}).get("stressScore", 50)) for r in records) / n
    anxiety = sum(float((r.get("labels") or {}).get("anxietyScore", 45)) for r in records) / n
    mood = sum(float((r.get("labels") or {}).get("moodScore", 55)) for r in records) / n
    return {
        "stress": round(stress, 1),
        "anxiety": round(anxiety, 1),
        "mood": round(mood, 1),
    }


def kmeans_risk_clusters(records: List[Dict[str, Any]], k: int = 4) -> List[Dict[str, Any]]:
    points = []
    for r in records:
        lb = r.get("labels") or {}
        points.append(
            [
                float(lb.get("stressScore", 50)),
                float(lb.get("anxietyScore", 45)),
                float(lb.get("moodScore", 55)),
            ]
        )
    if len(points) < k * 5:
        return []
    try:
        from sklearn.cluster import KMeans  # type: ignore

        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        km.fit(points)
        centers = []
        for i, c in enumerate(km.cluster_centers_):
            centers.append(
                {
                    "clusterId": i,
                    "stress": round(float(c[0]), 1),
                    "anxiety": round(float(c[1]), 1),
                    "mood": round(float(c[2]), 1),
                }
            )
        return centers
    except ImportError:
        return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-samples", type=int, default=100)
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="与已有 psych_model_weights.json 做指数平滑融合（α=0.35）",
    )
    parser.add_argument("--blend-alpha", type=float, default=0.35)
    args = parser.parse_args()

    records = load_corpus(CORPUS)
    if len(records) < args.min_samples:
        print(f"[WARN] 语料仅 {len(records)} 条，建议 >= {args.min_samples}。先运行 fetch + build。")
        if len(records) == 0:
            return 1

    X, y = extract_xy(records)
    w3 = fit_linear_weights(X, y)
    priors = population_priors(records)
    clusters = kmeans_risk_clusters(records)

    zh_count = sum(1 for r in records if r.get("language", "zh") == "zh")
    en_count = len(records) - zh_count
    ml_boost = min(0.45, 0.32 + len(records) / 200000)
    nn_boost = min(0.38, 0.28 + zh_count / 150000)

    base: Dict[str, Any] = {}
    if WEIGHTS_OUT.exists():
        try:
            base = json.loads(WEIGHTS_OUT.read_text(encoding="utf-8"))
        except Exception:
            pass

    out = {
        "version": "1.2",
        "trainedFrom": "unified_corpus.jsonl",
        "trainingSamples": len(records),
        "distressWeights": {
            "stress": round(w3[0], 4),
            "anxiety": round(w3[1], 4),
            "moodInstability": round(w3[2], 4),
        },
        "wellbeingBias": base.get("wellbeingBias", 8),
        "functionalDistressFactor": base.get("functionalDistressFactor", 0.55),
        "populationPrior": priors,
        "bayesianPriorStrength": base.get("bayesianPriorStrength", 3),
        "fusionWeights": {
            "statistical": round(max(0.2, 1 - ml_boost - nn_boost), 3),
            "machineLearning": round(ml_boost, 3),
            "neuralNetwork": round(nn_boost, 3),
        },
        "riskClusters": clusters,
        "corpusMeta": {"zh": zh_count, "en": en_count},
    }

    if args.incremental and base:
        alpha = max(0.05, min(0.95, args.blend_alpha))
        old_fw = (base.get("fusionWeights") or {})
        old_dw = (base.get("distressWeights") or {})
        for k in ("statistical", "machineLearning", "neuralNetwork"):
            if k in old_fw:
                out["fusionWeights"][k] = round(
                    alpha * out["fusionWeights"][k] + (1 - alpha) * float(old_fw[k]), 3
                )
        for k in ("stress", "anxiety", "moodInstability"):
            if k in old_dw:
                out["distressWeights"][k] = round(
                    alpha * out["distressWeights"][k] + (1 - alpha) * float(old_dw[k]), 4
                )
        out["incrementalBlend"] = {"alpha": alpha, "previousVersion": base.get("version")}

    WEIGHTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    WEIGHTS_OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_OUT.write_text(
        json.dumps(
            {
                "samples": len(records),
                "distressWeights": out["distressWeights"],
                "fusionWeights": out["fusionWeights"],
                "populationPrior": priors,
                "clusterCount": len(clusters),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[OK] 权重已写入 {WEIGHTS_OUT}")
    print(f"  样本: {len(records)} | distressWeights: {out['distressWeights']}")
    print(f"  fusionWeights: {out['fusionWeights']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
