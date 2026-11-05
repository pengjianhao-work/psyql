"""本机 bge-reranker-v2-m3。模型只加载一次。

监听 127.0.0.1:8092
GET  /health
POST /rerank  {"query": "...", "documents": ["..."], "max_length": 512}
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

from bge_reranker import DEFAULT_MODEL, BgeReranker

HOST = "127.0.0.1"
PORT = int(os.environ.get("BGE_RERANK_PORT", "8092"))
MODEL = Path(os.environ.get("BGE_RERANK_MODEL", str(DEFAULT_MODEL)))
RERANKER = BgeReranker(MODEL)
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
        self._send(200, {"ok": True, "device": RERANKER.device, "model": "bge-reranker-v2-m3"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/rerank":
            self._send(404, {"ok": False})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            query = str(body.get("query") or "").strip()
            documents = body.get("documents")
            if not isinstance(documents, list) or not documents or len(documents) > 40:
                self._send(400, {"ok": False, "error": "documents 需要 1 到 40 条"})
                return
            cleaned = [str(text) for text in documents]
            max_length = int(body.get("max_length") or 512)
            max_length = min(max(max_length, 32), 1024)
            with LOCK:
                scores = RERANKER.score(query[:500], cleaned, max_length=max_length)
            self._send(200, {"ok": True, "scores": scores})
        except Exception as exc:
            self._send(500, {"ok": False, "error": str(exc)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"bge-reranker ready on http://{HOST}:{PORT} device={RERANKER.device}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
