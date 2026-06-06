#!/usr/bin/env python3
import json
from pathlib import Path

TRANSCRIPT = Path(
    r"C:\Users\lenovo\.cursor\projects\c-Users-lenovo-Desktop-PsyQA1\agent-transcripts"
    r"\7a79d58e-45b0-4600-a45b-c17432f0e64d\7a79d58e-45b0-4600-a45b-c17432f0e64d.jsonl"
)
OUT = Path(__file__).resolve().parent.parent / "PsyQA/server/src/services/knowledge/vectorDBService.ts"

best = ""
for line in TRANSCRIPT.read_text(encoding="utf-8").splitlines():
    obj = json.loads(line)
    for part in obj.get("message", {}).get("content", []):
        if part.get("type") != "tool_use" or part.get("name") != "Write":
            continue
        p = str(part.get("input", {}).get("path", ""))
        if "vectorDBService.ts" not in p or "question" in p:
            continue
        c = part.get("input", {}).get("contents", "")
        if len(c) > len(best):
            best = c

if len(best) < 500:
    print("not found in transcript, len", len(best))
    raise SystemExit(1)

text = best.replace("from '../utils/", "from '../../utils/")
text = text.replace("from '../db/", "from '../../db/")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text, encoding="utf-8")
print(f"written {OUT} ({len(text)} chars)")
