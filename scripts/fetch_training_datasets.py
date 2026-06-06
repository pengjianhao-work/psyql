#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载公开心理健康训练数据集（合法开源源）

用法:
  python scripts/fetch_training_datasets.py
  python scripts/fetch_training_datasets.py --only psyqa,psydial,mentalchat16k
  python scripts/fetch_training_datasets.py --all

环境变量:
  EFAQA_DL_LICENSE       若已购买 EFAQA 证书，可自动 pip 下载
  TRAINING_LOCAL_FIRST=1 本地有缓存则跳过远程（默认开启）
  TRAINING_OFFLINE=1       纯离线，不发起任何远程请求
  TRAINING_DOMESTIC_ONLY=1 仅拉取国内源（ModelScope/GitCode/本地 PsyQA）
  HF_ENDPOINT=https://hf-mirror.com  HuggingFace 国内镜像
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from dataset_network import (
    configure_hf_mirror,
    download_with_mirrors,
    hf_endpoint,
    is_domestic_only,
    is_local_first,
    is_offline_mode,
    link_psyqa_from_repo,
    local_cache_hit,
    scan_local_inventory,
    should_skip_remote,
)

try:
    import requests  # noqa: F401
except ImportError:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DATA_ROOT = REPO_ROOT / "training_data"
REGISTRY = SCRIPT_DIR / "dataset_registry.json"
STATUS_FILE = DATA_ROOT / "fetch_status.json"


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def log(msg: str) -> None:
    print(msg, flush=True)


def load_registry() -> Dict[str, Any]:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def download_url(url: str, dest: Path, extra_mirrors: Optional[List[str]] = None) -> bool:
    urls = [url]
    if extra_mirrors:
        urls.extend(extra_mirrors)
    for u in urls[1:]:
        if u not in urls:
            urls.append(u)
    # download_with_mirrors 内部还会追加 ghproxy 等
    return download_with_mirrors(urls[0], dest, log_fn=log)


def fetch_github_raw(ds: Dict[str, Any]) -> Dict[str, bool]:
    results: Dict[str, bool] = {}
    for f in ds.get("files", []):
        rel = f["path"]
        dest = DATA_ROOT / rel
        mirrors = f.get("mirrors") or []
        ok = download_url(f["url"], dest, extra_mirrors=mirrors)
        results[rel] = ok
    return results


def convert_sos_hl_tsv(out_dir: Path) -> bool:
    """将 suicide_train/val_BERT.tsv 合并为 samples.jsonl（SOS-HL-1K 双专家标注）。"""
    out_file = out_dir / "samples.jsonl"
    if out_file.exists() and out_file.stat().st_size > 500:
        return True
    rows: List[Dict[str, Any]] = []
    for name in ("suicide_train_BERT.tsv", "suicide_val_BERT.tsv"):
        fp = out_dir / name
        if not fp.exists():
            continue
        for line in fp.read_text(encoding="utf-8", errors="replace").splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            try:
                expert1, expert2 = int(parts[0]), int(parts[1])
            except ValueError:
                continue
            text = parts[2].strip()
            if not text:
                continue
            label = 1 if expert1 == 1 or expert2 == 1 else 0
            rows.append({"text": text, "label": label, "expert1": expert1, "expert2": expert2})
    if not rows:
        return False
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")
    log(f"[OK] SOS-HL-1K TSV -> {len(rows)} 行 {out_file.name}")
    return True


def convert_socialcd_tsv(out_dir: Path) -> bool:
    """将 SocialCD-3k.tsv 转为 samples.jsonl（12 类认知扭曲多标签）。"""
    tsv = out_dir / "SocialCD-3k.tsv"
    out_file = out_dir / "samples.jsonl"
    if out_file.exists() and out_file.stat().st_size > 500:
        return True
    if not tsv.exists():
        return False
    lines = tsv.read_text(encoding="utf-8", errors="replace").splitlines()
    if len(lines) < 2:
        return False
    header = lines[0].split("\t")
    label_names = header[:-1]
    rows: List[Dict[str, Any]] = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) < len(header):
            continue
        text = parts[-1].strip()
        if not text:
            continue
        active = [label_names[i] for i in range(len(label_names)) if i < len(parts) and parts[i] == "1"]
        rows.append({"text": text, "labels": active, "distortion": active})
    if not rows:
        return False
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")
    log(f"[OK] SocialCD-3K TSV -> {len(rows)} 行 {out_file.name}")
    return True


