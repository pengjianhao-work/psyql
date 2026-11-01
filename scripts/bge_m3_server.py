"""本机 bge-m3 编码服务。查询时由 Node 调用，模型只加载一次。

监听 127.0.0.1:8091
GET  /health
POST /embed  {"texts": ["..."], "max_length": 768, "colbert_k": 128}
"""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from bge_m3_encoder import DEFAULT_MODEL, BgeM3Encoder

HOST = "127.0.0.1"
PORT = int(os.environ.get("BGE_M3_PORT", "8091"))
MODEL = Path(os.environ.get("BGE_M3_MODEL", str(DEFAULT_MODEL)))
# 进程启动时就把模型放进显存。Node 每次查询只发文本，不再重新加载。
ENCODER = BgeM3Encoder(MODEL)
# 一张显卡同时只能跑一次前向，请求排队。
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self._send(404, {"ok": False})
            return
        self._send(
            200,
            {
                "ok": True,
                "device": ENCODER.device,
                "dim": 1024,
                "colbertKeep": 64,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/embed":
            self._send(404, {"ok": False})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            texts = body.get("texts")
            if isinstance(texts, str):
                texts = [texts]
            if not isinstance(texts, list) or not texts or len(texts) > 16:
                self._send(400, {"ok": False, "error": "texts 需要 1 到 16 条"})
                return
            cleaned = [str(text).strip() for text in texts]
            if any(not text for text in cleaned):
                self._send(400, {"ok": False, "error": "文本为空"})
                return
            max_length = int(body.get("max_length") or 768)
            # 提问通常不到 64 个词，这里默认保留 128，避免查询侧被截短。
            # 文档入库仍用 64，见 reindex_bge_m3_qdrant.py。
            colbert_k = int(body.get("colbert_k") if body.get("colbert_k") is not None else 128)
            with LOCK:
                items = ENCODER.encode(cleaned, max_length=max_length, colbert_k=colbert_k)
            self._send(200, {"ok": True, "items": items})
        except Exception as exc:
            self._send(500, {"ok": False, "error": str(exc)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"bge-m3 ready on http://{HOST}:{PORT} device={ENCODER.device}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
