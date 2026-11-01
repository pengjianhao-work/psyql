"""本机 BAAI/bge-m3：一次前向返回 dense、sparse、colbert。

不导入 FlagEmbedding。当前 transformers 5 和那个包的入口冲突，
并且会拒绝 torch 2.5 读取 pytorch_model.bin。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

DEFAULT_MODEL = Path(r"D:\huggingface\bge-m3")
DIM = 1024


def allow_bin_checkpoint() -> None:
    """本机 torch 2.5 读官方 bin 权重。文件来自本机模型目录。"""
    from transformers.utils import import_utils
    import transformers.modeling_utils as modeling_utils

    import_utils.check_torch_load_is_safe = lambda: None
    modeling_utils.check_torch_load_is_safe = lambda: None


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


def _round(values: np.ndarray, digits: int = 5) -> list[float]:
    return [round(float(v), digits) for v in values.tolist()]


class BgeM3Encoder:
    def __init__(self, model_dir: Path = DEFAULT_MODEL):
        if not (model_dir / "pytorch_model.bin").exists() and not (model_dir / "model.safetensors").exists():
            raise FileNotFoundError(f"模型权重不在 {model_dir}")
        for name in ("colbert_linear.pt", "sparse_linear.pt"):
            if not (model_dir / name).exists():
                raise FileNotFoundError(model_dir / name)

        allow_bin_checkpoint()
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
        self.model = AutoModel.from_pretrained(model_dir, local_files_only=True)
        hidden = int(self.model.config.hidden_size)
        # 官方仓库里的两个线性头。主干只出隐藏状态，词向量和词权重靠它们。
        # 缺文件时不能随机初始化，否则检索结果不可用。
        self.colbert_linear = _load_linear(model_dir / "colbert_linear.pt", hidden, hidden)
        self.sparse_linear = _load_linear(model_dir / "sparse_linear.pt", hidden, 1)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.benchmark = True
        dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.model.to(device=self.device, dtype=dtype).eval()
        self.colbert_linear.to(device=self.device, dtype=dtype).eval()
        self.sparse_linear.to(device=self.device, dtype=dtype).eval()
        special = [
            self.tokenizer.cls_token_id,
            self.tokenizer.sep_token_id,
            self.tokenizer.pad_token_id,
            self.tokenizer.unk_token_id,
            self.tokenizer.eos_token_id,
        ]
        self.special = {int(token_id) for token_id in special if token_id is not None}

    def encode(self, texts: list[str], max_length: int = 768, colbert_k: int = 64) -> list[dict]:
        if not texts:
            return []
        batch = self.tokenizer(
            texts,
            truncation=True,
            max_length=max_length,
            padding=True,
            return_tensors="pt",
        )
        batch = {key: value.to(self.device) for key, value in batch.items()}
        with torch.inference_mode():
            hidden = self.model(**batch, return_dict=True).last_hidden_state
            # dense：取句首 CLS，归一化后就是整句那一个 1024 维向量。
            dense = F.normalize(hidden[:, 0].float(), dim=-1)
            # sparse：每个词一个非负权重。后面按词编号取最大，得到稀疏向量。
            token_weights = torch.relu(self.sparse_linear(hidden)).squeeze(-1).float()
            # colbert：从第 2 个位置起，每个词一个 1024 维向量。下标 0 是 CLS，不参与词对词比较。
            colbert = self.colbert_linear(hidden[:, 1:]).float()

        dense_np = dense.cpu().numpy()
        weight_np = token_weights.cpu().numpy()
        colbert_np = colbert.cpu().numpy()
        ids_np = batch["input_ids"].cpu().numpy()
        mask_np = batch["attention_mask"].cpu().numpy()

        items = []
        for row in range(len(texts)):
            items.append(
                self._pack_row(
                    ids_np[row],
                    mask_np[row],
                    weight_np[row],
                    dense_np[row],
                    colbert_np[row],
                    colbert_k,
                )
            )
        return items

    def _pack_row(
        self,
        token_ids: np.ndarray,
        mask: np.ndarray,
        weights: np.ndarray,
        dense: np.ndarray,
        colbert: np.ndarray,
        colbert_k: int,
    ) -> dict:
        sparse_best: dict[int, float] = {}
        positions: list[int] = []
        position_weights: list[float] = []
        # 跳过填充和 CLS / SEP / PAD / UNK。同一个词出现多次时，稀疏权重只留最大的一次。
        for index in range(1, int(token_ids.shape[0])):
            if int(mask[index]) == 0:
                continue
            token_id = int(token_ids[index])
            if token_id in self.special:
                continue
            weight = float(weights[index])
            if not np.isfinite(weight) or weight <= 0:
                continue
            positions.append(index)
            position_weights.append(weight)
            if weight > sparse_best.get(token_id, 0.0):
                sparse_best[token_id] = weight

        # colbert_k<=0 表示全部保留。入库固定 64，只留下权重最高的词，控制 Qdrant 体积。
        keep = len(positions) if colbert_k <= 0 else min(colbert_k, len(positions))
        if keep:
            chosen = np.argpartition(np.negative(position_weights), keep - 1)[:keep]
            chosen = sorted(chosen, key=lambda item: position_weights[item], reverse=True)
            vecs = np.stack([colbert[positions[item] - 1] for item in chosen]).astype(np.float32)
            norms = np.linalg.norm(vecs, axis=1, keepdims=True)
            norms[norms == 0] = 1
            vecs = vecs / norms
            colbert_rows = [_round(row) for row in vecs]
        else:
            colbert_rows = []

        sparse_items = sorted(sparse_best.items())
        return {
            "dense": _round(dense),
            "sparse": {
                "indices": [token_id for token_id, _weight in sparse_items],
                "values": [round(weight, 5) for _token_id, weight in sparse_items],
            },
            "colbert": colbert_rows,
        }