def ensure_github_samples_jsonl(ds_id: str) -> bool:
    if ds_id == "sos_hl_1k":
        return convert_sos_hl_tsv(DATA_ROOT / "sos_hl_1k")
    if ds_id == "socialcd_3k":
        return convert_socialcd_tsv(DATA_ROOT / "socialcd_3k")
    return True


def fetch_direct_url(ds: Dict[str, Any]) -> Dict[str, bool]:
    return fetch_github_raw(ds)


def fetch_huggingface(ds: Dict[str, Any], limit: int = 5000) -> bool:
    if should_skip_remote(ds):
        hit, path = local_cache_hit(ds["id"])
        if hit:
            log(f"[SKIP] 离线/国内模式，使用本地缓存 {path}")
            return True
        log(f"[WARN] {ds['id']} 为外网源，已跳过远程（可手动放入 training_data/{ds['id']}/samples.jsonl）")
        return False

    hf_id = ds.get("hfId")
    out_dir = DATA_ROOT / ds["id"]
    out_file = out_dir / "samples.jsonl"
    out_dir.mkdir(parents=True, exist_ok=True)
    hit, path = local_cache_hit(ds["id"])
    if hit:
        log(f"[SKIP] 本地缓存 {path}")
        return True
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        log("[WARN] 未安装 datasets。运行: pip install datasets")
        return False

    configure_hf_mirror()
    log(f"从 HuggingFace 加载 {hf_id}（镜像 {hf_endpoint()}）...")
    try:
        ds_obj = load_dataset(hf_id, split="train", trust_remote_code=True)
    except Exception:
        try:
            ds_obj = load_dataset(hf_id, trust_remote_code=True)
            if hasattr(ds_obj, "keys"):
                first = list(ds_obj.keys())[0]
                ds_obj = ds_obj[first]
        except Exception as e:
            log(f"[FAIL] HuggingFace {hf_id}: {e}")
            return False
    n = 0
    with open(out_file, "w", encoding="utf-8") as fp:
        for row in ds_obj:
            fp.write(json.dumps(dict(row), ensure_ascii=False) + "\n")
            n += 1
            if n >= limit:
                break
    log(f"[OK] HuggingFace {hf_id} -> {n} 行")
    return True


def fetch_psydial(ds: Dict[str, Any]) -> bool:
    ok_all = True
    for f in ds.get("files", []):
        if not download_url(f["url"], DATA_ROOT / f["path"]):
            ok_all = False
    return ok_all


def month_key() -> str:
    return time.strftime("%Y-%m")


