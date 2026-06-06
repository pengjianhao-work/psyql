#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""训练数据下载：本地优先、镜像回退、超时兼容（适配国内网络）"""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = REPO_ROOT / "training_data"
PSYQA_DIR = REPO_ROOT / "PsyQA"

# 本地缓存探测规则：任一命中即视为「已有离线数据」
LOCAL_CACHE_RULES: Dict[str, List[str]] = {
    "psyqa": [
        "psyqa/PsyQA_full.json",
        "../PsyQA/PsyQA_full.json",
    ],
    "efaqa": ["efaqa/efaqa_corpus.json"],
    "soulchat": ["soulchat/*.json"],
    "mentalchat16k": ["mentalchat16k/samples.jsonl"],
    "psycrisis": ["psycrisis/PsyCrisis-Bench.xlsx"],
    "psydial": ["psydial/PsyDial-D3.json", "psydial/samples.jsonl"],
    "sos_hl_1k": ["sos_hl_1k/samples.jsonl", "sos_hl_1k/suicide_train_BERT.tsv"],
    "socialcd_3k": ["socialcd_3k/samples.jsonl", "socialcd_3k/SocialCD-3k.tsv"],
    "mental_r1_10k": ["mental_r1_10k/**/*.json", "mental_r1_10k/**/*.jsonl"],
    "tcci_lingxi": ["tcci_lingxi/**/*.json", "tcci_lingxi/**/*.jsonl"],
    "mental_9k": ["mental_9k/**/*.json", "mental_9k/**/*.jsonl"],
    "dreaddit": ["dreaddit/**/*.csv"],
    "qiaoban": ["qiaoban/samples.jsonl", "../data/child_chat_data.json"],
}


def is_offline_mode() -> bool:
    return os.environ.get("TRAINING_OFFLINE", "0") == "1"


def is_local_first() -> bool:
    if is_offline_mode():
        return True
    return os.environ.get("TRAINING_LOCAL_FIRST", "1") != "0"


def is_domestic_only() -> bool:
    return os.environ.get("TRAINING_DOMESTIC_ONLY", "0") == "1"


def connect_timeout() -> int:
    return int(os.environ.get("TRAINING_CONNECT_TIMEOUT", "12"))


def read_timeout() -> int:
    return int(os.environ.get("TRAINING_READ_TIMEOUT", "90"))


def max_retries() -> int:
    return int(os.environ.get("TRAINING_DOWNLOAD_RETRIES", "2"))


def hf_endpoint() -> str:
    return os.environ.get("HF_ENDPOINT", "https://hf-mirror.com").rstrip("/")


def configure_hf_mirror() -> None:
    """国内常用 HF 镜像，load_dataset 前调用。"""
    ep = hf_endpoint()
    os.environ.setdefault("HF_ENDPOINT", ep)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(DATA_ROOT / ".hf_cache"))


def mirror_urls(url: str) -> List[str]:
    """为 GitHub/HuggingFace 直链生成镜像候选列表。"""
    urls: List[str] = []
    if url not in urls:
        urls.append(url)

    if "raw.githubusercontent.com" in url:
        # ghproxy 镜像
        urls.append(f"https://ghproxy.net/{url}")
        urls.append(f"https://mirror.ghproxy.com/{url}")
        # jsDelivr
        parts = url.replace("https://raw.githubusercontent.com/", "").split("/", 2)
        if len(parts) == 3:
            user, repo, rest = parts
            urls.append(f"https://cdn.jsdelivr.net/gh/{user}/{repo}@{rest}")

    if "huggingface.co/datasets/" in url and "/resolve/" in url:
        hf_path = url.split("huggingface.co/", 1)[1]
        urls.append(f"{hf_endpoint()}/{hf_path}")

    # 去重保序
    seen: set[str] = set()
    out: List[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _glob_any(base: Path, pattern: str) -> bool:
    if "**" in pattern:
        return any(base.glob(pattern))
    return any(base.parent.glob(pattern)) if pattern.startswith("../") else any(base.glob(pattern))


def local_cache_hit(ds_id: str) -> Tuple[bool, Optional[str]]:
    """检查本地是否已有可用缓存。"""
    rules = LOCAL_CACHE_RULES.get(ds_id, [])
    for rule in rules:
        if rule.startswith("../"):
            p = REPO_ROOT / rule.replace("../", "", 1)
            if "*" in rule:
                parent = p.parent
                pat = p.name
                if parent.exists() and list(parent.glob(pat)):
                    return True, str(parent)
            elif p.exists() and p.stat().st_size > 500:
                return True, str(p)
        else:
            p = DATA_ROOT / rule
            if "*" in rule:
                if list(DATA_ROOT.glob(rule)):
                    return True, str(DATA_ROOT / rule.split("/")[0])
            elif p.exists() and p.stat().st_size > 500:
                return True, str(p)
    return False, None


def link_psyqa_from_repo() -> bool:
    """若仓库内已有 PsyQA_full.json，同步到 training_data（零网络）。"""
    src = PSYQA_DIR / "PsyQA_full.json"
    if not src.exists() or src.stat().st_size < 1024:
        return False
    dest = DATA_ROOT / "psyqa" / "PsyQA_full.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == src.stat().st_size:
        return True
    shutil.copy2(src, dest)
    return True


def scan_local_inventory() -> Dict[str, Any]:
    """扫描本地可用训练数据，供离线训练与文档展示。"""
    inv: Dict[str, Any] = {"ready": [], "missing": [], "paths": {}}
    for ds_id in LOCAL_CACHE_RULES:
        ok, path = local_cache_hit(ds_id)
        if ok:
            inv["ready"].append(ds_id)
            inv["paths"][ds_id] = path
        else:
            inv["missing"].append(ds_id)
    link_psyqa_from_repo()
    ok, path = local_cache_hit("psyqa")
    if ok and "psyqa" not in inv["ready"]:
        inv["ready"].append("psyqa")
        inv["paths"]["psyqa"] = path
    return inv


def download_with_mirrors(url: str, dest: Path, log_fn=print) -> bool:
    if requests is None:
        log_fn("[FAIL] 需要 pip install requests")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1024:
        log_fn(f"[SKIP] 本地已存在 {dest.name}")
        return True

    timeout = (connect_timeout(), read_timeout())
    candidates = mirror_urls(url)
    for attempt, candidate in enumerate(candidates):
        for retry in range(max_retries()):
            try:
                log_fn(f"下载 ({attempt + 1}/{len(candidates)}): {candidate[:100]}...")
                with requests.get(candidate, stream=True, timeout=timeout) as r:
                    r.raise_for_status()
                    with open(dest, "wb") as f:
                        for chunk in r.iter_content(chunk_size=65536):
                            if chunk:
                                f.write(chunk)
                log_fn(f"[OK] {dest} ({dest.stat().st_size // 1024} KB)")
                return True
            except Exception as e:
                log_fn(f"[WARN] 超时/失败 (重试 {retry + 1}): {e}")
                time.sleep(1 + retry)
    return False


def access_region(ds: Dict[str, Any]) -> str:
    return str(ds.get("accessRegion", "hybrid"))


def should_skip_remote(ds: Dict[str, Any]) -> bool:
    if is_offline_mode():
        return True
    if is_domestic_only() and access_region(ds) == "foreign":
        return True
    return False
