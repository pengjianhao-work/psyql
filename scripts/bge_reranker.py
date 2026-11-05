"""本机 BAAI/bge-reranker-v2-m3。查询和候选成对打分，不导入 FlagEmbedding。"""

from __future__ import annotations

from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from bge_m3_encoder import allow_bin_checkpoint

DEFAULT_MODEL = Path(r"D:\huggingface\bge-reranker-v2-m3")


class BgeReranker:
    def __init__(self, model_dir: Path = DEFAULT_MODEL):
        if not (model_dir / "model.safetensors").exists() and not (model_dir / "pytorch_model.bin").exists():
            raise FileNotFoundError(f"重排序权重不在 {model_dir}")
        allow_bin_checkpoint()
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_dir, local_files_only=True)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
        dtype = torch.float16 if self.device == "cuda" else torch.float32
        try:
            self.model.to(device=self.device, dtype=dtype).eval()
        except RuntimeError:
            self.device = "cpu"
            self.model.to(device="cpu", dtype=torch.float32).eval()

    def score(self, query: str, documents: list[str], max_length: int = 512) -> list[float]:
        if not documents:
            return []
        scores = [0.0] * len(documents)
        pairs: list[list[str]] = []
        indexes: list[int] = []
        for index, document in enumerate(documents):
            text = document.strip()
            if not query.strip() or not text:
                continue
            pairs.append([query, text])
            indexes.append(index)
        # 8GB 显存上 bge-m3 已经常驻，重排序按小批前向。
        batch_size = 4 if self.device == "cuda" else 2
        offset = 0
        while offset < len(pairs):
            took = self._score_batch(pairs[offset : offset + batch_size], max_length)
            if took is None and batch_size > 1:
                batch_size = 1
                if self.device == "cuda":
                    torch.cuda.empty_cache()
                continue
            if not took:
                raise RuntimeError("重排序打分失败")
            for index, value in zip(indexes[offset : offset + len(took)], took):
                scores[index] = value
            offset += len(took)
        return scores

    def _score_batch(self, pairs: list[list[str]], max_length: int) -> list[float] | None:
        try:
            inputs = self.tokenizer(
                pairs,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt",
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            with torch.inference_mode():
                logits = self.model(**inputs, return_dict=True).logits.view(-1).float()
                values = torch.sigmoid(logits).detach().cpu().tolist()
            return [round(float(value), 6) for value in values]
        except RuntimeError as exc:
            if "out of memory" not in str(exc).lower():
                raise
            if self.device == "cuda":
                torch.cuda.empty_cache()
            return None