def fetch_soulchat_sample(force: bool = False) -> bool:
    """每月只拉 SoulChat 少量 JSON 分片，避免全量 100GB+。"""
    out_dir = DATA_ROOT / "soulchat"
    out_dir.mkdir(parents=True, exist_ok=True)
    marker = out_dir / f".monthly_{month_key()}.ok"
    if marker.exists() and not force:
        log(f"[SKIP] SoulChat 本月子集已拉取 ({marker.name})")
        return True

    max_files = int(os.environ.get("SOULCHAT_MAX_FILES", "2"))
    max_mb = int(os.environ.get("SOULCHAT_MAX_MB", "120"))
    include = os.environ.get("SOULCHAT_INCLUDE", "*single_turn*.json")
    ms_id = "YIRONGCHEN/SoulChatCorpus"

    log(f"SoulChat 子集: include={include} max_files={max_files} max_mb={max_mb}")

    staging = out_dir / "_staging"
    if staging.exists() and force:
        import shutil

        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    downloaded_any = False
    try:
        from modelscope.hub.snapshot_download import snapshot_download  # type: ignore

        patterns = [p.strip() for p in include.split(",") if p.strip()]
        snapshot_download(
            ms_id,
            cache_dir=str(staging / "cache"),
            local_dir=str(staging / "files"),
            allow_patterns=patterns or ["*.json"],
        )
        downloaded_any = True
    except ImportError:
        log("[WARN] modelscope SDK 未安装，尝试 CLI …")
    except Exception as e:
        log(f"[WARN] modelscope SDK: {e}，尝试 CLI …")

    if not downloaded_any:
        try:
            subprocess.run(
                [
                    "modelscope",
                    "download",
                    "--dataset",
                    ms_id,
                    "--local_dir",
                    str(staging / "files"),
                    "--include",
                    include,
                ],
                check=True,
                timeout=7200,
            )
            downloaded_any = True
        except FileNotFoundError:
            log("[WARN] 未安装 modelscope，跳过 SoulChat。pip install modelscope")
            return False
        except subprocess.CalledProcessError as e:
            log(f"[WARN] SoulChat CLI 下载失败: {e}")
            return False

    files_dir = staging / "files"
    if not files_dir.exists():
        files_dir = staging
    json_files = sorted(
        [p for p in files_dir.rglob("*.json") if p.is_file() and p.stat().st_size > 500],
        key=lambda p: p.stat().st_size,
    )
    if not json_files:
        log("[WARN] SoulChat 未找到 JSON 文件")
        return False

    copied = 0
    total_mb = 0.0
    for src in json_files:
        if copied >= max_files:
            break
        size_mb = src.stat().st_size / (1024 * 1024)
        if total_mb + size_mb > max_mb and copied > 0:
            break
        dest = out_dir / src.name
        if not dest.exists() or dest.stat().st_size != src.stat().st_size:
            import shutil

            shutil.copy2(src, dest)
        copied += 1
        total_mb += size_mb
        log(f"[OK] SoulChat 子集 {src.name} ({size_mb:.1f} MB)")

    if copied == 0:
        log("[WARN] SoulChat 子集为空（体积限制过严？调大 SOULCHAT_MAX_MB）")
        return False

    marker.write_text(
        json.dumps({"month": month_key(), "files": copied, "totalMb": round(total_mb, 1)}, ensure_ascii=False),
        encoding="utf-8",
    )
    log(f"[OK] SoulChat 子集 {copied} 个文件, {total_mb:.1f} MB")
    return True


