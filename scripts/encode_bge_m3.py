"""用本地 BAAI/bge-m3 同时返回三种表示。

dense: 一整句一个 1024 维向量（CLS，已归一化）
sparse: 词级别权重，键是词、值是权重
colbert: 每个有效词一个 1024 维小向量（已归一化，不含 CLS）

SiliconFlow 的嵌入接口只返回 dense，所以这三项要在本机模型上算。
不走 FlagEmbedding 包，避免它和当前 transformers 版本冲突。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

DEFAULT_MODEL = Path(r"D:\huggingface\bge-m3")


def _num(value) -> float:
    if hasattr(value, "item"):
        return float(value.item())
    return float(value)


def _load_linear(path: Path, in_features: int, out_features: int) -> torch.nn.Linear:
    layer = torch.nn.Linear(in_features, out_features)
    try:
        state = torch.load(path, map_location="cpu", weights_only=True)
    except Exception:
        state = torch.load(path, map_location="cpu", weights_only=False)
    if not isinstance(state, dict) or "weight" not in state:
        raise RuntimeError(f"{path.name} 不是可用的线性层权重")
    layer.load_state_dict(state)
    return layer


def _allow_bin_checkpoint() -> None:
    """本机 torch 2.5 不能过 transformers 5 的 torch.load 版本检查。权重是本地官方文件。"""
    from transformers.utils import import_utils
    import transformers.modeling_utils as modeling_utils

    import_utils.check_torch_load_is_safe = lambda: None
    modeling_utils.check_torch_load_is_safe = lambda: None


def encode_three(text: str, model_dir: Path, max_length: int) -> dict:
    _allow_bin_checkpoint()
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    model = AutoModel.from_pretrained(model_dir, local_files_only=True)
    hidden = int(model.config.hidden_size)
    colbert_linear = _load_linear(model_dir / "colbert_linear.pt", hidden, hidden)
    sparse_linear = _load_linear(model_dir / "sparse_linear.pt", hidden, 1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    model.to(device=device, dtype=dtype).eval()
    colbert_linear.to(device=device, dtype=dtype).eval()
    sparse_linear.to(device=device, dtype=dtype).eval()

    batch = tokenizer(
        [text],
        truncation=True,
        max_length=max_length,
        padding=True,
        return_tensors="pt",
    )
    batch = {key: value.to(device) for key, value in batch.items()}

    with torch.no_grad():
        hidden_state = model(**batch, return_dict=True).last_hidden_state
        dense = F.normalize(hidden_state[:, 0], dim=-1)
        token_weights = torch.relu(sparse_linear(hidden_state)).squeeze(-1)
        colbert = colbert_linear(hidden_state[:, 1:])
        colbert = colbert * batch["attention_mask"][:, 1:].unsqueeze(-1).to(colbert.dtype)
        colbert = F.normalize(colbert, dim=-1)

    input_ids = batch["input_ids"][0].tolist()
    weights = token_weights[0].float().cpu().numpy()
    unused = {
        tokenizer.cls_token_id,
        tokenizer.eos_token_id,
        tokenizer.pad_token_id,
        tokenizer.unk_token_id,
    }
    best: dict[str, float] = {}
    for token_id, weight in zip(input_ids, weights):
        if token_id in unused or weight <= 0:
            continue
        key = str(token_id)
        if weight > best.get(key, 0):
            best[key] = float(weight)
    sparse = {tokenizer.decode([int(token_id)]): weight for token_id, weight in best.items()}

    mask = batch["attention_mask"][0].cpu().numpy()
    keep = int(np.sum(mask)) - 1
    colbert_np = colbert[0, :keep].float().cpu().numpy()
    dense_np = dense[0].float().cpu().numpy()
    return {
        "text": text,
        "dense": dense_np.tolist(),
        "denseDim": int(dense_np.shape[0]),
        "sparse": sparse,
        "colbert": colbert_np.tolist(),
        "colbertTokens": int(colbert_np.shape[0]),
        "colbertDim": int(colbert_np.shape[1]) if colbert_np.ndim == 2 else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="返回 bge-m3 的 dense、sparse、colbert")
    parser.add_argument("text", nargs="?", help="要编码的文本；省略则从标准输入读")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--out", type=Path, default=None, help="结果 JSON 路径，默认打印到标准输出")
    args = parser.parse_args()

    text = (args.text if args.text is not None else sys.stdin.read()).strip()
    if not text:
        print("请提供要编码的文本", file=sys.stderr)
        return 2
    if not (args.model / "pytorch_model.bin").exists() and not (args.model / "model.safetensors").exists():
        print(f"模型权重不在 {args.model}", file=sys.stderr)
        return 2
    for name in ("colbert_linear.pt", "sparse_linear.pt"):
        if not (args.model / name).exists():
            print(f"缺少 {args.model / name}", file=sys.stderr)
            return 2

    payload = encode_three(text, args.model, args.max_length)
    raw = json.dumps(payload, ensure_ascii=False)
    if args.out:
        args.out.write_text(raw, encoding="utf-8")
        print(
            json.dumps(
                {
                    "out": str(args.out),
                    "denseDim": payload["denseDim"],
                    "sparseTerms": len(payload["sparse"]),
                    "colbertTokens": payload["colbertTokens"],
                    "colbertDim": payload["colbertDim"],
                },
                ensure_ascii=False,
            )
        )
    else:
        print(raw)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