def fetch_efaqa(*, force: bool = False, monthly: bool = False) -> bool:
    license_id = os.environ.get("EFAQA_DL_LICENSE", "").strip()
    out_dir = DATA_ROOT / "efaqa"
    marker = out_dir / "efaqa_corpus.json"
    meta = out_dir / "efaqa_meta.json"
    if marker.exists() and not force:
        if monthly:
            age_days = (time.time() - marker.stat().st_mtime) / 86400
            if age_days < 25:
                log(f"[SKIP] EFAQA 缓存有效 ({age_days:.0f} 天前)")
                return True
        else:
            log("[SKIP] EFAQA 已导出")
            return True
    if not license_id:
        log("[WARN] EFAQA 需设置环境变量 EFAQA_DL_LICENSE（证书标识）")
        readme = out_dir / "README.txt"
        out_dir.mkdir(parents=True, exist_ok=True)
        readme.write_text(
            "EFAQA 需购买证书后设置 EFAQA_DL_LICENSE，再运行 fetch。\n",
            encoding="utf-8",
        )
        return False
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-U", "efaqa-corpus-zh"],
            check=True,
            capture_output=True,
        )
        import efaqa_corpus_zh  # type: ignore

        records = list(efaqa_corpus_zh.load())
        out_dir.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
        meta.write_text(
            json.dumps(
                {"fetchedAt": time.strftime("%Y-%m-%d %H:%M:%S"), "count": len(records)},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        log(f"[OK] EFAQA {len(records)} 条 -> {marker}")
        return True
    except Exception as e:
        log(f"[FAIL] EFAQA: {e}")
        return False


def fetch_multi(ds: Dict[str, Any], hf_limit: int) -> bool:
    """GitHub 直链 + 本地 PsyQA + HuggingFace 镜像，本地优先。"""
    if ds.get("id") == "psyqa":
        if link_psyqa_from_repo():
            log("[OK] 已从本地 PsyQA/PsyQA_full.json 同步（零网络）")
            hit, _ = local_cache_hit("psyqa")
            if hit:
                return True

    hit, path = local_cache_hit(ds["id"])
    if hit and is_local_first():
        log(f"[SKIP] 本地优先，已有 {path}")
        return True

    ok = False
    if ds.get("files") and not should_skip_remote(ds):
        ok = all(fetch_github_raw(ds).values()) or ok
    if ds.get("hfId") and not should_skip_remote(ds):
        ok = fetch_huggingface(ds, limit=hf_limit) or ok
    if not ok and ds.get("hfFallbackId") and not should_skip_remote(ds):
        fb = {**ds, "hfId": ds["hfFallbackId"]}
        ok = fetch_huggingface(fb, limit=hf_limit) or ok
    if not ok and ds.get("files") and not is_offline_mode():
        ok = fetch_psydial(ds) or ok

    if not ok:
        hit, path = local_cache_hit(ds["id"])
        if hit:
            log(f"[OK] 远程失败，回退本地缓存 {path}")
            return True
    return ok


def fetch_modelscope_full(ds: Dict[str, Any], *, monthly: bool = False) -> bool:
    if ds.get("id") == "soulchat" and monthly:
        return fetch_soulchat_sample()
    ms_id = ds.get("modelscopeId")
    out_dir = DATA_ROOT / ds["id"]
    marker = out_dir / "samples.jsonl"
    if marker.exists() and marker.stat().st_size > 500:
        log(f"[SKIP] ModelScope 缓存 {marker}")
        return True
    if out_dir.exists() and any(out_dir.rglob("*.json")) and not monthly:
        log(f"[SKIP] ModelScope 数据已存在 {out_dir}")
        return True
    max_mb = int(os.environ.get("MODELSCOPE_MAX_MB", "200"))
    try:
        from modelscope.hub.snapshot_download import snapshot_download  # type: ignore

        snapshot_download(ms_id, local_dir=str(out_dir), allow_patterns=["*.json", "*.jsonl"])
        json_files = list(out_dir.rglob("*.json")) + list(out_dir.rglob("*.jsonl"))
        if not json_files:
            log(f"[WARN] ModelScope {ms_id} 无 JSON 文件")
            return False
        total = sum(f.stat().st_size for f in json_files) / (1024 * 1024)
        if total > max_mb:
            log(f"[WARN] {ms_id} 体积 {total:.0f}MB > {max_mb}MB，已下载但可能较大")
        log(f"[OK] ModelScope {ms_id} ({len(json_files)} 文件)")
        return True
    except ImportError:
        pass
    except Exception as e:
        log(f"[WARN] ModelScope SDK {ms_id}: {e}")
    try:
        subprocess.run(
            ["modelscope", "download", "--dataset", ms_id, "--local_dir", str(out_dir), "--include", "*.json*"],
            check=True,
            timeout=7200,
        )
        return True
    except Exception as e:
        log(f"[WARN] ModelScope {ms_id}: {e}")
        return False


def fetch_kaggle(ds: Dict[str, Any]) -> bool:
    slug = ds.get("kaggleSlug", "")
    out_dir = DATA_ROOT / ds["id"]
    if out_dir.exists() and any(out_dir.iterdir()):
        log(f"[SKIP] Kaggle 已存在 {out_dir}")
        return True
    try:
        subprocess.run(["kaggle", "datasets", "download", "-d", slug, "-p", str(out_dir), "--unzip"], check=True, timeout=3600)
        log(f"[OK] Kaggle {slug}")
        return True
    except FileNotFoundError:
        log("[WARN] 未安装 Kaggle CLI。配置 ~/.kaggle/kaggle.json 后: pip install kaggle")
        readme = out_dir / "README.txt"
        out_dir.mkdir(parents=True, exist_ok=True)
        readme.write_text(f"手动下载: https://www.kaggle.com/datasets/{slug}\n", encoding="utf-8")
        return False
    except subprocess.CalledProcessError as e:
        log(f"[WARN] Kaggle {slug}: {e}")
        return False


def fetch_manual(ds: Dict[str, Any]) -> bool:
    out_dir = DATA_ROOT / ds["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    readme = out_dir / "README.txt"
    if not readme.exists():
        readme.write_text(
            f"请手动下载参考资源:\n{ds.get('url', '')}\n"
            "用于领域预训练/特征提取初始化，非 Q&A 语料。\n",
            encoding="utf-8",
        )
    log(f"[INFO] {ds['name']} 为手动/预训练参考，见 {readme}")
    return True


def resolve_tier_ids(registry: Dict[str, Any], tier: str) -> List[str]:
    combos = registry.get("recommendedCombos", {})
    if tier in combos:
        return list(combos[tier])
    if tier == "extended":
        return [d["id"] for d in registry["datasets"] if d.get("tier") in ("core", "risk", "professional") and d.get("fetchMethod") != "manual"]
    if tier == "all":
        return [d["id"] for d in registry["datasets"] if d.get("fetchMethod") != "manual"]
    return combos.get("basic", ["psyqa", "soulchat", "mental_9k", "mental_r1_10k", "sos_hl_1k"])


def fetch_dataset(
    ds: Dict[str, Any],
    hf_limit: int,
    *,
    monthly: bool = False,
    force: bool = False,
) -> bool:
    ds_id = ds["id"]
    if ds_id == "psyqa":
        link_psyqa_from_repo()

    if not force and is_local_first():
        hit, path = local_cache_hit(ds_id)
        if hit:
            log(f"\n--- {ds['name']} ({ds_id}) ---")
            log(f"[SKIP] 本地优先，已有缓存: {path}")
            if ds_id in ("sos_hl_1k", "socialcd_3k"):
                return ensure_github_samples_jsonl(ds_id)
            return True

    if is_offline_mode():
        hit, path = local_cache_hit(ds_id)
        log(f"\n--- {ds['name']} ({ds_id}) ---")
        if hit:
            log(f"[OK] 离线模式，使用 {path}")
            return True
        log("[WARN] 离线模式且无本地缓存")
        return False

    if should_skip_remote(ds):
        hit, path = local_cache_hit(ds_id)
        log(f"\n--- {ds['name']} ({ds_id}) ---")
        if hit:
            log(f"[SKIP] 国内-only，使用本地 {path}")
            return True
        log("[WARN] 外网源已跳过，请手动缓存或关闭 TRAINING_DOMESTIC_ONLY")
        return False

    method = ds.get("fetchMethod", "")
    log(f"\n--- {ds['name']} ({ds_id}) ---")
    if ds_id == "efaqa":
        return fetch_efaqa(force=force, monthly=monthly)
    if ds_id == "soulchat" and monthly:
        return fetch_soulchat_sample(force=force)
    if method == "github_raw":
        ok = all(fetch_github_raw(ds).values())
        if ok and ds_id in ("sos_hl_1k", "socialcd_3k"):
            ok = ensure_github_samples_jsonl(ds_id)
        return ok
    if method == "direct_url":
        return fetch_psydial(ds)
    if method == "huggingface":
        return fetch_huggingface(ds, limit=hf_limit)
    if method == "modelscope":
        return fetch_modelscope_full(ds, monthly=monthly)
    if method == "multi":
        return fetch_multi(ds, hf_limit)
    if method == "kaggle":
        return fetch_kaggle(ds)
    if method == "manual":
        return fetch_manual(ds)
    log(f"[WARN] 未实现 fetchMethod={method}")
    return False


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=str, default="", help="逗号分隔的数据集 id")
    parser.add_argument("--tier", type=str, default="", help="basic|extended|premium|risk|professional|all")
    parser.add_argument("--all", action="store_true", help="等同 --tier all")
    parser.add_argument("--monthly", action="store_true", help="每月模式：SoulChat 子集 + 轻量扩充源")
    parser.add_argument("--soft-fail", action="store_true", help="可选源失败仍返回 0")
    parser.add_argument("--force", action="store_true", help="强制重新拉取")
    parser.add_argument("--offline", action="store_true", help="纯离线：仅校验/使用本地缓存")
    parser.add_argument("--domestic-only", action="store_true", help="仅国内源（ModelScope/GitCode/本地）")
    parser.add_argument("--hf-limit", type=int, default=int(os.environ.get("HF_FETCH_LIMIT", "8000")))
    args = parser.parse_args()

    if args.offline:
        os.environ["TRAINING_OFFLINE"] = "1"
    if args.domestic_only:
        os.environ["TRAINING_DOMESTIC_ONLY"] = "1"

    configure_hf_mirror()
    inv = scan_local_inventory()
    log(f"本地已就绪: {', '.join(inv['ready']) or '无'}")
    if inv["missing"]:
        log(f"本地缺失: {', '.join(inv['missing'])}")
    registry = load_registry()
    tier = args.tier or os.environ.get("KNOWLEDGE_FETCH_TIER", "")
    if args.offline and not tier:
        tier = "offline"
    if args.domestic_only and not tier:
        tier = "domestic"
    if args.all:
        tier = "all"

    if args.monthly:
        tier = tier or os.environ.get("KNOWLEDGE_MONTHLY_TIER", "extended")
        default_ids = resolve_tier_ids(registry, tier)
        if "soulchat" not in default_ids:
            default_ids.insert(1, "soulchat")
        if os.environ.get("EFAQA_DL_LICENSE", "").strip() and "efaqa" not in default_ids:
            default_ids.append("efaqa")
    elif tier:
        default_ids = resolve_tier_ids(registry, tier)
    elif args.only.strip():
        default_ids = []
    else:
        default_ids = resolve_tier_ids(registry, "basic")

    if args.only.strip():
        ids = [x.strip() for x in args.only.split(",") if x.strip()]
    else:
        ids = default_ids

    ds_by_id = {d["id"]: d for d in registry["datasets"]}
    required_monthly = {"psyqa"}
    optional_monthly = set(ids) - required_monthly

    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    status: Dict[str, Any] = {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "mode": "offline" if is_offline_mode() else ("monthly" if args.monthly else "full"),
        "tier": tier or "custom",
        "localInventory": inv,
        "results": {},
    }

    for ds_id in ids:
        ds = ds_by_id.get(ds_id)
        if not ds:
            log(f"[FAIL] 未知数据集: {ds_id}")
            status["results"][ds_id] = "failed"
            continue
        ok = fetch_dataset(ds, args.hf_limit, monthly=args.monthly, force=args.force)
        if ok:
            status["results"][ds_id] = "ok"
        elif ds.get("fetchMethod") == "manual":
            status["results"][ds_id] = "manual"
        elif args.monthly and ds_id in optional_monthly:
            status["results"][ds_id] = "skipped"
        elif is_offline_mode() or should_skip_remote(ds):
            status["results"][ds_id] = "skipped"
        else:
            status["results"][ds_id] = "failed"

    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\n状态已写入 {STATUS_FILE}")
    failed = [k for k, v in status["results"].items() if v == "failed"]
    skipped = [k for k, v in status["results"].items() if v in ("skipped", "manual")]

    if args.offline:
        if inv["ready"]:
            log(f"离线模式：可用本地源 {len(inv['ready'])} 个，可直接 build + train")
            return 0
        log("离线模式：无本地缓存，请将数据放入 training_data/ 或 PsyQA/PsyQA_full.json")
        return 1

    if (args.monthly or args.soft_fail or is_domestic_only()) and not failed:
        log("拉取完成（允许部分源跳过/使用本地缓存）")
        return 0

    if args.monthly and (args.soft_fail or is_domestic_only() or os.environ.get("KNOWLEDGE_MONTHLY_TIER") == "domestic"):
        critical = [k for k in failed if k in required_monthly]
        if critical:
            log(f"关键源失败: {', '.join(critical)}")
            return 1
        if skipped:
            log(f"可选源跳过/失败: {', '.join(skipped)}")
        log("每月拉取完成（允许部分可选源跳过）")
        return 0

    if failed:
        log(f"部分失败: {', '.join(failed)}")
        return 1
    log("全部完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
